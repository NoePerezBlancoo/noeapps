const http=require('http');
const fs=require('fs');
const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'index.html'));
const port=process.env.PORT||3000;
const LIBRARY_ORIGIN='https://catalog-production-53f9.up.railway.app';

async function proxy(req,res,target){
  try{
    const upstream=await fetch(target,{method:req.method,redirect:'follow'});
    const headers={
      'Content-Type':upstream.headers.get('content-type')||'application/octet-stream',
      'Cache-Control':upstream.headers.get('cache-control')||'public, max-age=3600'
    };
    res.writeHead(upstream.status,headers);
    if(req.method==='HEAD')return res.end();
    const body=Buffer.from(await upstream.arrayBuffer());
    res.end(body);
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
    return proxy(req,res,LIBRARY_ORIGIN+'/catalog.json');
  }
  if(url.pathname.startsWith('/library/')){
    const target=LIBRARY_ORIGIN+'/'+url.pathname.slice('/library/'.length)+url.search;
    return proxy(req,res,target);
  }
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=60'});
  res.end(html);
}).listen(port,'0.0.0.0',()=>console.log('NoeApps catalog listening on '+port));