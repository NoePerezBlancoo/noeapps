// Explicit staging integration. Synthetic fixtures only; no live credentials or customer messages.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import pg from 'pg';
import subscriptions from '../subscriptions.js';
const root=new URL('../../',import.meta.url);
const env=JSON.parse(await readFile(new URL('.env.roadmap-staging.json',root),'utf8'));
const dbEnv=JSON.parse(await readFile(new URL('.env.roadmap-staging-db.json',root),'utf8'));
const origin='https://catalogo-staging-v2-production.up.railway.app';
assert.equal(env.CATALOG_ENVIRONMENT,'staging');assert.equal(env.PUBLIC_ORIGIN,origin);
assert.match(env.STRIPE_SECRET_KEY,/^(sk|rk|rkcs)_test_/);
assert.equal(dbEnv.RAILWAY_TCP_PROXY_DOMAIN,'ballast.proxy.rlwy.net');
const db=new pg.Pool({host:dbEnv.RAILWAY_TCP_PROXY_DOMAIN,port:Number(dbEnv.RAILWAY_TCP_PROXY_PORT),database:dbEnv.PGDATABASE,user:dbEnv.PGUSER,password:dbEnv.PGPASSWORD,max:1});
const stripe=subscriptions.stripeClient(env.STRIPE_SECRET_KEY);
const suffix=crypto.randomBytes(4).toString('hex');let cookie='';
const evidence={date:new Date().toISOString(),origin,checks:[],fixtures:{},invoices:[]};
async function api(path,body,method=body===undefined?'GET':'POST',expected=200,headers={}){
  const r=await fetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const json=await r.json();assert.equal(r.status,expected,`${method} ${path}: ${json.error||r.status}`);
  if(path==='/api/crm/login')cookie=r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  return json;
}
const mark=message=>{evidence.checks.push(message);console.log(message);};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  await api('/api/crm/login',{password:env.CATALOG_CRM_PASSWORD});
  await api('/api/crm/offers',{name:'Rejected',source:'both',percentOff:50,durationMonths:4},'POST',403,{Origin:'https://example.invalid'});
  const offer=(await api('/api/crm/offers',{name:'QA cuatro meses '+suffix,source:'both',percentOff:50,durationMonths:4},'POST',201)).offer;
  evidence.fixtures.campaignId=offer.id;
  const fixture=await api('/api/requests',{customer:{name:'QA '+suffix,businessName:'STAGING Roadmap '+suffix,whatsapp:'+34000000000',email:'qa-'+suffix+'@example.invalid'},selection:{id:'qa-roadmap',name:'Diseño QA',price:39,category:'QA'}},'POST',201);
  evidence.fixtures.requestId=fixture.id;
  const patch={status:'new',previewUrl:origin+'/',paymentUrl:'',adminNotes:'QA roadmap',salespersonId:'',offerId:offer.id,discountCode:'',discountType:'none',discountValue:0,discountScope:'creation',siteSlug:'',siteOriginUrl:'',creationPrice:0,monthlyPriceCents:1990};
  await api('/api/crm/requests/'+fixture.id,patch,'PATCH');
  const checkouts=await Promise.all([1,2,3].map(()=>api('/api/crm/requests/'+fixture.id+'/checkout',{})));
  assert.equal(new Set(checkouts.map(x=>x.request.stripe_checkout_session_id)).size,1);
  const row=checkouts[0].request;
  const session=await stripe.request('GET','/checkout/sessions/'+row.stripe_checkout_session_id);
  assert.equal(session.livemode,false);assert.equal(session.amount_total,995);
  assert.equal(session.total_details.amount_discount,995);
  await api('/api/crm/requests/'+fixture.id,{...patch,offerId:''},'PATCH',409);
  await api('/api/crm/requests/'+fixture.id,{...patch,creationPrice:1},'PATCH',409);
  await api('/api/crm/offers/'+offer.id,{active:false},'PATCH');
  await api('/api/crm/requests/'+fixture.id,{...patch,adminNotes:'Condiciones preservadas'},'PATCH');
  await api('/api/crm/offers/'+offer.id,{active:true},'PATCH');
  mark('Checkout TEST 9,95 EUR; concurrent retries share one session; pending terms frozen; inactive campaign does not break notes');
  const initialReport=await api('/api/crm/roadmap');
  const now=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Madrid'});
  await api('/api/crm/expenses',{name:'QA inválido',category:'hosting',cadence:'monthly',amountCents:1,expenseDate:'2026-02-31'},'POST',400);
  const expense=(await api('/api/crm/expenses',{name:'QA Hosting '+suffix,category:'hosting',cadence:'monthly',amountCents:1234,expenseDate:now},'POST',201)).expense;
  await api('/api/crm/expenses',{name:'QA futuro '+suffix,category:'software',cadence:'one_time',amountCents:5000,expenseDate:'2099-01-01'},'POST',201);
  const costReport=await api('/api/crm/roadmap');assert.equal(costReport.costs.operatingExpensesCents,initialReport.costs.operatingExpensesCents+1234);
  await api('/api/crm/expenses/'+expense.id,{active:false},'PATCH');
  assert.equal((await api('/api/crm/roadmap')).costs.operatingExpensesCents,costReport.costs.operatingExpensesCents);
  await api('/api/crm/expenses/'+expense.id,{active:true},'PATCH',409);
  mark('Expense dates validated; future costs excluded; monthly history preserved after stopping');
  const templates=await api('/api/crm/roadmap/templates');
  await api('/api/crm/roadmap/templates',{kind:'followup',body:'Hola {cliente}, seguimiento de {negocio}.'},'PUT');
  const message=await api('/api/crm/roadmap/message',{id:fixture.id,source:'catalog',kind:'followup'});
  assert.equal(new URL(message.url).hostname,'wa.me');assert.match(message.message,new RegExp(suffix));
  await api('/api/crm/roadmap/message',{id:fixture.id,source:'catalog',kind:'published'},'POST',409);
  await api('/api/crm/roadmap/templates',{kind:'followup',body:'{secret}'},'PUT',400);
  await api('/api/crm/roadmap/templates',{kind:'followup',body:templates.templates.followup},'PUT');
  mark('Editable templates and encoded WhatsApp draft verified; no message sent; missing publication rejected');
  await db.query("UPDATE catalog_requests SET site_status='error' WHERE id=$1 AND email=$2",[fixture.id,'qa-'+suffix+'@example.invalid']);
  await api('/api/crm/roadmap/scan',{});
  let incident=(await api('/api/crm/roadmap/incidents')).incidents.find(x=>x.entity_id===fixture.id&&x.kind==='publication_error');assert.ok(incident);
  await api('/api/crm/roadmap/incident',{key:incident.key,note:'Revisión de prueba'},'PATCH');
  await api('/api/crm/roadmap/scan',{});
  assert.equal((await api('/api/crm/roadmap/incidents')).incidents.find(x=>x.key===incident.key).state,'acknowledged');
  await db.query("UPDATE catalog_requests SET site_status='draft' WHERE id=$1 AND email=$2",[fixture.id,'qa-'+suffix+'@example.invalid']);
  await api('/api/crm/roadmap/scan',{});
  assert.equal((await api('/api/crm/roadmap/incidents')).incidents.find(x=>x.key===incident.key).state,'resolved');
  mark('Publication failure detected, acknowledgement retained while failing, automatic recovery recorded');
  // Real Stripe test clock and real TEST invoices: four discounted renewals, then normal price.
  const clock=env.STRIPE_SECRET_KEY.startsWith('rkcs_')?null:await stripe.request('POST','/test_helpers/test_clocks',{frozen_time:Math.floor(Date.now()/1000),name:'QA 4 meses '+suffix});
  evidence.testClockAvailable=!!clock;
  const customer=await stripe.request('POST','/customers',{name:'QA Roadmap '+suffix,email:'qa-clock-'+suffix+'@example.invalid',...(clock?{test_clock:clock.id}:{}),payment_method:'pm_card_visa','invoice_settings[default_payment_method]':'pm_card_visa'});
  const sub=await stripe.request('POST','/subscriptions',{customer:customer.id,'items[0][price]':env.STRIPE_DEFAULT_MONTHLY_PRICE_ID,'discounts[0][promotion_code]':row.stripe_offer_promotion_code_id,'metadata[catalog_request_id]':fixture.id,payment_behavior:'error_if_incomplete'});
  assert.equal(sub.livemode,false);assert.equal(sub.status,'active');
  evidence.fixtures.subscriptionId=sub.id;evidence.fixtures.clockId=clock?.id||null;
  await db.query('UPDATE catalog_requests SET stripe_subscription_id=$2,stripe_customer_id=$3 WHERE id=$1 AND email=$4',[fixture.id,sub.id,customer.id,'qa-'+suffix+'@example.invalid']);
  async function invoiceAndWebhook(month){
    const current=await stripe.request('GET','/subscriptions/'+sub.id);
    const inv=await stripe.request('GET','/invoices/'+current.latest_invoice);
    assert.equal(inv.status,'paid');assert.equal(inv.amount_paid,month<=4?995:1990);
    evidence.invoices.push({month,id:inv.id,paidCents:inv.amount_paid,discountCents:inv.total_discount_amounts.reduce((s,x)=>s+x.amount,0)});
    const events=await stripe.request('GET','/events?type=invoice.paid&limit=100');
    const event=events.data.find(e=>e.data.object.id===inv.id);assert.ok(event,'Real Stripe invoice.paid event');
    const payload=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000),signature=crypto.createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+payload).digest('hex');
    const response=await fetch(origin+'/api/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':`t=${timestamp},v1=${signature}`},body:payload});
    assert.equal(response.status,200,'Real invoice webhook accepted');
    console.log('Stripe TEST month '+month+': '+inv.amount_paid+' cents confirmed');
    return current;
  }
  let current=await invoiceAndWebhook(1);
  for(let month=2;clock&&month<=5;month++){
    const end=current.items.data[0].current_period_end;
    await stripe.request('POST','/test_helpers/test_clocks/'+clock.id+'/advance',{frozen_time:end+7200});
    let ready=false;
    for(let i=0;i<30;i++){await delay(2000);if((await stripe.request('GET','/test_helpers/test_clocks/'+clock.id)).status==='ready'){ready=true;break;}}
    assert.ok(ready,'Test clock ready');
    current=await invoiceAndWebhook(month);
  }
  const ledger=(await db.query('SELECT amount_paid_cents,discount_cents,campaign_id FROM catalog_revenue_events WHERE request_id=$1 ORDER BY paid_at',[fixture.id])).rows;
  assert.deepEqual(ledger.map(x=>x.amount_paid_cents),clock?[995,995,995,995,1990]:[995]);
  assert.deepEqual(ledger.map(x=>x.discount_cents),clock?[995,995,995,995,0]:[995]);assert.ok(ledger.every(x=>x.campaign_id===offer.id));
  await api('/api/crm/requests/'+fixture.id,{...patch,offerId:''},'PATCH',409);
  mark(clock?'Stripe TEST charged four months at 50%, fifth at full price; signed canonical webhooks recorded exact campaign revenue and discount':'Stripe TEST initial payment and signed canonical invoice webhook verified; claimable Catalog sandbox lacks test-clock permission, duration tested independently in TuNegocio TEST');
  // End only this synthetic TEST subscription; retain the invoices and audit evidence.
  await stripe.request('DELETE','/subscriptions/'+sub.id);
  const final=await api('/api/crm/roadmap');evidence.bridgeAvailable=final.bridgeAvailable;
  evidence.campaign=final.campaigns.find(x=>x.id===offer.id);
  evidence.auditCount=(await db.query('SELECT count(*)::int AS count FROM crm_action_audit WHERE entity_id LIKE $1',['%'+fixture.id+'%'])).rows[0].count;
  assert.ok(evidence.auditCount>0);mark('Administrative requests and WhatsApp preparation audited');
}finally{
  await writeFile(new URL('.env.roadmap-evidence.json',root),JSON.stringify(evidence,null,2));
  await db.end();
}
