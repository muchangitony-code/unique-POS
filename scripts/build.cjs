'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const required=['app.js','index.cjs','public/index.html','public/app.js','public/inventory-v3-ui.js','public/live-data-sanity.js','public/data-authority-guard.js','server/inventory-v3.cjs','server/quotations-v2.cjs','server/quotations-v2-ui.cjs','server/pdf/bundle-loader.cjs','server/pdf/index.cjs','server/pdf/a4-renderer.cjs','server/pdf/professional-a4-renderer.cjs','server/pdf/receipt.cjs','server/pdf/document-adapter.cjs','assets/fonts/DejaVuSans.ttf','assets/fonts/DejaVuSans-Bold.ttf','main.tsx','App.tsx','Router.tsx','vite.config.mjs','frontend/api-client.ts'];
for(const file of required){const full=path.join(root,file);if(!fs.existsSync(full)||fs.statSync(full).size===0)throw new Error(`Build: missing required ${file}`);}
for(const stale of ['public/bulk-import-v2.js','public/bulk-import-v2-launcher.js','server/bulk-import-v2.cjs','server/bulk-import-v2-router.cjs'])if(fs.existsSync(path.join(root,stale)))throw new Error(`Build: legacy component remains: ${stale}`);
const patch=spawnSync(process.execPath,[path.join(__dirname,'build-runtime-patch.cjs')],{stdio:'inherit'});
if(patch.status!==0)process.exit(patch.status||1);
const runtime=path.join(root,'index.runtime.cjs');fs.writeFileSync(runtime,fs.readFileSync(path.join(root,'index.cjs'),'utf8'),'utf8');
for(const file of ['app.js','index.cjs','index.runtime.cjs','server/index.cjs','server/inventory-v3.cjs','server/quotations-v2.cjs','server/quotations-v2-ui.cjs','server/pdf/bundle-loader.cjs','server/pdf/index.cjs','server/pdf/a4-renderer.cjs','server/pdf/professional-a4-renderer.cjs','server/pdf/receipt.cjs','server/pdf/document-adapter.cjs']){const r=spawnSync(process.execPath,['--check',path.join(root,file)],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
const pdf=require(path.join(root,'server/pdf/index.cjs'));if(typeof pdf.renderPdfBuffer!=='function')throw new Error('Build: PDF renderer is unavailable');
console.log('[build] PDF subsystem verified');
console.log('[build] quotation runtime syntax verified');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const match=html.match(/\/assets\/(index-[^"']+\.js)/);
if(!match)throw new Error('Build: frontend bundle is not referenced by public/index.html');
if(!fs.existsSync(path.join(root,'public/assets',match[1])))throw new Error(`Build: referenced frontend bundle missing: ${match[1]}`);
console.log(`[build] prebuilt frontend bundle verified: ${match[1]}`);
