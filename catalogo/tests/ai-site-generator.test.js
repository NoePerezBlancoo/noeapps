'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const ai=require('../ai-site-generator');

const valid='<!doctype html><html lang="es"><head><meta charset="utf-8"><style>body{font-family:system-ui}main{min-height:100vh}</style></head><body><main><h1>Negocio de prueba</h1><p>Contenido suficientemente largo para validar una landing segura.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><p>Detalle comercial de ejemplo.</p><a href="https://example.com">Contacto</a></main></body></html>';

test('accepts a complete static landing',()=>{
  assert.equal(ai.validateGeneratedHtml(valid),valid);
});

test('rejects generated scripts and forms',()=>{
  assert.throws(()=>ai.validateGeneratedHtml(valid.replace('</body>','<script>alert(1)</script></body>')),/scripts/);
  assert.throws(()=>ai.validateGeneratedHtml(valid.replace('</body>','<form action="https://evil.example"></form></body>')),/formularios/);
});

test('lead gate is non-dismissible and points to configured WhatsApp',()=>{
  const previous=process.env.CATALOG_SALES_WHATSAPP;
  process.env.CATALOG_SALES_WHATSAPP='34697375020';
  try{
    const gated=ai.injectLeadGate(valid,'Negocio Demo');
    assert.match(gated,/id="noeapps-demo-gate"/);
    assert.match(gated,/wa\.me\/34697375020/);
    assert.match(gated,/¿Te gusta esta web\?/);
    assert.doesNotMatch(gated,/close|cerrar/i);
  }finally{
    if(previous===undefined)delete process.env.CATALOG_SALES_WHATSAPP;
    else process.env.CATALOG_SALES_WHATSAPP=previous;
  }
});

test('lead gate requires a commercial WhatsApp',()=>{
  const previous=process.env.CATALOG_SALES_WHATSAPP;
  delete process.env.CATALOG_SALES_WHATSAPP;
  try{assert.throws(()=>ai.injectLeadGate(valid,'Negocio Demo'),/CATALOG_SALES_WHATSAPP/)}
  finally{if(previous!==undefined)process.env.CATALOG_SALES_WHATSAPP=previous}
});
