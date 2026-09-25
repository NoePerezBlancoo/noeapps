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
  if(url.pathname==='/catalog-data'){
    return proxy(req,res,LIBRARY_ORIGIN+'/catalog.json','catalog.json');
  }
  if(url.pathname.startsWith('/library/')){
    const assetPath=url.pathname.slice('/library/'.length);
    const target=LIBRARY_ORIGIN+'/'+assetPath;
    return proxy(req,res,target,assetPath);
  }
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=60'});
  res.end(html);
}).listen(port,'0.0.0.0',()=>console.log('NoeApps catalog listening on '+port));