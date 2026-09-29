import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, "index.html"));
const port = Number(process.env.PORT || 3000);

http.createServer((req,res)=>{
  if (req.url === "/health") {
    res.writeHead(200, {"content-type":"text/plain; charset=utf-8"});
    res.end("ok");
    return;
  }
  if (req.url === "/" || req.url?.startsWith("/?")) {
    res.writeHead(200, {
      "content-type":"text/html; charset=utf-8",
      "cache-control":"no-cache"
    });
    res.end(html);
    return;
  }
  res.writeHead(404, {"content-type":"text/plain; charset=utf-8"});
  res.end("Not found");
}).listen(port, "0.0.0.0", ()=>console.log("Bandiños demo listening on", port));
