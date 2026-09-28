'use strict';
const crypto=require('node:crypto');
const {Resolver}=require('node:dns').promises;
const {Pool}=require('pg');
const lockPools=new WeakMap();
const enabled=()=>process.env.CRM_ROADMAP_V2==='true';
const n=x=>Number(x||0);
const problem=(status,message)=>Object.assign(new Error(message),{status,publicMessage:message});
const defaultTemplates={
  preview:'Hola {cliente}, ya puedes revisar la propuesta para {negocio}: {preview}. Cuéntanos qué te parece.',
  payment:'Hola {cliente}, aquí tienes el enlace de pago de {negocio}: {pago}. Las condiciones aparecen antes de confirmar.',
  reminder:'Hola {cliente}, te recordamos que tienes pendiente revisar el pago de {negocio}: {pago}. Si necesitas ayuda, escríbenos.',
  published:'Hola {cliente}, la web de {negocio} ya está publicada: {web}. Gracias por confiar en NoeApps.',
  followup:'Hola {cliente}, ¿cómo va todo con {negocio}? Estamos disponibles si necesitas ayuda.',
  cancellation:'Hola {cliente}, la cancelación de {negocio} está programada. El servicio se mantiene hasta {fin}. No se cobrará la siguiente renovación.'
};
const placeholders=new Set(['cliente','negocio','preview','pago','web','fin']);
function validTemplate(kind,body){
  if(!Object.hasOwn(defaultTemplates,kind)||typeof body!=='string'||!body.trim()||body.length>1600||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body))return false;
  return [...body.matchAll(/\{([^{}]+)\}/g)].every(x=>placeholders.has(x[1]))&&!body.replace(/\{[^{}]+\}/g,'').match(/[{}]/);
}
function whatsappDraft(kind,template,item){
  if(!validTemplate(kind,template))throw problem(400,'Plantilla no válida.');
  const raw=String(item.whatsapp||'').trim();
  const phone=raw.replace(/^00/,'').replace(/[^0-9]/g,'');
  if(!/^\+?[\d ().-]+$/.test(raw)||!/^\d{8,15}$/.test(phone)||/^0/.test(phone))throw problem(400,'Añade un WhatsApp válido con prefijo internacional.');
  const values={cliente:item.contact_name||item.businessName||item.business_name,negocio:item.businessName||item.business_name,
    preview:item.preview_url||item.previewUrl,pago:item.payment_url||item.paymentUrl,web:item.publicUrl,
    fin:item.subscription?.paidUntil?new Date(item.subscription.paidUntil).toLocaleDateString('es-ES',{timeZone:'Europe/Madrid'}):''};
  if(kind==='published'&&!item.published)throw problem(409,'La web todavía no consta como publicada.');
  if(kind==='cancellation'&&!item.subscription?.cancelAtPeriodEnd)throw problem(409,'No hay una cancelación programada confirmada.');
  for(const [,field] of template.matchAll(/\{([^{}]+)\}/g)){
    if(!values[field])throw problem(409,'Falta el dato: '+field+'. No se ha preparado un enlace incompleto.');
    if(['preview','pago','web'].includes(field)){
      let u;try{u=new URL(values[field])}catch{throw problem(400,'Enlace no válido.')}
      if(u.protocol!=='https:'||u.username||u.password)throw problem(400,'El enlace debe usar HTTPS.');
    }
  }
  const message=template.replace(/\{([^{}]+)\}/g,(_,field)=>String(values[field]));
  if(message.length>3000)throw problem(400,'El mensaje es demasiado largo.');
  return {message,url:'https://wa.me/'+phone+'?text='+encodeURIComponent(message)};
}
function expenseMonth(rows,month,now=new Date()){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw problem(400,'Mes no válido.');
  const today=now.toLocaleDateString('en-CA',{timeZone:'Europe/Madrid'}),start=month+'-01';
  const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)).toISOString().slice(0,10);
  const amounts={};let total=0,recordedCommissionPayments=0;
  for(const row of rows){
    const date=String(row.expense_date instanceof Date?row.expense_date.toISOString():row.expense_date).slice(0,10);
    const ended=row.ended_on?String(row.ended_on instanceof Date?row.ended_on.toISOString():row.ended_on).slice(0,10):null;
    const applies=row.cadence==='one_time'?date>=start&&date<end&&date<=today&&row.active:
      date<end&&date<=today&&(!ended||ended>=start)&&(row.active||!!ended);
    if(!applies)continue;
    if(row.category==='commission'){recordedCommissionPayments+=n(row.amount_cents);continue;}
    total+=n(row.amount_cents);amounts[row.category]=(amounts[row.category]||0)+n(row.amount_cents);
  }
  return{month,operatingExpensesCents:total,recordedCommissionPaymentsCents:recordedCommissionPayments,byCategory:amounts};
}
function detectIncidents(rows,source,now=Date.now()){
  const found=[];
  const add=(r,kind,title,recommendation,severity='warning')=>found.push({key:source+':'+r.id+':'+kind,source,entityId:String(r.id),kind,title,recommendation,severity,businessName:r.business_name||r.businessName||''});
  for(const r of rows){
    const paid=source==='catalog'?r.first_paid_amount_cents!=null:r.payment_status==='paid';
    const active=source==='catalog'?r.site_status==='active':r.published;
    const until=Date.parse(r.subscription_paid_until||r.paid_until||r.published_until||'');
    const subscription=r.subscription_status||r.stripe_subscription_status||r.subscription_state?.status;
    if(['past_due','unpaid'].includes(subscription))add(r,subscription,'Stripe: '+subscription,'Revisar la factura en Stripe y contactar con el cliente. Conservar el periodo ya pagado.');
    if(paid&&until>now&&!active)add(r,'paid_unpublished','Pago confirmado y web sin publicar','Revisar el estado de publicación y recuperar la web pagada.','error');
    if(active&&Number.isFinite(until)&&until<=now)add(r,'expired_entitlement','Web marcada como publicada con periodo vencido','Comprobar la renovación y el control de acceso. No borrar la web.','error');
    const pending=source==='catalog'?r.stripe_checkout_session_id&&!['paid','complete','expired','failed'].includes(r.stripe_payment_status):r.payment_status==='pending';
    const checkout=Date.parse(r.checkout_created_at||r.updated_at||'');
    if(pending&&Number.isFinite(checkout)&&now-checkout>24*3600000)add(r,'checkout_stale','Checkout pendiente más de 24 horas','Consultar el checkout en Stripe antes de crear otro enlace.');
    if(['error','failed'].includes(r.site_status)||r.publication_error)add(r,'publication_error','Error de publicación','Revisar el origen de la web y los registros del despliegue.','error');
    if(active&&source==='catalog'&&!r.site_origin_url)add(r,'publication_error','Web activa sin origen configurado','Configurar y verificar la URL de la web antes de publicarla.','error');
  }
  return found;
}
async function withRequestLock(pool,id,task){
  if(!enabled())return task();
  if(!lockPools.has(pool))lockPools.set(pool,new Pool({...pool.options,max:2}));
  const db=await lockPools.get(pool).connect();
  try{await db.query("SET lock_timeout='8s'");await db.query('SELECT pg_advisory_lock(hashtextextended($1,0))',['catalog-subscription:'+id]);return await task();}
  finally{await db.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['catalog-subscription:'+id]).catch(()=>{});await db.query('RESET lock_timeout').catch(()=>{});db.release();}
}
function createRoadmap({pool,ensureSchema,bridgeOrigin,bridgeSecret,publicOrigin}){
  let latest=null,running=null;
  const audit=(action,source,entity,details={})=>pool.query('INSERT INTO crm_action_audit(action,source,entity_id,details) VALUES($1,$2,$3,$4::jsonb)',[action,source,String(entity),JSON.stringify(details)]);
  async function remote(){
    if(!bridgeOrigin||!bridgeSecret)return null;
    try{const r=await fetch(bridgeOrigin+'/api/internal/crm-insights',{headers:{Authorization:'Bearer '+bridgeSecret},signal:AbortSignal.timeout(20000)});if(!r.ok)return null;const data=await r.json();return data.enabled?data:null;}catch{return null;}
  }
  async function report(){
    await ensureSchema();
    const [tn,rev,totals,designs,categories,offers,expenses,localOps,assigned]=await Promise.all([
      remote(),
      pool.query(`SELECT coalesce(sum(amount_paid_cents),0)::float8 AS total,
        coalesce(sum(amount_paid_cents) FILTER(WHERE paid_at>=date_trunc('day',now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid'),0)::float8 AS today,
        coalesce(sum(amount_paid_cents) FILTER(WHERE paid_at>=date_trunc('month',now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid'),0)::float8 AS month,
        coalesce(sum(amount_paid_cents) FILTER(WHERE paid_at>=date_trunc('year',now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid'),0)::float8 AS year,
        min(paid_at) AS since FROM catalog_revenue_events WHERE paid_at<=now()`),
      pool.query(`SELECT count(*)::int AS operations,count(*) FILTER(WHERE first_paid_amount_cents>0)::int AS paid,
        count(*) FILTER(WHERE site_status='active' AND subscription_paid_until>now())::int AS active_customers,
        count(*) FILTER(WHERE paid_at>=date_trunc('month',now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid')::int AS new_customers,
        coalesce(sum(first_paid_amount_cents),0)::float8 AS first_revenue,coalesce(sum(commission_cents),0)::float8 AS commissions,
        coalesce(sum(commission_cents) FILTER(WHERE paid_at>=date_trunc('month',now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid'),0)::float8 AS month_commissions,
        coalesce(sum(monthly_price_cents) FILTER(WHERE stripe_subscription_status='active' AND subscription_paid_until>now()),0)::float8 AS mrr,
        count(*) FILTER(WHERE subscription_state->>'cancelAtPeriodEnd'='true')::int AS scheduled_cancellations,
        count(*) FILTER(WHERE stripe_subscription_status='canceled')::int AS cancellations
        FROM catalog_requests`),
      pool.query(`SELECT r.design_id AS id,max(r.design_name) AS name,count(*)::int AS requests,count(*) FILTER(WHERE r.first_paid_amount_cents>0)::int AS sales,
        coalesce(sum(v.revenue),0)::float8 AS revenue FROM catalog_requests r LEFT JOIN LATERAL(SELECT sum(amount_paid_cents) AS revenue FROM catalog_revenue_events WHERE request_id=r.id) v ON true
        GROUP BY r.design_id ORDER BY sales DESC,requests DESC`),
      pool.query(`SELECT category AS name,count(*)::int AS requests,count(*) FILTER(WHERE first_paid_amount_cents>0)::int AS sales FROM catalog_requests GROUP BY category ORDER BY sales DESC`),
      pool.query(`SELECT a.campaign_id AS id,count(DISTINCT a.entity_id)::int AS customers,count(DISTINCT r.request_id) FILTER(WHERE r.amount_paid_cents>0)::int AS sales,
        coalesce(sum(r.amount_paid_cents),0)::float8 AS revenue,sum(r.discount_cents)::float8 AS discount,count(r.event_id) FILTER(WHERE r.discount_cents IS NULL)::int AS unknown_discounts
        FROM crm_campaign_assignments a LEFT JOIN catalog_revenue_events r ON r.request_id=a.entity_id AND r.campaign_id=a.campaign_id
        WHERE a.source='catalog' GROUP BY a.campaign_id`),
      pool.query('SELECT * FROM crm_expenses'),pool.query("SELECT * FROM crm_operations WHERE source='tunegocio'"),
      pool.query("SELECT campaign_id AS id,count(*)::int AS customers FROM crm_campaign_assignments WHERE source='tunegocio' GROUP BY campaign_id")
    ]);
    const cat={revenue:rev.rows[0],totals:totals.rows[0],designs:designs.rows,categories:categories.rows};
    const campaigns=new Map();
    for(const row of [...offers.rows,...(tn?.campaigns||[])]){
      const prior=campaigns.get(row.id)||{id:row.id,customers:0,sales:0,revenue:0,discount:0,unknown_discounts:0};
      for(const k of ['customers','sales','revenue','unknown_discounts'])prior[k]+=n(row[k]);
      prior.discount+=n(row.discount);campaigns.set(row.id,prior);
    }
    if(!tn)for(const row of assigned.rows){const prior=campaigns.get(row.id)||{id:row.id,customers:0,sales:0,revenue:0,discount:0,unknown_discounts:0};prior.customers+=row.customers;prior.partial=true;campaigns.set(row.id,prior);}
    const month=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Madrid'}).slice(0,7),costs=expenseMonth(expenses.rows,month);
    const firstPayments=new Map((tn?.firstPayments||[]).map(r=>[r.project_id,r]));
    let tnCommission=0,tnMonthCommission=0;
    for(const row of localOps.rows){tnCommission+=n(row.commission_cents);const p=firstPayments.get(row.external_id);if(p&&new Date(p.first_paid_at).toLocaleDateString('en-CA',{timeZone:'Europe/Madrid'}).startsWith(month))tnMonthCommission+=n(row.commission_cents);}
    const value={checkedAt:new Date().toISOString(),timezone:'Europe/Madrid',mode:process.env.CATALOG_ENVIRONMENT==='staging'?'test':'live',bridgeAvailable:!!tn,catalog:cat,tunegocio:tn,
      campaigns:[...campaigns.values()].map(x=>({...x,conversion:x.customers?x.sales/x.customers:null,discount:x.unknown_discounts?null:x.discount})),costs,
      combined:tn?{revenue:Object.fromEntries(['today','month','year','total'].map(k=>[k,n(cat.revenue[k])+n(tn.revenue[k])])),
        operations:n(cat.totals.operations)+n(tn.totals.operations),paid:n(cat.totals.paid)+n(tn.totals.paid),
        firstRevenue:n(cat.totals.first_revenue)+n(tn.totals.first_revenue),activeCustomers:n(cat.totals.active_customers)+n(tn.totals.active_customers),
        newCustomers:n(cat.totals.new_customers)+n(tn.totals.new_customers),mrr:n(cat.totals.mrr)+n(tn.mrr.value),
        commissions:n(cat.totals.commissions)+tnCommission,monthCommissions:n(cat.totals.month_commissions)+tnMonthCommission,
        operatingResult:n(cat.revenue.month)+n(tn.revenue.month)-costs.operatingExpensesCents-n(cat.totals.month_commissions)-tnMonthCommission}:null,
      definitions:{revenue:'REAL · cobros brutos confirmados por Stripe; no incluye una conciliación de devoluciones ni facturas anteriores al registro disponible.',mrr:'ESTIMADO · cuota base mensual; no es un cobro futuro confirmado.',ai:'ESTIMADO · telemetría en USD, no factura del proveedor. No se suma a gastos EUR.',churn:'NO DISPONIBLE · falta una cohorte histórica verificable al inicio del mes.',costs:'Gastos registrados del mes. Comisiones devengadas se descuentan una vez; los gastos de categoría comisión se muestran como pagos y no se vuelven a restar.'}};
    latest=value;return value;
  }
  async function scan(){
    if(running)return running;
    running=(async()=>{
      await ensureSchema();
      const run=(await pool.query('INSERT INTO crm_monitor_runs DEFAULT VALUES RETURNING id')).rows[0];
      try{
        const [rows,tn]=await Promise.all([pool.query('SELECT * FROM catalog_requests'),remote()]);
        const incidents=detectIncidents(rows.rows,'catalog');
        if(tn){incidents.push(...detectIncidents(tn.health,'tunegocio'));for(const e of tn.aiErrors||[])incidents.push({key:'tunegocio:ai:'+e.id,source:'tunegocio',entityId:String(e.generation_id||e.id),kind:'ai_error',title:'Error de generación IA',businessName:'Generación '+(e.generation_id||e.id),severity:'error',recommendation:'Revisar la generación '+(e.generation_id||e.id)+' ('+e.operation+'). El registro no dispone de un cliente vinculado.'});}
        else incidents.push({key:'system:bridge',source:'system',entityId:'tunegocio',kind:'bridge_unavailable',title:'Bridge de TuNegocio no disponible',businessName:'TuNegocio',severity:'error',recommendation:'Comprobar el servicio de staging, la conexión y la autenticación del bridge.'});
        const resolver=new Resolver({timeout:2500,tries:1}),resolvedDomains=[];
        const domains=rows.rows.filter(r=>r.site_status==='active'&&r.site_slug).map(r=>({r,host:process.env.CATALOG_ENVIRONMENT==='staging'?new URL(publicOrigin).hostname:r.site_slug+'.'+(process.env.SITE_DOMAIN||'noeapps.com')}));
        for(let i=0;i<domains.length;i+=4)await Promise.all(domains.slice(i,i+4).map(async({r,host})=>{
          try{await resolver.resolve4(host);resolvedDomains.push('catalog:'+r.id+':domain')}catch(e){if(!['ENOTFOUND','ENODATA'].includes(e.code))return;try{await resolver.resolve6(host);resolvedDomains.push('catalog:'+r.id+':domain');return}catch(e6){if(!['ENOTFOUND','ENODATA'].includes(e6.code))return;}
            incidents.push({key:'catalog:'+r.id+':domain',source:'catalog',entityId:r.id,kind:'domain',title:'Dominio sin resolución DNS',businessName:r.business_name,severity:'error',recommendation:'Revisar los registros DNS de '+host+'. No se han modificado.'});}
        }));
        const db=await pool.connect();
        try{await db.query('BEGIN');
          for(const item of incidents)await db.query(`INSERT INTO crm_incidents(key,source,entity_id,kind,severity,title,business_name,recommendation) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT(key) DO UPDATE SET last_seen_at=now(),title=EXCLUDED.title,recommendation=EXCLUDED.recommendation,
            state=CASE WHEN crm_incidents.state='resolved' THEN 'open' ELSE crm_incidents.state END,resolved_at=NULL`,[item.key,item.source,item.entityId,item.kind,item.severity,item.title,item.businessName,item.recommendation]);
          await db.query(`UPDATE crm_incidents SET state='resolved',resolved_at=now() WHERE state<>'resolved' AND NOT(key=ANY($1::text[])) AND
            (source IN ('catalog','system') OR ($2 AND source='tunegocio')) AND kind<>'domain'`,[incidents.map(x=>x.key),!!tn&&!tn.healthTruncated]);
          await db.query("UPDATE crm_incidents SET state='resolved',resolved_at=now() WHERE kind='domain' AND key=ANY($1::text[]) AND state<>'resolved'",[resolvedDomains]);
          await db.query('COMMIT');
        }catch(error){await db.query('ROLLBACK');throw error}finally{db.release();}
        await pool.query("UPDATE crm_monitor_runs SET finished_at=now(),outcome=$2,checked_count=$3,open_count=$4 WHERE id=$1",[run.id,tn?'succeeded':'partial',rows.rows.length+(tn?.health?.length||0),incidents.length]);
        return {checked:rows.rows.length+(tn?.health?.length||0),found:incidents.length,bridgeAvailable:!!tn};
      }catch(error){await pool.query("UPDATE crm_monitor_runs SET finished_at=now(),outcome='failed',detail='No se pudo completar la comprobación' WHERE id=$1",[run.id]);throw error;}
    })().finally(()=>{running=null;});return running;
  }
  return {report,scan,audit,remote,latest:()=>latest,defaultTemplates};
}
module.exports={enabled,createRoadmap,defaultTemplates,validTemplate,whatsappDraft,expenseMonth,detectIncidents,withRequestLock,problem};
