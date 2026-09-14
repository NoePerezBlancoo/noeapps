import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(readFileSync(resolve(root,'assets-source/manifest.json'),'utf8'));
for(const item of manifest){
 const data=Buffer.from(item.parts.map(p=>readFileSync(resolve(root,p),'utf8')).join(''),'base64');
 if(data.length!==item.size||createHash('sha256').update(data).digest('hex')!==item.sha256)throw new Error(`Asset integrity failed: ${item.path}`);
 const target=resolve(root,item.path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,data);
}
console.log(`Restored ${manifest.length} original assets with SHA-256 verification.`);
