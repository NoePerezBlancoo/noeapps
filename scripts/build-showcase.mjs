import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {entries as catalog} from './catalog-data.mjs';
import {showcase} from './showcase-content.mjs';

const root=fileURLToPath(new URL('../dist/',import.meta.url));
const portfolio='https://portfolio-noe-zeta.vercel.app/';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const contact=(name,topic='Quiero conocer')=>`mailto:support@noeapps.com?subject=${encodeURIComponent(`${topic} ${name}`)}`;
const entries=catalog.map(e=>({...e,...showcase[e.slug]}));
const groupNames={apps:'Productos',herramientas:'Herramientas',proyectos:'Proyectos'};
const urlOf=e=>`/${e.group}/${e.slug}/`;
const anchorOf=e=>e.group==='apps'?'productos':e.group;
const accessOf=e=>e.url||contact(e.name,e.cta);
const asset=name=>`/assets/showcase/${name}`;
const dimensions=new Map();
for(const e of entries){
  for(const name of [e.image,e.logo,e.previewHome,...(e.gallery||[]).map(g=>g[0])].filter(Boolean)){
    if(dimensions.has(name))continue;
    const b=fs.readFileSync(path.join(root,asset(name)));
    if(b.length<30)throw new Error(`Empty or incomplete image: ${name}`);
    let w,h;
    if(name.endsWith('.png')){w=b.readUInt32BE(16);h=b.readUInt32BE(20);}
    else if(name.endsWith('.jpg')){
      let offset=2;
      while(offset<b.length){
        if(b[offset]!==0xff)throw new Error(`Invalid JPEG: ${name}`);
        const marker=b[offset+1],length=b.readUInt16BE(offset+2);
        if([0xc0,0xc1,0xc2].includes(marker)){h=b.readUInt16BE(offset+5);w=b.readUInt16BE(offset+7);break;}
        offset+=2+length;
      }
      if(!w||!h)throw new Error(`Missing JPEG dimensions: ${name}`);
    }
    else if(b.toString('ascii',12,16)==='VP8 '){w=b.readUInt16LE(26)&0x3fff;h=b.readUInt16LE(28)&0x3fff;}
    else if(b.toString('ascii',12,16)==='VP8X'){w=b.readUIntLE(24,3)+1;h=b.readUIntLE(27,3)+1;}
    else throw new Error(`Unknown image dimensions: ${name}`);
    dimensions.set(name,{w,h});
  }
}
function img(name,alt,eager=false){
  const {w,h}=dimensions.get(name);
  return `<img src="${asset(name)}" alt="${esc(alt)}" width="${w}" height="${h}" ${eager?'fetchpriority="high"':'loading="lazy"'} decoding="async">`;
}
const productVisual=(e,eager=false)=>img(e.image,e.alt,eager)+(e.previewHome?img(e.previewHome,'Pantalla real de inicio de Fivaki en Android, con una cuenta de prueba.',eager):'');
const nav=`<nav aria-label="Principal"><a href="/#productos">Productos</a><a href="/#herramientas">Herramientas</a><a href="/#proyectos">Proyectos</a><a class="nav-portfolio" href="${portfolio}">Quién soy <span aria-hidden="true">↗</span></a><a href="/soporte/">Soporte</a></nav>`;
const header=`<header class="site-header wrap"><a class="brand" href="/" aria-label="NoeApps, inicio"><img class="brand-logo" src="/assets/noeapps-logo.webp" alt="" width="380" height="298"><span class="brand-wordmark">Noe<span>Apps</span><span class="brand-mark" aria-hidden="true">/</span></span></a>${nav}</header>`;
const footer=`<footer class="site-footer wrap"><a class="brand small" href="/"><img class="brand-logo" src="/assets/noeapps-logo.webp" alt="" width="380" height="298"><span class="brand-wordmark">Noe<span>Apps</span></span></a><p>© 2026 Noé Pérez Blanco</p><div><a href="${portfolio}">Quién soy ↗</a><a href="/aviso-legal/">Aviso legal</a><a href="/privacidad/">Privacidad de la web</a><a href="/soporte/">Soporte</a></div></footer>`;
function page(title,description,route,body,cover){
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — NoeApps</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow"><meta name="theme-color" content="#102b49"><link rel="canonical" href="https://noeapps.com${route}"><meta property="og:title" content="${esc(title)} — NoeApps"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="website"><meta property="og:url" content="https://noeapps.com${route}">${cover?`<meta property="og:image" content="https://noeapps.com${asset(cover)}">`:''}<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/catalog.css"><link rel="stylesheet" href="/presentation.css"><link rel="stylesheet" href="/brand-refresh.css"></head><body><a class="skip-link" href="#contenido">Ir al contenido</a>${header}<main id="contenido" class="wrap">${body}</main>${footer}</body></html>\n`;
}
function writePage(route,html){const dest=path.join(root,route,'index.html');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,html);}
function card(e){
  if(e.group==='apps')return `<article class="product-visual-card"><a class="product-preview preview-${e.slug}" href="${urlOf(e)}" aria-label="Explorar ${esc(e.name)}">${productVisual(e)}</a><div class="product-card-body"><div class="card-top"><p class="card-label">${esc(e.label)}</p><span class="status">${esc(e.status)}</span></div><h3><a href="${urlOf(e)}">${esc(e.name)}</a></h3><p class="card-description">${esc(e.description)}</p><ul class="card-benefits">${e.short.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><div class="card-actions"><a class="button button-dark" href="${urlOf(e)}">Conocer el producto <span aria-hidden="true">↗</span></a><a class="text-link" href="${esc(accessOf(e))}">${esc(e.cta)}</a></div></div></article>`;
  return `<article class="catalog-card"><a href="${urlOf(e)}" class="mini-image" aria-label="Explorar ${esc(e.name)}">${img(e.image,e.alt)}</a><div class="mini-card-body"><div class="card-top"><p class="card-label">${esc(e.label)}</p><span class="status">${esc(e.status)}</span></div><h3><a href="${urlOf(e)}">${esc(e.name)}</a></h3><p class="card-description">${esc(e.description)}</p><a class="card-link" href="${urlOf(e)}">Ver ${e.group==='herramientas'?'la herramienta':'el proyecto'} <span aria-hidden="true">↗</span></a></div></article>`;
}
function section(group,id,number,title,description,intro=''){
  return `<section class="catalog-section" id="${id}"><div class="section-heading"><div><p class="eyebrow">${number} / ${groupNames[group].toUpperCase()}</p><h2>${title}</h2></div><p>${description}</p></div>${intro}<div class="catalog-grid grid-${group}">${entries.filter(e=>e.group===group).map(card).join('')}</div></section>`;
}
const hero=`<section class="visual-hero" id="apps"><div><p class="eyebrow">NOEAPPS / APLICACIONES Y PROYECTOS</p><h1>Software para<br>trabajar, crear<br>y <em>avanzar.</em></h1><p class="hub-lead">Del mantenimiento de una planta a los hábitos de cada día. Aplicaciones, herramientas y automatizaciones que puedes conocer, probar y llevar a tu trabajo.</p><div class="hero-actions"><a class="button button-dark" href="#productos">Explorar aplicaciones <span aria-hidden="true">↓</span></a><a class="text-link" href="${portfolio}">Conoce a su creador</a></div></div><div class="hero-mosaic" aria-label="Una selección de productos NoeApps"><a class="mosaic-main" href="/apps/forgeops/"><span><b>ForgeOps</b><small>Demo de mantenimiento industrial</small></span>${img('forgeops-dashboard.webp','Panel real de demostración de ForgeOps.',true)}</a><a class="mosaic-product mosaic-fivaki" href="/apps/fivaki/">${img('fivaki-icon-original.png','Icono original completo de Fivaki.')}<span>Fivaki</span></a><a class="mosaic-product" href="/apps/deleteguard/"><img src="/assets/deleteguard.png" alt="Logo de DeleteGuard." width="64" height="64" loading="lazy"><span>DeleteGuard</span></a><a class="mosaic-product mosaic-comercio" href="/apps/pequeno-comercio/">${img('comercio-panel.png','Panel de demostración de Pequeño Comercio.')}<span>Pequeño Comercio</span></a></div></section><nav class="catalog-jump" aria-label="Secciones del catálogo"><a href="#productos"><strong>06</strong><span>Productos</span><span class="jump-arrow" aria-hidden="true">↗</span></a><a href="#herramientas"><strong>05</strong><span>Herramientas</span><span class="jump-arrow" aria-hidden="true">↗</span></a><a href="#proyectos"><strong>06</strong><span>Proyectos</span><span class="jump-arrow" aria-hidden="true">↗</span></a></nav>`;
writePage('/',page('Aplicaciones para trabajar, crear y avanzar','Descubre Broken Link Guard, Leaver Guard, ForgeOps, DeleteGuard, Fivaki y Pequeño Comercio. Capturas, demos, herramientas creativas, automatizaciones y proyectos de NoeApps.','/',hero+
section('apps','productos','01','Cada aplicación resuelve algo distinto.','Organiza el mantenimiento, consulta el historial de Jira, cuida tus hábitos o explora la gestión de tu negocio.')+
section('herramientas','herramientas','02','Dale salida a tus tareas diarias.','Prepara imágenes, convierte texto en voz, organiza contenido y conecta procesos.',`<div class="collection-intro"><p>¿Repites la misma tarea entre varias aplicaciones? Cuéntame tu proceso y revisamos cómo simplificarlo.</p><a class="text-link" href="${contact('una herramienta para mi trabajo')}">Consultar mi caso</a></div>`)+
section('proyectos','proyectos','03','Más allá de una sola aplicación.','Medios especializados, experiencias digitales y laboratorios de software e industria. Visita las webs o conoce cada proyecto.')+
`<section class="contact-band"><div><p class="eyebrow">DE LA IDEA AL SIGUIENTE PASO</p><h2>¿Qué te gustaría resolver?</h2><p>Cuéntame cómo trabajas, qué quieres mejorar y qué producto te ha llamado la atención.</p></div><a class="button button-light" href="${contact('un proyecto de NoeApps')}">Hablemos de tu caso <span aria-hidden="true">↗</span></a></section><section class="about" id="acerca"><p class="eyebrow">DETRÁS DE NOEAPPS</p><div><h2>Soy Noé Pérez Blanco.</h2><p>Desarrollo software y trabajo en la conexión entre sistemas, procesos y personas. En NoeApps reúno productos y proyectos que nacen de esa forma de entender el trabajo: observar una necesidad y convertirla en algo útil.</p><p>En mi portfolio puedes conocer mi trayectoria y mi experiencia en entornos IT e industriales.</p><a class="text-link" href="${portfolio}">Quién soy · Ver mi portfolio ↗</a></div></section>`,'forgeops-dashboard.webp'));

for(const e of entries){
  const gallery=e.gallery?.length?`<section class="story-section"><div class="story-heading"><p class="eyebrow">EL PRODUCTO POR DENTRO</p><h2>${e.slug==='fivaki'?'Así se ve Fivaki en Android.':'Una mirada a sus pantallas.'}</h2><p>Capturas reales${e.slug==='fivaki'?' de la beta Android':' con datos de demostración'}. Pulsa una imagen para ampliarla.</p></div><div class="gallery-grid${e.brand?' phone-gallery':''}">${e.gallery.map(([name,caption])=>`<figure class="gallery-item"><a href="${asset(name)}" aria-label="Ampliar: ${esc(caption)}">${img(name,caption)}</a><figcaption>${esc(caption)}</figcaption></figure>`).join('')}</div></section>`:'';
  const docs=['deleteguard','broken-link-guard','leaver-guard'].includes(e.slug)?`<section class="story-section"><div class="story-heading"><p class="eyebrow">DOCUMENTACIÓN</p><h2>Conoce los detalles de ${esc(e.name)}.</h2></div><div class="docs-links"><a href="/apps/${e.slug}/ayuda/">Guía de uso</a><a href="/apps/${e.slug}/privacidad/">Privacidad</a><a href="/apps/${e.slug}/seguridad/">Seguridad</a><a href="/apps/${e.slug}/condiciones/">Condiciones</a><a href="/apps/${e.slug}/tratamiento-datos/">Tratamiento de datos</a></div></section>`:'';
  const body=`<nav class="breadcrumb" aria-label="Ruta de navegación"><a href="/">NoeApps</a><span aria-hidden="true">/</span><a href="/#${anchorOf(e)}">${groupNames[e.group]}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(e.name)}</span></nav>
<section class="product-story-hero"><div><p class="eyebrow">${esc(e.label)}</p><span class="status">${esc(e.status)}</span><h1>${esc(e.name)}</h1><p class="detail-lead">${esc(e.lead)}</p><p class="detail-description">${esc(e.description)}</p><div class="hero-actions"><a class="button button-dark" href="${esc(accessOf(e))}">${esc(e.cta)} <span aria-hidden="true">↗</span></a><a class="text-link" href="#posibilidades">Conocer sus funciones</a></div></div><figure><div class="product-story-image image-${e.slug}${e.concept?' concept-image':''}">${productVisual(e,true)}</div><figcaption>${esc(e.caption)}</figcaption></figure></section>
<section class="story-section" id="posibilidades"><div class="story-heading"><p class="eyebrow">LO QUE PUEDES HACER</p><h2>${esc(e.heading)}</h2></div><div class="benefit-grid">${e.benefits.map(([title,copy],i)=>`<article class="benefit-item"><span aria-hidden="true">0${i+1}</span><h3>${esc(title)}</h3><p>${esc(copy)}</p></article>`).join('')}</div></section>
<section class="story-section"><div class="use-grid"><div><div class="audience-box"><h3>A quién va dirigido</h3><p>${esc(e.audience)}</p></div><div class="story-heading use-example"><h3>Ejemplo de uso</h3><p>${esc(e.example)}</p></div></div><div><h2>Cómo funciona</h2><ol>${e.steps.map((step,i)=>`<li><span aria-hidden="true">0${i+1}</span><p>${esc(step)}</p></li>`).join('')}</ol><div class="process-flow" aria-label="Resumen del recorrido">${e.flow.map(esc).map((step,i)=>`${i?'<b aria-hidden="true">→</b>':''}<span>${step}</span>`).join('')}</div></div></div></section>
${gallery}<section class="story-section faq-layout"><div class="faq-list"><h2>Preguntas frecuentes</h2>${e.faq.map(([question,answer])=>`<details><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>`).join('')}</div><aside class="story-access"><p class="eyebrow">EMPIEZA POR AQUÍ</p><h2>${esc(e.status)}</h2><p>${esc(e.access)}</p><a class="button button-light" href="${esc(accessOf(e))}">${esc(e.cta)} <span aria-hidden="true">↗</span></a>${!e.url?'<p class="small-copy">Cuéntanos tu caso por correo para concretar una presentación o las condiciones de acceso.</p>':`<p class="small-copy">¿Quieres comentar tu caso? <a href="${contact(e.name)}">Escríbenos</a>.</p>`}</aside></section>${docs}
<section class="more-catalog"><h2>También puedes descubrir</h2><div>${entries.filter(x=>x.group===e.group&&x.slug!==e.slug).slice(0,3).map(x=>`<a href="${urlOf(x)}">${esc(x.name)} <span aria-hidden="true">↗</span></a>`).join('')}</div><a class="text-link" href="/#${anchorOf(e)}">Ver ${groupNames[e.group].toLowerCase()}</a></section>`;
  writePage(urlOf(e),page(e.name,e.description,urlOf(e),body,e.image));
}

// Preserve established guide and contractual article bodies; update shared navigation only.
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(d,x.name)):[path.join(d,x.name)]);
for(const f of walk(root).filter(f=>f.endsWith('.html'))){
  let html=fs.readFileSync(f,'utf8');
  html=html.replace(/<header class="site-header wrap">[\s\S]*?<\/header>/,header).replace(/<footer class="site-footer wrap">[\s\S]*?<\/footer>/,footer);
  html=html.replace('href="/showcase.css"','href="/presentation.css"');
  if(!html.includes('href="/presentation.css"'))html=html.replace('<link rel="stylesheet" href="/brand-refresh.css"></head>','<link rel="stylesheet" href="/presentation.css"><link rel="stylesheet" href="/brand-refresh.css"></head>');
  fs.writeFileSync(f,html);
}
const routes=['/',...entries.map(urlOf)];
fs.writeFileSync(path.join(root,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(route=>`<url><loc>https://noeapps.com${route}</loc></url>`).join('')}</urlset>\n`);
console.log(JSON.stringify({catalogEntries:entries.length,images:dimensions.size,generatedPages:routes.length}));
