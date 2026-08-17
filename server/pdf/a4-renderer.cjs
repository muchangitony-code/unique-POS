'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const { validateDocument, normalizeDocument } = require('./schema.cjs');
const { moneyFromInput, mulCents, taxCents, formatMoney, formatNumber } = require('./format');
const { registerFonts } = require('./fonts.cjs');
const { adaptDocumentPayload } = require('./document-adapter.cjs');

// Single A4 renderer for both invoice and quotation. This mirrors the supplied
// POS template: clean ledger table, two-column parties, compact totals, notes,
// payment details and signatures. No legacy renderer or branding fallback.
const A4 = { width: 595.28, height: 841.89 };
const M = 40, W = A4.width - 80, FOOTER_Y = A4.height - 28;
const C = { ink:'#16213A', paper:'#EEF1ED', card:'#FFFFFF', line:'#CBD2C8', lineSoft:'#E3E7E1', muted:'#6B7280', amber:'#C7810A', teal:'#1E6E67', danger:'#B3402A', white:'#FFFFFF' };
const COL = { idx:34, description:235, qty:52, unit:100, amount:94 };
const MAX_LOGO = 2 * 1024 * 1024;

function txt(p,v,x,y,o={}) { p.font(o.font||'body').fontSize(o.size||9).fillColor(o.color||C.ink).text(String(v??''),x,y,{width:o.width,align:o.align||'left',lineGap:o.lineGap||0}); }
function right(p,v,x,y,w,o={}) { txt(p,v,x,y,{...o,width:w,align:'right'}); }
function hstr(p,v,w,s=9,f='body') { p.font(f).fontSize(s); return p.heightOfString(String(v??''),{width:w,lineGap:0}); }
function wrap(v) { return String(v??'').replace(/([^\s]{30})(?=[^\s])/g,'$1\u200b'); }
function lineTotal(it) { const gross=mulCents(moneyFromInput(it.unitPrice),it.qty), discount=moneyFromInput(it.discount||'0'), net=Math.max(0,gross-discount), tax=taxCents(net,it.taxRate||0); return {gross,discount,tax,total:net+tax}; }
function totals(items) { return items.reduce((a,it)=>{const t=lineTotal(it);a.subtotal+=t.gross;a.discount+=t.discount;a.tax+=t.tax;a.total+=t.total;return a;},{subtotal:0,discount:0,tax:0,total:0}); }
function imageBuffer(b) { return Buffer.isBuffer(b)&&b.length>4&&((b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71)||(b[0]===255&&b[1]===216&&b[2]===255)); }
function dataImage(v) { const m=String(v||'').trim().match(/^data:image\/(png|jpe?g);base64,(.+)$/i); if(!m)return null; try{const b=Buffer.from(m[2],'base64');return b.length<=MAX_LOGO&&imageBuffer(b)?b:null;}catch{return null;} }
async function loadLogo(source) {
  if(imageBuffer(source))return source; const raw=String(source||'').trim(); if(!raw)return null; const d=dataImage(raw); if(d)return d;
  if(/^(iVBOR|\/9j\/)/.test(raw)){try{const b=Buffer.from(raw,'base64');if(b.length<=MAX_LOGO&&imageBuffer(b))return b;}catch{}}
  const local=[]; if(raw.startsWith('/')){local.push(path.join(process.cwd(),'public',raw.replace(/^\/+/,'')));local.push(path.join(process.cwd(),raw.replace(/^\/+/,'')));} else if(!/^https?:\/\//i.test(raw)){local.push(path.join(process.cwd(),raw));local.push(path.join(process.cwd(),'public',raw));}
  for(const f of local){try{const b=fs.readFileSync(f);if(b.length<=MAX_LOGO&&imageBuffer(b))return b;}catch{}}
  if(!/^https?:\/\//i.test(raw))return null; try{const r=await fetch(raw,{redirect:'follow'});if(!r.ok)return null;const ct=String(r.headers.get('content-type')||'');if(!/^image\/(png|jpe?g)$/i.test(ct))return null;const b=Buffer.from(await r.arrayBuffer());return b.length<=MAX_LOGO&&imageBuffer(b)?b:null;}catch{return null;}
}
function drawLogo(p,x,y,size,b){if(!b)return;try{p.image(b,x,y,{fit:[size,size],align:'center',valign:'center'});}catch{}}
function dateDisplay(v){if(!v)return '—';const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return String(v);return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(+m[1],+m[2]-1,+m[3])));}

function header(p,d){
  const top=34, logoS=60, brandX=M+logoS+14, cardW=175, metaX=A4.width-M-cardW, brandW=metaX-brandX-22, accent=d.type==='quotation'?C.amber:C.teal;
  drawLogo(p,M,top,logoS,d.company.logo); let by=top; const nameH=Math.max(23,hstr(p,d.company.name,brandW,17,'bold')); txt(p,d.company.name,brandX,by,{font:'bold',size:17,width:brandW}); by+=nameH+4;
  [d.company.address,[d.company.phone,d.company.email].filter(Boolean).join('  ·  '),d.company.taxId?`PIN: ${d.company.taxId}`:''].filter(Boolean).forEach(v=>{const h=hstr(p,v,brandW,8.5);txt(p,v,brandX,by,{size:8.5,color:C.muted,width:brandW});by+=h+3;});
  const type=d.type==='quotation'?'Quotation':'Invoice'; txt(p,type,metaX,top,{font:'bold',size:23,width:cardW,align:'right'}); right(p,`No. ${d.number}`,metaX,top+28,cardW,{size:9,color:C.muted}); right(p,`Issued  ${dateDisplay(d.date)}`,metaX,top+48,cardW,{size:8.5,color:C.muted}); right(p,`${d.type==='quotation'?'Valid until':'Due'}  ${dateDisplay(d.type==='quotation'?d.validUntil:d.dueDate)}`,metaX,top+62,cardW,{size:8.5,color:C.muted}); if(d.servedBy)right(p,`Served by  ${d.servedBy}`,metaX,top+76,cardW,{size:8.2,color:C.muted});
  const bottom=Math.max(by,top+90)+20; p.strokeColor(C.ink).lineWidth(1.1).moveTo(M,bottom).lineTo(A4.width-M,bottom).stroke(); p.save();p.translate(A4.width-M-35,top+3);p.rotate(9);p.strokeColor(accent).lineWidth(1.1).dash(4,{space:3}).moveTo(-95,0).lineTo(95,0).stroke();p.moveTo(-95,24).lineTo(95,24).stroke();txt(p,type,-95,7,{font:'bold',size:9.5,color:accent,width:190,align:'center'});p.restore(); return bottom+1;
}
function parties(p,d,y){
  const gap=24,colW=(W-gap)/2,leftX=M,rightX=M+colW+gap; txt(p,'BILLED TO',leftX,y,{font:'bold',size:7.5,color:C.muted,width:colW}); txt(p,d.customer.name,leftX,y+16,{font:'bold',size:10.5,width:colW});
  let ly=y+31; [d.customer.address,d.customer.phone,d.customer.email,d.customer.taxId?`PIN: ${d.customer.taxId}`:''].filter(Boolean).forEach(v=>{txt(p,v,leftX,ly,{size:8.2,color:C.muted,width:colW});ly+=hstr(p,v,colW,8.2)+2;});
  txt(p,'ORDER REFERENCE',rightX,y,{font:'bold',size:7.5,color:C.muted,width:colW}); txt(p,d.orderReference||'—',rightX,y+16,{font:'bold',size:10.5,width:colW}); let ry=y+31; [d.channel?`Channel: ${d.channel}`:'',d.paymentMethod?`Payment method: ${d.paymentMethod}`:'',`Status: ${d.status||(d.type==='quotation'?'Pending approval':'Awaiting payment')}`].filter(Boolean).forEach(v=>{txt(p,v,rightX,ry,{size:8.2,color:C.muted,width:colW});ry+=hstr(p,v,colW,8.2)+2;});
  const bottom=Math.max(ly,ry)+15;p.strokeColor(C.lineSoft).lineWidth(.7).moveTo(M,bottom).lineTo(A4.width-M,bottom).stroke();return bottom+1;
}
function tableHeader(p,y){const h=22,headers=[['#',COL.idx],['Item',COL.description],['Qty',COL.qty],['Unit price',COL.unit],['Amount',COL.amount]];let x=M;headers.forEach(([lab,w],i)=>{if(i>=2)right(p,lab,x,y,w,{font:'bold',size:7.3,color:C.muted});else txt(p,lab,x,y,{font:'bold',size:7.3,color:C.muted,width:w});x+=w;});p.strokeColor(C.ink).lineWidth(1).moveTo(M,y+h).lineTo(A4.width-M,y+h).stroke();return y+h+1;}
function rowHeight(p,it){const main=hstr(p,wrap(it.description),COL.description-12,9),sub=it.sub?hstr(p,wrap(it.sub),COL.description-12,7.6):0;return Math.max(30,main+sub+15);}
function drawRow(p,it,y,index,currency){const h=rowHeight(p,it);let x=M;txt(p,String(index+1).padStart(2,'0'),x+4,y+8,{size:7.5,color:C.muted,width:COL.idx-8});x+=COL.idx;txt(p,wrap(it.description),x+4,y+7,{font:'bold',size:8.7,width:COL.description-12});if(it.sub)txt(p,wrap(it.sub),x+4,y+20,{size:7.4,color:C.muted,width:COL.description-12});x+=COL.description;right(p,formatNumber(it.qty),x,y+8,COL.qty-7,{size:8.2});x+=COL.qty;right(p,formatMoney(moneyFromInput(it.unitPrice),currency),x,y+8,COL.unit-7,{size:8.2});x+=COL.unit;right(p,formatMoney(lineTotal(it).total,currency),x,y+8,COL.amount-7,{font:'bold',size:8.2});p.strokeColor(C.lineSoft).lineWidth(.55).moveTo(M,y+h).lineTo(A4.width-M,y+h).stroke();return y+h;}
function totalsBlock(p,d,t,y){const width=270,x=A4.width-M-width;let cy=y;const line=(k,v,color=C.ink)=>{txt(p,k,x,cy,{size:8.5,color:C.muted,width:width-125});right(p,v,x+120,cy,width-120,{size:8.5,color});cy+=18;};line('Subtotal',formatMoney(t.subtotal,d.currency));line('VAT',formatMoney(t.tax,d.currency));if(t.discount)line('Discount',`- ${formatMoney(t.discount,d.currency)}`,C.danger);const label=d.type==='quotation'?'Estimated total':'Total due';p.fillColor(C.ink).roundedRect(x,cy+2,width,34,5).fill();txt(p,label,x+12,cy+12,{font:'bold',size:8.5,color:C.white,width:115});right(p,formatMoney(t.total,d.currency),x+115,cy+10,width-127,{font:'bold',size:12.5,color:C.white});return cy+36;}
function qrPlaceholder(p,x,y,size){p.save();p.strokeColor(C.ink).lineWidth(.8).roundedRect(x,y,size,size,4).stroke();const cell=4,n=Math.floor((size-8)/cell);for(let r=0;r<n;r++)for(let c=0;c<n;c++){if(((r*17+c*31+r*c)%7)<2)p.fillColor(C.ink).rect(x+4+c*cell,y+4+r*cell,cell,cell).fill();}p.restore();}
function footerBlock(p,d,y){const leftW=300,gap=28,rightX=M+leftW+gap,rightW=W-leftW-gap,note=d.notes||(d.type==='quotation'?'This quotation is valid for 14 days from the issue date. Prices are subject to stock availability at time of order confirmation.':'Goods once sold are exchangeable within 7 days with receipt. Prices include VAT where applicable. Thank you for shopping with us.');const notesText=d.terms?`${note}\n${d.terms}`:note,leftH=hstr(p,notesText,leftW,8.2)+22,pay=d.paymentDetails||{},rows=[['M-Pesa Paybill',pay.paybill],['Till',pay.till],['Account',pay.account],['Bank',pay.bank]].filter(([,v])=>v),rightH=22+rows.length*15+(pay.qr?82:0),h=Math.max(leftH,rightH);p.strokeColor(C.lineSoft).lineWidth(.7).moveTo(M,y).lineTo(A4.width-M,y).stroke();txt(p,'NOTES & TERMS',M,y+12,{font:'bold',size:7.3,color:C.muted,width:leftW});txt(p,notesText,M,y+27,{size:8.2,width:leftW,lineGap:2});txt(p,'PAYMENT DETAILS',rightX,y+12,{font:'bold',size:7.3,color:C.muted,width:rightW});let py=y+27;rows.forEach(([k,v])=>{txt(p,k,rightX,py,{size:7.8,color:C.muted,width:rightW*.55});right(p,v,rightX+rightW*.55,py,rightW*.45,{size:7.8});py+=15;});if(pay.qr)qrPlaceholder(p,rightX,py+3,60);return y+h+12;}
function signatures(p,d,y){const gap=24,sw=(W-gap)/2;p.strokeColor(C.ink).lineWidth(.6).moveTo(M,y+28).lineTo(M+sw,y+28).stroke();p.moveTo(M+sw+gap,y+28).lineTo(A4.width-M,y+28).stroke();txt(p,d.preparedBy?`Prepared by: ${d.preparedBy}`:'Prepared by',M,y+34,{size:7.5,color:C.muted,width:sw,align:'center'});txt(p,d.customerAcknowledgement||'Customer acknowledgement',M+sw+gap,y+34,{size:7.5,color:C.muted,width:sw,align:'center'});return y+50;}
function pageFooter(p,d,n,count){p.strokeColor(C.lineSoft).lineWidth(.6).moveTo(M,FOOTER_Y-7).lineTo(A4.width-M,FOOTER_Y-7).stroke();txt(p,d.type==='quotation'?'Quotation':'Invoice',M,FOOTER_Y,{size:7,color:C.muted});right(p,`Page ${n} of ${count}`,A4.width-M-100,FOOTER_Y,100,{size:7,color:C.muted});}
function rowPages(p,d,start,reserve){const capacity=FOOTER_Y-16-start-reserve,pages=[];let cur={rows:[],height:0};d.items.forEach(it=>{const h=rowHeight(p,it);if(cur.rows.length&&cur.height+h>capacity){pages.push(cur);cur={rows:[],height:0};}cur.rows.push(it);cur.height+=h;});if(cur.rows.length||!pages.length)pages.push(cur);return pages;}

async function renderDocument({type,doc:input,company}){
  if(!company||typeof company!=='object')throw new Error('company: must be an object'); const logo=await loadLogo(company.logo||company.logoUrl||company.logo_url||company.logoPath||company.logo_path||''); const c={...company,logo}; validateDocument(type,input,c); const d=normalizeDocument(type,input,c); const t=totals(d.items);
  const p=new PDFDocument({size:'A4',margins:{top:M,bottom:M,left:M,right:M},autoFirstPage:false,bufferPages:true,info:{Title:`${type==='invoice'?'Invoice':'Quotation'} ${d.number}`,Author:d.company.name}});registerFonts(p);const chunks=[];const done=new Promise((resolve,reject)=>{p.on('data',b=>chunks.push(b));p.once('end',()=>resolve(Buffer.concat(chunks)));p.once('error',reject);});
  const probe=new PDFDocument({size:'A4'});registerFonts(probe);const hb=header(probe,d);const pb=parties(probe,d,hb+18);const start=tableHeader(probe,pb+18)+2;const pages=rowPages(probe,d,start,175);probe.end();
  pages.forEach((pg,pi)=>{p.addPage({size:'A4',margins:{top:M,bottom:M,left:M,right:M}});let y=tableHeader(p,parties(p,d,header(p,d)+18)+18);pg.rows.forEach((it,i)=>{y=drawRow(p,it,y+1,i,d.currency);});if(pi===pages.length-1){y+=14;const footerSpace=170,totalsY=Math.min(y,FOOTER_Y-footerSpace-12),afterTotals=totalsBlock(p,d,t,totalsY),afterFooter=footerBlock(p,d,afterTotals+18);signatures(p,d,Math.min(afterFooter+8,FOOTER_Y-58));}});
  const r=p.bufferedPageRange();for(let i=r.start;i<r.start+r.count;i++){p.switchToPage(i);pageFooter(p,d,i+1,r.count);}p.end();return done;
}
async function renderPdfBuffer(payload,paper='a4'){const a=adaptDocumentPayload(payload,paper);if(a.type!=='invoice'&&a.type!=='quotation')throw new Error(`Unsupported PDF document type: ${a.type}`);return renderDocument({type:a.type,doc:a.doc,company:a.company});}
module.exports={renderDocument,renderPdfBuffer,mapDocumentPayload:adaptDocumentPayload};
