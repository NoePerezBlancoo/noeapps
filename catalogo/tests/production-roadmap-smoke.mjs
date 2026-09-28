// Post-release read-only smoke checks. No Stripe calls, business writes or messages.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const env=JSON.parse(await readFile(new URL('.env.operations-production.json',root),'utf8'));
const origin='https://catalogo.noeapps.com';
assert.equal(env.PUBLIC_ORIGIN,origin);assert.equal(env.TUNEGOCIO_CRM_ORIGIN,'https://tunegocio-beta-production.up.railway.app');
assert.match(env.STRIPE_SECRET_KEY,/^(sk|rk)_live_/);
let cookie='';
async function get(path){const r=await fetch(origin+path,{headers:{Cookie:cookie}});assert.equal(r.status,200,path);return r.json();}
const evidence={at:new Date().toISOString(),origin,checks:[],stripeWrites:0,businessWrites:0,messagesSent:0};
assert.equal((await fetch(origin+'/health')).status,200);
assert.equal((await fetch(env.TUNEGOCIO_CRM_ORIGIN+'/api/health')).status,200);
assert.equal((await fetch(origin+'/api/crm/roadmap')).status,401);
assert.equal((await fetch(env.TUNEGOCIO_CRM_ORIGIN+'/api/internal/crm-insights')).status,401);
evidence.checks.push('Public health endpoints 200; private reports reject anonymous access');
const login=await fetch(origin+'/api/crm/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:env.CATALOG_CRM_PASSWORD})});
assert.equal(login.status,200);cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
try{
  const report=await get('/api/crm/roadmap');assert.equal(report.mode,'live');assert.equal(report.bridgeAvailable,true);assert.equal(report.tunegocio.mode,'live');
  for(const period of ['today','month','year','total'])assert.equal(report.combined.revenue[period],report.catalog.revenue[period]+report.tunegocio.revenue[period]);
  assert.equal(report.combined.operatingResult,report.combined.revenue.month-report.costs.operatingExpensesCents-report.combined.monthCommissions);
  evidence.checks.push('Authenticated production bridge and analytics reconcile');
  const templates=await get('/api/crm/roadmap/templates');assert.equal(Object.keys(templates.templates).length,6);
  evidence.checks.push('Six WhatsApp templates available; no message prepared or sent');
  const incidents=await get('/api/crm/roadmap/incidents');assert.ok(incidents.lastRun);assert.equal(incidents.lastRun.outcome,'succeeded');
  evidence.checks.push('Automatic production monitor completed successfully');
  const offers=await get('/api/crm/offers');assert.ok(Array.isArray(offers.offers));
  if(offers.offers.length){const customers=await get('/api/crm/roadmap/campaign?id='+offers.offers[0].id);assert.ok(Array.isArray(customers.customers));}
  const expenses=await get('/api/crm/expenses');assert.ok(Array.isArray(expenses.expenses));
  evidence.checks.push('Existing offers, campaign customer view and expense listing respond');
  evidence.products={catalogOperations:report.catalog.totals.operations,tunegocioOperations:report.tunegocio.totals.operations};
  evidence.monitor={outcome:incidents.lastRun.outcome,openCount:incidents.openCount};
  evidence.offerCount=offers.offers.length;evidence.expenseCount=expenses.expenses.length;
}finally{await fetch(origin+'/api/crm/logout',{method:'POST',headers:{Origin:origin,Cookie:cookie}});}
await writeFile(new URL('.env.operations-production-smoke.json',root),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
