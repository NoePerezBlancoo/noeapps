const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
for (const name of ['server.js', 'subscriptions.js']) new vm.Script(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),{filename:name});
for (const name of ['index.html','crm.html','solicitar.html']) {
  const html=fs.readFileSync(path.join(__dirname,'..',name),'utf8');
  for (const [,script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) if(script.trim())new vm.Script(script,{filename:name});
}
console.log('Server and all embedded browser scripts compile.');
