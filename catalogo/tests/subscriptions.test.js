const test = require('node:test');
const assert = require('node:assert/strict');
const { stateFrom, paidInvoiceEnd, hasPaidAccess, verifySubscription, stripeClient, assertStaging } = require('../subscriptions');
const now = Date.now(), end = Math.floor(now/1000)+86400;
const row = { id:'request',stripe_subscription_id:'sub_test',stripe_customer_id:'cus_test',subscription_paid_until:new Date(end*1000).toISOString() };
const sub = { id:'sub_test',object:'subscription',livemode:false,customer:'cus_test',status:'active',metadata:{catalog_request_id:'request'},items:{data:[{current_period_end:end,quantity:1,price:{unit_amount:1990,currency:'eur'}}]} };
test('scheduled cancellation, reactivation and terminal states preserve paid service',()=>{
  const active=stateFrom(sub,row,now);
  assert.equal(active.canCancel,true);assert.equal(active.canReactivate,false);assert.ok(active.nextRenewalAt);
  const canceled=stateFrom({...sub,cancel_at_period_end:true},row,now);
  assert.equal(canceled.canReactivate,true);assert.equal(canceled.nextRenewalAt,null);assert.equal(canceled.paidUntil,row.subscription_paid_until);
  for(const status of ['canceled','unpaid','incomplete_expired','paused']){
    const state=stateFrom({...sub,status,cancel_at_period_end:true},row,now);
    assert.equal(state.canReactivate,false);assert.equal(state.canCancel,false);assert.equal(state.nextRenewalAt,null);
    assert.equal(hasPaidAccess(row,now),true);
    assert.equal(hasPaidAccess(row,end*1000),false);
  }
  assert.equal(stateFrom({...sub,schedule:'sched_test',cancel_at_period_end:true},row,now).canReactivate,false);
});
test('only a matching paid recurring invoice grants its own period',()=>{
  const invoice={object:'invoice',status:'paid',livemode:false,customer:'cus_test',amount_paid:1990,amount_remaining:0,parent:{subscription_details:{subscription:'sub_test'}},lines:{data:[{parent:{type:'subscription_item_details',subscription_item_details:{subscription:'sub_test',proration:false}},period:{start:end-86400,end}}]}};
  assert.equal(paidInvoiceEnd(invoice,'sub_test','cus_test',false),row.subscription_paid_until);
  for(const patch of [{status:'open'},{amount_paid:0},{amount_remaining:1},{paid_out_of_band:true},{livemode:true},{customer:'cus_other'},{lines:{has_more:true,data:invoice.lines.data}},{lines:{data:[{type:'invoiceitem',period:{start:end-10,end:end+365*86400}}]}}]){
    assert.equal(paidInvoiceEnd({...invoice,...patch},'sub_test','cus_test',false),null);
  }
});
test('billing binding prevents crossing products, clients and environments',()=>{
  verifySubscription(sub,row,false);
  for(const patch of [{id:'sub_other'},{livemode:true},{customer:'cus_other'},{metadata:{catalog_request_id:'other'}}])assert.throws(()=>verifySubscription({...sub,...patch},row,false));
});
test('staging refuses live keys, production origins, legacy database import and live bridge',()=>{
  const env={CATALOG_ENVIRONMENT:'staging',STRIPE_SECRET_KEY:'rk_test_fixture',DATABASE_URL:'postgres://synthetic',PUBLIC_ORIGIN:'https://catalogo-staging-v2-production.up.railway.app',SITE_DOMAIN:'catalogo-staging-v2-production.up.railway.app'};
  assertStaging(env);
  for(const patch of [{STRIPE_SECRET_KEY:'sk_live_fixture'},{LEGACY_DATABASE_URL:'postgres://production'},{NEON_DATABASE_URL:'postgres://production'},{PUBLIC_ORIGIN:'https://catalogo.noeapps.com'},{SITE_DOMAIN:'noeapps.com'},{TUNEGOCIO_CRM_ORIGIN:'https://tunegocio.noeapps.com'}])assert.throws(()=>assertStaging({...env,...patch}));
});
test('Stripe faults never expose provider response details',async()=>{
  const stripe=stripeClient('rk_test_fixture',async()=>new Response(JSON.stringify({error:{message:'sensitive customer context'}}),{status:400}));
  await assert.rejects(stripe.request('GET','/subscriptions/sub_test'),error=>!error.message.includes('sensitive')&&error.status===502);
});
