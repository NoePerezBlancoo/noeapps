'use strict';

const crypto=require('node:crypto');

const MCP_NAME='noeapps-catalog';
const MCP_VERSION='1.0.0';
const MCP_PROTOCOLS=new Set(['2025-03-26','2025-06-18','2025-11-25']);

function problem(status,message){return Object.assign(new Error(message),{status,publicMessage:message});}
function validUuid(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''));}
function clean(value,max=3000){const s=String(value??'').replace(/\u0000/g,'').trim();return s.length>max?s.slice(0,max):s;}
function redact(value){
  return clean(value,3000)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email omitido]')
    .replace(/(?<!\d)(?:\+?34[ .-]?)?(?:6|7)\d{2}(?:[ .-]?\d{3}){2}(?!\d)/g,'[teléfono omitido]');
}
function normalizeOrigin(value){return String(value||'').trim().replace(/\/$/,'');}
function safeInt(value,min=0,max=100000){const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:null;}

function mcpJson(res,status,payload){
  res.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Expose-Headers':'MCP-Protocol-Version'
  });
  res.end(JSON.stringify(payload));
}
async function readJson(req,max=1024*1024){
  let size=0;const chunks=[];
  for await(const chunk of req){
    size+=chunk.length;if(size>max)throw problem(413,'Solicitud demasiado grande.');
    chunks.push(chunk);
  }
  if(!chunks.length)return{};
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw problem(400,'JSON no válido.')}
}
function rpcResult(id,result){return{jsonrpc:'2.0',id,result};}
function rpcError(id,code,message,data){return{jsonrpc:'2.0',id:id??null,error:{code,message,...(data?{data}:{})}};}

function createHandoff({pool,ensureSchema,demoOrigin,sitePublicUrl,siteIsPaid}){
  const origin=normalizeOrigin(demoOrigin);
  const enabled=()=>process.env.CATALOG_CHATGPT_HANDOFF_V1==='true';
  const configured=()=>enabled()&&/^https:\/\//i.test(origin);
  const salesWhatsapp=()=>String(process.env.CATALOG_SALES_WHATSAPP||'').replace(/\D/g,'');

  function requireConfigured(){
    if(!enabled())throw problem(404,'El flujo ChatGPT todavía no está habilitado.');
    if(!configured())throw problem(503,'Falta configurar CHATGPT_DEMO_ORIGIN.');
  }
  async function requestRow(id){
    if(!validUuid(id))throw problem(400,'Solicitud no válida.');
    await ensureSchema();
    const row=(await pool.query('SELECT * FROM catalog_requests WHERE id=$1',[id])).rows[0];
    if(!row)throw problem(404,'Solicitud no encontrada.');
    return row;
  }
  function basePath(row){
    if(!row.chatgpt_review_token)throw problem(409,'Prepara primero la solicitud para ChatGPT.');
    return 'requests/'+row.id+'/'+row.chatgpt_review_token;
  }
  function manifestUrl(row){return origin+'/'+basePath(row)+'/manifest.json';}
  function versionUrl(row,version){return origin+'/'+basePath(row)+'/v'+Number(version)+'/';}
  function publicContext(row){
    return{
      id:row.id,
      businessName:clean(row.business_name,200),
      city:clean(row.city,160),
      sourceUrl:clean(row.source_url,1200),
      notes:redact(row.notes),
      design:{
        id:clean(row.design_id,180),
        name:clean(row.design_name,200),
        category:clean(row.category,160),
        tier:clean(row.tier,100),
        catalogPreviewUrl:clean(row.catalog_preview_url,1400),
        thumbnailUrl:clean(row.thumbnail_url,1400)
      },
      siteSlug:clean(row.site_slug,80),
      state:clean(row.chatgpt_state,40)||'not_ready',
      latestVersion:Number(row.chatgpt_latest_version||0),
      validatedVersion:row.chatgpt_validated_version==null?null:Number(row.chatgpt_validated_version),
      publishedVersion:row.chatgpt_published_version==null?null:Number(row.chatgpt_published_version),
      publicUrl:row.preview_url||'',
      handoff:{
        repository:'NoePerezBlancoo/noeapps',
        branch:'main',
        basePath:'catalogo-demos/'+basePath(row),
        manifestPath:'catalogo-demos/'+basePath(row)+'/manifest.json',
        versionPathTemplate:'catalogo-demos/'+basePath(row)+'/v{version}/index.html',
        manifestSchema:{
          schema:1,
          requestId:row.id,
          latestVersion:'integer >= 1',
          generatedAt:'ISO-8601',
          versions:[{version:'integer >= 1',createdAt:'ISO-8601',summary:'short text'}]
        }
      }
    };
  }
  async function prepare(id){
    requireConfigured();
    const row=await requestRow(id);
    const token=row.chatgpt_review_token||crypto.randomBytes(24).toString('base64url');
    const updated=(await pool.query(`UPDATE catalog_requests SET
      chatgpt_review_token=$2,
      chatgpt_state=CASE WHEN chatgpt_state IN ('review','validated','published') THEN chatgpt_state ELSE 'ready' END,
      chatgpt_prepared_at=COALESCE(chatgpt_prepared_at,now()),
      chatgpt_last_error='',
      updated_at=now()
      WHERE id=$1 RETURNING *`,[id,token])).rows[0];
    return{request:updated,context:publicContext(updated)};
  }
  function validateManifest(manifest,row){
    if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw problem(422,'El manifiesto del borrador no es válido.');
    if(Number(manifest.schema)!==1||String(manifest.requestId)!==row.id)throw problem(422,'El manifiesto no corresponde a esta solicitud.');
    const latest=safeInt(manifest.latestVersion,1,100);
    if(latest==null)throw problem(422,'La versión del manifiesto no es válida.');
    const versions=Array.isArray(manifest.versions)?manifest.versions:[];
    const seen=new Set(),normalized=[];
    for(const item of versions){
      const version=safeInt(item?.version,1,100);
      if(version==null||seen.has(version))continue;
      seen.add(version);
      normalized.push({version,createdAt:clean(item.createdAt,80),summary:clean(item.summary,500)});
    }
    if(!seen.has(latest))throw problem(422,'El manifiesto no incluye la última versión.');
    return{latestVersion:latest,versions:normalized.sort((a,b)=>a.version-b.version),generatedAt:clean(manifest.generatedAt,80)};
  }
  async function fetchManifest(row){
    requireConfigured();
    if(!row.chatgpt_review_token)throw problem(409,'Prepara primero la solicitud para ChatGPT.');
    let response;
    try{response=await fetch(manifestUrl(row),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000),cache:'no-store'});}
    catch{throw problem(502,'No se pudo consultar el servidor de borradores.');}
    if(response.status===404)throw problem(404,'ChatGPT todavía no ha generado ningún borrador para esta solicitud.');
    if(!response.ok)throw problem(502,'El servidor de borradores respondió con un error.');
    const manifest=await response.json().catch(()=>null);
    return validateManifest(manifest,row);
  }
  async function sync(id){
    let row=await requestRow(id);
    try{
      const manifest=await fetchManifest(row);
      row=(await pool.query(`UPDATE catalog_requests SET
        chatgpt_latest_version=$2,
        chatgpt_manifest_url=$3,
        chatgpt_state=CASE WHEN chatgpt_validated_version IS NOT NULL AND chatgpt_validated_version=$2 THEN 'validated' ELSE 'review' END,
        chatgpt_last_sync_at=now(),chatgpt_last_error='',updated_at=now()
        WHERE id=$1 RETURNING *`,[id,manifest.latestVersion,manifestUrl(row)])).rows[0];
      return{request:row,manifest,reviewUrl:versionUrl(row,manifest.latestVersion)};
    }catch(error){
      if(error.status!==404)await pool.query("UPDATE catalog_requests SET chatgpt_last_error=$2,chatgpt_last_sync_at=now(),updated_at=now() WHERE id=$1",[id,clean(error.publicMessage||error.message,1000)]).catch(()=>{});
      throw error;
    }
  }
  async function validateVersion(id,version){
    requireConfigured();
    let row=await requestRow(id);
    const manifest=await fetchManifest(row);
    const n=safeInt(version,1,100);
    if(n==null||!manifest.versions.some(v=>v.version===n))throw problem(400,'Esa versión no existe en el borrador.');
    row=(await pool.query(`UPDATE catalog_requests SET
      chatgpt_latest_version=GREATEST(chatgpt_latest_version,$2),
      chatgpt_validated_version=$2,
      chatgpt_manifest_url=$3,
      chatgpt_state='validated',
      chatgpt_last_sync_at=now(),chatgpt_last_error='',updated_at=now()
      WHERE id=$1 RETURNING *`,[id,n,manifestUrl(row)])).rows[0];
    return{request:row,version:n,reviewUrl:versionUrl(row,n)};
  }
  async function publish(id){
    requireConfigured();
    let row=await requestRow(id);
    const version=safeInt(row.chatgpt_validated_version,1,100);
    if(version==null)throw problem(409,'Primero revisa y valida una versión.');
    const manifest=await fetchManifest(row);
    if(!manifest.versions.some(v=>v.version===version))throw problem(409,'La versión validada ya no está disponible.');
    const paid=siteIsPaid(row),publicUrl=sitePublicUrl(row.site_slug);
    const siteOrigin=versionUrl(row,version);
    row=(await pool.query(`UPDATE catalog_requests SET
      site_origin_url=$2,
      site_status=$3,
      preview_published_at=COALESCE(preview_published_at,now()),
      preview_expires_at=$4,
      preview_url=$5,
      status=$6,
      chatgpt_state='published',
      chatgpt_published_version=$7,
      chatgpt_last_sync_at=now(),
      chatgpt_last_error='',
      updated_at=now()
      WHERE id=$1 RETURNING *`,[
        id,siteOrigin,paid?'active':'preview',paid?null:new Date(Date.now()+10*24*60*60*1000),
        publicUrl,paid?'published':'preview_ready',version
      ])).rows[0];
    return{request:row,version,publicUrl,originUrl:siteOrigin};
  }

  function injectLeadGate(html,businessName){
    const phone=salesWhatsapp();
    if(!phone)throw problem(503,'Falta configurar el WhatsApp comercial antes de publicar demos.');
    const msg=encodeURIComponent('Hola Noé, he visto la demo de '+clean(businessName,120)+' y me gustaría una web para mi negocio.');
    const gate=`
<style id="noeapps-demo-gate-style">
html,body{overflow:hidden!important}
#noeapps-demo-gate{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:18px;background:rgba(12,10,12,.62);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}
#noeapps-demo-gate *{box-sizing:border-box}
#noeapps-demo-gate .ng-card{width:min(520px,100%);padding:34px 30px;border-radius:28px;background:#fffaf7;color:#181014;text-align:center;box-shadow:0 30px 100px rgba(0,0,0,.38);border:1px solid rgba(255,255,255,.75)}
#noeapps-demo-gate .ng-badge{display:inline-block;padding:7px 10px;border-radius:999px;background:#f5e6e8;color:#82152b;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
#noeapps-demo-gate h2{margin:18px 0 10px;font:500 clamp(36px,8vw,52px)/1 Georgia,serif;letter-spacing:-.04em;color:#181014}
#noeapps-demo-gate p{margin:0 auto 22px;max-width:390px;color:#6f6368;font-size:15px;line-height:1.6}
#noeapps-demo-gate a{min-height:56px;border-radius:17px;display:flex;align-items:center;justify-content:center;padding:0 18px;background:#20b85a!important;color:white!important;text-decoration:none!important;font-weight:900;font-size:15px}
#noeapps-demo-gate small{display:block;margin-top:12px;color:#94868c;font-size:10px}
</style>
<div id="noeapps-demo-gate" role="dialog" aria-modal="true" aria-label="Contactar con Noé Pérez">
  <div class="ng-card">
    <span class="ng-badge">Demo personalizada</span>
    <h2>¿Te gusta esta web?</h2>
    <p>Habla con <strong>Noé Pérez</strong> y te preparo una web personalizada para tu negocio.</p>
    <a href="https://wa.me/${phone}?text=${msg}" target="_blank" rel="noopener">Hablar con Noé por WhatsApp</a>
    <small>Vista de demostración · NoeApps</small>
  </div>
</div>`;
    const source=String(html||'');
    if(source.includes('id="noeapps-demo-gate"'))return source;
    return /<\/body>/i.test(source)?source.replace(/<\/body>/i,gate+'\n</body>'):source+gate;
  }

  async function mcpList(state){
    requireConfigured();
    await ensureSchema();
    const allowed=new Set(['ready','review','validated','published']);
    const requested=allowed.has(String(state||''))?String(state):'ready';
    const rows=(await pool.query(`SELECT * FROM catalog_requests
      WHERE chatgpt_state=$1
      ORDER BY COALESCE(chatgpt_prepared_at,updated_at) ASC LIMIT 50`,[requested])).rows;
    return rows.map(publicContext);
  }
  async function mcpGet(id){
    requireConfigured();
    const row=await requestRow(id);
    if(!['ready','review','validated','published'].includes(row.chatgpt_state))throw problem(404,'Esta solicitud todavía no está preparada para ChatGPT.');
    return publicContext(row);
  }
  const tools=[
    {
      name:'list_catalog_requests',
      title:'List catalog requests',
      description:'List NoeApps Catalog requests explicitly prepared for ChatGPT. Use this to find the next website request to work on. Returns sanitized business/design data only; no customer email, phone, or contact name.',
      inputSchema:{type:'object',properties:{state:{type:'string',enum:['ready','review','validated','published'],description:'Workflow state. Defaults to ready.'}},additionalProperties:false},
      annotations:{readOnlyHint:true,openWorldHint:false,destructiveHint:false}
    },
    {
      name:'get_catalog_request',
      title:'Get catalog request',
      description:'Get the sanitized business brief, chosen catalog design, current versions, and exact private GitHub paths for one NoeApps Catalog request. Use after list_catalog_requests before creating or revising a demo.',
      inputSchema:{type:'object',properties:{id:{type:'string',description:'Catalog request UUID.'}},required:['id'],additionalProperties:false},
      annotations:{readOnlyHint:true,openWorldHint:false,destructiveHint:false}
    }
  ];
  async function handleMcp(req,res){
    if(req.method==='OPTIONS'){
      res.writeHead(204,{
        'Access-Control-Allow-Origin':'*',
        'Access-Control-Allow-Methods':'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers':'content-type,accept,mcp-protocol-version,mcp-method,mcp-name',
        'Access-Control-Expose-Headers':'MCP-Protocol-Version'
      });return res.end();
    }
    if(req.method==='GET'){
      res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
      return res.end('NoeApps Catalog MCP · read-only connector');
    }
    if(req.method!=='POST')return mcpJson(res,405,rpcError(null,-32600,'Method not allowed'));
    let body;
    try{body=await readJson(req);}catch(error){return mcpJson(res,error.status||400,rpcError(null,-32700,error.publicMessage||'Invalid JSON'))}
    const id=body?.id;
    if(body?.jsonrpc!=='2.0'||typeof body?.method!=='string')return mcpJson(res,400,rpcError(id,-32600,'Invalid Request'));
    if(id===undefined||id===null){
      res.writeHead(202,{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});return res.end();
    }
    try{
      if(body.method==='initialize'){
        const requested=String(body.params?.protocolVersion||'2025-11-25');
        const protocolVersion=MCP_PROTOCOLS.has(requested)?requested:'2025-11-25';
        return mcpJson(res,200,rpcResult(id,{
          protocolVersion,
          capabilities:{tools:{}},
          serverInfo:{name:MCP_NAME,version:MCP_VERSION},
          instructions:'Read-only NoeApps Catalog connector. First list ready requests, then fetch one request. Never invent customer data. Website HTML is written separately through the connected GitHub app to the exact handoff paths returned by get_catalog_request.'
        }));
      }
      if(body.method==='ping')return mcpJson(res,200,rpcResult(id,{}));
      if(body.method==='tools/list')return mcpJson(res,200,rpcResult(id,{tools}));
      if(body.method==='resources/list')return mcpJson(res,200,rpcResult(id,{resources:[]}));
      if(body.method==='prompts/list')return mcpJson(res,200,rpcResult(id,{prompts:[]}));
      if(body.method==='tools/call'){
        const name=String(body.params?.name||''),args=body.params?.arguments&&typeof body.params.arguments==='object'?body.params.arguments:{};
        let structuredContent,textResult;
        if(name==='list_catalog_requests'){
          const requests=await mcpList(args.state);
          structuredContent={requests};
          textResult=requests.length?'Found '+requests.length+' Catalog request(s) in state '+String(args.state||'ready')+'.':'No Catalog requests found in that state.';
        }else if(name==='get_catalog_request'){
          const request=await mcpGet(args.id);
          structuredContent={request};
          textResult='Loaded '+request.businessName+'. Use the exact GitHub handoff paths returned in structuredContent.';
        }else return mcpJson(res,200,rpcResult(id,{content:[{type:'text',text:'Unknown tool.'}],isError:true}));
        return mcpJson(res,200,rpcResult(id,{structuredContent,content:[{type:'text',text:textResult}],isError:false}));
      }
      return mcpJson(res,200,rpcError(id,-32601,'Method not found'));
    }catch(error){
      return mcpJson(res,200,rpcResult(id,{
        content:[{type:'text',text:clean(error.publicMessage||'No se pudo completar la consulta.',1000)}],
        isError:true
      }));
    }
  }

  return{enabled,configured,prepare,sync,validateVersion,publish,handleMcp,publicContext,manifestUrl,versionUrl,injectLeadGate};
}

module.exports={createHandoff,problem};
