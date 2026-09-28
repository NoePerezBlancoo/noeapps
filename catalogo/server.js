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
const DATABASE_URL=(process.env.NEON_DATABASE_URL||process.env.DATABASE_URL||'').trim();
const LEGACY_DATABASE_URL=(process.env.LEGACY_DATABASE_URL||process.env.DATABASE_URL||'').trim();
const CRM_PASSWORD=process.env.CATALOG_CRM_PASSWORD||'';
const SESSION_SECRET=process.env.CATALOG_SESSION_SECRET||'';
const STRIPE_SECRET_KEY=(process.env.STRIPE_SECRET_KEY||'').trim().replace(/^['\"]|['\"]$/g,'');
const STRIPE_WEBHOOK_SECRET=(process.env.STRIPE_WEBHOOK_SECRET||'').trim();
const STRIPE_ACCOUNT_ID=(process.env.STRIPE_ACCOUNT_ID||'').trim();
const STRIPE_CREATION_PRODUCT_ID=(process.env.STRIPE_CREATION_PRODUCT_ID||'').trim();
const STRIPE_MAINTENANCE_PRODUCT_ID=(process.env.STRIPE_MAINTENANCE_PRODUCT_ID||'').trim();
const STRIPE_DEFAULT_MONTHLY_PRICE_ID=(process.env.STRIPE_DEFAULT_MONTHLY_PRICE_ID||'').trim();
const STRIPE_AUTOMATIC_TAX=/^(1|true|yes)$/i.test(process.env.STRIPE_AUTOMATIC_TAX||'');
const PUBLIC_ORIGIN=(process.env.PUBLIC_ORIGIN||'https://catalogo.noeapps.com').replace(/\/$/,'');
const SITE_DOMAIN=(process.env.SITE_DOMAIN||'noeapps.com').trim().toLowerCase();
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:20000}):null;
const legacyPool=LEGACY_DATABASE_URL&&LEGACY_DATABASE_URL!==DATABASE_URL?new Pool({connectionString:LEGACY_DATABASE_URL,max:1,connectionTimeoutMillis:5000,idleTimeoutMillis:10000}):null;
let schemaPromise=null;
let legacyMigrationPromise=null;

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
      payment_token text NOT NULL DEFAULT '',
      stripe_checkout_url text NOT NULL DEFAULT '',
      stripe_checkout_expires_at timestamptz,
      site_slug text NOT NULL DEFAULT '',
      site_origin_url text NOT NULL DEFAULT '',
      site_status text NOT NULL DEFAULT 'draft',
      preview_published_at timestamptz,
      preview_expires_at timestamptz,
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
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS payment_token text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS stripe_checkout_url text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS stripe_checkout_expires_at timestamptz;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS site_slug text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS site_origin_url text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS site_status text NOT NULL DEFAULT 'draft';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS preview_published_at timestamptz;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS preview_expires_at timestamptz;
    CREATE TABLE IF NOT EXISTS stripe_events(
      id text PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS catalog_requests_created_idx ON catalog_requests(created_at DESC);
    CREATE INDEX IF NOT EXISTS catalog_requests_status_idx ON catalog_requests(status);
    CREATE UNIQUE INDEX IF NOT EXISTS catalog_requests_site_slug_uidx ON catalog_requests(site_slug) WHERE site_slug <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS catalog_requests_payment_token_uidx ON catalog_requests(payment_token) WHERE payment_token <> '';
  `).catch(error=>{schemaPromise=null;throw error});
  return schemaPromise;
}

async function migrateLegacyData(){
  if(!legacyPool||!pool)return;
  if(legacyMigrationPromise)return legacyMigrationPromise;
  legacyMigrationPromise=(async()=>{
    try{
      await ensureSchema();
      const oldRequests=await legacyPool.query('SELECT * FROM catalog_requests ORDER BY created_at ASC');
      let copied=0;
      for(const row of oldRequests.rows){
        const cols=[
          'id','created_at','updated_at','status','contact_name','business_name','whatsapp','email','city','source_url','notes',
          'design_id','design_name','category','tier','creation_price','monthly_price_cents','salesperson','discount_code','discount_type',
          'discount_value','discount_scope','stripe_checkout_session_id','stripe_customer_id','stripe_subscription_id','stripe_payment_status',
          'stripe_subscription_status','stripe_last_invoice_id','stripe_last_event_at','paid_at','checkout_fingerprint','catalog_preview_url',
          'thumbnail_url','preview_url','payment_url','admin_notes'
        ];
        const values=cols.map(k=>row[k]===undefined?null:row[k]);
        const dollar=String.fromCharCode(36);
        const placeholders=values.map((_,i)=>dollar+(i+1)).join(',');
        const inserted=await pool.query(
          'INSERT INTO catalog_requests('+cols.join(',')+') VALUES('+placeholders+') ON CONFLICT(id) DO NOTHING RETURNING id',
          values
        );
        if(inserted.rows[0])copied++;
      }
      try{
        const oldEvents=await legacyPool.query('SELECT id,created_at FROM stripe_events ORDER BY created_at ASC');
        for(const row of oldEvents.rows){
          await pool.query('INSERT INTO stripe_events(id,created_at) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',[row.id,row.created_at]);
        }
      }catch(error){
        if(error&&error.code!=='42P01')throw error;
      }
      console.log('Legacy catalog DB migration complete: '+copied+' request(s) copied, '+oldRequests.rows.length+' seen');
    }catch(error){
      console.error('Legacy catalog DB migration failed',error&&error.message?error.message:error);
    }finally{
      legacyPool.end().catch(()=>{});
    }
  })();
  return legacyMigrationPromise;
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
const statuses=new Set(['new','preparing','preview_ready','sent','paid','published','expired','closed']);
const discountTypes=new Set(['none','percent','fixed']);
const discountScopes=new Set(['creation','monthly','both']);
const RESERVED_SITE_SLUGS=new Set(['www','app','admin','administrator','api','auth','login','logout','signup','register','account','accounts','cuenta','billing','checkout','payments','pagos','publish','publicar','preview','estilos','sites','assets','static','images','fonts','media','uploads','examples','art','mail','email','smtp','imap','pop','pop3','webmail','mx','status','support','help','docs','dashboard','panel','manage','management','settings','security','privacy','legal','terms','contact','contacto','abuse','postmaster','hostmaster','webmaster','root','ftp','sftp','ssh','cdn','proxy','origin','ns1','ns2','dns','dev','test','testing','staging','sandbox','demo','beta','production','prod','localhost','noeapps','tunegocio','crear','personalizar','stripe','webhook','webhooks','health','healthz','metrics','internal','autodiscover','autoconfig','bbdd','rsend','send','tutest','adt','cisneros','catalogo']);

function normalizeSiteSlug(value){
  let slug=String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'').slice(0,48).replace(/-+$/g,'');
  if(slug.length<3)slug=(slug||'web')+'-web';
  if(RESERVED_SITE_SLUGS.has(slug))slug=('web-'+slug).slice(0,48);
  return slug;
}
function validSiteSlug(value){
  return typeof value==='string'&&/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(value)&&!value.startsWith('xn--')&&!value.startsWith('web-')&&!RESERVED_SITE_SLUGS.has(value);
}
function sitePublicUrl(slug){return 'https://'+slug+'.'+SITE_DOMAIN+'/';}
function safeSiteOrigin(value){
  const raw=text(value,1600);if(!raw)return'';
  try{
    const u=new URL(raw);const h=u.hostname.toLowerCase();
    if(u.protocol!=='https:'||u.username||u.password||u.port)return'';
    if(h==='localhost'||h.endsWith('.local')||h.endsWith('.internal')||h.endsWith('.'+SITE_DOMAIN))return'';
    if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)||h==='0.0.0.0'||h==='127.0.0.1'||h==='::1')return'';
    u.hash='';return u.toString().replace(/\/$/,'');
  }catch{return''}
}
function siteIsPaid(row){
  return !!(row&&(
    row.paid_at||
    String(row.stripe_payment_status||'').toLowerCase()==='paid'||
    ['active','trialing','past_due'].includes(String(row.stripe_subscription_status||'').toLowerCase())
  ));
}
async function makeUniqueSiteSlug(name,excludeId=''){
  let base=normalizeSiteSlug(name);
  for(let i=0;i<20;i++){
    const candidate=i===0?base:(base.slice(0,43)+'-'+crypto.randomBytes(2).toString('hex')).replace(/-+$/,'');
    const q=await pool.query('SELECT 1 FROM catalog_requests WHERE site_slug=$1 AND ($2::uuid IS NULL OR id<>$2::uuid) LIMIT 1',[candidate,excludeId||null]);
    if(!q.rows[0])return candidate;
  }
  return ('web-'+crypto.randomBytes(8).toString('hex')).slice(0,48);
}
async function ensureSiteSlugs(rows){
  for(const row of rows){
    if(row.site_slug)continue;
    const slug=await makeUniqueSiteSlug(row.business_name,row.id);
    const u=await pool.query('UPDATE catalog_requests SET site_slug=$2,updated_at=now() WHERE id=$1 RETURNING *',[row.id,slug]);
    if(u.rows[0])Object.assign(row,u.rows[0]);
  }
  return rows;
}
async function refreshSiteState(row){
  if(!row)return row;
  if(siteIsPaid(row)&&row.site_status!=='active'){
    const r=await pool.query("UPDATE catalog_requests SET site_status='active',preview_expires_at=NULL,status=CASE WHEN status='published' THEN status ELSE 'paid' END,updated_at=now() WHERE id=$1 RETURNING *",[row.id]);
    return r.rows[0]||row;
  }
  if(row.site_status==='preview'&&row.preview_expires_at&&new Date(row.preview_expires_at).getTime()<=Date.now()){
    const r=await pool.query("UPDATE catalog_requests SET site_status='expired',status=CASE WHEN status IN ('new','preparing','preview_ready','sent') THEN 'expired' ELSE status END,updated_at=now() WHERE id=$1 RETURNING *",[row.id]);
    return r.rows[0]||row;
  }
  return row;
}
async function expireOverduePreviews(){
  if(!pool)return;
  await ensureSchema();
  await pool.query("UPDATE catalog_requests SET site_status='expired',status=CASE WHEN status IN ('new','preparing','preview_ready','sent') THEN 'expired' ELSE status END,updated_at=now() WHERE site_status='preview' AND preview_expires_at IS NOT NULL AND preview_expires_at<=now() AND paid_at IS NULL AND stripe_payment_status<>'paid' AND stripe_subscription_status NOT IN ('active','trialing','past_due')");
}

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
async function ensurePaymentToken(row){
  if(row.payment_token)return row;
  for(let i=0;i<5;i++){
    const token=crypto.randomBytes(24).toString('base64url');
    try{
      const r=await pool.query("UPDATE catalog_requests SET payment_token=$2,updated_at=now() WHERE id=$1 AND payment_token='' RETURNING *",[row.id,token]);
      if(r.rows[0])return r.rows[0];
      const current=await pool.query('SELECT * FROM catalog_requests WHERE id=$1',[row.id]);
      if(current.rows[0]&&current.rows[0].payment_token)return current.rows[0];
    }catch(error){if(error&&error.code!=='23505')throw error}
  }
  throw new Error('payment_token_generation_failed');
}
async function createStripeSessionForRow(row){
  const creationBase=Math.max(0,Math.round(Number(row.creation_price)*100));
  const monthlyBase=Math.max(0,Math.round(Number(row.monthly_price_cents)));
  const creationAmount=applyDiscount(creationBase,row.discount_type,Number(row.discount_value)||0,row.discount_scope,'creation');
  const monthlyAmount=applyDiscount(monthlyBase,row.discount_type,Number(row.discount_value)||0,row.discount_scope,'monthly');
  if(monthlyAmount<50){const e=new Error('monthly_price_too_low');e.status=400;e.publicMessage='La cuota mensual final debe ser al menos 0,50 €.';throw e}
  const fingerprint=checkoutFingerprint(row);
  const rawExpiry=row.stripe_checkout_expires_at?new Date(row.stripe_checkout_expires_at).getTime():0;
  if(row.stripe_checkout_url&&row.checkout_fingerprint===fingerprint&&rawExpiry>Date.now()+60000&&!['paid','complete','failed'].includes(String(row.stripe_payment_status||'').toLowerCase())){
    return {row,url:row.stripe_checkout_url,reused:true};
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
    discount_code:row.discount_code||'',
    site_slug:row.site_slug||''
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
  const window=Math.floor(Date.now()/(5*60*1000));
  const session=await stripePost('/checkout/sessions',params,'catalog-checkout-'+row.id+'-'+fingerprint.slice(0,16)+'-'+window);
  const expiresAt=session.expires_at?new Date(Number(session.expires_at)*1000):new Date(Date.now()+23*60*60*1000);
  const updated=await pool.query(`UPDATE catalog_requests SET stripe_checkout_session_id=$2,stripe_checkout_url=$3,stripe_checkout_expires_at=$4,stripe_payment_status=$5,checkout_fingerprint=$6,updated_at=now() WHERE id=$1 RETURNING *`,
    [row.id,session.id||'',session.url||'',expiresAt,session.payment_status||session.status||'open',fingerprint]);
  return {row:updated.rows[0]||row,url:session.url,reused:false};
}
async function createStripeCheckout(res,id){
  if(!validUuid(id))return json(res,400,{error:'Solicitud no válida.'});
  if(!STRIPE_CREATION_PRODUCT_ID||!STRIPE_MAINTENANCE_PRODUCT_ID)return json(res,503,{error:'Stripe todavía no está terminado de configurar.'});
  await ensureSchema();
  const found=await pool.query('SELECT * FROM catalog_requests WHERE id=$1',[id]);
  let row=found.rows[0];if(!row)return json(res,404,{error:'Solicitud no encontrada.'});
  row=await ensurePaymentToken(row);
  const checkout=await createStripeSessionForRow(row);
  const durableUrl=PUBLIC_ORIGIN+'/pagar/'+encodeURIComponent(checkout.row.payment_token);
  const updated=await pool.query('UPDATE catalog_requests SET payment_url=$2,updated_at=now() WHERE id=$1 RETURNING *',[row.id,durableUrl]);
  return json(res,200,{ok:true,reused:checkout.reused,url:durableUrl,request:updated.rows[0]||checkout.row});
}
function simpleSitePage(res,status,title,message){
  res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff'});
  return res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+' · NoeApps</title><body style="margin:0;background:#080a0e;color:#fff;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px"><main style="max-width:640px;text-align:center"><div style="font-size:46px">●</div><h1 style="font-size:38px;margin:14px 0">'+title+'</h1><p style="color:#aeb7c4;line-height:1.65">'+message+'</p></main></body></html>');
}
async function handlePublicPayment(res,token){
  if(!/^[A-Za-z0-9_-]{20,80}$/.test(token))return simpleSitePage(res,404,'Enlace no válido','Este enlace de pago no es válido.');
  await ensureSchema();
  const q=await pool.query('SELECT * FROM catalog_requests WHERE payment_token=$1',[token]);
  let row=q.rows[0];if(!row)return simpleSitePage(res,404,'Enlace no encontrado','Este enlace de pago ya no está disponible.');
  row=await refreshSiteState(row);
  if(siteIsPaid(row)){
    res.writeHead(303,{'Location':row.preview_url||PUBLIC_ORIGIN+'/pago-ok','Cache-Control':'no-store'});return res.end();
  }
  if(row.site_status==='expired')return simpleSitePage(res,410,'Vista previa caducada','Han pasado los 10 días de disponibilidad. Ponte en contacto con NoeApps si quieres reactivar esta web.');
  const checkout=await createStripeSessionForRow(row);
  res.writeHead(303,{'Location':checkout.url,'Cache-Control':'no-store','X-Robots-Tag':'noindex'});return res.end();
}
async function publishSite(req,res,id){
  if(!validUuid(id))return json(res,400,{error:'Solicitud no válida.'});
  const data=await bodyJson(req,8000);
  const requested=normalizeSiteSlug(text(data.siteSlug,80));
  if(!validSiteSlug(requested))return json(res,400,{error:'El subdominio no es válido.'});
  const origin=safeSiteOrigin(data.siteOriginUrl);
  if(!origin)return json(res,400,{error:'Indica la URL privada/origen HTTPS donde está desplegada la web.'});
  await ensureSchema();
  const found=await pool.query('SELECT * FROM catalog_requests WHERE id=$1',[id]);
  let row=found.rows[0];if(!row)return json(res,404,{error:'Solicitud no encontrada.'});
  const clash=await pool.query('SELECT id FROM catalog_requests WHERE site_slug=$1 AND id<>$2 LIMIT 1',[requested,id]);
  if(clash.rows[0])return json(res,409,{error:'Ese subdominio ya está asignado a otra web.'});
  const paid=siteIsPaid(row);
  const publicUrl=sitePublicUrl(requested);
  const r=await pool.query(`UPDATE catalog_requests SET site_slug=$2,site_origin_url=$3,site_status=$4,preview_published_at=COALESCE(preview_published_at,now()),preview_expires_at=$5,preview_url=$6,status=$7,updated_at=now() WHERE id=$1 RETURNING *`,
    [id,requested,origin,paid?'active':'preview',paid?null:new Date(Date.now()+10*24*60*60*1000),publicUrl,paid?'published':'preview_ready']);
  return json(res,200,{ok:true,publicUrl,request:r.rows[0]});
}
async function publicSiteRoute(res,slug){
  if(!validSiteSlug(slug))return json(res,404,{managed:false});
  await ensureSchema();
  const q=await pool.query('SELECT * FROM catalog_requests WHERE site_slug=$1',[slug]);
  if(!q.rows[0])return json(res,404,{managed:false});
  const row=await refreshSiteState(q.rows[0]);
  return json(res,200,{managed:true,status:row.site_status,publicUrl:sitePublicUrl(slug)});
}
async function proxyCustomerSite(req,res,slug,pathname,search){
  if(!validSiteSlug(slug))return simpleSitePage(res,404,'Web no encontrada','No encontramos esta web.');
  await ensureSchema();
  const q=await pool.query('SELECT * FROM catalog_requests WHERE site_slug=$1',[slug]);
  let row=q.rows[0];if(!row)return simpleSitePage(res,404,'Web no encontrada','No encontramos esta web.');
  row=await refreshSiteState(row);
  if(row.site_status==='expired')return simpleSitePage(res,410,'Vista previa caducada','Esta vista previa estuvo disponible durante 10 días y ha caducado al no activarse.');
  if(row.site_status==='suspended')return simpleSitePage(res,402,'Web temporalmente desactivada','Esta web no está activa en este momento.');
  if(!['preview','active'].includes(row.site_status)||!row.site_origin_url)return simpleSitePage(res,503,'Web en preparación','La web todavía se está preparando.');
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'},{'Allow':'GET, HEAD'});
  let target;
  try{
    const base=row.site_origin_url.endsWith('/')?row.site_origin_url:row.site_origin_url+'/';
    target=new URL((pathname||'/').replace(/^\//,''),base);
    target.search=search||'';
  }catch{return simpleSitePage(res,502,'Web no disponible','No se pudo abrir el origen de esta web.')}
  try{
    const headers={};
    for(const name of ['accept','accept-language','user-agent','if-none-match','if-modified-since']){
      if(req.headers[name])headers[name]=req.headers[name];
    }
    const upstream=await fetch(target,{method:req.method,headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(upstream.status>=300&&upstream.status<400&&upstream.headers.get('location')){
      const loc=new URL(upstream.headers.get('location'),target);
      let location=loc.toString();
      if(loc.hostname===target.hostname)location=sitePublicUrl(slug).replace(/\/$/,'')+loc.pathname+loc.search+loc.hash;
      res.writeHead(upstream.status,{'Location':location,'Cache-Control':'no-store'});return res.end();
    }
    const responseHeaders={
      'Content-Type':upstream.headers.get('content-type')||contentType(pathname,upstream.headers.get('content-type')),
      'Cache-Control':row.site_status==='preview'?'private, no-store, max-age=0':(upstream.headers.get('cache-control')||'public, max-age=60'),
      'X-Content-Type-Options':'nosniff'
    };
    if(row.site_status==='preview')responseHeaders['X-Robots-Tag']='noindex, nofollow, noarchive';
    if(upstream.headers.get('etag'))responseHeaders['ETag']=upstream.headers.get('etag');
    if(upstream.headers.get('last-modified'))responseHeaders['Last-Modified']=upstream.headers.get('last-modified');
    res.writeHead(upstream.status,responseHeaders);
    if(req.method==='HEAD')return res.end();
    return res.end(Buffer.from(await upstream.arrayBuffer()));
  }catch(error){
    console.error('Customer site proxy failed',slug,error&&error.message?error.message:error);
    return simpleSitePage(res,502,'Web no disponible','La web no está disponible temporalmente.');
  }
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
          site_status=CASE WHEN $4='paid' THEN 'active' ELSE site_status END,
          preview_expires_at=CASE WHEN $4='paid' THEN NULL ELSE preview_expires_at END,
          status=CASE WHEN $4='paid' AND status IN ('new','preparing','preview_ready','sent','paid','expired') THEN 'paid' ELSE status END,
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
          site_status=CASE WHEN $1='paid' THEN 'active' ELSE site_status END,
          preview_expires_at=CASE WHEN $1='paid' THEN NULL ELSE preview_expires_at END,
          status=CASE WHEN $1='paid' AND status IN ('new','preparing','preview_ready','sent','paid','expired') THEN 'paid' ELSE status END,
          updated_at=now() WHERE `+where,values);
      }
    }else if(type==='customer.subscription.created'||type==='customer.subscription.updated'||type==='customer.subscription.deleted'){
      const requestId=obj.metadata&&obj.metadata.catalog_request_id||'';
      const subStatus=String(obj.status||(type.endsWith('.deleted')?'canceled':''));
      const activeSub=['active','trialing','past_due'].includes(subStatus);
      const deleted=type==='customer.subscription.deleted'||['canceled','unpaid','incomplete_expired'].includes(subStatus);
      if(validUuid(requestId)){
        await client.query("UPDATE catalog_requests SET stripe_subscription_id=$2,stripe_customer_id=COALESCE(NULLIF($3,''),stripe_customer_id),stripe_subscription_status=$4,site_status=CASE WHEN $5 THEN 'active' WHEN $6 THEN 'suspended' ELSE site_status END,preview_expires_at=CASE WHEN $5 THEN NULL ELSE preview_expires_at END,stripe_last_event_at=now(),updated_at=now() WHERE id=$1",
          [requestId,String(obj.id||''),String(obj.customer||''),subStatus,activeSub,deleted]);
      }else if(obj.id){
        await client.query("UPDATE catalog_requests SET stripe_subscription_status=$2,site_status=CASE WHEN $3 THEN 'active' WHEN $4 THEN 'suspended' ELSE site_status END,preview_expires_at=CASE WHEN $3 THEN NULL ELSE preview_expires_at END,stripe_last_event_at=now(),updated_at=now() WHERE stripe_subscription_id=$1",[String(obj.id),subStatus,activeSub,deleted]);
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
  const siteSlug=await makeUniqueSiteSlug(businessName);
  await pool.query(`INSERT INTO catalog_requests(id,contact_name,business_name,whatsapp,email,city,source_url,notes,design_id,design_name,category,tier,creation_price,catalog_preview_url,thumbnail_url,site_slug)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[id,contactName,businessName,whatsapp,email,city,sourceUrl,notes,designId,designName,category,tier,creationPrice,catalogPreview,thumbnail,siteSlug]);
  return json(res,201,{ok:true,id,siteSlug,siteUrl:sitePublicUrl(siteSlug)});
}
async function listRequests(res){
  await ensureSchema();
  await expireOverduePreviews();
  const result=await pool.query('SELECT * FROM catalog_requests ORDER BY created_at DESC LIMIT 500');
  await ensureSiteSlugs(result.rows);
  return json(res,200,{requests:result.rows});
}
async function updateRequest(req,res,id){
  if(!validUuid(id))return json(res,400,{error:'Solicitud no válida.'});
  const data=await bodyJson(req,16000);
  const status=text(data.status,30),previewUrl=safeUrl(data.previewUrl,1600),paymentUrl=safeUrl(data.paymentUrl,1600),adminNotes=text(data.adminNotes,3000);
  const salesperson=text(data.salesperson,120),discountCode=text(data.discountCode,60).toUpperCase(),discountType=text(data.discountType,20),discountScope=text(data.discountScope,20);
  const requestedSiteSlug=text(data.siteSlug,80).toLowerCase();
  const siteSlug=requestedSiteSlug?normalizeSiteSlug(requestedSiteSlug):'';
  const rawSiteOrigin=text(data.siteOriginUrl,1600);
  const siteOriginUrl=rawSiteOrigin?safeSiteOrigin(rawSiteOrigin):'';
  const creationPrice=Math.round(Number(data.creationPrice));
  const monthlyPriceCents=Math.round(Number(data.monthlyPriceCents));
  let discountValue=Math.round(Number(data.discountValue)||0);
  if(!statuses.has(status))return json(res,400,{error:'Estado no válido.'});
  if(siteSlug&&!validSiteSlug(siteSlug))return json(res,400,{error:'El subdominio no es válido.'});
  if(rawSiteOrigin&&!siteOriginUrl)return json(res,400,{error:'La URL origen de la web debe ser HTTPS y pública.'});
  if(!discountTypes.has(discountType))return json(res,400,{error:'Tipo de descuento no válido.'});
  if(!discountScopes.has(discountScope))return json(res,400,{error:'Ámbito de descuento no válido.'});
  if(!Number.isSafeInteger(creationPrice)||creationPrice<0||creationPrice>10000)return json(res,400,{error:'Precio de creación no válido.'});
  if(!Number.isSafeInteger(monthlyPriceCents)||monthlyPriceCents<100||monthlyPriceCents>100000)return json(res,400,{error:'Cuota mensual no válida.'});
  if(discountType==='none')discountValue=0;
  if(discountType==='percent'&&(!Number.isSafeInteger(discountValue)||discountValue<0||discountValue>100))return json(res,400,{error:'El descuento porcentual debe estar entre 0 y 100.'});
  if(discountType==='fixed'&&(!Number.isSafeInteger(discountValue)||discountValue<0||discountValue>1000000))return json(res,400,{error:'Descuento fijo no válido.'});
  await ensureSchema();
  if(siteSlug){
    const clash=await pool.query('SELECT id FROM catalog_requests WHERE site_slug=$1 AND id<>$2 LIMIT 1',[siteSlug,id]);
    if(clash.rows[0])return json(res,409,{error:'Ese subdominio ya está asignado a otra web.'});
  }
  const publicUrl=siteSlug?sitePublicUrl(siteSlug):'';
  const result=await pool.query("UPDATE catalog_requests SET status=$2,preview_url=CASE WHEN site_status IN ('preview','active') AND $13<>'' THEN $15 ELSE $3 END,payment_url=$4,admin_notes=$5,creation_price=$6,monthly_price_cents=$7,salesperson=$8,discount_code=$9,discount_type=$10,discount_value=$11,discount_scope=$12,site_slug=CASE WHEN $13<>'' THEN $13 ELSE site_slug END,site_origin_url=CASE WHEN $14<>'' THEN $14 ELSE site_origin_url END,updated_at=now() WHERE id=$1 RETURNING *",
    [id,status,previewUrl,paymentUrl,adminNotes,creationPrice,monthlyPriceCents,salesperson,discountCode,discountType,discountValue,discountScope,siteSlug,siteOriginUrl,publicUrl]);
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
    if(url.pathname==='/api/public/site-route'&&req.method==='GET')return await publicSiteRoute(res,String(url.searchParams.get('slug')||'').toLowerCase());
    const customerSiteMatch=url.pathname.match(/^\/customer-site\/([a-z0-9-]{3,48})(\/.*)?$/i);
    if(customerSiteMatch)return await proxyCustomerSite(req,res,customerSiteMatch[1].toLowerCase(),customerSiteMatch[2]||'/',url.search);
    const payMatch=url.pathname.match(/^\/pagar\/([A-Za-z0-9_-]{20,80})$/);
    if(payMatch&&req.method==='GET')return await handlePublicPayment(res,payMatch[1]);
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
      await expireOverduePreviews();
      const result=await pool.query('SELECT * FROM catalog_requests ORDER BY created_at DESC LIMIT 500');
      await ensureSiteSlugs(result.rows);
      return json(res,200,{requests:result.rows,stripeConfigured:!!STRIPE_SECRET_KEY,taxEnabled:STRIPE_AUTOMATIC_TAX,stripeAccountId:STRIPE_ACCOUNT_ID,siteDomain:SITE_DOMAIN});
    }
    const publishMatch=url.pathname.match(/^\/api\/crm\/requests\/([0-9a-f-]{36})\/site\/publish$/i);
    if(publishMatch&&req.method==='POST'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await publishSite(req,res,publishMatch[1]);
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
}).listen(port,'0.0.0.0',()=>{
  console.log('NoeApps catalog listening on '+port);
  console.log('Stripe backend key mode: '+(STRIPE_SECRET_KEY.startsWith('sk_live_')?'sk_live':STRIPE_SECRET_KEY.startsWith('sk_test_')?'sk_test':STRIPE_SECRET_KEY.startsWith('rk_live_')?'rk_live':STRIPE_SECRET_KEY.startsWith('rk_test_')?'rk_test':STRIPE_SECRET_KEY.startsWith('pk_live_')?'pk_live':STRIPE_SECRET_KEY.startsWith('pk_test_')?'pk_test':'unknown'));
  migrateLegacyData().catch(()=>{});
  expireOverduePreviews().catch(()=>{});
  setInterval(()=>expireOverduePreviews().catch(error=>console.error('Preview expiry sweep failed',error&&error.message?error.message:error)),60*60*1000).unref();
});
