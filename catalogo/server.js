const http=require('http');
const fs=require('fs');
const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'index.html'));
const port=process.env.PORT||3000;
http.createServer((req,res)=>{
  if(req.url==='/health'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('ok');}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300'});
  res.end(html);
}).listen(port,'0.0.0.0',()=>console.log('NoeApps catalog listening on '+port));