const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {Pool}=require('pg');

const html=fs.readFileSync(path.join(__dirname,'index.html'));
const requestHtml=fs.readFileSync(path.join(__dirname,'solicitar.html'));
const crmHtml=fs.readFileSync(path.join(__dirname,'crm.html'));

function validateCatalogHtml(buffer){
  const source=buffer.toString('utf8');
  const match=source.match(/<script>([\s\S]*)<\/script>\s*<\/body>/i);
  if(!match)throw new Error('Catalog inline script not found');
  new Function(match[1]);
}
validateCatalogHtml(html);

const port=process.env.PORT||3000;
const LIBRARY_ORIGIN='https://catalog-production-53f9.up.railway.app';
const DATABASE_URL=process.env.DATABASE_URL||'';
const CRM_PASSWORD=process.env.CATALOG_CRM_PASSWORD||'';
const SESSION_SECRET=process.env.CATALOG_SESSION_SECRET||'';
const STRIPE_SECRET_KEY=(process.env.STRIPE_SECRET_KEY||'').trim();
const STRIPE_WEBHOOK_SECRET=(process.env.STRIPE_WEBHOOK_SECRET||'').trim();
const STRIPE_ACCOUNT_ID=(process.env.STRIPE_ACCOUNT_ID||'').trim();
const STRIPE_CREATION_PRODUCT_ID=(process.env.STRIPE_CREATION_PRODUCT_ID||'').trim();
const STRIPE_MAINTENANCE_PRODUCT_ID=(process.env.STRIPE_MAINTENANCE_PRODUCT_ID||'').trim();
const STRIPE_DEFAULT_MONTHLY_PRICE_ID=(process.env.STRIPE_DEFAULT_MONTHLY_PRICE_ID||'').trim();
const STRIPE_AUTOMATIC_TAX=/^(1|true|yes)$/i.test(process.env.STRIPE_AUTOMATIC_TAX||'');
const PUBLIC_ORIGIN=(process.env.PUBLIC_ORIGIN||'https://catalogo.noeapps.com').replace(/\/$/,'');
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:20000}):null;
let schemaPromise=null;

async function ensureSchema(){
  if(!pool)throw new Error('database_not_configured');
  if(!schemaPromise)schemaPromise=pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_requests(
      id uuid PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      status text NOT NULL DEFAULT 'new',
      contact_name text NOT NULL,
      business_name text NOT NULL,
      whatsapp text NOT NULL,
      email text NOT NULL DEFAULT '',
      city text NOT NULL DEFAULT '',
      source_url text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '',
      design_id text NOT NULL,
      design_name text NOT NULL,
      category text NOT NULL DEFAULT '',
      tier text NOT NULL DEFAULT '',
      creation_price integer NOT NULL,
      monthly_price_cents integer NOT NULL DEFAULT 1990,
      salesperson text NOT NULL DEFAULT '',
      discount_code text NOT NULL DEFAULT '',
      discount_type text NOT NULL DEFAULT 'none',
      discount_value integer NOT NULL DEFAULT 0,
      discount_scope text NOT NULL DEFAULT 'creation',
      stripe_checkout_session_id text NOT NULL DEFAULT '',
      stripe_customer_id text NOT NULL DEFAULT '',
      stripe_subscription_id text NOT NULL DEFAULT '',
      stripe_payment_status text NOT NULL DEFAULT '',
      stripe_subscription_status text NOT NULL DEFAULT '',
      stripe_last_invoice_id text NOT NULL DEFAULT '',
      stripe_last_event_at timestamptz,
      paid_at timestamptz,
      checkout_fingerprint text NOT NULL DEFAULT '',
      catalog_preview_url text NOT NULL DEFAULT '',
      thumbnail_url text NOT NULL DEFAULT '',
      preview_url text NOT NULL DEFAULT '',
      payment_url text NOT NULL DEFAULT '',
      admin_notes text NOT NULL DEFAULT ''
    );
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS monthly_price_cents integer NOT NULL DEFAULT 1990;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS salesperson text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS discount_code text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'none';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS discount_value integer NOT NULL DEFAULT 0;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS discount_scope text NOT NULL DEFAULT 'creation';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS stripe_customer_id text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS stripe_subscription_id text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS stripe_payment_status text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS stripe_subscription_status text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS stripe_last_invoice_id text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS stripe_last_event_at timestamptz;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS paid_at timestamptz;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS checkout_fingerprint text NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS stripe_events(
      id text PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS catalog_requests_created_idx ON catalog_requests(created_at DESC);
    CREATE INDEX IF NOT EXISTS catalog_requests_status_idx ON catalog_requests(status);
  `).catch(error=>{schemaPromise=null;throw error});
  return schemaPromise;
}

function contentType(pathname,upstream){
  const ext=path.extname(pathname).toLowerCase();
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
  return types[ext]||upstream||'application/octet-stream';
}
async function proxy(req,res,target,pathname){
  try{
    const upstream=await fetch(target,{method:req.method,redirect:'follow'});
    res.writeHead(upstream.status,{'Content-Type':contentType(pathname,upstream.headers.get('content-type')),'Cache-Control':pathname.endsWith('catalog.json')?'public, max-age=30':'public, max-age=3600','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')return res.end();
    res.end(Buffer.from(await upstream.arrayBuffer()));
  }catch{
    res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Catalog asset unavailable');
  }
}
function json(res,status,value,extra={}){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});
  res.end(JSON.stringify(value));
}
async function bodyJson(req,max=24000){
  let size=0,chunks=[];
  for await(const chunk of req){
    size+=chunk.length;
    if(size>max){const e=new Error('body_too_large');e.status=413;throw e}
    chunks.push(chunk);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}catch{const e=new Error('invalid_json');e.status=400;throw e}
}
function text(value,max){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):''}
function safeUrl(value,max=1600){
  const raw=text(value,max);if(!raw)return'';
  try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password?u.toString():''}catch{return''}
}
function safeEq(a,b){
  const x=Buffer.from(String(a)),y=Buffer.from(String(b));
  return x.length===y.length&&crypto.timingSafeEqual(x,y);
}
function cookies(req){
  return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2));
}
function makeSession(){
  const exp=Date.now()+7*24*60*60*1000;
  const sig=crypto.createHmac('sha256',SESSION_SECRET).update(String(exp)).digest('base64url');
  return exp+'.'+sig;
}
function validSession(req){
  if(!SESSION_SECRET)return false;
  const token=cookies(req).catalog_crm||'';
  const [expRaw,sig]=token.split('.');
  const exp=Number(expRaw);
  if(!Number.isFinite(exp)||exp<Date.now()||!sig)return false;
  const expected=crypto.createHmac('sha256',SESSION_SECRET).update(String(exp)).digest('base64url');
  return safeEq(sig,expected);
}
function sessionCookie(token){
  return 'catalog_crm='+encodeURIComponent(token)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800';
}
function clearCookie(){return 'catalog_crm=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'}
function validUuid(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)}
const statuses=new Set(['new','preparing','preview_ready','sent','paid','published','closed']);
const discountTypes=new Set(['none','percent','fixed']);
const discountScopes=new Set(['creation','monthly','both']);

async function rawBody(req,max=1024*1024){
  let size=0,chunks=[];
  for await(const chunk of req){
    size+=chunk.length;
    if(size>max){const e=new Error('body_too_large');e.status=413;throw e}
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function appendForm(form,key,value){
  if(value===undefined||value===null||value==='')return;
  if(Array.isArray(value)){value.forEach((v,i)=>appendForm(form,key+'['+i+']',v));return}
  if(typeof value==='object'){Object.entries(value).forEach(([k,v])=>appendForm(form,key?key+'['+k+']':k,v));return}
  form.append(key,String(value));
}
async function stripePost(endpoint,params,idempotencyKey=''){
  if(!STRIPE_SECRET_KEY){const e=new Error('stripe_not_configured');e.status=503;e.publicMessage='Falta conectar la clave privada de Stripe al CRM.';throw e}
  const form=new URLSearchParams();appendForm(form,'',params);
  const headers={'Authorization':'Bearer '+STRIPE_SECRET_KEY,'Content-Type':'application/x-www-form-urlencoded'};
  if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;
  const response=await fetch('https://api.stripe.com/v1'+endpoint,{method:'POST',headers,body:form});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const e=new Error(data&&data.error&&data.error.message?data.error.message:'stripe_error');
    e.status=502;e.publicMessage='Stripe: '+(data&&data.error&&data.error.message?data.error.message:'no se pudo crear el cobro.');
    throw e;
  }
  return data;
}
function verifyStripeSignature(payload,header){
  if(!STRIPE_WEBHOOK_SECRET||!header)return false;
  const parts=String(header).split(',');
  const timestamp=(parts.find(x=>x.startsWith('t='))||'').slice(2);
  const signatures=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));
  const ts=Number(timestamp);
  if(!Number.isFinite(ts)||Math.abs(Math.floor(Date.now()/1000)-ts)>300)return false;
  const expected=crypto.createHmac('sha256',STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+payload.toString('utf8')).digest('hex');
  return signatures.some(sig=>safeEq(sig,expected));
}
function applyDiscount(cents,type,value,scope,target){
  if(type==='none'||!value||!(scope===target||scope==='both'))return cents;
  if(type==='percent')return Math.max(0,Math.round(cents*(100-value)/100));
  if(type==='fixed')return Math.max(0,cents-value);
  return cents;
}
function checkoutFingerprint(row){
  return crypto.createHash('sha256').update(JSON.stringify([
    row.creation_price,row.monthly_price_cents,row.discount_code,row.discount_type,row.discount_value,row.discount_scope,row.salesperson,row.email,row.design_id
  ])).digest('hex');
}
function invoiceSubscriptionId(obj){
  return obj&&(
    obj.subscription||
    (obj.parent&&obj.parent.subscription_details&&obj.parent.subscription_details.subscription)||
    (obj.subscription_details&&obj.subscription_details.subscription)
  )||'';
}
function invoiceRequestId(obj){
  return obj&&(
    (obj.metadata&&obj.metadata.catalog_request_id)||
    (obj.parent&&obj.parent.subscription_details&&obj.parent.subscription_details.metadata&&obj.parent.subscription_details.metadata.catalog_request_id)||
    (obj.subscription_details&&obj.subscription_details.metadata&&obj.subscription_details.metadata.catalog_request_id)
  )||'';
}
async function createStripeCheckout(res,id){
  if(!validUuid(id))return json(res,400,{error:'Solicitud no válida.'});
  if(!STRIPE_CREATION_PRODUCT_ID||!STRIPE_MAINTENANCE_PRODUCT_ID){return json(res,503,{error:'Stripe todavía no está terminado de configurar.'})}
  await ensureSchema();
  const found=await pool.query('SELECT * FROM catalog_requests WHERE id=$1',[id]);
  const row=found.rows[0];if(!row)return json(res,404,{error:'Solicitud no encontrada.'});
  const creationBase=Math.max(0,Math.round(Number(row.creation_price)*100));
  const monthlyBase=Math.max(0,Math.round(Number(row.monthly_price_cents)));
  const creationAmount=applyDiscount(creationBase,row.discount_type,Number(row.discount_value)||0,row.discount_scope,'creation');
  const monthlyAmount=applyDiscount(monthlyBase,row.discount_type,Number(row.discount_value)||0,row.discount_scope,'monthly');
  if(monthlyAmount<50)return json(res,400,{error:'La cuota mensual final debe ser al menos 0,50 €.'});
  const fingerprint=checkoutFingerprint(row);
  if(row.payment_url&&row.checkout_fingerprint===fingerprint&&!['paid','complete','expired','failed'].includes(String(row.stripe_payment_status||'').toLowerCase())){
    return json(res,200,{ok:true,reused:true,url:row.payment_url,request:row});
  }
  const lineItems=[];
  if(creationAmount>0){
    lineItems.push({price_data:{currency:'eur',product:STRIPE_CREATION_PRODUCT_ID,unit_amount:creationAmount,tax_behavior:'inclusive'},quantity:1});
  }
  const monthlyDiscounted=monthlyAmount!==monthlyBase;
  if(monthlyAmount===1990&&!monthlyDiscounted&&STRIPE_DEFAULT_MONTHLY_PRICE_ID){
    lineItems.push({price:STRIPE_DEFAULT_MONTHLY_PRICE_ID,quantity:1});
  }else{
    lineItems.push({price_data:{currency:'eur',product:STRIPE_MAINTENANCE_PRODUCT_ID,unit_amount:monthlyAmount,tax_behavior:'inclusive',recurring:{interval:'month',interval_count:1}},quantity:1});
  }
  const metadata={
    catalog_request_id:row.id,
    design_id:row.design_id,
    salesperson:row.salesperson||'',
    discount_code:row.discount_code||''
  };
  const params={
    mode:'subscription',
    client_reference_id:row.id,
    line_items:lineItems,
    billing_address_collection:'required',
    tax_id_collection:{enabled:true},
    locale:'es',
    success_url:PUBLIC_ORIGIN+'/pago-ok?session_id={CHECKOUT_SESSION_ID}',
    cancel_url:row.preview_url||PUBLIC_ORIGIN+'/',
    metadata,
    subscription_data:{metadata}
  };
  if(row.email)params.customer_email=row.email;
  if(STRIPE_AUTOMATIC_TAX)params.automatic_tax={enabled:true};
  const session=await stripePost('/checkout/sessions',params,'catalog-checkout-'+row.id+'-'+fingerprint.slice(0,24));
  const updated=await pool.query(`UPDATE catalog_requests SET payment_url=$2,stripe_checkout_session_id=$3,stripe_payment_status=$4,checkout_fingerprint=$5,updated_at=now() WHERE id=$1 RETURNING *`,
    [row.id,session.url||'',session.id||'',session.payment_status||session.status||'open',fingerprint]);
  return json(res,200,{ok:true,url:session.url,request:updated.rows[0]});
}
async function createCustomerPortal(res,id){
  if(!validUuid(id))return json(res,400,{error:'Solicitud no válida.'});
  await ensureSchema();
  const found=await pool.query('SELECT * FROM catalog_requests WHERE id=$1',[id]);
  const row=found.rows[0];if(!row)return json(res,404,{error:'Solicitud no encontrada.'});
  if(!row.stripe_customer_id)return json(res,400,{error:'Este cliente todavía no tiene una suscripción Stripe.'});
  const session=await stripePost('/billing_portal/sessions',{customer:row.stripe_customer_id,return_url:PUBLIC_ORIGIN+'/crm'});
  return json(res,200,{ok:true,url:session.url});
}
async function handleStripeWebhook(req,res){
  const payload=await rawBody(req);
  if(!verifyStripeSignature(payload,req.headers['stripe-signature']))return json(res,400,{error:'Firma Stripe no válida.'});
  let event;try{event=JSON.parse(payload.toString('utf8'))}catch{return json(res,400,{error:'Evento Stripe no válido.'})}
  await ensureSchema();
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const inserted=await client.query('INSERT INTO stripe_events(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',[event.id]);
    if(!inserted.rows[0]){await client.query('COMMIT');return json(res,200,{received:true,duplicate:true})}
    const obj=event.data&&event.data.object?event.data.object:{};
    const type=event.type||'';
    if(type==='checkout.session.completed'||type==='checkout.session.async_payment_succeeded'){
      const requestId=(obj.metadata&&obj.metadata.catalog_request_id)||obj.client_reference_id||'';
      if(validUuid(requestId)){
        await client.query(`UPDATE catalog_requests SET
          stripe_customer_id=COALESCE(NULLIF($2,''),stripe_customer_id),
          stripe_subscription_id=COALESCE(NULLIF($3,''),stripe_subscription_id),
          stripe_payment_status=$4,
          stripe_last_event_at=now(),
          paid_at=CASE WHEN $4='paid' THEN COALESCE(paid_at,now()) ELSE paid_at END,
          status=CASE WHEN $4='paid' AND status IN ('new','preparing','preview_ready','sent','paid') THEN 'paid' ELSE status END,
          updated_at=now()
          WHERE id=$1`,[requestId,String(obj.customer||''),String(obj.subscription||''),String(obj.payment_status||'complete')]);
      }
    }else if(type==='checkout.session.expired'){
      const requestId=(obj.metadata&&obj.metadata.catalog_request_id)||obj.client_reference_id||'';
      if(validUuid(requestId))await client.query('UPDATE catalog_requests SET stripe_payment_status=$2,stripe_last_event_at=now(),updated_at=now() WHERE id=$1',[requestId,'expired']);
    }else if(type==='invoice.paid'||type==='invoice.payment_failed'){
      const requestId=invoiceRequestId(obj);
      const subscriptionId=invoiceSubscriptionId(obj);
      const paymentStatus=type==='invoice.paid'?'paid':'failed';
      const values=[paymentStatus,String(obj.id||''),subscriptionId];
      let where='';
      if(validUuid(requestId)){values.push(requestId);where='id=$4'}
      else if(subscriptionId){where='stripe_subscription_id=$3'}
      if(where){
        await client.query(`UPDATE catalog_requests SET stripe_payment_status=$1,stripe_last_invoice_id=$2,stripe_last_event_at=now(),
          paid_at=CASE WHEN $1='paid' THEN COALESCE(paid_at,now()) ELSE paid_at END,
          status=CASE WHEN $1='paid' AND status IN ('new','preparing','preview_ready','sent','paid') THEN 'paid' ELSE status END,
          updated_at=now() WHERE `+where,values);
      }
    }else if(type==='customer.subscription.created'||type==='customer.subscription.updated'||type==='customer.subscription.deleted'){
      const requestId=obj.metadata&&obj.metadata.catalog_request_id||'';
      const subStatus=String(obj.status||(type.endsWith('.deleted')?'canceled':''));
      if(validUuid(requestId)){
        await client.query('UPDATE catalog_requests SET stripe_subscription_id=$2,stripe_customer_id=COALESCE(NULLIF($3,\'\'),stripe_customer_id),stripe_subscription_status=$4,stripe_last_event_at=now(),updated_at=now() WHERE id=$1',
          [requestId,String(obj.id||''),String(obj.customer||''),subStatus]);
      }else if(obj.id){
        await client.query('UPDATE catalog_requests SET stripe_subscription_status=$2,stripe_last_event_at=now(),updated_at=now() WHERE stripe_subscription_id=$1',[String(obj.id),subStatus]);
      }
    }
    await client.query('COMMIT');
    return json(res,200,{received:true});
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}

async function createRequest(req,res){
  const data=await bodyJson(req);
  const customer=data.customer&&typeof data.customer==='object'?data.customer:{};
  const selection=data.selection&&typeof data.selection==='object'?data.selection:{};
  const contactName=text(customer.name,120),businessName=text(customer.businessName,160),whatsapp=text(customer.whatsapp,80),email=text(customer.email,180),city=text(customer.city,120),sourceUrl=safeUrl(customer.sourceUrl,600),notes=text(customer.notes,1800);
  const designId=text(selection.id||selection.designId,160),designName=text(selection.name||selection.designName,160)||'Diseño NoeApps',category=text(selection.category,120),tier=text(selection.tier,80),creationPrice=Number(selection.price),catalogPreview=safeUrl(selection.preview,1600),thumbnail=safeUrl(selection.thumbnail,1600);
  if(!contactName||!businessName||!whatsapp)return json(res,400,{error:'Completa tu nombre, negocio y WhatsApp.'});
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(res,400,{error:'Revisa el email.'});
  if(!/^[+()0-9 .-]{6,80}$/.test(whatsapp))return json(res,400,{error:'Revisa el WhatsApp.'});
  if(!designId||![39,79,149,299].includes(creationPrice))return json(res,400,{error:'No hemos podido identificar correctamente el diseño. Vuelve al catálogo.'});
  await ensureSchema();
  const id=crypto.randomUUID();
  await pool.query(`INSERT INTO catalog_requests(id,contact_name,business_name,whatsapp,email,city,source_url,notes,design_id,design_name,category,tier,creation_price,catalog_preview_url,thumbnail_url)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[id,contactName,businessName,whatsapp,email,city,sourceUrl,notes,designId,designName,category,tier,creationPrice,catalogPreview,thumbnail]);
  return json(res,201,{ok:true,id});
}
async function listRequests(res){
  await ensureSchema();
  const result=await pool.query('SELECT * FROM catalog_requests ORDER BY created_at DESC LIMIT 500');
  return json(res,200,{requests:result.rows});
}
async function updateRequest(req,res,id){
  if(!validUuid(id))return json(res,400,{error:'Solicitud no válida.'});
  const data=await bodyJson(req,16000);
  const status=text(data.status,30),previewUrl=safeUrl(data.previewUrl,1600),paymentUrl=safeUrl(data.paymentUrl,1600),adminNotes=text(data.adminNotes,3000);
  const salesperson=text(data.salesperson,120),discountCode=text(data.discountCode,60).toUpperCase(),discountType=text(data.discountType,20),discountScope=text(data.discountScope,20);
  const creationPrice=Math.round(Number(data.creationPrice));
  const monthlyPriceCents=Math.round(Number(data.monthlyPriceCents));
  let discountValue=Math.round(Number(data.discountValue)||0);
  if(!statuses.has(status))return json(res,400,{error:'Estado no válido.'});
  if(!discountTypes.has(discountType))return json(res,400,{error:'Tipo de descuento no válido.'});
  if(!discountScopes.has(discountScope))return json(res,400,{error:'Ámbito de descuento no válido.'});
  if(!Number.isSafeInteger(creationPrice)||creationPrice<0||creationPrice>10000)return json(res,400,{error:'Precio de creación no válido.'});
  if(!Number.isSafeInteger(monthlyPriceCents)||monthlyPriceCents<100||monthlyPriceCents>100000)return json(res,400,{error:'Cuota mensual no válida.'});
  if(discountType==='none')discountValue=0;
  if(discountType==='percent'&&(!Number.isSafeInteger(discountValue)||discountValue<0||discountValue>100))return json(res,400,{error:'El descuento porcentual debe estar entre 0 y 100.'});
  if(discountType==='fixed'&&(!Number.isSafeInteger(discountValue)||discountValue<0||discountValue>1000000))return json(res,400,{error:'Descuento fijo no válido.'});
  await ensureSchema();
  const result=await pool.query('UPDATE catalog_requests SET status=$2,preview_url=$3,payment_url=$4,admin_notes=$5,creation_price=$6,monthly_price_cents=$7,salesperson=$8,discount_code=$9,discount_type=$10,discount_value=$11,discount_scope=$12,updated_at=now() WHERE id=$1 RETURNING *',
    [id,status,previewUrl,paymentUrl,adminNotes,creationPrice,monthlyPriceCents,salesperson,discountCode,discountType,discountValue,discountScope]);
  if(!result.rows[0])return json(res,404,{error:'Solicitud no encontrada.'});
  return json(res,200,{ok:true,request:result.rows[0]});
}

http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/health'){
      try{await ensureSchema();res.writeHead(200,{'Content-Type':'text/plain'});return res.end('ok')}catch{res.writeHead(503,{'Content-Type':'text/plain'});return res.end('database unavailable')}
    }
    if(url.pathname==='/catalog-data')return proxy(req,res,LIBRARY_ORIGIN+'/catalog.json','catalog.json');
    if(url.pathname.startsWith('/library/')){
      const assetPath=url.pathname.slice('/library/'.length);
      return proxy(req,res,LIBRARY_ORIGIN+'/'+assetPath,assetPath);
    }
    if(url.pathname==='/solicitar'||url.pathname==='/solicitar/'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'});
      return res.end(requestHtml);
    }
    if(url.pathname==='/crm'||url.pathname==='/crm/'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'});
      return res.end(crmHtml);
    }
    if(url.pathname==='/api/stripe/webhook'&&req.method==='POST')return await handleStripeWebhook(req,res);
    if(url.pathname==='/api/requests'&&req.method==='POST')return await createRequest(req,res);
    if(url.pathname==='/api/crm/login'&&req.method==='POST'){
      if(!CRM_PASSWORD||!SESSION_SECRET)return json(res,503,{error:'CRM no configurado.'});
      const data=await bodyJson(req,2048);
      if(!safeEq(text(data.password,200),CRM_PASSWORD))return json(res,401,{error:'Contraseña incorrecta.'});
      return json(res,200,{ok:true},{'Set-Cookie':sessionCookie(makeSession())});
    }
    if(url.pathname==='/api/crm/logout'&&req.method==='POST')return json(res,200,{ok:true},{'Set-Cookie':clearCookie()});
    if(url.pathname==='/api/crm/requests'&&req.method==='GET'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      await ensureSchema();
      const result=await pool.query('SELECT * FROM catalog_requests ORDER BY created_at DESC LIMIT 500');
      return json(res,200,{requests:result.rows,stripeConfigured:!!STRIPE_SECRET_KEY,taxEnabled:STRIPE_AUTOMATIC_TAX,stripeAccountId:STRIPE_ACCOUNT_ID});
    }
    const checkoutMatch=url.pathname.match(/^\/api\/crm\/requests\/([0-9a-f-]{36})\/checkout$/i);
    if(checkoutMatch&&req.method==='POST'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await createStripeCheckout(res,checkoutMatch[1]);
    }
    const portalMatch=url.pathname.match(/^\/api\/crm\/requests\/([0-9a-f-]{36})\/portal$/i);
    if(portalMatch&&req.method==='POST'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await createCustomerPortal(res,portalMatch[1]);
    }
    const match=url.pathname.match(/^\/api\/crm\/requests\/([0-9a-f-]{36})$/i);
    if(match&&req.method==='PATCH'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await updateRequest(req,res,match[1]);
    }
    if(url.pathname==='/pago-ok'||url.pathname==='/pago-ok/'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'});
      return res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pago recibido · NoeApps</title><body style="margin:0;background:#080a0e;color:#fff;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px"><main style="max-width:620px;text-align:center"><div style="font-size:54px">✓</div><h1 style="font-size:42px;margin:12px 0">Pago recibido.</h1><p style="color:#aeb7c4;line-height:1.6">Gracias. Hemos recibido la activación de tu web. La cuota mensual quedará gestionada automáticamente por Stripe.</p><a href="/" style="display:inline-block;margin-top:20px;color:#fff;background:#6f62ff;padding:13px 18px;border-radius:10px;text-decoration:none;font-weight:bold">Volver a NoeApps</a></main></body></html>');
    }
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=60'});
    res.end(html);
  }catch(error){
    console.error('Catalog request failed',error&&error.message?error.message:error);
    json(res,error&&error.status?error.status:500,{error:error&&error.publicMessage?error.publicMessage:(error&&error.status===413?'Solicitud demasiado grande.':'No se pudo completar la operación.')});
  }
}).listen(port,'0.0.0.0',()=>console.log('NoeApps catalog listening on '+port));
