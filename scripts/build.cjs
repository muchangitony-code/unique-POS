'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const required=['app.js','index.cjs','public/index.html','public/app.js','public/inventory-v3-ui.js','public/live-data-sanity.js','public/data-authority-guard.js','server/inventory-v3.cjs','server/pdf/bundle-loader.cjs','server/pdf/index.cjs','server/pdf/a4-renderer.cjs','server/pdf/quotation-aware-renderer.cjs','server/pdf/quotation-renderer.cjs','server/pdf/receipt.cjs','server/pdf/document-adapter.cjs','assets/fonts/DejaVuSans.ttf','assets/fonts/DejaVuSans-Bold.ttf'];
for(const file of required){const full=path.join(root,file);if(!fs.existsSync(full)||fs.statSync(full).size===0)throw new Error(`Build: missing required ${file}`);}
for(const stale of ['public/bulk-import-v2.js','public/bulk-import-v2-launcher.js','server/bulk-import-v2.cjs','server/bulk-import-v2-router.cjs'])if(fs.existsSync(path.join(root,stale)))throw new Error(`Build: legacy inventory component remains: ${stale}`);
const runtime=path.join(root,'index.runtime.cjs');fs.writeFileSync(runtime,fs.readFileSync(path.join(root,'index.cjs'),'utf8'),'utf8');
for(const file of ['app.js','index.runtime.cjs','server/inventory-v3.cjs','server/pdf/bundle-loader.cjs','server/pdf/index.cjs','server/pdf/a4-renderer.cjs','server/pdf/quotation-aware-renderer.cjs','server/pdf/quotation-renderer.cjs','server/pdf/receipt.cjs','server/pdf/document-adapter.cjs']){const r=spawnSync(process.execPath,['--check',path.join(root,file)],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
const {isPdfRendererImport}=require(path.join(root,'server/pdf/bundle-loader.cjs'));for(const form of ['./server/pdf/a4-renderer','./server/pdf/a4-renderer.cjs'])if(!isPdfRendererImport(form))throw new Error(`Build: quotation PDF interception missing for ${form}`);
console.log('[build] authoritative POS runtime and quotation PDF routing verified');
