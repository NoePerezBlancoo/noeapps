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
  for(const name of [e.image,...(e.gallery||[]).map(g=>g[0])]){
    if(dimensions.has(name))continue;
    const b=fs.readFileSync(path.join(root,asset(name)));
    if(b.length<30)throw new Error(`Empty or incomplete image: ${name}`);
    let w,h;
    if(name.endsWith('.png')){w=b.readUInt32BE(16);h=b.readUInt32BE(20);}
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
const nav=`<nav aria-label="Principal"><a href="/#productos">Productos</a><a href="/#herramientas">Herramientas</a><a href="/#proyectos">Proyectos</a><a class="nav-portfolio" href="${portfolio}">Quién soy <span aria-hidden="true">↗</span></a><a href="/soporte/">Soporte</a></nav>`;
const header=`<header class="site-header wrap"><a class="brand" href="/" aria-label="NoeApps, inicio">Noe<span>Apps</span><span class="brand-mark" aria-hidden="true">/</span></a>${nav}</header>`;
const footer=`<footer class="site-footer wrap"><a class="brand small" href="/">Noe<span>Apps</span></a><p>© 2026 Noé Pérez Blanco</p><div><a href="${portfolio}">Quién soy ↗</a><a href="/aviso-legal/">Aviso legal</a><a href="/privacidad/">Privacidad de la web</a><a href="/soporte/">Soporte</a></div></footer>`;
function page(title,description,route,body,cover){
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — NoeApps</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow"><meta name="theme-color" content="#102b49"><link rel="canonical" href="https://noeapps.com${route}"><meta property="og:title" content="${esc(title)} — NoeApps"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="website"><meta property="og:url" content="https://noeapps.com${route}">${cover?`<meta property="og:image" content="https://noeapps.com${asset(cover)}">`:''}<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/catalog.css"><link rel="stylesheet" href="/showcase.css"></head><body><a class="skip-link" href="#contenido">Ir al contenido</a>${header}<main id="contenido" class="wrap">${body}</main>${footer}</body></html>\n`;
}
function writePage(route,html){const dest=path.join(root,route,'index.html');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,html);}
function card(e){
  if(e.group==='apps')return `<article class="product-visual-card"><a class="product-preview preview-${e.slug}${e.brand?' brand-preview':''}" href="${urlOf(e)}" aria-label="Explorar ${esc(e.name)}">${img(e.image,e.alt)}${e.brand?'<span class="brand-preview-copy"><strong>Tu siguiente hábito<br>empieza hoy.</strong><span>Fivaki · Beta Android</span></span>':''}</a><div class="product-card-body"><div class="card-top"><p class="card-label">${esc(e.label)}</p><span class="status">${esc(e.status)}</span></div><h3><a href="${urlOf(e)}">${esc(e.name)}</a></h3><p class="card-description">${esc(e.description)}</p><ul class="card-benefits">${e.short.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><div class="card-actions"><a class="button button-dark" href="${urlOf(e)}">Descubrir ${e.slug==='pequeno-comercio'?'el producto':esc(e.name)} <span aria-hidden="true">↗</span></a><a class="text-link" href="${esc(accessOf(e))}">${esc(e.cta)} ↗</a></div></div></article>`;
  return `<article class="catalog-card"><a href="${urlOf(e)}" class="mini-image" aria-label="Explorar ${esc(e.name)}">${img(e.image,e.alt)}${e.concept?'<span class="image-kind">Ilustración</span>':''}</a><div class="card-top"><p class="card-label">${esc(e.label)}</p><span class="status">${esc(e.status)}</span></div><h3><a href="${urlOf(e)}">${esc(e.name)}</a></h3><p class="card-description">${esc(e.description)}</p><a class="card-link" href="${urlOf(e)}">Ver ${e.group==='herramientas'?'la herramienta':'el proyecto'} <span aria-hidden="true">↗</span></a></article>`;
}
function section(group,id,number,title,description,intro=''){
  return `<section class="catalog-section" id="${id}"><div class="section-heading"><div><p class="eyebrow">${number} / ${groupNames[group].toUpperCase()}</p><h2>${title}</h2></div><p>${description}</p></div>${intro}<div class="catalog-grid grid-${group}">${entries.filter(e=>e.group===group).map(card).join('')}</div></section>`;
}
const hero=`<section class="visual-hero" id="apps"><div><p class="eyebrow">SOFTWARE CON UN PROPÓSITO</p><h1>Ideas que se<br>convierten en<br><em>herramientas.</em></h1><p class="hub-lead">Organiza tu trabajo, crea contenido y descubre nuevas formas de hacer las cosas. Explora las aplicaciones y proyectos de NoeApps.</p><div class="hero-actions"><a class="button button-dark" href="#productos">Encuentra tu herramienta <span aria-hidden="true">↓</span></a><a class="text-link" href="${portfolio}">Quién soy ↗</a></div></div><div class="showcase-stage"><p class="stage-label"><span>EN PRIMER PLANO / FORGEOPS</span><span>01 — 04</span></p><a class="stage-screen" href="/apps/forgeops/" aria-label="Descubrir ForgeOps">${img('forgeops-dashboard.webp','Panel real de la demo de ForgeOps para organizar el mantenimiento industrial.',true)}</a><p class="stage-caption">Mantenimiento industrial, de un vistazo.<br>Captura real del entorno de demostración.</p><div class="stage-bottom"><span>Activos</span><span>Órdenes de trabajo</span><span>Preventivos</span></div></div></section><nav class="catalog-jump" aria-label="Secciones del catálogo"><a href="#productos"><strong>04</strong><span>Productos</span>↗</a><a href="#herramientas"><strong>05</strong><span>Herramientas</span>↗</a><a href="#proyectos"><strong>07</strong><span>Proyectos</span>↗</a></nav>`;
writePage('/',page('Aplicaciones para trabajar, crear y avanzar','Descubre ForgeOps, DeleteGuard, Fivaki y Pequeño Comercio. Capturas, demos, herramientas creativas, automatizaciones y proyectos de NoeApps.','/',hero+
section('apps','productos','01','Encuentra lo que encaja contigo.','De la planta industrial al día a día de tu negocio. Conoce cada producto, mira sus posibilidades y elige cómo empezar.')+
section('herramientas','herramientas','02','Menos pasos. Más posibilidades.','Utilidades para crear contenido y explorar automatizaciones. Descubre sus funciones y consulta el acceso que necesitas.',`<div class="collection-intro"><p>¿Tienes una tarea que repites cada día? Podemos revisar si una herramienta o un flujo de trabajo encaja en tu caso.</p><a class="text-link" href="${contact('una herramienta para mi trabajo')}">Cuéntame tu caso ↗</a></div>`)+
section('proyectos','proyectos','03','Explora otras formas de crear.','Medios digitales, prototipos de producto y laboratorios. Una ventana al trabajo que hay detrás de NoeApps.')+
`<section class="contact-band"><div><p class="eyebrow">DE LA IDEA AL SIGUIENTE PASO</p><h2>¿Qué te gustaría resolver?</h2><p>Cuéntame cómo trabajas, qué quieres mejorar y qué producto te ha llamado la atención.</p></div><a class="button button-light" href="${contact('un proyecto de NoeApps')}">Hablemos de tu caso <span aria-hidden="true">↗</span></a></section><section class="about" id="acerca"><p class="eyebrow">DETRÁS DE NOEAPPS</p><div><h2>Soy Noé Pérez Blanco.</h2><p>Desarrollo software y trabajo en la conexión entre sistemas, procesos y personas. En NoeApps reúno productos y proyectos que nacen de esa forma de entender el trabajo: observar una necesidad y convertirla en algo útil.</p><p>En mi portfolio puedes conocer mi trayectoria y mi experiencia en entornos IT e industriales.</p><a class="text-link" href="${portfolio}">Quién soy · Ver mi portfolio ↗</a></div></section>`,'forgeops-dashboard.webp'));

for(const e of entries){
  const gallery=e.gallery?.length?`<section class="story-section"><div class="story-heading"><p class="eyebrow">POR DENTRO</p><h2>Mira el producto en acción.</h2><p>Capturas reales con datos de demostración. Pulsa una imagen para verla con más detalle.</p></div><div class="gallery-grid">${e.gallery.map(([name,caption])=>`<figure class="gallery-item"><a href="${asset(name)}" aria-label="Ampliar: ${esc(caption)}">${img(name,caption)}</a><figcaption>${esc(caption)}</figcaption></figure>`).join('')}</div></section>`:'';
  const docs=e.slug==='deleteguard'?`<section class="story-section"><div class="story-heading"><p class="eyebrow">DOCUMENTACIÓN</p><h2>Conoce los detalles de DeleteGuard.</h2></div><div class="docs-links"><a href="/apps/deleteguard/ayuda/">Guía de uso</a><a href="/apps/deleteguard/privacidad/">Privacidad</a><a href="/apps/deleteguard/seguridad/">Seguridad</a><a href="/apps/deleteguard/condiciones/">Condiciones</a><a href="/apps/deleteguard/tratamiento-datos/">Tratamiento de datos</a></div></section>`:'';
  const body=`<nav class="breadcrumb" aria-label="Ruta de navegación"><a href="/">NoeApps</a><span aria-hidden="true">/</span><a href="/#${anchorOf(e)}">${groupNames[e.group]}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(e.name)}</span></nav>
<section class="product-story-hero"><div><p class="eyebrow">${esc(e.label)}</p><span class="status">${esc(e.status)}</span><h1>${esc(e.name)}</h1><p class="detail-lead">${esc(e.lead)}</p><p class="detail-description">${esc(e.description)}</p><div class="hero-actions"><a class="button button-dark" href="${esc(accessOf(e))}">${esc(e.cta)} <span aria-hidden="true">↗</span></a><a class="text-link" href="#posibilidades">Explorar funciones ↓</a></div></div><figure><div class="product-story-image image-${e.slug}${e.concept?' concept-image':''}${e.brand?' brand-image':''}">${img(e.image,e.alt,true)}${e.brand?'<div class="fivaki-brand-story"><span>FIVAKI</span><strong>Pequeños pasos.<br>Tu propio progreso.</strong><p>Hábitos · Actividad · Gamificación</p></div>':''}</div><figcaption>${esc(e.caption)}</figcaption></figure></section>
<section class="story-section" id="posibilidades"><div class="story-heading"><p class="eyebrow">LO QUE PUEDES HACER</p><h2>${esc(e.heading)}</h2></div><div class="benefit-grid">${e.benefits.map(([title,copy],i)=>`<article class="benefit-item"><span aria-hidden="true">0${i+1}</span><h3>${esc(title)}</h3><p>${esc(copy)}</p></article>`).join('')}</div></section>
<section class="story-section"><div class="use-grid"><div><div class="audience-box"><h3>¿Para quién tiene sentido?</h3><p>${esc(e.audience)}</p></div><div class="story-heading use-example"><h3>Imagina este caso</h3><p>${esc(e.example)}</p></div></div><div><h2>Así es el recorrido.</h2><ol>${e.steps.map((step,i)=>`<li><span aria-hidden="true">0${i+1}</span><p>${esc(step)}</p></li>`).join('')}</ol><div class="process-flow" aria-label="Resumen del recorrido">${e.flow.map(esc).map((step,i)=>`${i?'<b aria-hidden="true">→</b>':''}<span>${step}</span>`).join('')}</div></div></div></section>
${gallery}<section class="story-section faq-layout"><div class="faq-list"><h2>Antes de empezar.</h2>${e.faq.map(([question,answer])=>`<details><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>`).join('')}</div><aside class="story-access"><p class="eyebrow">TU SIGUIENTE PASO</p><h2>${esc(e.status)}</h2><p>${esc(e.access)}</p><a class="button button-light" href="${esc(accessOf(e))}">${esc(e.cta)} <span aria-hidden="true">↗</span></a>${!e.url?'<p class="small-copy">El botón abre tu correo. Indica tu caso de uso para concretar una presentación o las condiciones de acceso.</p>':`<p class="small-copy">¿Quieres comentar tu caso? <a href="${contact(e.name)}">Escríbenos</a>.</p>`}</aside></section>${docs}
<section class="more-catalog"><h2>También puedes descubrir</h2><div>${entries.filter(x=>x.group===e.group&&x.slug!==e.slug).slice(0,3).map(x=>`<a href="${urlOf(x)}">${esc(x.name)} <span aria-hidden="true">↗</span></a>`).join('')}</div><a class="text-link" href="/#${anchorOf(e)}">Ver ${groupNames[e.group].toLowerCase()}</a></section>`;
  writePage(urlOf(e),page(e.name,e.description,urlOf(e),body,e.image));
}

// Preserve established guide and contractual article bodies; update shared navigation only.
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(d,x.name)):[path.join(d,x.name)]);
for(const f of walk(root).filter(f=>f.endsWith('.html'))){
  let html=fs.readFileSync(f,'utf8');
  html=html.replace(/<header class="site-header wrap">[\s\S]*?<\/header>/,header).replace(/<footer class="site-footer wrap">[\s\S]*?<\/footer>/,footer);
  if(!html.includes('href="/showcase.css"'))html=html.replace('</head>','<link rel="stylesheet" href="/showcase.css"></head>');
  fs.writeFileSync(f,html);
}
const routes=['/',...entries.map(urlOf)];
fs.writeFileSync(path.join(root,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(route=>`<url><loc>https://noeapps.com${route}</loc></url>`).join('')}</urlset>\n`);
console.log(JSON.stringify({catalogEntries:entries.length,images:dimensions.size,generatedPages:routes.length}));
