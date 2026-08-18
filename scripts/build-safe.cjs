'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const rendererPath = path.join(root, 'server', 'pdf', 'a4-renderer.cjs');
const marker = 'PDF_SVG_LOGO_PATCH_V3';
let source = fs.readFileSync(rendererPath, 'utf8');
if (!source.includes("require('../branding.config.cjs')")) {
  source = source.replace("const PDFDocument = require('pdfkit');", "const PDFDocument = require('pdfkit');\nconst BRAND = require('../branding.config.cjs');");
}
function replaceFn(src, start, end, body) {
  const a = src.indexOf(start);
  if (a < 0) throw new Error(`Safe PDF build: missing ${start}`);
  const b = src.indexOf(end, a);
  if (b < 0) throw new Error(`Safe PDF build: missing ${end}`);
  return src.slice(0, a) + body + src.slice(b);
}
if (!source.includes(marker)) {
  source = replaceFn(source, 'async function loadLogo(source)', 'async function makeQrBuffer', String.raw`async function loadLogo(source) {
  // ${marker}: canonical SVG/PNG/JPEG logo support.
  const values = [String(source || '').trim(), String(BRAND.logo || '/assets/unique-solar-kenya-logo.svg').trim()].filter(Boolean);
  const raster = b => Buffer.isBuffer(b) && b.length > 4 && ((b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71)||(b[0]===255&&b[1]===216&&b[2]===255));
  const svg = b => { const s=Buffer.isBuffer(b)?b.toString('utf8'):String(b||''); return /^\s*<svg(?:\s|>)/i.test(s) ? s : null; };
  for (const value of values) {
    if (raster(value) || svg(value)) return value;
    const files = value.startsWith('/') ? [path.join(process.cwd(),'public',value.slice(1)),path.join(process.cwd(),value.slice(1))] : [/^https?:\/\//i.test(value) ? '' : path.resolve(process.cwd(),value), /^https?:\/\//i.test(value) ? '' : path.join(process.cwd(),'public',value)].filter(Boolean);
    for (const file of files) { try { const b=fs.readFileSync(file); if (b.length<=MAX_LOGO && (raster(b)||svg(b))) return b; } catch (_) {} }
    if (/^https?:\/\//i.test(value)) { try { const r=await fetch(value,{redirect:'follow'}); if(r.ok){const b=Buffer.from(await r.arrayBuffer()); if(b.length<=MAX_LOGO&&(raster(b)||svg(b))) return b;} } catch (_) {} }
  }
  console.warn('[pdf] Branding logo could not be loaded.'); return null;
}

`);
  source = replaceFn(source, 'function drawLogo(pdf, x, y, size, buffer)', 'function drawTopBar', String.raw`function drawLogo(pdf, x, y, size, buffer) {
  pdf.save();
  pdf.strokeColor(C.orangeSoft).lineWidth(.7).roundedRect(x,y,size,size,7).stroke();
  if(!buffer) console.warn('[pdf] Branding logo missing at render time.');
  if(typeof buffer==='string' && /^\s*<svg(?:\s|>)/i.test(buffer)){ try{ const SVGtoPDF=require('@leduard/svg-to-pdfkit'); SVGtoPDF(pdf,buffer,x+3,y+3,{width:size-6,height:size-6,preserveAspectRatio:'xMidYMid meet'}); }catch(e){console.warn('[pdf] SVG logo render failed:',e?.message||e);} }
  else if(buffer){ try{pdf.image(buffer,x+3,y+3,{fit:[size-6,size-6],align:'center',valign:'center'});}catch(e){console.warn('[pdf] Raster logo render failed:',e?.message||e);} }
  pdf.restore();
}

`);
  source = replaceFn(source, 'async function renderDocument({ type, doc: input, company })', 'async function renderPdfBuffer', String.raw`async function renderDocument({ type, doc: input, company }) {
  // ${marker}: compact-first pagination. One page when it fits; continuation pages only when required.
  const logo = await loadLogo(company?.logo || company?.logoUrl || company?.logoPath || BRAND.logo);
  const normalizedCompany={...company,logo}; validateDocument(type,input,normalizedCompany); const doc=normalizeDocument(type,input,normalizedCompany);
  doc.company.name=BRAND.legalName; doc.company.tagline=BRAND.tagline; doc.company.address=BRAND.address; doc.company.phone=BRAND.phone; doc.company.website=BRAND.website; doc.company.logo=logo;
  const calculated=totals(doc.items);
  const probe=new PDFDocument({size:'A4'}); registerFonts(probe); const hy=drawHeader(probe,doc); const py=drawParties(probe,doc,hy+14); const ty=drawTableHeader(probe,py+14)+1; const rows=doc.items.map((item,index)=>({item,index,height:itemHeight(probe,item)})); probe.end();
  const reserve=205, firstOpen=FOOTER_Y-ty-12, firstFinal=FOOTER_Y-ty-reserve, contTop=66, contTable=contTop+14+22, contOpen=FOOTER_Y-contTable-12, contFinal=FOOTER_Y-contTable-reserve;
  const sum=a=>a.reduce((n,r)=>n+r.height,0), take=(list,cap)=>{const out=[];let used=0;for(const r of list){if(out.length&&used+r.height>cap)break;out.push(r);used+=r.height;}if(!out.length&&list.length)out.push(list[0]);return out;};
  const pages=[]; let remaining=rows;
  if(sum(rows)<=firstFinal) pages.push({kind:'first',rows}); else { const first=take(remaining,firstOpen); pages.push({kind:'first',rows:first}); remaining=remaining.slice(first.length); while(remaining.length){ if(sum(remaining)<=contFinal){pages.push({kind:'continuation-final',rows:remaining});break;} const chunk=take(remaining,contOpen); pages.push({kind:'continuation',rows:chunk}); remaining=remaining.slice(chunk.length); } }
  const title=(type==='quotation'?'Quotation':'Invoice') + ' ' + doc.number;
  const pdf=new PDFDocument({size:'A4',autoFirstPage:false,bufferPages:true,margins:{top:M,bottom:M,left:M,right:M},info:{Title:title,Author:BRAND.legalName}}); registerFonts(pdf);
  const chunks=[]; const done=new Promise((resolve,reject)=>{pdf.on('data',c=>chunks.push(c));pdf.once('end',()=>resolve(Buffer.concat(chunks)));pdf.once('error',reject);});
  pages.forEach((page,pi)=>{pdf.addPage({size:'A4',margins:{top:M,bottom:M,left:M,right:M}});let y;if(page.kind==='first'){y=drawHeader(pdf,doc);y=drawParties(pdf,doc,y+14);y=drawTableHeader(pdf,y+14)+1;}else{drawTopBar(pdf);drawLogo(pdf,M,20,30,doc.company.logo);text(pdf,doc.type==='quotation'?'Quotation':'Invoice',M+40,25,{font:'bold',size:12,width:180});right(pdf,'No. '+doc.number,A4.width-M-180,25,180,{size:8.2,color:C.muted});pdf.strokeColor(C.line).lineWidth(.8).moveTo(M,57).lineTo(A4.width-M,57).stroke();y=drawTableHeader(pdf,72)+1;} page.rows.forEach((r,i)=>{y=drawItem(pdf,r.item,y,r.index,i===page.rows.length-1);}); if(pi===pages.length-1){y+=12;y=drawTotals(pdf,doc,calculated,y)+7;y=drawFooter(pdf,doc,y)+4;drawSignatures(pdf,doc,Math.min(y,FOOTER_Y-42));}});
  const range=pdf.bufferedPageRange();for(let i=range.start;i<range.start+range.count;i++){pdf.switchToPage(i);drawPageFooter(pdf,doc,i+1,range.count);} pdf.end(); return done;
}

`);
}
fs.writeFileSync(rendererPath,source,'utf8');
const check=spawnSync(process.execPath,['--check',rendererPath],{encoding:'utf8'});
if(check.status!==0) throw new Error(`Safe PDF build: renderer syntax check failed\n${check.stderr||check.stdout}`);
require(path.join(root,'scripts','build.cjs'));
