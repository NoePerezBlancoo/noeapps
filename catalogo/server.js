const http=require('http');
const fs=require('fs');
const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'index.html'));
function validateCatalogHtml(buffer){
  const source=buffer.toString('utf8');
  const match=source.match(/<script>([\s\S]*)<\/script>\s*<\/body>/i);
  if(!match)throw new Error('Catalog inline script not found');
  // Parse before accepting the deployment. A syntax error would otherwise render a black shell.
  new Function(match[1]);
}
validateCatalogHtml(html);
const port=process.env.PORT||3000;
const LIBRARY_ORIGIN='https://catalog-production-53f9.up.railway.app';

function contentType(pathname,upstream){
  const ext=path.extname(pathname).toLowerCase();
  const types={
    '.html':'text/html; charset=utf-8',
    '.css':'text/css; charset=utf-8',
    '.js':'text/javascript; charset=utf-8',
    '.mjs':'text/javascript; charset=utf-8',
    '.json':'application/json; charset=utf-8',
    '.svg':'image/svg+xml',
    '.png':'image/png',
    '.jpg':'image/jpeg',
    '.jpeg':'image/jpeg',
    '.webp':'image/webp',
    '.gif':'image/gif',
    '.ico':'image/x-icon',
    '.woff':'font/woff',
    '.woff2':'font/woff2',
    '.ttf':'font/ttf'
  };
  return types[ext]||upstream||'application/octet-stream';
}

function esc(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]))}
function showcasePage(res,url){
  const src=url.searchParams.get('src')||'';
  const allowed=src.startsWith('/library/')||src.startsWith('/demo/')||/^https:\/\//i.test(src);
  if(!allowed){res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});return res.end('Invalid preview')}
  const designId=(url.searchParams.get('id')||'demo').slice(0,120);
  const name=(url.searchParams.get('name')||'Diseño NoeApps').slice(0,160);
  const category=(url.searchParams.get('category')||'').slice(0,100);
  const demoId=Math.random().toString(36).slice(2,10).toUpperCase();
  const publicPreview='https://catalogo.noeapps.com/showcase?'+new URLSearchParams({src,id:designId,name,category}).toString();
  const builder=new URL('https://crear.noeapps.com/');
  builder.searchParams.set('catalogDesign',designId);
  builder.searchParams.set('catalogName',name);
  if(category)builder.searchParams.set('catalogCategory',category);
  builder.searchParams.set('catalogPreview',publicPreview);
  const marks=Array.from({length:12},()=>'<span>NOEAPPS · DEMO '+esc(demoId)+'</span>').join('');
  const html='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>'+esc(name)+' · NoeApps</title><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#09090b;font-family:Inter,Arial,sans-serif}.bar{height:58px;display:flex;align-items:center;gap:14px;padding:0 16px;background:#0d0e12;color:#fff;border-bottom:1px solid #282a33;position:relative;z-index:20}.brand{font-weight:900}.status{font-size:11px;color:#aeb3c3}.id{font-size:10px;color:#858b9c;border:1px solid #30333d;border-radius:999px;padding:6px 8px}.spacer{flex:1}.back,.cta{border-radius:999px;padding:10px 13px;text-decoration:none;font-size:12px;font-weight:800}.back{color:#d4d7e0;border:1px solid #323540}.cta{background:#fff;color:#111}.frame{position:absolute;left:0;right:0;top:58px;bottom:0;width:100%;height:calc(100% - 58px);border:0;background:#fff}.wm{position:fixed;inset:58px 0 0;z-index:15;pointer-events:none;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(4,1fr);align-items:center;justify-items:center;overflow:hidden}.wm span{font:900 12px/1 Arial,sans-serif;letter-spacing:.16em;color:rgba(255,255,255,.34);text-shadow:0 1px 7px rgba(0,0,0,.28);transform:rotate(-24deg);white-space:nowrap}.owner{position:fixed;right:14px;bottom:14px;z-index:16;pointer-events:none;background:rgba(7,8,10,.8);color:#fff;border:1px solid rgba(255,255,255,.2);padding:8px 10px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.08em}@media(max-width:700px){.status,.id{display:none}.bar{gap:8px;padding:0 10px}.back,.cta{padding:9px 10px;font-size:11px}.wm{grid-template-columns:repeat(2,1fr)}}</style></head><body><header class="bar"><strong class="brand">NOEAPPS</strong><span class="status">Vista protegida · '+esc(category||'Catálogo')+'</span><span class="id">ID '+esc(demoId)+'</span><span class="spacer"></span><a class="back" href="/">← Catálogo</a><a class="cta" href="'+esc(builder.toString())+'">Quiero esta web →</a></header><iframe class="frame" src="'+esc(src)+'" sandbox="allow-scripts allow-forms allow-same-origin" referrerpolicy="no-referrer"></iframe><div class="wm" aria-hidden="true">'+marks+'</div><div class="owner">© NOEAPPS · '+esc(demoId)+'</div></body></html>';
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  res.end(html);
}

async function proxy(req,res,target,pathname){
  try{
    const upstream=await fetch(target,{method:req.method,redirect:'follow'});
    res.writeHead(upstream.status,{
      'Content-Type':contentType(pathname,upstream.headers.get('content-type')),
      'Cache-Control':pathname.endsWith('catalog.json')?'public, max-age=30':'public, max-age=3600',
      'X-Content-Type-Options':'nosniff'
    });
    if(req.method==='HEAD')return res.end();
    res.end(Buffer.from(await upstream.arrayBuffer()));
  }catch(error){
    res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
    res.end('Catalog asset unavailable');
  }
}

http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health'){
    res.writeHead(200,{'Content-Type':'text/plain'});
    return res.end('ok');
  }
  if(url.pathname==='/showcase'){
    return showcasePage(res,url);
  }
  if(url.pathname==='/catalog-data'){
    return proxy(req,res,LIBRARY_ORIGIN+'/catalog.json','catalog.json');
  }
  if(url.pathname.startsWith('/library/')){
    const assetPath=url.pathname.slice('/library/'.length);
    const target=LIBRARY_ORIGIN+'/'+assetPath;
    return proxy(req,res,target,assetPath);
  }
  const demoRoute=url.pathname.startsWith('/demo/');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':demoRoute?'no-store':'public, max-age=60',...(demoRoute?{'X-Robots-Tag':'noindex, nofollow, noarchive'}:{})});
  res.end(html);
}).listen(port,'0.0.0.0',()=>console.log('NoeApps catalog listening on '+port));