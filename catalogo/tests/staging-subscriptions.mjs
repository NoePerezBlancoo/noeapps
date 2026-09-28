// Explicit opt-in integration test. Creates only synthetic records on the fixed staging service.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import subscriptions from '../subscriptions.js';
const origin='https://catalogo-staging-v2-production.up.railway.app';
assert.equal(process.env.CATALOG_ENVIRONMENT,'staging');
assert.match(process.env.STRIPE_SECRET_KEY||'',/^(sk|rk|rkcs)_test_/);
assert.equal(new URL(process.env.STAGING_DATABASE_URL).hostname,'ballast.proxy.rlwy.net');
const db=new pg.Pool({connectionString:process.env.STAGING_DATABASE_URL,max:1});
const stripe=subscriptions.stripeClient(process.env.STRIPE_SECRET_KEY);
const suffix=crypto.randomBytes(5).toString('hex');
let cookie='';
async function request(path,body,expected=200,headers={}){
  const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...headers},body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal(response.status,expected,`HTTP ${path}`);
  if(path==='/api/crm/login')cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  return response.json();
}
try{
  await request('/api/crm/login',{password:process.env.CATALOG_CRM_PASSWORD});
  const fixture=await request('/api/requests',{customer:{name:'Prueba automatizada',businessName:'STAGING Cancelaciones '+suffix,whatsapp:'000000000',email:`qa-${suffix}@example.invalid`},selection:{id:'qa-design',name:'Diseño de prueba',price:39}},201);
  const customer=await stripe.request('POST','/customers',{name:'STAGING Cancellation '+suffix,email:`qa-${suffix}@example.invalid`,payment_method:'pm_card_visa','invoice_settings[default_payment_method]':'pm_card_visa'});
  const subscription=await stripe.request('POST','/subscriptions',{customer:customer.id,'items[0][price]':process.env.STRIPE_DEFAULT_MONTHLY_PRICE_ID,'metadata[catalog_request_id]':fixture.id,payment_behavior:'error_if_incomplete'});
  assert.equal(subscription.status,'active');assert.equal(subscription.livemode,false);
  await db.query("UPDATE catalog_requests SET stripe_subscription_id=$2,stripe_customer_id=$3,site_origin_url=$4 WHERE id=$1 AND email=$5",[fixture.id,subscription.id,customer.id,origin,`qa-${suffix}@example.invalid`]);
  const events=await stripe.request('GET','/events?type=invoice.paid&limit=10');
  const paymentEvent=events.data.find(event=>event.data.object.id===subscription.latest_invoice);
  assert.ok(paymentEvent,'Stripe must produce invoice.paid');
  async function deliver(event,expected=200){
    const payload=JSON.stringify(event), timestamp=Math.floor(Date.now()/1000);
    const signature=crypto.createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+payload).digest('hex');
    const response=await fetch(origin+'/api/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':`t=${timestamp},v1=${signature}`},body:payload});
    assert.equal(response.status,expected,'Signed webhook delivery');
    return response.json();
  }
  await deliver(paymentEvent);
  assert.equal((await deliver(paymentEvent)).duplicate,true);
  await deliver({...paymentEvent,livemode:true},400);
  assert.equal((await db.query('SELECT count(*)::int AS total FROM catalog_revenue_events WHERE request_id=$1',[fixture.id])).rows[0].total,1);
  const route=`/api/crm/requests/${fixture.id}/subscription`;
  const active=(await request(route,{action:'refresh'})).subscription;
  assert.equal(active.status,'active');assert.equal(active.canCancel,true);assert.ok(Date.parse(active.paidUntil)>Date.now());
  assert.equal((await request('/api/public/site-route?slug='+fixture.siteSlug)).status,'active');
  await request(route,{action:'cancel'},403,{Origin:'https://attacker.example.invalid'});
  await request(route,{action:'cancel'},401,{Cookie:''});
  const cancelled=(await request(route,{action:'cancel'})).subscription;
  assert.equal(cancelled.cancelAtPeriodEnd,true);assert.equal(cancelled.nextRenewalAt,null);assert.equal(cancelled.paidUntil,active.paidUntil);
  assert.equal((await stripe.request('GET','/subscriptions/'+subscription.id)).cancel_at_period_end,true);
  assert.equal((await request('/api/public/site-route?slug='+fixture.siteSlug)).status,'active');
  const reactivated=(await request(route,{action:'reactivate'})).subscription;
  assert.equal(reactivated.cancelAtPeriodEnd,false);assert.ok(reactivated.nextRenewalAt);
  const portal=await request(route,{action:'portal'});
  assert.equal(new URL(portal.url).origin,'https://billing.stripe.com');
  // A synthetic subscription is ended immediately to verify that paid access survives billing termination.
  await stripe.request('DELETE','/subscriptions/'+subscription.id);
  const ended=(await request(route,{action:'refresh'})).subscription;
  assert.equal(ended.status,'canceled');assert.equal(ended.paidUntil,active.paidUntil);
  assert.equal((await request('/api/public/site-route?slug='+fixture.siteSlug)).status,'active');
  await request(route,{action:'reactivate'},409);
  // Advance only this synthetic local entitlement to exercise the request-time expiry gate.
  await db.query("UPDATE catalog_requests SET subscription_paid_until=now()-interval '1 second' WHERE id=$1 AND email=$2",[fixture.id,`qa-${suffix}@example.invalid`]);
  assert.equal((await request('/api/public/site-route?slug='+fixture.siteSlug)).status,'suspended');
  assert.equal((await fetch(origin+'/customer-site/'+fixture.siteSlug)).status,402);
  await request(route,{action:'refresh'}); // Leave the fixture reconciled with the real TEST invoice.
  const audit=(await db.query('SELECT action,outcome FROM catalog_subscription_audit WHERE request_id=$1 ORDER BY id',[fixture.id])).rows;
  assert.ok(audit.some(row=>row.action==='cancel'&&row.outcome==='succeeded'));
  assert.ok(audit.some(row=>row.action==='reactivate'&&row.outcome==='succeeded'));
  assert.ok(audit.some(row=>row.action==='reactivate'&&row.outcome==='failed'));
  const evidence={verifiedAt:new Date().toISOString(),fixtureId:fixture.id,subscriptionId:subscription.id,checks:['Stripe TEST paid invoice','signed webhook and duplicate replay','webhook TEST/LIVE separation','CRM auth','same-origin','scheduled cancellation','paid access retained','reactivation','safe portal','terminal reactivation rejected','expired synthetic entitlement denied','immutable action audit']};
  await writeFile(new URL('../../.env.phase1-evidence.json',import.meta.url),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
}finally{await db.end()}
