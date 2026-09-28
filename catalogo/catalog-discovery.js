const enabled=()=>process.env.CATALOG_SEARCH_V2==='true';
const metricsSql=`WITH paid AS (
  SELECT request_id, sum(amount_paid_cents)::bigint AS revenue_cents,
    bool_or(amount_paid_cents>0) AS has_sale, min(paid_at) FILTER (WHERE amount_paid_cents>0) AS first_paid_at
  FROM catalog_revenue_events GROUP BY request_id
)
SELECT r.design_id, max(r.design_name) AS name, max(r.category) AS category,
  count(*)::int AS requests, count(*) FILTER (WHERE paid.has_sale)::int AS sales,
  coalesce(sum(paid.revenue_cents),0)::bigint AS revenue_cents, min(paid.first_paid_at) AS coverage_start
FROM catalog_requests r LEFT JOIN paid ON paid.request_id=r.id GROUP BY r.design_id`;

function metricRow(row){
  const requests=Number(row.requests),sales=Number(row.sales),revenueCents=Number(row.revenue_cents);
  if(![requests,sales,revenueCents].every(Number.isSafeInteger)||requests<0||sales<0||sales>requests||revenueCents<0)throw new Error('Invalid aggregate');
  return {id:row.design_id,name:row.name,category:row.category,requests,sales,conversion:requests?sales/requests:null,revenueCents,coverageStart:row.coverage_start?new Date(row.coverage_start).toISOString():null};
}
function publicMetric(row){return {requests:row.requests,sales:row.sales,conversion:row.conversion};}

function createDiscovery(pool,origin,fetcher=fetch){
  let catalog=null,expires=0,pending=null;
  async function inventory(){
    if(catalog&&Date.now()<expires)return catalog;
    if(pending)return pending;
    pending=(async()=>{
      const response=await fetcher(origin+'/catalog.json',{signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('Catalog inventory unavailable');
      const data=await response.json(),items=Array.isArray(data)?data:data.templates;
      if(!Array.isArray(items)||!items.length||items.length>10000||(data.total!=null&&data.total!==items.length)
        ||items.some(x=>!x||typeof x.id!=='string'||!x.id||x.id.length>200)||new Set(items.map(x=>x.id)).size!==items.length)throw new Error('Invalid catalog inventory');
      const db=await pool.connect();
      try{
        await db.query('BEGIN');
        await db.query('SELECT pg_advisory_xact_lock(784090123)');
        const baseline=!(await db.query('SELECT 1 FROM catalog_design_registry LIMIT 1')).rowCount;
        const payload=items.map(item=>({id:item.id,name:String(item.commercial_name||item.title||item.id).slice(0,300),category:String(item.category||'').slice(0,100)}));
        await db.query(`INSERT INTO catalog_design_registry(design_id,name,category,added_at)
          SELECT id,name,category,CASE WHEN $2::boolean THEN NULL ELSE now() END
          FROM jsonb_to_recordset($1::jsonb) AS x(id text,name text,category text)
          ON CONFLICT(design_id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category`,[JSON.stringify(payload),baseline]);
        const rows=(await db.query('SELECT design_id AS id,name,category,added_at FROM catalog_design_registry WHERE design_id=ANY($1::text[])',[items.map(x=>x.id)])).rows;
        await db.query('COMMIT');
        catalog=rows;expires=Date.now()+300000;return rows;
      }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
    })().finally(()=>{pending=null;});
    return pending;
  }
  async function report(privateReport=false){
    const [catalogResult,metricResult]=await Promise.allSettled([inventory(),pool.query({text:metricsSql,query_timeout:10000})]);
    const rows=catalogResult.status==='fulfilled'?catalogResult.value:[];
    const metricsAvailable=metricResult.status==='fulfilled';
    const metrics=metricsAvailable?metricResult.value.rows.map(metricRow):[];
    const byId=new Map(metrics.map(row=>[row.id,row]));
    const dates=Object.fromEntries(rows.map(row=>[row.id,row.added_at?new Date(row.added_at).toISOString():null]));
    const designs=rows.map(row=>({...row,...(byId.get(row.id)||{requests:0,sales:0,conversion:null,revenueCents:0,coverageStart:null})}));
    if(privateReport){
      const registered=new Set(rows.map(row=>row.id));
      designs.push(...metrics.filter(row=>!registered.has(row.id)));
      return {enabled:true,metricsAvailable,datesAvailable:catalogResult.status==='fulfilled',mode:process.env.CATALOG_ENVIRONMENT==='staging'?'test':'live',generatedAt:new Date().toISOString(),designs:metricsAvailable?designs:[],dates};
    }
    return {enabled:true,metricsAvailable,datesAvailable:catalogResult.status==='fulfilled',mode:process.env.CATALOG_ENVIRONMENT==='staging'?'test':'live',generatedAt:new Date().toISOString(),dates,
      stats:metricsAvailable?Object.fromEntries(designs.map(row=>[row.id,publicMetric(row)])):{}};
  }
  return {report};
}
module.exports={enabled,metricsSql,metricRow,publicMetric,createDiscovery};
