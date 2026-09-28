// Explicit opt-in. Only the isolated Catálogo database and TEST Stripe account are allowed.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import pg from 'pg';
import discovery from '../catalog-discovery.js';
import subscriptions from '../subscriptions.js';
const origin='https://catalogo-staging-v2-production.up.railway.app';
assert.equal(process.env.CATALOG_ENVIRONMENT,'staging');
assert.equal(new URL(process.env.STAGING_DATABASE_URL).hostname,'ballast.proxy.rlwy.net');
assert.match(process.env.STRIPE_SECRET_KEY||'',/^(sk|rk|rkcs)_test_/);
const pool=new pg.Pool({connectionString:process.env.STAGING_DATABASE_URL,max:1});
let cookie='';
async function call(path,body,status=200){
  const r=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal(r.status,status,path);if(path.endsWith('/login'))cookie=r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');return r.json();
}
try{
  await call('/api/crm/design-stats',undefined,401);
  const before=await call('/api/catalog/discovery');assert.equal(before.enabled,true);assert.equal(before.metricsAvailable,true);assert.equal(before.datesAvailable,true);
  for(const metric of Object.values(before.stats))assert.deepEqual(Object.keys(metric).sort(),['conversion','requests','sales']);
  await call('/api/crm/login',{password:process.env.CATALOG_CRM_PASSWORD});
  const catalog=await call('/catalog-data');const design=catalog.templates.find(x=>x.id==='noeapps-beauty-velvet')||catalog.templates.find(x=>x.category==='Belleza');
  assert.ok(design);
  const suffix=crypto.randomBytes(5).toString('hex');
  const fixture=await call('/api/requests',{customer:{name:'STAGING búsqueda',businessName:'QA Discovery '+suffix,whatsapp:'000000000',email:`qa-discovery-${suffix}@example.invalid`},selection:{id:design.id,name:design.commercial_name,category:design.category,price:149}},201);
  const stripe=subscriptions.stripeClient(process.env.STRIPE_SECRET_KEY);
  const customer=await stripe.request('POST','/customers',{name:'STAGING Discovery '+suffix,email:`qa-discovery-${suffix}@example.invalid`,payment_method:'pm_card_visa','invoice_settings[default_payment_method]':'pm_card_visa'});
  const sub=await stripe.request('POST','/subscriptions',{customer:customer.id,'items[0][price]':process.env.STRIPE_DEFAULT_MONTHLY_PRICE_ID,'metadata[catalog_request_id]':fixture.id,payment_behavior:'error_if_incomplete',cancel_at_period_end:true});
  assert.equal(sub.livemode,false);assert.equal(sub.status,'active');
  await pool.query('UPDATE catalog_requests SET stripe_customer_id=$2,stripe_subscription_id=$3 WHERE id=$1 AND email=$4',[fixture.id,customer.id,sub.id,`qa-discovery-${suffix}@example.invalid`]);
  const events=await stripe.request('GET','/events?type=invoice.paid&limit=20');
  const event=events.data.find(x=>x.data.object.id===sub.latest_invoice);assert.ok(event);
  const payload=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000),signature=crypto.createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+payload).digest('hex');
  for(let attempt=0;attempt<2;attempt++){
    const r=await fetch(origin+'/api/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':`t=${timestamp},v1=${signature}`},body:payload});assert.equal(r.status,200);
  }
  const report=await call('/api/crm/design-stats');const row=report.designs.find(x=>x.id===design.id);
  assert.equal(row.requests,(before.stats[design.id]?.requests||0)+1);assert.equal(row.sales,(before.stats[design.id]?.sales||0)+1);assert.equal(row.conversion,row.sales/row.requests);
  const expected=(await pool.query(discovery.metricsSql)).rows.map(discovery.metricRow).find(x=>x.id===design.id);
  assert.equal(row.revenueCents,expected.revenueCents);assert.ok(row.revenueCents>=1990);
  const after=await call('/api/catalog/discovery');assert.equal(after.stats[design.id].sales,row.sales);assert.equal(after.stats[design.id].revenueCents,undefined);
  // Verify aggregate cardinality and renewal semantics in a private temporary schema, then roll back everything.
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    await db.query('CREATE TEMP TABLE catalog_requests(id uuid,design_id text,design_name text,category text)');
    await db.query('CREATE TEMP TABLE catalog_revenue_events(event_id text PRIMARY KEY,request_id uuid,amount_paid_cents integer,paid_at timestamptz)');
    const a=crypto.randomUUID(),b=crypto.randomUUID();
    await db.query("INSERT INTO catalog_requests VALUES($1,'qa','QA','Belleza'),($2,'qa','QA','Belleza')",[a,b]);
    await db.query("INSERT INTO catalog_revenue_events VALUES('initial',$1,1000,now()),('renewal',$1,1990,now()),('zero',$2,0,now())",[a,b]);
    await db.query("INSERT INTO catalog_revenue_events VALUES('renewal',$1,1990,now()) ON CONFLICT DO NOTHING",[a]);
    const total=discovery.metricRow((await db.query(discovery.metricsSql)).rows[0]);
    assert.equal(total.requests,2);assert.equal(total.sales,1);assert.equal(total.conversion,.5);assert.equal(total.revenueCents,2990);
  }finally{await db.query('ROLLBACK');db.release();}
  const evidence={verifiedAt:new Date().toISOString(),fixtureId:fixture.id,designId:design.id,checks:['private CRM authentication','public metrics exclude revenue and personal data','real Stripe TEST payment counted once','duplicate webhook does not inflate sales','renewals do not multiply sales or requests','zero payment is not a sale','conversion has the correct denominator','CRM revenue equals the stored ledger','dates are explicitly unknown for baseline inventory']};
  assert.ok(Object.values(after.dates).some(x=>x===null));
  await writeFile(new URL('../../.env.phase2-evidence.json',import.meta.url),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await pool.end();}
