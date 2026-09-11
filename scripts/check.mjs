import { access } from 'node:fs/promises';

const required = [
  'dist/index.html',
  'dist/styles.css',
  'dist/app.js',
  'dist/privacidad/index.html',
  'dist/soporte/index.html',
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

if (failed) process.exit(1);
