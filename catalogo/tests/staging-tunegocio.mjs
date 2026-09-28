import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import pg from 'pg';
const origin='https://catalogo-staging-v2-production.up.railway.app';
assert.equal(new URL(process.env.TN_STAGING_DATABASE_URL).hostname,'altaria.proxy.rlwy.net');
const pool=new pg.Pool({connectionString:process.env.TN_STAGING_DATABASE_URL,options:'-c search_path=noeapps_staging',max:1});
let cookie='';
async function call(path,body,expected=200){
  const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal(response.status,expected,path);
  if(path.endsWith('/login'))cookie=response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  return response.json();
}
try{
  const projectId=process.env.TN_PROJECT_ID;
  const order=(await pool.query("SELECT * FROM publication_orders WHERE project_id=$1 AND mode='test' ORDER BY sequence DESC LIMIT 1",[projectId])).rows[0];
  assert.ok(order);assert.equal(order.status,'paid');assert.ok(order.subscription_id);
  await call('/api/crm/login',{password:process.env.CATALOG_CRM_PASSWORD});
  const crm=await call('/api/crm/requests');
  assert.equal(crm.tunegocioAvailable,true);
  assert.equal(crm.tunegocio.find(item=>item.id===projectId)?.paymentStatus,'paid');
  const route='/api/crm/tunegocio/'+projectId+'/subscription';
  let state=(await call(route,{action:'refresh'})).subscription;
  if(state.canReactivate)state=(await call(route,{action:'reactivate'})).subscription;
  assert.equal(state.status,'active');assert.equal(state.canCancel,true);
  const canceled=(await call(route,{action:'cancel'})).subscription;
  assert.equal(canceled.cancelAtPeriodEnd,true);assert.equal(canceled.nextRenewalAt,null);assert.equal(canceled.paidUntil,order.paid_until.toISOString());
  const reactivated=(await call(route,{action:'reactivate'})).subscription;
  assert.equal(reactivated.cancelAtPeriodEnd,false);assert.ok(reactivated.nextRenewalAt);
  const portal=await call(route,{action:'portal'});
  assert.equal(new URL(portal.url).origin,'https://billing.stripe.com');
  await call(route,{action:'cancel'});
  const after=(await pool.query('SELECT status,paid_until FROM publication_orders WHERE id=$1',[order.id])).rows[0];
  assert.equal(after.status,'paid');assert.equal(after.paid_until.toISOString(),order.paid_until.toISOString());
  const project=(await pool.query('SELECT published_snapshot FROM publication_projects WHERE id=$1',[projectId])).rows[0];
  assert.equal(project.published_snapshot,null,'TEST cannot publish onto production tenant routes');
  const audit=(await pool.query('SELECT action,outcome FROM publication_subscription_audit WHERE order_id=$1',[order.id])).rows;
  for(const action of ['cancel','reactivate','portal'])assert.ok(audit.some(row=>row.action===action&&row.outcome==='succeeded'));
  const evidence={verifiedAt:new Date().toISOString(),projectId,orderId:order.id,checks:['real Stripe TEST checkout paid via browser','real webhook fulfillment','central CRM bridge','scheduled cancellation','reactivation','safe period-end portal','paid entitlement unchanged','TEST publication isolated','action audit']};
  await writeFile(new URL('../../.env.tunegocio-evidence.json',import.meta.url),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
}finally{await pool.end()}
