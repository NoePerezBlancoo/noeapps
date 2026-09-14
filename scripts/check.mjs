import { access, readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

const required = [
  'dist/index.html',
  'dist/styles.css',
  'dist/tunegocio.css',
  'dist/app.js',
  'dist/apps/tunegocio/index.html',
  'dist/apps/deleteguard/index.html',
  'dist/apps/brokenlinkguard/index.html',
  'dist/apps/leaverguard/index.html',
  'dist/privacidad/index.html',
  'dist/soporte/index.html',
  'dist/assets/noeapps-logo.webp',
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

if (failed) process.exit(1);
console.log('NoeApps integrity check passed.');
