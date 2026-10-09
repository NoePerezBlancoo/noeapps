const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../search-engine');
const discovery=require('../catalog-discovery');
const items=[
  {id:'hair',commercial_name:'Velvet Atelier',category:'Belleza',style:['Premium'],format:'One Page',impact_score:25},
  {id:'food',commercial_name:'Ember',category:'Hostelería',style:['Animado'],format:'Multi Page',impact_score:20},
  {id:'law',commercial_name:'Veritas',category:'Legal',style:['Minimalista']},
  {id:'garage',commercial_name:'Nightshift',category:'Automoción',style:['Oscuro']},
  {id:'estate',commercial_name:'Aether',category:'Inmobiliaria',style:['Premium']},
  {id:'tech',commercial_name:'Prism',category:'Tecnología',style:['3D'],impact_score:26},
];
test('semantic business and visual equivalents resolve every requested example',()=>{
  const queries={'peluquería elegante':'hair','restaurante moderno':'food','abogado serio':'law','taller industrial':'garage','inmobiliaria premium':'estate','una PELUQUERÍA de LUJO':'hair','bufete sobrio':'law'};
  for(const [query,id] of Object.entries(queries))assert.equal(engine.search(items,{query})[0]?.item.id,id,query);
  assert.equal(engine.search(items,{query:'astronauta desconocido'}).length,0);
  assert.equal(engine.search(items,{query:'abogado restaurante'}).length,0);
});
test('all filters intersect; invalid price ranges never broaden results',()=>{
  assert.equal(engine.search(items,{query:'elegante',category:'Belleza',style:'Premium',business:'peluqueria',sector:'Belleza y moda',minPrice:149,maxPrice:149})[0]?.item.id,'hair');
  assert.deepEqual(engine.search(items,{query:'abogado',business:'taller'}),[]);
  assert.deepEqual(engine.search(items,{query:'restaurante',format:'One Page'}),[]);
  assert.deepEqual(engine.search(items,{query:'restaurante',format:'Multi Page'}).map(x=>x.item.id),['food']);
  for(const options of [{minPrice:300,maxPrice:100},{minPrice:-1},{maxPrice:'oops'}])assert.deepEqual(engine.search(items,options),[]);
  assert.deepEqual(engine.search(items,{sort:'price-desc'}).map(x=>engine.tier(x.item).price),[299,149,149,79,39,39]);
});
test('everyday automotive terms and their plurals find automotive designs',()=>{
  for(const query of ['coche','COCHES','vehículo','vehículos','automóvil','automóviles','auto','autos','concesionario','concesionarios','taller','talleres']){
    assert.deepEqual(engine.search(items,{query}).map(x=>x.item.id),['garage'],query);
  }
  assert.deepEqual(engine.search(items,{query:'coches',category:'Legal'}),[]);
  assert.deepEqual(engine.search(items,{query:'coches',minPrice:100}),[]);
  assert.deepEqual(engine.search(items,{query:'coches modernos'}),[]);
  assert.deepEqual(engine.search(items,{query:'coches oscuros'}).map(x=>x.item.id),['garage']);
});
test('business and style plurals retain all search terms and accent normalization',()=>{
  for(const [query,id] of Object.entries({'bufetes sobrios':'law','abogadas serias':'law','cafeterías modernas':'food','barberías elegantes':'hair','inmobiliarias sofisticadas':'estate'}))assert.deepEqual(engine.search(items,{query}).map(x=>x.item.id),[id],query);
  assert.deepEqual(engine.search(items,{query:'coches astronautas'}),[]);
  assert.deepEqual(engine.search(items,{query:'automóviles abogados'}),[]);
});
test('common one-letter typing mistakes still find the intended business and style',()=>{
  for(const query of ['peluqueriaa elegante','peluqueria elegnate','restaurente moderno','inmobiliria premium']){
    assert.equal(engine.search(items,{query}).length,1,query);
  }
  assert.deepEqual(engine.search(items,{query:'coche astronata'}),[]);
  assert.deepEqual(engine.search(items,{query:'ley'}),[]);
});
test('ranking uses observed metrics and date information; zero and unknown differ',()=>{
  const stats={law:{requests:10,sales:2,conversion:.2},hair:{requests:2,sales:1,conversion:.5},tech:{requests:0,sales:0,conversion:null}};
  assert.equal(engine.search(items,{sort:'popular',stats})[0].item.id,'law');
  assert.equal(engine.search(items,{sort:'sales',stats})[0].item.id,'law');
  assert.equal(engine.search(items,{sort:'conversion',stats})[0].item.id,'hair');
  assert.equal(engine.search(items,{sort:'newest',dates:{law:'2026-09-28T10:00:00Z',tech:null}})[0].item.id,'law');
  assert.equal(engine.search(items,{query:'abogado',sort:'sales',stats}).length,1);
});
test('metric shape has a denominator and public output excludes financial totals',()=>{
  const row=discovery.metricRow({design_id:'law',name:'Legal',category:'Legal',requests:4,sales:1,revenue_cents:'1990',coverage_start:null});
  assert.equal(row.conversion,.25);
  assert.deepEqual(discovery.publicMetric(row),{requests:4,sales:1,conversion:.25});
  assert.equal(discovery.metricRow({...{design_id:'zero',requests:0,sales:0,revenue_cents:0}}).conversion,null);
  assert.throws(()=>discovery.metricRow({requests:1,sales:2,revenue_cents:5}));
});
test('metric outage is explicit and never converted to zero-valued success',async()=>{
  const app=discovery.createDiscovery({query:async()=>{throw new Error('Unavailable')}},'https://example.invalid',async()=>new Response('',{status:503}));
  const report=await app.report();
  assert.equal(report.metricsAvailable,false);assert.equal(report.datesAvailable,false);assert.deepEqual(report.stats,{});
});
