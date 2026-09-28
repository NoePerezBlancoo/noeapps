// Final, authenticated staging verification against the already-created synthetic fixtures.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const env=JSON.parse(await readFile(new URL('.env.roadmap-staging.json',root),'utf8'));
const fixture=JSON.parse(await readFile(new URL('.env.roadmap-evidence.json',root),'utf8')).fixtures;
const origin='https://catalogo-staging-v2-production.up.railway.app';
assert.equal(env.CATALOG_ENVIRONMENT,'staging');assert.equal(env.PUBLIC_ORIGIN,origin);
let cookie='';
async function api(path,body){
  const r=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal(r.status,200,path);if(path==='/api/crm/login')cookie=r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  return r.json();
}
assert.equal((await fetch(origin+'/api/crm/roadmap')).status,401);
await api('/api/crm/login',{password:env.CATALOG_CRM_PASSWORD});
const report=await api('/api/crm/roadmap');
assert.equal(report.mode,'test');assert.equal(report.bridgeAvailable,true);assert.equal(report.tunegocio.mode,'test');
for(const period of ['today','month','year','total'])assert.equal(report.combined.revenue[period],report.catalog.revenue[period]+report.tunegocio.revenue[period]);
assert.equal(report.combined.operatingResult,report.combined.revenue.month-report.costs.operatingExpensesCents-report.combined.monthCommissions);
for(const product of [report.catalog,report.tunegocio]){
  assert.ok(Number.isInteger(product.totals.new_customers));assert.ok(Number.isInteger(product.totals.published));
  assert.ok(product.totals.active_customers<=product.totals.published);
}
const campaign=report.campaigns.find(x=>x.id===fixture.campaignId);
assert.equal(campaign.customers,2);assert.equal(campaign.sales,2);assert.equal(campaign.revenue,1990);assert.equal(campaign.discount,1990);
const customers=(await api('/api/crm/roadmap/campaign?id='+fixture.campaignId)).customers;
assert.equal(customers.length,2);assert.deepEqual(customers.map(x=>x.source).sort(),['catalog','tunegocio']);
assert.ok(customers.every(x=>x.business_name.startsWith('STAGING ')));
const templates=(await api('/api/crm/roadmap/templates')).templates;
assert.equal(Object.keys(templates).length,6);
const scan=await api('/api/crm/roadmap/scan',{});assert.equal(scan.bridgeAvailable,true);
const incidents=await api('/api/crm/roadmap/incidents');assert.equal(incidents.lastRun.outcome,'succeeded');
assert.ok(incidents.incidents.some(x=>x.key==='catalog:'+fixture.requestId+':publication_error'&&x.state==='resolved')||incidents.incidents.some(x=>x.entity_id===fixture.requestId&&x.kind==='publication_error'&&x.state==='resolved'));
assert.ok(!incidents.incidents.some(x=>x.key==='system:bridge'&&x.state!=='resolved'));
const evidence={at:new Date().toISOString(),origin,bridgeAvailable:true,mode:report.mode,campaign,
  combined:report.combined,costs:report.costs,monitor:{outcome:incidents.lastRun.outcome,checkedCount:incidents.lastRun.checked_count,openCount:incidents.openCount},
  checks:['Private analytics reject anonymous access','Both isolated TEST products respond','Aggregate revenue and operating result reconcile','Customer cohorts and published counts available','Campaign has two actual sales and 1990 cents discount','Campaign customer list includes both products','Six editable WhatsApp templates available','Monitor succeeds and previous injected publication error is resolved']};
await writeFile(new URL('.env.roadmap-final-evidence.json',root),JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence,null,2));
