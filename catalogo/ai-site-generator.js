'use strict';

const OPENAI_URL='https://api.openai.com/v1/responses';
const enabled=()=>process.env.CATALOG_AI_GENERATION_V1==='true';
const configured=()=>enabled()&&!!String(process.env.OPENAI_API_KEY||'').trim();
const researchModel=()=>String(process.env.OPENAI_RESEARCH_MODEL||'gpt-5.6-luna').trim();
const buildModel=()=>String(process.env.OPENAI_BUILD_MODEL||'gpt-5.6-sol').trim();
const salesWhatsapp=()=>String(process.env.CATALOG_SALES_WHATSAPP||'').replace(/\D/g,'');

function problem(status,message){
  return Object.assign(new Error(message),{status,publicMessage:message});
}
function assertConfigured(){
  if(!enabled())throw problem(404,'La generación IA todavía no está habilitada.');
  if(!String(process.env.OPENAI_API_KEY||'').trim())throw problem(503,'Falta configurar OPENAI_API_KEY en el entorno de Catálogo.');
}
function cleanText(value,max=4000){
  const s=String(value??'').replace(/\u0000/g,'').trim();
  return s.length>max?s.slice(0,max):s;
}
function extractOutputText(data){
  if(typeof data?.output_text==='string')return data.output_text;
  const chunks=[];
  for(const item of Array.isArray(data?.output)?data.output:[]){
    if(item?.type!=='message')continue;
    for(const content of Array.isArray(item.content)?item.content:[]){
      if(content?.type==='output_text'&&typeof content.text==='string')chunks.push(content.text);
    }
  }
  return chunks.join('\n');
}
function usageFrom(data){
  const usage=data?.usage||{};
  return{
    inputTokens:Number(usage.input_tokens||0),
    cachedInputTokens:Number(usage.input_tokens_details?.cached_tokens||0),
    outputTokens:Number(usage.output_tokens||0),
    totalTokens:Number(usage.total_tokens||0),
    searchCalls:(Array.isArray(data?.output)?data.output:[]).filter(x=>x?.type==='web_search_call').length
  };
}
async function openaiResponse({model,instructions,input,tools,maxOutputTokens=8000,reasoning='low'}){
  assertConfigured();
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),180000);
  try{
    const payload={model,instructions,input,max_output_tokens:maxOutputTokens};
    if(reasoning)payload.reasoning={effort:reasoning};
    if(tools?.length){payload.tools=tools;payload.tool_choice='auto';}
    const response=await fetch(OPENAI_URL,{
      method:'POST',
      headers:{Authorization:'Bearer '+String(process.env.OPENAI_API_KEY).trim(),'Content-Type':'application/json'},
      body:JSON.stringify(payload),
      signal:controller.signal
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const detail=cleanText(data?.error?.message||'',500);
      console.error('OpenAI generation failed',response.status,detail);
      throw problem(response.status===429?429:502,response.status===429?'La IA está temporalmente limitada. Inténtalo de nuevo en unos minutos.':'No se pudo completar la generación con IA.');
    }
    const text=extractOutputText(data).trim();
    if(!text)throw problem(502,'La IA no devolvió contenido utilizable.');
    return{text,model,usage:usageFrom(data),responseId:data.id||''};
  }catch(error){
    if(error?.name==='AbortError')throw problem(504,'La generación IA tardó demasiado. Inténtalo de nuevo.');
    throw error;
  }finally{clearTimeout(timeout)}
}
function requestContext(row){
  return[
    'NEGOCIO: '+cleanText(row.business_name,200),
    'CONTACTO: '+cleanText(row.contact_name,160),
    'CIUDAD: '+cleanText(row.city,160),
    'SECTOR/CATEGORÍA: '+cleanText(row.category,160),
    'URL O RED SOCIAL A ANALIZAR: '+cleanText(row.source_url,1000),
    'NOTAS DEL CLIENTE: '+cleanText(row.notes,2400),
    'DISEÑO DEL CATÁLOGO ELEGIDO: '+cleanText(row.design_name,200),
    'PREVIEW DEL DISEÑO ELEGIDO: '+cleanText(row.catalog_preview_url,1200),
    'THUMBNAIL: '+cleanText(row.thumbnail_url,1200)
  ].join('\n');
}
async function researchBusiness(row){
  const instructions=[
    'Eres analista de negocio para NoeApps. Prepara un briefing factual para diseñar una web comercial de una pyme española.',
    'Usa búsqueda web cuando ayude, priorizando la URL/red social proporcionada y fuentes oficiales del propio negocio.',
    'No inventes precios, dirección, teléfono, horarios, reseñas ni servicios. Marca claramente lo que no puedas verificar.',
    'Evita copiar textos largos de terceros. Resume.',
    'Devuelve un briefing breve con: identidad, actividad, servicios verificables, ubicación, canales de contacto visibles, estilo visual observado, colores/tono, público objetivo, CTA recomendado, imágenes/activos que parecen útiles, y una lista final de fuentes URL consultadas.',
    'No propongas aún HTML.'
  ].join(' ');
  const input='Analiza esta solicitud de Catálogo:\n\n'+requestContext(row);
  return openaiResponse({
    model:researchModel(),
    instructions,
    input,
    tools:[{type:'web_search',search_context_size:'low'}],
    maxOutputTokens:5000,
    reasoning:'low'
  });
}
function stripCodeFence(text){
  let s=String(text||'').trim();
  s=s.replace(/^\`\`\`(?:html)?\s*/i,'').replace(/\s*\`\`\`$/,'').trim();
  const start=s.search(/<!doctype\s+html|<html[\s>]/i);
  if(start>0)s=s.slice(start);
  return s;
}
function validateGeneratedHtml(html){
  const source=String(html||'');
  if(source.length<800||source.length>350000)throw problem(422,'La IA devolvió una web con un tamaño no válido.');
  if(!/<html[\s>]/i.test(source)||!/<body[\s>]/i.test(source)||!/<\/html>/i.test(source))throw problem(422,'La IA no devolvió una página HTML completa.');
  const forbidden=[
    [/<script\b/i,'scripts'],
    [/<iframe\b/i,'iframes'],
    [/<form\b/i,'formularios'],
    [/<object\b/i,'objetos embebidos'],
    [/<embed\b/i,'contenido embebido'],
    [/<base\b/i,'base URL'],
    [/<meta[^>]+http-equiv\s*=\s*["']?refresh/i,'redirecciones'],
    [/javascript\s*:/i,'URLs javascript'],
    [/\son[a-z]+\s*=/i,'eventos JavaScript'],
    [/<link[^>]+rel\s*=\s*["']?stylesheet[^>]+href\s*=\s*["']?https?:/i,'CSS remoto']
  ];
  for(const [pattern,label] of forbidden)if(pattern.test(source))throw problem(422,'La web generada contiene '+label+' no permitidos. Regenera la versión.');
  return source;
}
async function generateSite(row,{brief='',feedback='',previousHtml=''}={}){
  const previous=cleanText(previousHtml,160000);
  const instructions=[
    'Eres un diseñador web senior de NoeApps. Genera una landing page comercial PREMIUM y muy visual en un único archivo HTML.',
    'Devuelve EXCLUSIVAMENTE el HTML completo, comenzando por <!doctype html>. Sin Markdown ni explicaciones.',
    'Debe ser responsive, accesible, en español y funcionar sin compilación.',
    'Incluye todo el CSS dentro de <style>. NO uses JavaScript, formularios, iframes, librerías externas ni hojas de estilo remotas.',
    'Puedes usar imágenes HTTPS ya presentes en el briefing o solicitud. No inventes URLs de imágenes. Si faltan fotos, diseña bien con tipografía, gradientes y bloques editoriales sin usar imágenes falsas.',
    'No inventes datos del negocio. Si un dato no está verificado, omítelo.',
    'Los enlaces de Instagram/Facebook/TikTok/WhatsApp solo deben aparecer si están verificados en el briefing o en la solicitud.',
    'La web debe parecer hecha a medida, no una plantilla genérica. Usa el diseño elegido del catálogo solo como inspiración, no como contenido a copiar.',
    'No incluyas ningún modal de NoeApps ni bloqueo comercial: el servidor lo añadirá únicamente cuando Noé publique la demo.'
  ].join(' ');
  let input='SOLICITUD:\n'+requestContext(row)+'\n\nBRIEFING VERIFICADO:\n'+cleanText(brief,18000);
  if(feedback)input+='\n\nCAMBIOS SOLICITADOS POR NOÉ:\n'+cleanText(feedback,4000);
  if(previous)input+='\n\nVERSIÓN ANTERIOR A MEJORAR:\n'+previous;
  const result=await openaiResponse({
    model:buildModel(),
    instructions,
    input,
    maxOutputTokens:24000,
    reasoning:'medium'
  });
  result.text=validateGeneratedHtml(stripCodeFence(result.text));
  return result;
}
function gateMarkup(businessName){
  const phone=salesWhatsapp();
  if(!phone)throw problem(503,'Falta configurar CATALOG_SALES_WHATSAPP antes de publicar demos.');
  const msg=encodeURIComponent('Hola Noé, he visto la demo de '+cleanText(businessName,120)+' y me gustaría una web para mi negocio.');
  return `
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
}
function injectLeadGate(html,businessName){
  const source=validateGeneratedHtml(html);
  if(source.includes('id="noeapps-demo-gate"'))return source;
  const gate=gateMarkup(businessName);
  return /<\/body>/i.test(source)?source.replace(/<\/body>/i,gate+'\n</body>'):source+gate;
}

module.exports={
  enabled,configured,researchModel,buildModel,salesWhatsapp,
  researchBusiness,generateSite,validateGeneratedHtml,injectLeadGate,
  usageFrom,problem
};
