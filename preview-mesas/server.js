const http=require('http');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'index.html'));
const port=process.env.PORT||3000;
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('ok');}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'});
  res.end(html);
}).listen(port,'0.0.0.0',()=>console.log('Mesas Dulces preview listening on '+port));