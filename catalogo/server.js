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
      catalog_preview_url text NOT NULL DEFAULT '',
      thumbnail_url text NOT NULL DEFAULT '',
      preview_url text NOT NULL DEFAULT '',
      payment_url text NOT NULL DEFAULT '',
      admin_notes text NOT NULL DEFAULT ''
    );
    ALTER TABLE catalog_requests ADD COLUMN IF NOT EXISTS monthly_price_cents integer NOT NULL DEFAULT 1990;
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
  const data=await bodyJson(req,12000);
  const status=text(data.status,30),previewUrl=safeUrl(data.previewUrl,1600),paymentUrl=safeUrl(data.paymentUrl,1600),adminNotes=text(data.adminNotes,3000);
  const creationPrice=Math.round(Number(data.creationPrice));
  const monthlyPriceCents=Math.round(Number(data.monthlyPriceCents));
  if(!statuses.has(status))return json(res,400,{error:'Estado no válido.'});
  if(!Number.isSafeInteger(creationPrice)||creationPrice<0||creationPrice>10000)return json(res,400,{error:'Precio de creación no válido.'});
  if(!Number.isSafeInteger(monthlyPriceCents)||monthlyPriceCents<100||monthlyPriceCents>100000)return json(res,400,{error:'Cuota mensual no válida.'});
  await ensureSchema();
  const result=await pool.query('UPDATE catalog_requests SET status=$2,preview_url=$3,payment_url=$4,admin_notes=$5,creation_price=$6,monthly_price_cents=$7,updated_at=now() WHERE id=$1 RETURNING *',[id,status,previewUrl,paymentUrl,adminNotes,creationPrice,monthlyPriceCents]);
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
      return await listRequests(res);
    }
    const match=url.pathname.match(/^\/api\/crm\/requests\/([0-9a-f-]{36})$/i);
    if(match&&req.method==='PATCH'){
      if(!validSession(req))return json(res,401,{error:'Acceso no autorizado.'});
      return await updateRequest(req,res,match[1]);
    }
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=60'});
    res.end(html);
  }catch(error){
    console.error('Catalog request failed',error&&error.message?error.message:error);
    json(res,error&&error.status?error.status:500,{error:error&&error.status===413?'Solicitud demasiado grande.':'No se pudo completar la operación.'});
  }
}).listen(port,'0.0.0.0',()=>console.log('NoeApps catalog listening on '+port));
