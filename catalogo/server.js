const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {Pool}=require('pg');
const subscriptions=require('./subscriptions');
const discovery=require('./catalog-discovery');
const roadmap=require('./crm-roadmap');
const aiGenerator=require('./ai-site-generator');
const chatgptHandoffModule=require('./chatgpt-handoff');
subscriptions.assertStaging();

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
const SALESPERSON_COMMISSION_PERCENT=30;
const CRM_BRIDGE_SECRET=(process.env.NOEAPPS_CRM_BRIDGE_SECRET||'').trim();
const TUNEGOCIO_CRM_ORIGIN=(process.env.TUNEGOCIO_CRM_ORIGIN||'').trim().replace(/\/$/,'');
const CHATGPT_DEMO_ORIGIN=(process.env.CHATGPT_DEMO_ORIGIN||'').trim().replace(/\/$/,'');
const CATALOG_SALES_WHATSAPP=(process.env.CATALOG_SALES_WHATSAPP||'').replace(/\D/g,'');
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:20000}):null;
const legacyPool=LEGACY_DATABASE_URL&&LEGACY_DATABASE_URL!==DATABASE_URL?new Pool({connectionString:LEGACY_DATABASE_URL,max:1,connectionTimeoutMillis:5000,idleTimeoutMillis:10000}):null;
const catalogDiscovery=discovery.createDiscovery(pool,LIBRARY_ORIGIN);
const crmRoadmap=roadmap.createRoadmap({pool,ensureSchema,bridgeOrigin:TUNEGOCIO_CRM_ORIGIN,bridgeSecret:CRM_BRIDGE_SECRET,publicOrigin:PUBLIC_ORIGIN});
const chatgptHandoff=chatgptHandoffModule.createHandoff({pool,ensureSchema,demoOrigin:CHATGPT_DEMO_ORIGIN,sitePublicUrl,siteIsPaid});
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
      admin_notes text NOT NULL DEFAULT '',
      salesperson_id uuid,
      offer_id uuid,
      offer_name text NOT NULL DEFAULT '',
      offer_percent_off integer NOT NULL DEFAULT 0,
      offer_duration_months integer NOT NULL DEFAULT 0,
      stripe_offer_coupon_id text NOT NULL DEFAULT '',
      stripe_offer_promotion_code_id text NOT NULL DEFAULT '',
      first_paid_amount_cents integer,
      commission_cents integer
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
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS salesperson_id uuid;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS offer_id uuid;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS offer_name text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS offer_percent_off integer NOT NULL DEFAULT 0;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS offer_duration_months integer NOT NULL DEFAULT 0;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS stripe_offer_coupon_id text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS stripe_offer_promotion_code_id text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS first_paid_amount_cents integer;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS commission_cents integer;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS generation_state text NOT NULL DEFAULT 'not_started';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS generation_brief text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS generation_research_usage jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS generation_last_error text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS latest_generation_id bigint;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS validated_generation_id bigint;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS published_generation_id bigint;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS chatgpt_state text NOT NULL DEFAULT 'not_ready';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS chatgpt_review_token text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS chatgpt_latest_version integer NOT NULL DEFAULT 0;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS chatgpt_validated_version integer;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS chatgpt_published_version integer;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS chatgpt_manifest_url text NOT NULL DEFAULT '';
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS chatgpt_prepared_at timestamptz;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS chatgpt_last_sync_at timestamptz;
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS chatgpt_last_error text NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS catalog_requests_chatgpt_state_idx ON catalog_requests(chatgpt_state, COALESCE(chatgpt_prepared_at, updated_at));
    CREATE TABLE IF NOT EXISTS catalog_site_generations(
      id bigserial PRIMARY KEY,
      request_id uuid NOT NULL REFERENCES catalog_requests(id) ON DELETE CASCADE,
      version integer NOT NULL,
      state text NOT NULL DEFAULT 'draft',
      feedback text NOT NULL DEFAULT '',
      html text NOT NULL DEFAULT '',
      model text NOT NULL DEFAULT '',
      input_tokens bigint NOT NULL DEFAULT 0,
      cached_input_tokens bigint NOT NULL DEFAULT 0,
      output_tokens bigint NOT NULL DEFAULT 0,
      total_tokens bigint NOT NULL DEFAULT 0,
      search_calls integer NOT NULL DEFAULT 0,
      response_id text NOT NULL DEFAULT '',
      error text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      validated_at timestamptz,
      UNIQUE(request_id,version)
    );
    CREATE INDEX IF NOT EXISTS catalog_site_generations_request_created_idx ON catalog_site_generations(request_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS stripe_events(
      id text PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS crm_salespeople(
      id uuid PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL DEFAULT '',
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS crm_offers(
      id uuid PRIMARY KEY,
      name text NOT NULL,
      source text NOT NULL CHECK (source IN ('catalog','tunegocio','both')),
      percent_off integer NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
      duration_months integer NOT NULL CHECK (duration_months BETWEEN 1 AND 24),
      active boolean NOT NULL DEFAULT true,
      starts_at timestamptz,
      ends_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS catalog_revenue_events(
      event_id text PRIMARY KEY,
      request_id uuid NOT NULL REFERENCES catalog_requests(id) ON DELETE CASCADE,
      amount_paid_cents integer NOT NULL CHECK (amount_paid_cents >= 0),
      kind text NOT NULL CHECK (kind IN ('initial','renewal')),
      paid_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS crm_expenses(
      id uuid PRIMARY KEY,
      name text NOT NULL,
      category text NOT NULL DEFAULT 'other',
      amount_cents integer NOT NULL CHECK (amount_cents >= 0),
      cadence text NOT NULL CHECK (cadence IN ('one_time','monthly')),
      expense_date date NOT NULL DEFAULT current_date,
      active boolean NOT NULL DEFAULT true,
      notes text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS catalog_revenue_events_paid_idx ON catalog_revenue_events(paid_at DESC);
    CREATE INDEX IF NOT EXISTS catalog_revenue_events_request_idx ON catalog_revenue_events(request_id, paid_at DESC);
    CREATE TABLE IF NOT EXISTS crm_operations(
      source text NOT NULL CHECK (source IN ('tunegocio')),
      external_id uuid NOT NULL,
      manual_status text NOT NULL DEFAULT 'auto' CHECK (manual_status IN ('auto','review','in_progress','resolved','closed')),
      salesperson text NOT NULL DEFAULT '',
      admin_notes text NOT NULL DEFAULT '',
      salesperson_id uuid,
      offer_id uuid,
      offer_name text NOT NULL DEFAULT '',
      offer_percent_off integer NOT NULL DEFAULT 0,
      offer_duration_months integer NOT NULL DEFAULT 0,
      first_paid_amount_cents integer,
      commission_cents integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(source,external_id)
    );
    CREATE INDEX IF NOT EXISTS crm_operations_updated_idx ON crm_operations(updated_at DESC);
    ALTER TABLE crm_operations ADD COLUMN IF NOT EXISTS salesperson_id uuid;
    ALTER TABLE crm_operations ADD COLUMN IF NOT EXISTS offer_id uuid;
    ALTER TABLE crm_operations ADD COLUMN IF NOT EXISTS offer_name text NOT NULL DEFAULT '';
    ALTER TABLE crm_operations ADD COLUMN IF NOT EXISTS offer_percent_off integer NOT NULL DEFAULT 0;
    ALTER TABLE crm_operations ADD COLUMN IF NOT EXISTS offer_duration_months integer NOT NULL DEFAULT 0;
    ALTER TABLE crm_operations ADD COLUMN IF NOT EXISTS first_paid_amount_cents integer;
    ALTER TABLE crm_operations ADD COLUMN IF NOT EXISTS commission_cents integer;
    CREATE INDEX IF NOT EXISTS catalog_requests_created_idx ON catalog_requests(created_at DESC);
    CREATE INDEX IF NOT EXISTS catalog_requests_status_idx ON catalog_requests(status);
    CREATE UNIQUE INDEX IF NOT EXISTS catalog_requests_site_slug_uidx ON catalog_requests(site_slug) WHERE site_slug <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS catalog_requests_payment_token_uidx ON catalog_requests(payment_token) WHERE payment_token <> '';
  `).then(async()=>{if(subscriptions.enabled()||discovery.enabled()||roadmap.enabled())await subscriptions.migrate(pool)}).catch(error=>{schemaPromise=null;throw error});
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
function safeTunegocioOrigin(){
  if(!TUNEGOCIO_CRM_ORIGIN)return'';
  try{
    const u=new URL(TUNEGOCIO_CRM_ORIGIN);
    if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.endsWith('.up.railway.app'))return'';
    return u.origin;
  }catch{return''}
}
function offerUsable(row,source){
  if(!row||row.active!==true)return false;
  if(!['both',source].includes(String(row.source||'')))return false;
  const now=Date.now();
  if(row.starts_at&&new Date(row.starts_at).getTime()>now)return false;
  if(row.ends_at&&new Date(row.ends_at).getTime()<=now)return false;
  return true;
}
async function crmConfig(){
  await ensureSchema();
  const [salespeople,offers]=await Promise.all([
    pool.query("SELECT id,name,email,active,created_at,updated_at FROM crm_salespeople ORDER BY active DESC,name ASC"),
    pool.query("SELECT id,name,source,percent_off,duration_months,active,starts_at,ends_at,created_at,updated_at FROM crm_offers ORDER BY active DESC,created_at DESC")
  ]);
  return{salespeople:salespeople.rows,offers:offers.rows};
}
async function expenseConfig(){
  await ensureSchema();
  const q=await pool.query("SELECT * FROM crm_expenses ORDER BY active DESC,expense_date DESC,created_at DESC");
  return q.rows;
}
async function createExpense(req,res){
  const data=await bodyJson(req,10000);
  const name=text(data.name,160),category=text(data.category,40)||'other',cadence=text(data.cadence,20);
  const amountCents=Math.round(Number(data.amountCents)),notes=text(data.notes,1200);
  const expenseDate=data.expenseDate?new Date(String(data.expenseDate)+'T00:00:00Z'):new Date();
  if(roadmap.enabled()&&data.expenseDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(data.expenseDate)||!Number.isFinite(expenseDate.getTime())||expenseDate.toISOString().slice(0,10)!==data.expenseDate))return json(res,400,{error:'Fecha de gasto no válida.'});
  if(!name||!['hosting','ai','software','ads','commission','tax','other'].includes(category)||!['one_time','monthly'].includes(cadence)
    ||!Number.isSafeInteger(amountCents)||amountCents<0||amountCents>100000000||!Number.isFinite(expenseDate.getTime())){
    return json(res,400,{error:'Gasto no válido.'});
  }
  await ensureSchema();
  const result=await pool.query("INSERT INTO crm_expenses(id,name,category,amount_cents,cadence,expense_date,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
    [crypto.randomUUID(),name,category,amountCents,cadence,expenseDate.toISOString().slice(0,10),notes]);
  return json(res,201,{ok:true,expense:result.rows[0]});
}
async function updateExpense(req,res,id){
  if(!validUuid(id))return json(res,400,{error:'Gasto no válido.'});
  const data=await bodyJson(req,8000);
  const active=data.active!==false;
  await ensureSchema();
  if(roadmap.enabled()&&active){
    const old=(await pool.query('SELECT * FROM crm_expenses WHERE id=$1',[id])).rows[0];
    if(old?.cadence==='monthly'&&old.ended_on)return json(res,409,{error:'Crea un nuevo gasto mensual para reanudarlo; el historial del anterior se conserva.'});
  }
  const result=await pool.query(roadmap.enabled()?"UPDATE crm_expenses SET active=$2,ended_on=CASE WHEN $2 THEN NULL ELSE (now() AT TIME ZONE 'Europe/Madrid')::date END,updated_at=now() WHERE id=$1 RETURNING *":"UPDATE crm_expenses SET active=$2,updated_at=now() WHERE id=$1 RETURNING *",[id,active]);
  if(!result.rows[0])return json(res,404,{error:'Gasto no encontrado.'});
  return json(res,200,{ok:true,expense:result.rows[0]});
}
async function expenseAnalytics(){
  await ensureSchema();
  const q=await pool.query(`SELECT
    coalesce(sum(amount_cents) FILTER (WHERE active=true AND cadence='monthly'),0)::bigint AS recurring_monthly_cents,
    coalesce(sum(amount_cents) FILTER (WHERE active=true AND cadence='one_time' AND expense_date>=date_trunc('month',current_date)::date),0)::bigint AS one_time_month_cents,
    count(*) FILTER (WHERE active=true)::integer AS active_count
    FROM crm_expenses`);
  const row=q.rows[0]||{};
  const recurring=Number(row.recurring_monthly_cents||0),oneTime=Number(row.one_time_month_cents||0);
  return{recurringMonthlyCents:recurring,oneTimeMonthCents:oneTime,monthExpensesCents:recurring+oneTime,activeCount:Number(row.active_count||0)};
}

async function createSalesperson(req,res){
  const data=await bodyJson(req,8000);
  const name=text(data.name,120),email=text(data.email,180).toLowerCase();
  if(!name)return json(res,400,{error:'Indica el nombre del comercial.'});
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(res,400,{error:'Revisa el email del comercial.'});
  await ensureSchema();
  const id=crypto.randomUUID();
  const result=await pool.query("INSERT INTO crm_salespeople(id,name,email) VALUES($1,$2,$3) RETURNING *",[id,name,email]);
  return json(res,201,{ok:true,salesperson:result.rows[0],commissionPercent:SALESPERSON_COMMISSION_PERCENT});
}
async function updateSalesperson(req,res,id){
  if(!validUuid(id))return json(res,400,{error:'Comercial no válido.'});
  const data=await bodyJson(req,8000);
  const name=text(data.name,120),email=text(data.email,180).toLowerCase(),active=data.active!==false;
  if(!name)return json(res,400,{error:'Indica el nombre del comercial.'});
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(res,400,{error:'Revisa el email del comercial.'});
  await ensureSchema();
  const result=await pool.query("UPDATE crm_salespeople SET name=$2,email=$3,active=$4,updated_at=now() WHERE id=$1 RETURNING *",[id,name,email,active]);
  if(!result.rows[0])return json(res,404,{error:'Comercial no encontrado.'});
  return json(res,200,{ok:true,salesperson:result.rows[0],commissionPercent:SALESPERSON_COMMISSION_PERCENT});
}
async function createOffer(req,res){
  const data=await bodyJson(req,10000);
  const name=text(data.name,120),source=text(data.source,20);
  const percentOff=roadmap.enabled()?Number(data.percentOff):Math.round(Number(data.percentOff)),durationMonths=roadmap.enabled()?Number(data.durationMonths):Math.round(Number(data.durationMonths));
  const startsAt=data.startsAt?new Date(String(data.startsAt)):null,endsAt=data.endsAt?new Date(String(data.endsAt)):null;
  if(!name||!['catalog','tunegocio','both'].includes(source))return json(res,400,{error:'Oferta no válida.'});
  if(!Number.isInteger(percentOff)||percentOff<1||percentOff>100)return json(res,400,{error:'El descuento debe estar entre 1% y 100%.'});
  if(roadmap.enabled()&&source!=='catalog'&&percentOff===100)return json(res,400,{error:'TuNegocio necesita un primer cobro superior a cero. Usa del 1 al 99%.'});
  if(!Number.isInteger(durationMonths)||durationMonths<1||durationMonths>24)return json(res,400,{error:'La duración debe estar entre 1 y 24 meses.'});
  if((startsAt&&!Number.isFinite(startsAt.getTime()))||(endsAt&&!Number.isFinite(endsAt.getTime()))||(startsAt&&endsAt&&endsAt<=startsAt))return json(res,400,{error:'Revisa las fechas de la oferta.'});
  await ensureSchema();
  const id=crypto.randomUUID();
  const result=await pool.query("INSERT INTO crm_offers(id,name,source,percent_off,duration_months,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
    [id,name,source,percentOff,durationMonths,startsAt?startsAt.toISOString():null,endsAt?endsAt.toISOString():null]);
  return json(res,201,{ok:true,offer:result.rows[0]});
}
async function updateOffer(req,res,id){
  if(!validUuid(id))return json(res,400,{error:'Oferta no válida.'});
  const data=await bodyJson(req,10000);
  const active=data.active!==false;
  await ensureSchema();
  const result=await pool.query("UPDATE crm_offers SET active=$2,updated_at=now() WHERE id=$1 RETURNING *",[id,active]);
  if(!result.rows[0])return json(res,404,{error:'Oferta no encontrada.'});
  return json(res,200,{ok:true,offer:result.rows[0]});
}
async function getOffer(id,source){
  if(!id||!validUuid(String(id)))return null;
  await ensureSchema();
  const q=await pool.query("SELECT * FROM crm_offers WHERE id=$1 LIMIT 1",[id]);
  return offerUsable(q.rows[0],source)?q.rows[0]:null;
}
async function syncTunegocioOffer(projectId,offer){
  const origin=safeTunegocioOrigin();
  if(!origin||CRM_BRIDGE_SECRET.length<32)throw new Error('bridge_not_configured');
  const response=await fetch(origin+'/api/internal/crm-offer',{
    method:offer?'POST':'DELETE',
    headers:{'Authorization':'Bearer '+CRM_BRIDGE_SECRET,'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify(offer?{projectId,name:offer.name,percentOff:Number(offer.percent_off),durationMonths:Number(offer.duration_months),...(roadmap.enabled()?{campaignId:offer.id,expiresAt:offer.ends_at}: {})}:{projectId}),
    signal:AbortSignal.timeout(12000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'offer_sync_failed');
  return data;
}
async function ensureCatalogOfferPromotion(row){
  if(!row||!Number(row.offer_percent_off)||!Number(row.offer_duration_months))return row;
  let campaign=null;
  if(roadmap.enabled()){
    campaign=await getOffer(row.offer_id,'catalog');
    if(!campaign)throw roadmap.problem(409,'La campaña no está vigente. Revisa la oferta antes de crear un checkout.');
  }
  if(row.stripe_offer_coupon_id&&row.stripe_offer_promotion_code_id)return row;
  if(!STRIPE_MAINTENANCE_PRODUCT_ID)throw Object.assign(new Error('offer_product_missing'),{status:503,publicMessage:'Falta configurar el producto mensual de Stripe.'});
  const months=Number(row.offer_duration_months),percent=Number(row.offer_percent_off);
  const coupon=await stripePost('/coupons',{
    name:row.offer_name||('Oferta NoeApps '+percent+'%'),
    percent_off:percent,
    duration:months===1?'once':'repeating',
    ...(months>1?{duration_in_months:months}:{}),
    applies_to:{products:[STRIPE_MAINTENANCE_PRODUCT_ID]},
    metadata:{application:'noeapps-catalog',request_id:row.id,offer_id:row.offer_id||''}
  },'catalog-offer-coupon-'+row.id+'-'+String(row.offer_id||'custom'));
  const promotion=await stripePost('/promotion_codes',{
    active:true,
    ...(campaign?.ends_at?{expires_at:Math.floor(new Date(campaign.ends_at).getTime()/1000)}:{}),
    promotion:{type:'coupon',coupon:coupon.id},
    metadata:{application:'noeapps-catalog',request_id:row.id,offer_id:row.offer_id||''}
  },'catalog-offer-promo-'+row.id+'-'+String(row.offer_id||'custom'));
  const updated=await pool.query("UPDATE catalog_requests SET stripe_offer_coupon_id=$2,stripe_offer_promotion_code_id=$3,updated_at=now() WHERE id=$1 RETURNING *",
    [row.id,String(coupon.id||''),String(promotion.id||'')]);
  return updated.rows[0]||row;
}
async function catalogAnalytics(){
  await ensureSchema();
  const [revenue,totals,topDesigns]=await Promise.all([
    pool.query(`SELECT coalesce(sum(amount_paid_cents),0)::bigint AS revenue_cents,
      coalesce(sum(amount_paid_cents) FILTER (WHERE paid_at>=date_trunc('month',now())),0)::bigint AS month_revenue_cents,
      count(*)::integer AS payments FROM catalog_revenue_events`),
    pool.query(`SELECT count(*)::integer AS requests,
      count(*) FILTER (WHERE first_paid_amount_cents IS NOT NULL)::integer AS paid,
      count(*) FILTER (WHERE site_status='active')::integer AS active,
      coalesce(sum(commission_cents),0)::bigint AS commissions_cents
      FROM catalog_requests`),
    pool.query(`SELECT design_id,design_name,count(*)::integer AS requests,
      count(*) FILTER (WHERE first_paid_amount_cents IS NOT NULL)::integer AS paid,
      coalesce(sum(first_paid_amount_cents),0)::bigint AS first_revenue_cents
      FROM catalog_requests GROUP BY design_id,design_name ORDER BY paid DESC,requests DESC LIMIT 10`)
  ]);
  const activeRows=await pool.query("SELECT monthly_price_cents,offer_percent_off,offer_duration_months,paid_at FROM catalog_requests WHERE stripe_subscription_status IN ('active','trialing','past_due')");
  let mrrCents=0;
  for(const row of activeRows.rows){
    let amount=Number(row.monthly_price_cents||0);
    if(row.paid_at&&Number(row.offer_percent_off)>0&&Number(row.offer_duration_months)>0){
      const end=new Date(row.paid_at);end.setUTCMonth(end.getUTCMonth()+Number(row.offer_duration_months));
      if(end.getTime()>Date.now())amount=Math.round(amount*(100-Number(row.offer_percent_off))/100);
    }
    mrrCents+=amount;
  }
  return{
    revenueCents:Number(revenue.rows[0]?.revenue_cents||0),
    monthRevenueCents:Number(revenue.rows[0]?.month_revenue_cents||0),
    payments:Number(revenue.rows[0]?.payments||0),
    requests:Number(totals.rows[0]?.requests||0),
    paid:Number(totals.rows[0]?.paid||0),
    active:Number(totals.rows[0]?.active||0),
    commissionsCents:Number(totals.rows[0]?.commissions_cents||0),
    mrrCents,
    topDesigns:topDesigns.rows
  };
}
async function combinedAnalytics(tunegocio){
  const [catalog,expenses]=await Promise.all([catalogAnalytics(),expenseAnalytics()]);
  const tnCommercial=tunegocio&&tunegocio.analytics&&tunegocio.analytics.commercial?tunegocio.analytics.commercial:null;
  const tnAi=tunegocio&&tunegocio.analytics&&tunegocio.analytics.aiUsage?tunegocio.analytics.aiUsage:null;
  const tnProjects=Array.isArray(tunegocio?.projects)?tunegocio.projects:[];
  let tnMrrCents=0,tnCommissionsCents=0;
  for(const item of tnProjects){
    if(item.paymentStatus==='paid'&&item.paidUntil&&new Date(item.paidUntil).getTime()>Date.now()){
      let amount=Number(item.amountCents||0);
      if(item.planId==='monthly'){
        if(Number(item.offerPercentOff)>0&&Number(item.offerDurationMonths)>0&&item.firstPaidAt){
          const offerEnd=new Date(item.firstPaidAt);
          offerEnd.setUTCMonth(offerEnd.getUTCMonth()+Number(item.offerDurationMonths));
          if(offerEnd.getTime()>Date.now())amount=Math.round(amount*(100-Number(item.offerPercentOff))/100);
        }
        tnMrrCents+=amount;
      }else if(item.planId==='annual'||item.planId==='annual-prepaid')tnMrrCents+=Math.round(amount/12);
    }
    if(item.salespersonId&&Number(item.firstAmountCents)>0)tnCommissionsCents+=Math.round(Number(item.firstAmountCents)*SALESPERSON_COMMISSION_PERCENT/100);
  }
  const totalRevenueCents=catalog.revenueCents+Number(tnCommercial?.revenueCents||0);
  const totalCommissionsCents=catalog.commissionsCents+tnCommissionsCents;
  const totalOperations=catalog.requests+tnProjects.length;
  const totalPaid=catalog.paid+tnProjects.filter(x=>x.paymentStatus==='paid').length;
  return{
    catalog,
    tunegocio:{commercial:tnCommercial,aiUsage:tnAi,mrrCents:tnMrrCents,commissionsCents:tnCommissionsCents,bridgeAvailable:!!tunegocio?.available},
    totals:{
      operations:totalOperations,
      paid:totalPaid,
      conversionPct:totalOperations?Number((totalPaid*100/totalOperations).toFixed(1)):0,
      revenueCents:totalRevenueCents,
      monthRevenueCents:catalog.monthRevenueCents+Number(tnCommercial?.monthRevenueCents||0),
      mrrCents:catalog.mrrCents+tnMrrCents,
      commissionsCents:totalCommissionsCents,
      averageFirstTicketCents:totalPaid?Math.round((catalog.topDesigns.reduce((s,x)=>s+Number(x.first_revenue_cents||0),0)+tnProjects.filter(x=>x.paymentStatus==='paid').reduce((s,x)=>s+Number(x.firstAmountCents||0),0))/totalPaid):0,
      monthExpensesCents:expenses.monthExpensesCents,
      recurringExpensesCents:expenses.recurringMonthlyCents,
      monthOperatingResultCents:catalog.monthRevenueCents+Number(tnCommercial?.monthRevenueCents||0)-expenses.monthExpensesCents
    },
    expenses
  };
}

async function fetchTunegocioOperations(){
  const origin=safeTunegocioOrigin();
  if(!origin||CRM_BRIDGE_SECRET.length<32)return{available:false,projects:[],analytics:null,error:'bridge_not_configured'};
  try{
    const response=await fetch(origin+'/api/internal/crm-summary',{
      method:'GET',
      headers:{'Authorization':'Bearer '+CRM_BRIDGE_SECRET,'Accept':'application/json'},
      cache:'no-store',
      signal:AbortSignal.timeout(7000)
    });
    if(!response.ok)return{available:false,projects:[],analytics:null,error:'upstream_'+response.status};
    const data=await response.json();
    const remote=Array.isArray(data.projects)?data.projects:[];
    await ensureSchema();
    const local=await pool.query("SELECT o.*,s.name AS salesperson_name,s.email AS salesperson_email FROM crm_operations o LEFT JOIN crm_salespeople s ON s.id=o.salesperson_id WHERE o.source='tunegocio'");
    const meta=new Map(local.rows.map(row=>[String(row.external_id),row]));
    const projects=[];
    for(const item of remote.filter(item=>item&&validUuid(String(item.id||'')))){
      const saved=meta.get(String(item.id))||{};
      const firstAmount=Number(item.firstAmountCents||saved.first_paid_amount_cents||0);
      const salespersonId=saved.salesperson_id?String(saved.salesperson_id):'';
      const commissionCents=salespersonId&&firstAmount>0?Number(saved.commission_cents||Math.round(firstAmount*SALESPERSON_COMMISSION_PERCENT/100)):0;
      if(salespersonId&&firstAmount>0&&(!saved.first_paid_amount_cents||!saved.commission_cents)){
        await pool.query("UPDATE crm_operations SET first_paid_amount_cents=COALESCE(first_paid_amount_cents,$2),commission_cents=COALESCE(commission_cents,$3),updated_at=now() WHERE source='tunegocio' AND external_id=$1",
          [item.id,firstAmount,commissionCents]).catch(()=>{});
      }
      projects.push({
        ...item,
        source:'tunegocio',
        manualStatus:String(saved.manual_status||'auto'),
        salesperson:String(saved.salesperson_name||saved.salesperson||''),
        salespersonId,
        salespersonEmail:String(saved.salesperson_email||''),
        adminNotes:String(saved.admin_notes||''),
        offerId:saved.offer_id?String(saved.offer_id):'',
        offerName:String(saved.offer_name||item.offerName||''),
        offerPercentOff:Number(saved.offer_percent_off||item.offerPercentOff||0),
        offerDurationMonths:Number(saved.offer_duration_months||item.offerDurationMonths||0),
        firstAmountCents:firstAmount||null,
        commissionCents,
        commissionPercent:SALESPERSON_COMMISSION_PERCENT,
        manualUpdatedAt:saved.updated_at?new Date(saved.updated_at).toISOString():null
      });
    }
    return{available:true,projects,analytics:data.analytics||null};
  }catch(error){
    console.warn('TuNegocio CRM bridge unavailable',{message:error&&error.name?error.name:'error'});
    return{available:false,projects:[],analytics:null,error:'bridge_unavailable'};
  }
}
async function updateTunegocioOperation(req,res,id){
  return roadmap.withRequestLock(pool,'tn-'+id,()=>updateTunegocioOperationUnlocked(req,res,id));
}
async function updateTunegocioOperationUnlocked(req,res,id){
  if(!validUuid(id))return json(res,400,{error:'Proyecto no válido.'});
  const data=await bodyJson(req,16000);
  const manualStatus=text(data.manualStatus,30),adminNotes=text(data.adminNotes,4000);
  const salespersonId=text(data.salespersonId,40),offerId=text(data.offerId,40);
  const allowed=new Set(['auto','review','in_progress','resolved','closed']);
  if(!allowed.has(manualStatus))return json(res,400,{error:'Estado manual no válido.'});
  if(salespersonId&&!validUuid(salespersonId))return json(res,400,{error:'Comercial no válido.'});
  if(offerId&&!validUuid(offerId))return json(res,400,{error:'Oferta no válida.'});
  await ensureSchema();

  let salesperson=null;
  if(salespersonId){
    const q=await pool.query("SELECT * FROM crm_salespeople WHERE id=$1 AND active=true LIMIT 1",[salespersonId]);
    salesperson=q.rows[0];
    if(!salesperson)return json(res,400,{error:'El comercial no está activo.'});
  }

  const currentLocal=(await pool.query("SELECT * FROM crm_operations WHERE source='tunegocio' AND external_id=$1 LIMIT 1",[id])).rows[0]||{};
  const remoteBundle=await fetchTunegocioOperations();
  const remote=remoteBundle.projects.find(item=>String(item.id)===id);
  if(!remote)return json(res,503,{error:'No se pudo comprobar el proyecto de TuNegocio.'});
  const salespersonChanged=String(currentLocal.salesperson_id||'')!==salespersonId;
  const confirmedFirstAmount=Number(remote.firstAmountCents||currentLocal.first_paid_amount_cents||0);
  if(confirmedFirstAmount>0&&currentLocal.salesperson_id&&salespersonChanged){
    return json(res,409,{error:'El comercial queda fijado al registrar el primer cobro y su comisión.'});
  }

  let offer=null;
  const offerChanged=String(currentLocal.offer_id||'')!==offerId;
  if(offerChanged&&remote.paymentStatus==='paid')return json(res,409,{error:'La oferta no se puede cambiar después del primer pago.'});
  if(offerChanged&&remote.paymentStatus==='pending')return json(res,409,{error:'Esta web ya tiene un pago pendiente. No cambies la oferta hasta que ese checkout expire o se cierre.'});
  if(offerId&&!offerChanged&&roadmap.enabled()){
    offer={id:currentLocal.offer_id,name:currentLocal.offer_name,percent_off:currentLocal.offer_percent_off,duration_months:currentLocal.offer_duration_months};
  }else if(offerId){
    offer=await getOffer(offerId,'tunegocio');
    if(!offer)return json(res,400,{error:'La oferta no está activa para TuNegocio.'});
  }
  if(offerChanged){
    try{await syncTunegocioOffer(id,offer)}catch(error){return json(res,503,{error:error&&error.message?String(error.message):'No se pudo aplicar la oferta en TuNegocio.'})}
  }

  const firstAmount=Number(remote.firstAmountCents||currentLocal.first_paid_amount_cents||0);
  const commissionCents=salesperson&&firstAmount>0?Math.round(firstAmount*SALESPERSON_COMMISSION_PERCENT/100):null;
  const result=await pool.query(
    `INSERT INTO crm_operations(source,external_id,manual_status,salesperson,admin_notes,salesperson_id,offer_id,offer_name,offer_percent_off,offer_duration_months,first_paid_amount_cents,commission_cents)
     VALUES('tunegocio',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT(source,external_id) DO UPDATE SET
       manual_status=EXCLUDED.manual_status,
       salesperson=EXCLUDED.salesperson,
       admin_notes=EXCLUDED.admin_notes,
       salesperson_id=EXCLUDED.salesperson_id,
       offer_id=EXCLUDED.offer_id,
       offer_name=EXCLUDED.offer_name,
       offer_percent_off=EXCLUDED.offer_percent_off,
       offer_duration_months=EXCLUDED.offer_duration_months,
       first_paid_amount_cents=COALESCE(crm_operations.first_paid_amount_cents,EXCLUDED.first_paid_amount_cents),
       commission_cents=CASE WHEN EXCLUDED.salesperson_id IS NULL THEN NULL ELSE COALESCE(crm_operations.commission_cents,EXCLUDED.commission_cents) END,
       updated_at=now()
     RETURNING *`,
    [id,manualStatus,salesperson?String(salesperson.name):'',adminNotes,salesperson?String(salesperson.id):null,offer?String(offer.id):null,
      offer?String(offer.name):'',offer?Number(offer.percent_off):0,offer?Number(offer.duration_months):0,firstAmount||null,commissionCents]
  );
  if(roadmap.enabled()&&offerChanged&&offer)await pool.query("INSERT INTO crm_campaign_assignments(campaign_id,source,entity_id) VALUES($1,'tunegocio',$2) ON CONFLICT DO NOTHING",[offer.id,id]);
  return json(res,200,{ok:true,operation:result.rows[0],commissionPercent:SALESPERSON_COMMISSION_PERCENT});
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
  if(RESERVED_SITE_SLUGS.has(slug))slug=('cliente-'+slug).slice(0,48);
  return slug;
}
function validSiteSlug(value){
  return typeof value==='string'&&/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(value)&&!value.startsWith('xn--')&&!value.startsWith('web-')&&!RESERVED_SITE_SLUGS.has(value);
}
function sitePublicUrl(slug){return process.env.CATALOG_ENVIRONMENT==='staging'?PUBLIC_ORIGIN+'/customer-site/'+encodeURIComponent(slug):'https://'+slug+'.'+SITE_DOMAIN+'/';}
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
  if(!row)return false;
  if(subscriptions.enabled()&&row.subscription_state&&row.stripe_subscription_id)return subscriptions.hasPaidAccess(row);
  const sub=String(row.stripe_subscription_status||'').toLowerCase();
  if(['canceled','unpaid','incomplete_expired'].includes(sub))return false;
  if(row.stripe_subscription_id)return ['active','trialing','past_due'].includes(sub)||String(row.stripe_payment_status||'').toLowerCase()==='paid';
  return !!(row.paid_at||String(row.stripe_payment_status||'').toLowerCase()==='paid');
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
  if(subscriptions.enabled()&&row.subscription_state&&row.stripe_subscription_id&&!subscriptions.hasPaidAccess(row)&&row.site_status==='active'){
    const r=await pool.query("UPDATE catalog_requests SET site_status='suspended',updated_at=now() WHERE id=$1 AND (subscription_paid_until IS NULL OR subscription_paid_until<=now()) RETURNING *",[row.id]);
    return r.rows[0]||row;
  }
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
    const code=String(data?.error?.code||data?.error?.type||'unknown').replace(/[^a-z0-9_]/gi,'').slice(0,80);
    console.error('Stripe request failed',response.status,code);
    const e=new Error('stripe_request_failed');
    e.status=502;e.publicMessage='Stripe no pudo preparar el cobro. Revisa la configuración o inténtalo de nuevo.';
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
    row.creation_price,row.monthly_price_cents,row.discount_code,row.discount_type,row.discount_value,row.discount_scope,
    row.salesperson,row.salesperson_id,row.email,row.design_id,row.offer_id,row.offer_name,row.offer_percent_off,row.offer_duration_months
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
  return roadmap.withRequestLock(pool,row.id,async()=>{
    if(roadmap.enabled()){
      row=(await pool.query('SELECT * FROM catalog_requests WHERE id=$1',[row.id])).rows[0];
      if(row.first_paid_amount_cents!=null||row.stripe_payment_status==='paid')throw roadmap.problem(409,'Esta solicitud ya tiene un pago. Gestiona su suscripción existente.');
      const expiry=row.stripe_checkout_expires_at?new Date(row.stripe_checkout_expires_at).getTime():0;
      if(row.stripe_checkout_url&&expiry>Date.now()+60000&&!['paid','complete','failed','expired'].includes(row.stripe_payment_status))return {row,url:row.stripe_checkout_url,reused:true};
    }
    return createStripeSessionForRowUnlocked(row);
  });
}
async function createStripeSessionForRowUnlocked(row){
  const hasOffer=Number(row.offer_percent_off)>0&&Number(row.offer_duration_months)>0;
  if(hasOffer)row=await ensureCatalogOfferPromotion(row);
  const creationBase=Math.max(0,Math.round(Number(row.creation_price)*100));
  const monthlyBase=Math.max(0,Math.round(Number(row.monthly_price_cents)));
  const creationAmount=applyDiscount(creationBase,row.discount_type,Number(row.discount_value)||0,row.discount_scope,'creation');
  const monthlyAmount=hasOffer?monthlyBase:applyDiscount(monthlyBase,row.discount_type,Number(row.discount_value)||0,row.discount_scope,'monthly');
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
    salesperson_id:row.salesperson_id||'',
    discount_code:row.discount_code||'',
    offer_id:row.offer_id||'',
    offer_percent_off:String(row.offer_percent_off||0),
    offer_duration_months:String(row.offer_duration_months||0),
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
    subscription_data:{metadata},
    ...(hasOffer?{discounts:[{promotion_code:row.stripe_offer_promotion_code_id}]}:{})
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

function generatedHtmlHeaders({preview=false}={}){
  return{
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'private, no-store, max-age=0',
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY',
    'Referrer-Policy':'strict-origin-when-cross-origin',
    'Content-Security-Policy':"default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:; media-src https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"+(preview?"; sandbox allow-popups allow-popups-to-escape-sandbox":'')
  };
}
async function requestForAi(id){
  if(!validUuid(id))throw aiGenerator.problem(400,'Solicitud no válida.');
  await ensureSchema();
  const row=(await pool.query('SELECT * FROM catalog_requests WHERE id=$1',[id])).rows[0];
  if(!row)throw aiGenerator.problem(404,'Solicitud no encontrada.');
  return row;
}
async function researchRequestWithAi(req,res,id){
  return roadmap.withRequestLock(pool,'ai-generation-global',async()=>{
    let row=await requestForAi(id);
    await pool.query("UPDATE catalog_requests SET generation_state='researching',generation_last_error='',updated_at=now() WHERE id=$1",[id]);
    try{
      const result=await aiGenerator.researchBusiness(row);
      const usage={...result.usage,model:result.model,responseId:result.responseId,completedAt:new Date().toISOString()};
      const updated=(await pool.query("UPDATE catalog_requests SET generation_state='brief_ready',generation_brief=$2,generation_research_usage=$3::jsonb,generation_last_error='',updated_at=now() WHERE id=$1 RETURNING *",[id,result.text,JSON.stringify(usage)])).rows[0];
      return json(res,200,{ok:true,request:updated,brief:result.text,usage});
    }catch(error){
      const message=String(error.publicMessage||'No se pudo analizar el negocio con IA.').slice(0,1000);
      await pool.query("UPDATE catalog_requests SET generation_state='failed',generation_last_error=$2,updated_at=now() WHERE id=$1",[id,message]).catch(()=>{});
      throw error;
    }
  });
}
async function generateRequestWithAi(req,res,id){
  const data=await bodyJson(req,9000);
  const feedback=text(data.feedback,4000);
  return roadmap.withRequestLock(pool,'ai-generation-global',async()=>{
    let row=await requestForAi(id);
    if(!row.generation_brief)return json(res,409,{error:'Primero pulsa Analizar negocio para preparar el briefing.'});
    const latest=row.latest_generation_id?(await pool.query('SELECT * FROM catalog_site_generations WHERE id=$1 AND request_id=$2',[row.latest_generation_id,id])).rows[0]:null;
    const previousHtml=feedback&&latest?latest.html:'';
    await pool.query("UPDATE catalog_requests SET generation_state='generating',generation_last_error='',updated_at=now() WHERE id=$1",[id]);
    try{
      const generated=await aiGenerator.generateSite(row,{brief:row.generation_brief,feedback,previousHtml});
      const next=(await pool.query('SELECT COALESCE(MAX(version),0)+1 AS version FROM catalog_site_generations WHERE request_id=$1',[id])).rows[0].version;
      const inserted=(await pool.query(`INSERT INTO catalog_site_generations(
        request_id,version,state,feedback,html,model,input_tokens,cached_input_tokens,output_tokens,total_tokens,search_calls,response_id
      ) VALUES($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[
        id,Number(next),feedback,generated.text,generated.model,generated.usage.inputTokens,generated.usage.cachedInputTokens,
        generated.usage.outputTokens,generated.usage.totalTokens,generated.usage.searchCalls,generated.responseId
      ])).rows[0];
      row=(await pool.query("UPDATE catalog_requests SET latest_generation_id=$2,generation_state='review',generation_last_error='',updated_at=now() WHERE id=$1 RETURNING *",[id,inserted.id])).rows[0];
      return json(res,200,{ok:true,request:row,generation:{id:inserted.id,version:inserted.version,state:inserted.state,model:inserted.model,inputTokens:Number(inserted.input_tokens),outputTokens:Number(inserted.output_tokens),createdAt:inserted.created_at},reviewUrl:'/api/crm/requests/'+id+'/ai/preview?generationId='+inserted.id});
    }catch(error){
      const message=String(error.publicMessage||'No se pudo generar la web con IA.').slice(0,1000);
      await pool.query("UPDATE catalog_requests SET generation_state='failed',generation_last_error=$2,updated_at=now() WHERE id=$1",[id,message]).catch(()=>{});
      throw error;
    }
  });
}
async function serveAiPreview(req,res,id,url){
  const row=await requestForAi(id);
  const requested=String(url.searchParams.get('generationId')||row.latest_generation_id||'');
  if(!/^\d+$/.test(requested))return json(res,404,{error:'Todavía no hay un borrador generado.'});
  const generation=(await pool.query('SELECT * FROM catalog_site_generations WHERE id=$1 AND request_id=$2',[requested,id])).rows[0];
  if(!generation)return json(res,404,{error:'Versión no encontrada.'});
  res.writeHead(200,{...generatedHtmlHeaders({preview:true}),'X-Robots-Tag':'noindex, nofollow, noarchive','X-NoeApps-Generation':String(generation.version)});
  return res.end(generation.html);
}
async function validateAiGeneration(req,res,id){
  const data=await bodyJson(req,3000);
  const generationId=String(data.generationId||'');
  if(!/^\d+$/.test(generationId))return json(res,400,{error:'Versión no válida.'});
  return roadmap.withRequestLock(pool,id,async()=>{
    await requestForAi(id);
    const generation=(await pool.query('SELECT * FROM catalog_site_generations WHERE id=$1 AND request_id=$2',[generationId,id])).rows[0];
    if(!generation)return json(res,404,{error:'Versión no encontrada.'});
    await pool.query("UPDATE catalog_site_generations SET state=CASE WHEN id=$2 THEN 'validated' WHEN state='validated' THEN 'superseded' ELSE state END,validated_at=CASE WHEN id=$2 THEN now() ELSE validated_at END WHERE request_id=$1",[id,generation.id]);
    const row=(await pool.query("UPDATE catalog_requests SET validated_generation_id=$2,latest_generation_id=$2,generation_state='validated',generation_last_error='',updated_at=now() WHERE id=$1 RETURNING *",[id,generation.id])).rows[0];
    return json(res,200,{ok:true,request:row,generation:{id:generation.id,version:generation.version,state:'validated'}});
  });
}
async function publishValidatedGeneration(req,res,id){
  return roadmap.withRequestLock(pool,id,async()=>{
    let row=await requestForAi(id);
    if(!row.validated_generation_id)return json(res,409,{error:'Primero revisa y valida una versión de la web.'});
    const generation=(await pool.query("SELECT * FROM catalog_site_generations WHERE id=$1 AND request_id=$2 AND state='validated'",[row.validated_generation_id,id])).rows[0];
    if(!generation)return json(res,409,{error:'La versión validada ya no está disponible.'});
    if(!aiGenerator.salesWhatsapp())return json(res,503,{error:'Falta configurar el WhatsApp comercial antes de publicar.'});
    const slug=row.site_slug||await makeUniqueSiteSlug(row.business_name,row.id);
    const paid=siteIsPaid(row),publicUrl=sitePublicUrl(slug);
    row=(await pool.query(`UPDATE catalog_requests SET
      site_slug=$2,site_origin_url='',published_generation_id=validated_generation_id,site_status=$3,preview_published_at=COALESCE(preview_published_at,now()),
      preview_expires_at=$4,preview_url=$5,status=$6,generation_state='published',updated_at=now()
      WHERE id=$1 RETURNING *`,[id,slug,paid?'active':'preview',paid?null:new Date(Date.now()+10*24*60*60*1000),publicUrl,paid?'published':'preview_ready'])).rows[0];
    return json(res,200,{ok:true,publicUrl,request:row,generation:{id:generation.id,version:generation.version}});
  });
}
async function generatedSiteForRequest(row,pathname){
  if(!row.published_generation_id)return null;
  if(pathname!=='/'&&pathname!=='/index.html')return{notFound:true};
  const generation=(await pool.query('SELECT * FROM catalog_site_generations WHERE id=$1 AND request_id=$2',[row.published_generation_id,row.id])).rows[0];
  if(!generation)return null;
  const html=row.site_status==='preview'?aiGenerator.injectLeadGate(generation.html,row.business_name):generation.html;
  return{html,version:generation.version};
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
  if(!['preview','active'].includes(row.site_status))return simpleSitePage(res,503,'Web en preparación','La web todavía se está preparando.');
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'},{'Allow':'GET, HEAD'});
  const generated=await generatedSiteForRequest(row,pathname||'/');
  if(generated?.notFound)return simpleSitePage(res,404,'Página no encontrada','Esta demo es una web de una sola página.');
  if(generated){
    const headers={...generatedHtmlHeaders({preview:row.site_status==='preview'})};
    if(row.site_status==='preview')headers['X-Robots-Tag']='noindex, nofollow, noarchive';
    headers['X-NoeApps-Generation']=String(generated.version);
    res.writeHead(200,headers);
    if(req.method==='HEAD')return res.end();
    return res.end(generated.html);
  }
  if(!row.site_origin_url)return simpleSitePage(res,503,'Web en preparación','La web todavía se está preparando.');
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
      'Cache-Control':row.site_status==='preview'||(subscriptions.enabled()&&row.subscription_state&&row.stripe_subscription_id)?'private, no-store, max-age=0':(upstream.headers.get('cache-control')||'public, max-age=60'),
      'X-Content-Type-Options':'nosniff'
    };
    if(row.site_status==='preview')responseHeaders['X-Robots-Tag']='noindex, nofollow, noarchive';
    if(upstream.headers.get('etag'))responseHeaders['ETag']=upstream.headers.get('etag');
    if(upstream.headers.get('last-modified'))responseHeaders['Last-Modified']=upstream.headers.get('last-modified');
    let responseBody=null;
    if(req.method!=='HEAD')responseBody=Buffer.from(await upstream.arrayBuffer());
    if(req.method!=='HEAD'&&row.site_status==='preview'&&row.chatgpt_published_version&&/^text\/html\b/i.test(responseHeaders['Content-Type'])){
      try{responseBody=Buffer.from(aiGenerator.injectLeadGate(responseBody.toString('utf8'),row.business_name),'utf8');}
      catch(error){console.error('Commercial demo gate failed',slug,error&&error.message?error.message:error);return simpleSitePage(res,503,'Demo en preparación','No se pudo preparar la vista comercial.');}
    }
    res.writeHead(upstream.status,responseHeaders);
    if(req.method==='HEAD')return res.end();
    return res.end(responseBody);
  }catch(error){
    console.error('Customer site proxy failed',slug,error&&error.message?error.message:error);
    return simpleSitePage(res,502,'Web no disponible','La web no está disponible temporalmente.');
  }
}

async function createCustomerPortal(res,id){
  if(!validUuid(id))return json(res,400,{error:'Solicitud no válida.'});
  await ensureSchema();
  if(subscriptions.enabled())return json(res,200,await subscriptions.manage(pool,id,'portal',subscriptions.stripeClient(STRIPE_SECRET_KEY),PUBLIC_ORIGIN));
  const found=await pool.query('SELECT * FROM catalog_requests WHERE id=$1',[id]);
  const row=found.rows[0];if(!row)return json(res,404,{error:'Solicitud no encontrada.'});
  if(!row.stripe_customer_id)return json(res,400,{error:'Este cliente todavía no tiene una suscripción Stripe.'});
  const session=await stripePost('/billing_portal/sessions',{customer:row.stripe_customer_id,return_url:PUBLIC_ORIGIN+'/crm'});
  return json(res,200,{ok:true,url:session.url});
}
async function recordCatalogRevenue(client,requestId,invoice){
  if(!validUuid(requestId))return;
  const amount=Math.max(0,Math.round(Number(invoice&&invoice.amount_paid)||0));
  if(!Number.isSafeInteger(amount))return;
  const current=await client.query("SELECT first_paid_amount_cents,salesperson_id FROM catalog_requests WHERE id=$1 FOR UPDATE",[requestId]);
  const row=current.rows[0];if(!row)return;
  const initial=row.first_paid_amount_cents==null;
  const eventId='invoice:'+String(invoice.id||'');
  const inserted=await client.query("INSERT INTO catalog_revenue_events(event_id,request_id,amount_paid_cents,kind,paid_at) VALUES($1,$2,$3,$4,to_timestamp($5)) ON CONFLICT(event_id) DO NOTHING RETURNING event_id",
    [eventId,requestId,amount,initial?'initial':'renewal',Number(invoice.status_transitions&&invoice.status_transitions.paid_at||invoice.created||Math.floor(Date.now()/1000))]);
  if(!inserted.rows[0])return;
  if(roadmap.enabled())await client.query('UPDATE catalog_revenue_events SET campaign_id=(SELECT offer_id FROM catalog_requests WHERE id=$2),discount_cents=$3 WHERE event_id=$1',
    [eventId,requestId,Array.isArray(invoice.total_discount_amounts)?invoice.total_discount_amounts.reduce((sum,item)=>sum+Number(item.amount||0),0):null]);
  if(initial){
    const commission=row.salesperson_id?Math.round(amount*SALESPERSON_COMMISSION_PERCENT/100):null;
    await client.query("UPDATE catalog_requests SET first_paid_amount_cents=$2,commission_cents=$3,updated_at=now() WHERE id=$1",
      [requestId,amount,commission]);
  }
}

async function handleStripeWebhook(req,res){
  const payload=await rawBody(req);
  if(!verifyStripeSignature(payload,req.headers['stripe-signature']))return json(res,400,{error:'Firma Stripe no válida.'});
  let event;try{event=JSON.parse(payload.toString('utf8'))}catch{return json(res,400,{error:'Evento Stripe no válido.'})}
  if((subscriptions.enabled()||roadmap.enabled())&&event.livemode!==/^(sk|rk)_live_/.test(STRIPE_SECRET_KEY))return json(res,400,{error:'Entorno Stripe no válido.'});
  await ensureSchema();
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const inserted=await client.query('INSERT INTO stripe_events(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',[event.id]);
    if(!inserted.rows[0]){await client.query('COMMIT');return json(res,200,{received:true,duplicate:true})}
    let obj=event.data&&event.data.object?event.data.object:{};
    const type=event.type||'';
    let subscriptionRequestId='';
    const stripeV2=(subscriptions.enabled()||roadmap.enabled())?subscriptions.stripeClient(STRIPE_SECRET_KEY):null;
    if(stripeV2&&/^(checkout\.session\.|invoice\.|customer\.subscription\.)/.test(type)){
      const sid=type.startsWith('customer.subscription.')?obj.id:invoiceSubscriptionId(obj);
      const metadataId=invoiceRequestId(obj)||obj.client_reference_id||'';
      const mapped=sid?(await client.query('SELECT id FROM catalog_requests WHERE stripe_subscription_id=$1',[sid])).rows[0]:null;
      subscriptionRequestId=mapped?String(mapped.id):validUuid(metadataId)?metadataId:'';
      if(subscriptionRequestId){
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['catalog-subscription:'+subscriptionRequestId]);
        const endpoint=type.startsWith('checkout.')?'/checkout/sessions/':type.startsWith('invoice.')?'/invoices/':'/subscriptions/';
        obj=await stripeV2.request('GET',endpoint+encodeURIComponent(obj.id));
        const canonicalId=invoiceRequestId(obj)||obj.client_reference_id||'';
        if(canonicalId&&canonicalId!==subscriptionRequestId)throw new Error('Stripe request binding mismatch');
      }
    }
    if(roadmap.enabled()&&type==='invoice.paid'&&(obj.currency!=='eur'||obj.status!=='paid'||obj.paid_out_of_band||obj.livemode!==stripeV2.live))throw roadmap.problem(400,'Factura no válida para el registro de cobros.');
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
          stripe_subscription_id=COALESCE(NULLIF($3::text,''),stripe_subscription_id),
          paid_at=CASE WHEN $1='paid' THEN COALESCE(paid_at,now()) ELSE paid_at END,
          site_status=CASE WHEN $1='paid' THEN 'active' ELSE site_status END,
          preview_expires_at=CASE WHEN $1='paid' THEN NULL ELSE preview_expires_at END,
          status=CASE WHEN $1='paid' AND status IN ('new','preparing','preview_ready','sent','paid','expired') THEN 'paid' ELSE status END,
          updated_at=now() WHERE `+where,values);
        if(type==='invoice.paid'&&validUuid(requestId))await recordCatalogRevenue(client,requestId,obj);
        else if(type==='invoice.paid'&&subscriptionId){
          const mapped=await client.query("SELECT id FROM catalog_requests WHERE stripe_subscription_id=$1 LIMIT 1",[subscriptionId]);
          if(mapped.rows[0])await recordCatalogRevenue(client,String(mapped.rows[0].id),obj);
        }
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
    if(stripeV2&&subscriptionRequestId){
      const row=(await client.query('SELECT * FROM catalog_requests WHERE id=$1',[subscriptionRequestId])).rows[0];
      if(row?.stripe_subscription_id&&row?.stripe_customer_id)await subscriptions.sync(client,row,stripeV2);
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
  return roadmap.withRequestLock(pool,id,()=>updateRequestUnlocked(req,res,id));
}
async function updateRequestUnlocked(req,res,id){
  if(!validUuid(id))return json(res,400,{error:'Solicitud no válida.'});
  const data=await bodyJson(req,18000);
  const status=text(data.status,30),previewUrl=safeUrl(data.previewUrl,1600),paymentUrl=safeUrl(data.paymentUrl,1600),adminNotes=text(data.adminNotes,3000);
  const salespersonId=text(data.salespersonId,40),offerId=text(data.offerId,40);
  const discountCode=text(data.discountCode,60).toUpperCase(),discountType=text(data.discountType,20),discountScope=text(data.discountScope,20);
  const requestedSiteSlug=text(data.siteSlug,80).toLowerCase();
  const siteSlug=requestedSiteSlug?normalizeSiteSlug(requestedSiteSlug):'';
  const rawSiteOrigin=text(data.siteOriginUrl,1600);
  const siteOriginUrl=rawSiteOrigin?safeSiteOrigin(rawSiteOrigin):'';
  const creationPrice=Math.round(Number(data.creationPrice));
  const monthlyPriceCents=Math.round(Number(data.monthlyPriceCents));
  let discountValue=Math.round(Number(data.discountValue)||0);
  if(!statuses.has(status))return json(res,400,{error:'Estado no válido.'});
  if(salespersonId&&!validUuid(salespersonId))return json(res,400,{error:'Comercial no válido.'});
  if(offerId&&!validUuid(offerId))return json(res,400,{error:'Oferta no válida.'});
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
  const existing=(await pool.query("SELECT * FROM catalog_requests WHERE id=$1 LIMIT 1",[id])).rows[0];
  if(!existing)return json(res,404,{error:'Solicitud no encontrada.'});

  let salesperson=null;
  if(salespersonId){
    const q=await pool.query("SELECT * FROM crm_salespeople WHERE id=$1 AND active=true LIMIT 1",[salespersonId]);
    salesperson=q.rows[0];
    if(!salesperson)return json(res,400,{error:'El comercial no está activo.'});
  }
  const salespersonChanged=String(existing.salesperson_id||'')!==salespersonId;
  if(existing.first_paid_amount_cents!=null&&existing.salesperson_id&&salespersonChanged){
    return json(res,409,{error:'El comercial queda fijado al registrar el primer cobro y su comisión.'});
  }

  let offer=null;
  const offerChanged=String(existing.offer_id||'')!==offerId;
  const hasOpenCheckout=!!existing.stripe_checkout_session_id&&!['paid','complete','failed','expired'].includes(String(existing.stripe_payment_status||'').toLowerCase());
  if(roadmap.enabled()&&hasOpenCheckout&&(creationPrice!==existing.creation_price||monthlyPriceCents!==existing.monthly_price_cents||discountType!==existing.discount_type||discountValue!==existing.discount_value||discountScope!==existing.discount_scope))return json(res,409,{error:'Las condiciones quedan bloqueadas mientras haya un checkout pendiente.'});
  if(offerChanged&&existing.first_paid_amount_cents!=null)return json(res,409,{error:'La oferta no se puede cambiar después del primer pago.'});
  if(offerChanged&&hasOpenCheckout)return json(res,409,{error:'Esta web ya tiene un enlace de pago pendiente. No cambies la oferta hasta que ese checkout caduque o se cierre.'});
  if(offerId&&!offerChanged&&roadmap.enabled()){
    offer={id:existing.offer_id,name:existing.offer_name,percent_off:existing.offer_percent_off,duration_months:existing.offer_duration_months};
  }else if(offerId){
    offer=await getOffer(offerId,'catalog');
    if(!offer)return json(res,400,{error:'La oferta no está activa para Catálogo.'});
  }

  if(siteSlug){
    const clash=await pool.query('SELECT id FROM catalog_requests WHERE site_slug=$1 AND id<>$2 LIMIT 1',[siteSlug,id]);
    if(clash.rows[0])return json(res,409,{error:'Ese subdominio ya está asignado a otra web.'});
  }

  const publicUrl=siteSlug?sitePublicUrl(siteSlug):'';
  const firstPaid=existing.first_paid_amount_cents==null?null:Number(existing.first_paid_amount_cents);
  const commission=existing.commission_cents??(salesperson&&firstPaid!=null?Math.round(firstPaid*SALESPERSON_COMMISSION_PERCENT/100):null);
  const result=await pool.query(`UPDATE catalog_requests SET
    status=$2,
    preview_url=CASE WHEN site_status IN ('preview','active') AND $13<>'' THEN $15 ELSE $3 END,
    payment_url=$4,
    admin_notes=$5,
    creation_price=$6,
    monthly_price_cents=$7,
    salesperson=$8,
    discount_code=$9,
    discount_type=$10,
    discount_value=$11,
    discount_scope=$12,
    site_slug=CASE WHEN $13<>'' THEN $13 ELSE site_slug END,
    site_origin_url=CASE WHEN $14<>'' THEN $14 ELSE site_origin_url END,
    salesperson_id=$16,
    offer_id=$17,
    offer_name=$18,
    offer_percent_off=$19,
    offer_duration_months=$20,
    stripe_offer_coupon_id=CASE WHEN $21 THEN '' ELSE stripe_offer_coupon_id END,
    stripe_offer_promotion_code_id=CASE WHEN $21 THEN '' ELSE stripe_offer_promotion_code_id END,
    stripe_checkout_url=CASE WHEN $21 THEN '' ELSE stripe_checkout_url END,
    stripe_checkout_session_id=CASE WHEN $21 THEN '' ELSE stripe_checkout_session_id END,
    checkout_fingerprint=CASE WHEN $21 THEN '' ELSE checkout_fingerprint END,
    commission_cents=$22,
    updated_at=now()
    WHERE id=$1 RETURNING *`,
    [id,status,previewUrl,paymentUrl,adminNotes,creationPrice,monthlyPriceCents,salesperson?String(salesperson.name):'',discountCode,discountType,discountValue,discountScope,
      siteSlug,siteOriginUrl,publicUrl,salesperson?String(salesperson.id):null,offer?String(offer.id):null,offer?String(offer.name):'',
      offer?Number(offer.percent_off):0,offer?Number(offer.duration_months):0,offerChanged,commission]);
  if(roadmap.enabled()&&offerChanged&&offer)await pool.query("INSERT INTO crm_campaign_assignments(campaign_id,source,entity_id) VALUES($1,'catalog',$2) ON CONFLICT DO NOTHING",[offer.id,id]);
  return json(res,200,{ok:true,request:result.rows[0],commissionPercent:SALESPERSON_COMMISSION_PERCENT});
}

http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/mcp'){
      if(!chatgptHandoff.enabled())return json(res,404,{error:'Función no habilitada.'});
      return await chatgptHandoff.handleMcp(req,res);
    }
    if(roadmap.enabled()&&url.pathname.startsWith('/api/crm/')&&!['GET','HEAD'].includes(req.method)){
      if(req.headers.origin!==PUBLIC_ORIGIN||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')||!['same-origin','none',undefined].includes(req.headers['sec-fetch-site']))return json(res,403,{error:'Abre esta acción desde el CRM.'});
      if(!['/api/crm/login','/api/crm/logout'].includes(url.pathname)){
        if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
        await ensureSchema();await crmRoadmap.audit('requested:'+req.method,'crm',url.pathname);
        res.once('finish',()=>{crmRoadmap.audit('completed:'+req.method,'crm',url.pathname,{status:res.statusCode}).catch(()=>console.error('CRM audit completion unavailable'));});
      }
    }
    if(url.pathname==='/assets/crm-roadmap.js'&&req.method==='GET'){
      res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      return res.end(fs.readFileSync(path.join(__dirname,'crm-roadmap-ui.js')));
    }
    if(url.pathname.startsWith('/api/crm/roadmap')){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      if(!roadmap.enabled())return json(res,404,{error:'Función no habilitada.'});
      await ensureSchema();
      if(url.pathname==='/api/crm/roadmap'&&req.method==='GET')return json(res,200,await crmRoadmap.report());
      if(url.pathname==='/api/crm/roadmap/campaign'&&req.method==='GET'){
        const id=url.searchParams.get('id');if(!validUuid(id))return json(res,400,{error:'Campaña no válida.'});
        const customers=(await pool.query(`SELECT a.source,a.entity_id,a.assigned_at,r.business_name,r.first_paid_amount_cents
          FROM crm_campaign_assignments a LEFT JOIN catalog_requests r ON a.source='catalog' AND r.id=a.entity_id
          WHERE a.campaign_id=$1 ORDER BY a.assigned_at DESC`,[id])).rows;
        const tn=customers.some(x=>x.source==='tunegocio')?await fetchTunegocioOperations():null;
        return json(res,200,{customers:customers.map(x=>({...x,business_name:x.business_name||tn?.projects.find(p=>p.id===x.entity_id)?.businessName||x.entity_id}))});
      }
      if(url.pathname==='/api/crm/roadmap/incidents'&&req.method==='GET'){
        const [list,count,run]=await Promise.all([pool.query("SELECT * FROM crm_incidents ORDER BY (state='resolved'),last_seen_at DESC LIMIT 500"),pool.query("SELECT count(*)::int AS total FROM crm_incidents WHERE state<>'resolved'"),pool.query('SELECT * FROM crm_monitor_runs ORDER BY id DESC LIMIT 1')]);
        return json(res,200,{incidents:list.rows,openCount:count.rows[0].total,lastRun:run.rows[0]||null});
      }
      if(url.pathname==='/api/crm/roadmap/scan'&&req.method==='POST')return json(res,200,await crmRoadmap.scan());
      if(url.pathname==='/api/crm/roadmap/incident'&&req.method==='PATCH'){
        const data=await bodyJson(req,4000);
        if(typeof data.key!=='string'||data.key.length>250||typeof data.note!=='string'||data.note.length>2000)return json(res,400,{error:'Incidencia no válida.'});
        const result=await pool.query("UPDATE crm_incidents SET state='acknowledged',acknowledged_at=now(),note=$2 WHERE key=$1 AND state<>'resolved' RETURNING *",[data.key,data.note]);
        return json(res,result.rows.length?200:404,{incident:result.rows[0]||null});
      }
      if(url.pathname==='/api/crm/roadmap/templates'&&req.method==='GET'){
        const saved=(await pool.query('SELECT * FROM crm_whatsapp_templates')).rows;
        return json(res,200,{templates:{...roadmap.defaultTemplates,...Object.fromEntries(saved.map(x=>[x.kind,x.body]))}});
      }
      if(url.pathname==='/api/crm/roadmap/templates'&&req.method==='PUT'){
        const data=await bodyJson(req,6000);
        if(!roadmap.validTemplate(data.kind,data.body))return json(res,400,{error:'Plantilla o campos no válidos.'});
        await pool.query('INSERT INTO crm_whatsapp_templates(kind,body) VALUES($1,$2) ON CONFLICT(kind) DO UPDATE SET body=EXCLUDED.body,updated_at=now()',[data.kind,data.body.trim()]);
        return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/crm/roadmap/message'&&req.method==='POST'){
        const data=await bodyJson(req,10000);
        if(!validUuid(data.id)||!['catalog','tunegocio'].includes(data.source)||!(data.kind in roadmap.defaultTemplates))return json(res,400,{error:'Mensaje no válido.'});
        let item;
        if(data.source==='catalog'){
          item=(await pool.query('SELECT * FROM catalog_requests WHERE id=$1',[data.id])).rows[0];
          if(item)item={...item,publicUrl:item.site_slug?sitePublicUrl(item.site_slug):'',published:item.site_status==='active'&&subscriptions.hasPaidAccess(item),subscription:item.subscription_state};
        }else{item=(await fetchTunegocioOperations()).projects.find(x=>x.id===data.id);}
        if(!item)return json(res,404,{error:'Operación no disponible.'});
        // Explicit owner-provided links support protected TuNegocio previews without inventing public URLs.
        if(data.previewUrl)item.previewUrl=safeUrl(data.previewUrl,1600);
        if(data.paymentUrl)item.paymentUrl=safeUrl(data.paymentUrl,1600);
        if(data.phone)item.whatsapp=text(data.phone,40);
        const saved=(await pool.query('SELECT body FROM crm_whatsapp_templates WHERE kind=$1',[data.kind])).rows[0];
        const template=data.body||saved?.body||roadmap.defaultTemplates[data.kind];
        const message=roadmap.whatsappDraft(data.kind,template,item);
        await crmRoadmap.audit('whatsapp_prepared',data.source,data.id,{kind:data.kind});
        return json(res,200,message);
      }
      return json(res,404,{error:'Ruta no encontrada.'});
    }
    if(url.pathname==='/health'){
      try{await ensureSchema();res.writeHead(200,{'Content-Type':'text/plain'});return res.end('ok')}catch{res.writeHead(503,{'Content-Type':'text/plain'});return res.end('database unavailable')}
    }
    if(url.pathname==='/catalog-data')return proxy(req,res,LIBRARY_ORIGIN+'/catalog.json','catalog.json');
    if(['/assets/catalog-search.js','/assets/catalog-search-ui.js','/assets/catalog-search.css'].includes(url.pathname)&&req.method==='GET'){
      const name={'/assets/catalog-search.js':'search-engine.js','/assets/catalog-search-ui.js':'search-ui.js','/assets/catalog-search.css':'search.css'}[url.pathname];
      res.writeHead(200,{'Content-Type':name.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8','Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'});
      return res.end(fs.readFileSync(path.join(__dirname,name)));
    }
    if(url.pathname==='/api/catalog/discovery'&&req.method==='GET'){
      if(!discovery.enabled())return json(res,200,{enabled:false});
      await ensureSchema();return json(res,200,await catalogDiscovery.report());
    }
    if(url.pathname==='/api/crm/design-stats'&&req.method==='GET'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      if(!discovery.enabled())return json(res,404,{error:'Función no habilitada.'});
      await ensureSchema();return json(res,200,await catalogDiscovery.report(true));
    }
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
      const [result,tunegocio,config,expenses]=await Promise.all([
        pool.query('SELECT * FROM catalog_requests ORDER BY created_at DESC LIMIT 500'),
        fetchTunegocioOperations(),
        crmConfig(),
        expenseConfig()
      ]);
      await ensureSiteSlugs(result.rows);
      const analytics=await combinedAnalytics(tunegocio);
      return json(res,200,{
        requests:result.rows.map(row=>({...row,subscriptionControlsEnabled:subscriptions.enabled()})),
        tunegocio:tunegocio.projects,
        tunegocioAvailable:tunegocio.available,
        roadmapEnabled:roadmap.enabled(),
        salespeople:config.salespeople,
        offers:config.offers,
        expenses,
        analytics,
        commissionPercent:SALESPERSON_COMMISSION_PERCENT,
        stripeConfigured:!!STRIPE_SECRET_KEY,
        taxEnabled:STRIPE_AUTOMATIC_TAX,
        stripeAccountId:STRIPE_ACCOUNT_ID,
        siteDomain:SITE_DOMAIN,
        aiGenerationEnabled:aiGenerator.enabled(),
        aiConfigured:aiGenerator.configured(),
        aiResearchModel:aiGenerator.researchModel(),
        aiBuildModel:aiGenerator.buildModel(),
        chatgptHandoffEnabled:chatgptHandoff.enabled(),
        chatgptHandoffConfigured:chatgptHandoff.configured(),
        chatgptDemoOrigin:CHATGPT_DEMO_ORIGIN
      });
    }
    if(url.pathname==='/api/crm/expenses'&&req.method==='POST'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await createExpense(req,res);
    }
    const expenseMatch=url.pathname.match(/^\/api\/crm\/expenses\/([0-9a-f-]{36})$/i);
    if(expenseMatch&&req.method==='PATCH'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await updateExpense(req,res,expenseMatch[1]);
    }
    if(url.pathname==='/api/crm/salespeople'&&req.method==='POST'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await createSalesperson(req,res);
    }
    const salespersonMatch=url.pathname.match(/^\/api\/crm\/salespeople\/([0-9a-f-]{36})$/i);
    if(salespersonMatch&&req.method==='PATCH'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await updateSalesperson(req,res,salespersonMatch[1]);
    }
    if(url.pathname==='/api/crm/offers'&&req.method==='POST'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await createOffer(req,res);
    }
    const offerMatch=url.pathname.match(/^\/api\/crm\/offers\/([0-9a-f-]{36})$/i);
    if(offerMatch&&req.method==='PATCH'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await updateOffer(req,res,offerMatch[1]);
    }
    const tunegocioMatch=url.pathname.match(/^\/api\/crm\/tunegocio\/([0-9a-f-]{36})$/i);
    if(tunegocioMatch&&req.method==='PATCH'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await updateTunegocioOperation(req,res,tunegocioMatch[1]);
    }
    const subscriptionMatch=url.pathname.match(/^\/api\/crm\/(requests|tunegocio)\/([0-9a-f-]{36})\/subscription$/i);
    if(subscriptionMatch&&req.method==='POST'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      if(req.headers.origin!==PUBLIC_ORIGIN||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')||!['same-origin','none',undefined].includes(req.headers['sec-fetch-site']))return json(res,403,{error:'Abre esta acción desde el CRM.'});
      if(!subscriptions.enabled())return json(res,404,{error:'Función no habilitada.'});
      const data=await bodyJson(req,2048);
      if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>key!=='action')||!['refresh','cancel','reactivate','portal'].includes(data.action))return json(res,400,{error:'Acción no válida.'});
      await ensureSchema();
      if(subscriptionMatch[1]==='requests')return json(res,200,await subscriptions.manage(pool,subscriptionMatch[2],data.action,subscriptions.stripeClient(STRIPE_SECRET_KEY),PUBLIC_ORIGIN));
      const bundle=await fetchTunegocioOperations();
      const remote=bundle.projects.find(item=>item.id===subscriptionMatch[2]);
      if(!remote?.orderId)return json(res,503,{error:'No se pudo verificar la suscripción de TuNegocio.'});
      const response=await fetch(TUNEGOCIO_CRM_ORIGIN+'/api/internal/crm-subscription',{method:'POST',headers:{Authorization:'Bearer '+CRM_BRIDGE_SECRET,'Content-Type':'application/json'},body:JSON.stringify({orderId:remote.orderId,action:data.action}),signal:AbortSignal.timeout(45000)});
      const result=await response.json();
      return json(res,response.status,result);
    }
    const chatgptPrepareMatch=url.pathname.match(/^\/api\/crm\/requests\/([0-9a-f-]{36})\/chatgpt\/prepare$/i);
    if(chatgptPrepareMatch&&req.method==='POST'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return json(res,200,await chatgptHandoff.prepare(chatgptPrepareMatch[1]));
    }
    const chatgptSyncMatch=url.pathname.match(/^\/api\/crm\/requests\/([0-9a-f-]{36})\/chatgpt\/sync$/i);
    if(chatgptSyncMatch&&req.method==='POST'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return json(res,200,await chatgptHandoff.sync(chatgptSyncMatch[1]));
    }
    const chatgptValidateConversationMatch=url.pathname.match(/^\/api\/crm\/requests\/([0-9a-f-]{36})\/chatgpt\/validate$/i);
    if(chatgptValidateConversationMatch&&req.method==='POST'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      const data=await bodyJson(req,2048);
      return json(res,200,await chatgptHandoff.validateVersion(chatgptValidateConversationMatch[1],data.version));
    }
    const chatgptPublishMatch=url.pathname.match(/^\/api\/crm\/requests\/([0-9a-f-]{36})\/chatgpt\/publish$/i);
    if(chatgptPublishMatch&&req.method==='POST'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return json(res,200,await chatgptHandoff.publish(chatgptPublishMatch[1]));
    }
    const aiResearchMatch=url.pathname.match(/^\/api\/crm\/requests\/([0-9a-f-]{36})\/ai\/research$/i);
    if(aiResearchMatch&&req.method==='POST'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await researchRequestWithAi(req,res,aiResearchMatch[1]);
    }
    const aiGenerateMatch=url.pathname.match(/^\/api\/crm\/requests\/([0-9a-f-]{36})\/ai\/generate$/i);
    if(aiGenerateMatch&&req.method==='POST'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await generateRequestWithAi(req,res,aiGenerateMatch[1]);
    }
    const aiPreviewMatch=url.pathname.match(/^\/api\/crm\/requests\/([0-9a-f-]{36})\/ai\/preview$/i);
    if(aiPreviewMatch&&req.method==='GET'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await serveAiPreview(req,res,aiPreviewMatch[1],url);
    }
    const aiValidateMatch=url.pathname.match(/^\/api\/crm\/requests\/([0-9a-f-]{36})\/ai\/validate$/i);
    if(aiValidateMatch&&req.method==='POST'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await validateAiGeneration(req,res,aiValidateMatch[1]);
    }
    const aiPublishMatch=url.pathname.match(/^\/api\/crm\/requests\/([0-9a-f-]{36})\/ai\/publish$/i);
    if(aiPublishMatch&&req.method==='POST'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await publishValidatedGeneration(req,res,aiPublishMatch[1]);
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
      if(subscriptions.enabled()&&req.headers.origin!==PUBLIC_ORIGIN)return json(res,403,{error:'Abre esta acción desde el CRM.'});
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
  console.log('Stripe backend key mode: '+(STRIPE_SECRET_KEY.startsWith('sk_live_')?'sk_live':STRIPE_SECRET_KEY.startsWith('sk_test_')?'sk_test':STRIPE_SECRET_KEY.startsWith('rk_live_')?'rk_live':STRIPE_SECRET_KEY.startsWith('rk_test_')?'rk_test':STRIPE_SECRET_KEY.startsWith('rkcs_test_')?'sandbox_test':STRIPE_SECRET_KEY.startsWith('pk_live_')?'pk_live':STRIPE_SECRET_KEY.startsWith('pk_test_')?'pk_test':'unknown'));
  console.log('Catalog AI generation: '+(aiGenerator.configured()?'configured':aiGenerator.enabled()?'enabled_without_key':'disabled')+' · '+aiGenerator.researchModel()+' / '+aiGenerator.buildModel());
  migrateLegacyData().catch(()=>{});
  expireOverduePreviews().catch(()=>{});
  setInterval(()=>expireOverduePreviews().catch(error=>console.error('Preview expiry sweep failed',error&&error.message?error.message:error)),60*60*1000).unref();
  // CRM reads and incident scans run only on authenticated user requests.
});
