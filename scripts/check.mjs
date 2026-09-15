import { access, readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { entries as catalog } from './catalog-data.mjs';

const required = [
  'dist/index.html',
  'dist/styles.css',
  'dist/apps/deleteguard/index.html',
  'dist/apps/broken-link-guard/index.html',
  'dist/apps/leaver-guard/index.html',
  'dist/privacidad/index.html',
  'dist/soporte/index.html',
  'dist/assets/noeapps-logo.webp',
  'dist/assets/favicon.svg',
  'dist/assets/tutest-preview.svg',
  'dist/assets/tunegocio-preview.svg',
  '.openai/hosting.json'
];

let failed = false;

for (const path of required) {
  try {
    await access(path);
    console.log(`OK ${path}`);
  } catch {
    console.error(`MISSING ${path}`);
    failed = true;
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

function localTarget(url) {
  const clean = url.split('#')[0].split('?')[0];
  if (!clean || !clean.startsWith('/') || clean.startsWith('//')) return null;
  if (clean === '/') return 'dist/index.html';
  const relative = clean.slice(1);
  return extname(relative) ? join('dist', relative) : join('dist', relative, 'index.html');
}

for (const htmlPath of (await walk('dist')).filter((path) => path.endsWith('.html'))) {
  const html = await readFile(htmlPath, 'utf8');
  const adsenseScripts = html.match(/https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-2728247953803725/g) ?? [];
  if (adsenseScripts.length !== 1) {
    console.error(`ADSENSE ${htmlPath}: expected one verification script, found ${adsenseScripts.length}`);
    failed = true;
  }
  const urls = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  for (const url of urls) {
    const target = localTarget(url);
    if (!target) continue;
    try {
      await access(target);
    } catch {
      console.error(`BROKEN ${htmlPath}: ${url} -> ${target}`);
      failed = true;
    }
  }
}

// Protect the complete catalog, including projects recovered from the previous publication.
const expectedSlugs = ['tutest','tunegocio','forgeops','fivaki','pequeno-comercio','deleteguard','broken-link-guard','leaver-guard','quitar-fondo','texto-audio','descargas-multimedia','iagentes','automatizaciones-n8n','tugta','noticias-tcg','itflow-manager','opsdesk','edulabops','laboratorio-industrial'];
const home = await readFile('dist/index.html','utf8');
for (const asset of ['/assets/favicon.svg','/assets/tutest-preview.svg','/assets/tunegocio-preview.svg']) {
 if (!home.includes(asset)) { console.error(`HOME ASSET MISSING: ${asset}`); failed=true; }
}
const support = await readFile('dist/soporte/index.html','utf8');
const sitemap = await readFile('dist/sitemap.xml','utf8');
for (const slug of expectedSlugs) {
 const entry = catalog.find(e=>e.slug===slug);
 const route = entry && `/${entry.group}/${slug}/`;
 if (!entry || !home.includes(`href="${route}"`) || !support.includes(`href="${route}"`) || !sitemap.includes(`https://noeapps.com${route}`)) {
  console.error(`CATALOG ENTRY MISSING: ${slug}`); failed=true;
 }
}
const tutest = await readFile('dist/apps/tutest/index.html','utf8');
if (!tutest.includes('href="https://tutest.noeapps.com"') || !tutest.includes('Analizar una web') || !tutest.includes('application/ld+json')) { console.error('TuTest CTA or metadata missing'); failed=true; }
for (const match of tutest.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) JSON.parse(match[1]);
for (const category of ['productos','herramientas','atlassian','proyectos']) if (!home.includes(`id="${category}"`)) { console.error(`Missing category: ${category}`); failed=true; }
console.log(`Verified ${expectedSlugs.length} catalog entries, support, sitemap and TuTest metadata.`);
if (failed) process.exit(1);
console.log('NoeApps integrity check passed.');
