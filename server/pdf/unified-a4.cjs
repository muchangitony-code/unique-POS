'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const { validateDocument, normalizeDocument } = require('./schema.cjs');
const { moneyFromInput, mulCents, taxCents, formatMoney, formatNumber } = require('./format');
const { registerFonts } = require('./fonts.cjs');

const A4 = { width: 595.28, height: 841.89 };
const M = 40;
const W = A4.width - M * 2;
const FOOTER_Y = A4.height - 28;
const COLORS = { text:'#111827', muted:'#667085', line:'#D7DDE5', soft:'#F6F8FB', accent:'#123D6A', white:'#FFFFFF' };
const COLS = { description:215, qty:45, unitPrice:90, tax:55, amount:110 };
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function text(pdf,value,x,y,o={}) { pdf.font(o.font||'body').fontSize(o.size||9).fillColor(o.color||COLORS.text).text(String(value ?? ''),x,y,{width:o.width,align:o.align||'left',lineGap:o.lineGap||0}); }
function right(pdf,value,x,y,w,o={}) { text(pdf,value,x,y,{...o,width:w,align:'right'}); }
function height(pdf,value,width,size=9) { pdf.font('body').fontSize(size); return pdf.heightOfString(String(value ?? ''),{width,lineGap:0}); }
function money(v,currency){ return formatMoney(moneyFromInput(v),currency); }
function itemTotal(item){ const gross=mulCents(moneyFromInput(item.unitPrice),item.qty); const discount=moneyFromInput(item.discount||0); const net=Math.max(0,gross-discount); const tax=taxCents(net,item.taxRate||0); return {gross,discount,tax,total:net+tax}; }
function totals(items){ return items.reduce((a,i)=>{const t=itemTotal(i);a.subtotal+=t.gross;a.discount+=t.discount;a.tax+=t.tax;a.total+=t.total;return a;},{subtotal:0,discount:0,tax:0,total:0}); }

async function logoBuffer(value){
  const raw=String(value||'').trim();
  if(!raw) return null;
  try {
    if(/^data:image\/(png|jpeg|jpg);base64,/i.test(raw)) { const b=Buffer.from(raw.split(',')[1],'base64'); return b.length<=MAX_LOGO_BYTES?b:null; }
    let filename=raw;
    if(/^https?:\/\//i.test(raw)) { const r=await fetch(raw,{redirect:'follow'}); if(!r.ok)return null; const type=String(r.headers.get('content-type')||'').toLowerCase(); if(!/^image\/(png|jpeg|jpg)$/i.test(type))return null; const b=Buffer.from(await r.arrayBuffer()); return b.length<=MAX_LOGO_BYTES?b:null; }
    if(raw.startsWith('/')) filename=path.join(process.cwd(),raw.slice(1));
    else if(!path.isAbsolute(raw)) filename=path.resolve(process.cwd(),raw);
    if(fs.existsSync(filename)&&fs.statSync(filename).isFile()){const b=fs.readFileSync(filename);return b.length<=MAX_LOGO_BYTES?b:null;}
  } catch (_) {}
  return null;
}

function drawLogo(pdf,x,y,size,buffer){ if(!buffer)return; try{pdf.image(buffer,x,y,{fit:[size,size],align:'center',valign:'center'});}catch(_){} }

function header(pdf,data){
  const top=22, logo=58, cardW=170, cardH=82, cardX=A4.width-M-cardW, cardY=top;
  pdf.fillColor(COLORS.accent).rect(0,0,A4.width,5).fill();
  drawLogo(pdf,M,top,logo,data.company.logoBuffer);
  const tx=M+72, tw=230;
  let y=top+1;
  const name=String(data.company.name||'Unique Solar Kenya Ltd');
  const nameH=Math.max(16,height(pdf,name,tw,13.5));
  text(pdf,name,tx,y,{font:'bold',size:13.5,color:COLORS.accent,width:tw,lineGap:1}); y+=nameH+5;
  for(const line of [data.company.address,[data.company.phone,data.company.email].filter(Boolean).join('  ·  '),data.company.taxId?`Tax ID: ${data.company.taxId}`:''].filter(Boolean)){const h=Math.max(10,height(pdf,line,tw,7.6));text(pdf,line,tx,y,{size:7.6,color:COLORS.muted,width:tw});y+=h+3;}
  pdf.fillColor(COLORS.accent).roundedRect(cardX,cardY,cardW,cardH,6).fill();
  text(pdf,data.type==='invoice'?'INVOICE':'QUOTATION',cardX+12,cardY+10,{font:'bold',size:13.5,color:COLORS.white,width:cardW-24});
  text(pdf,data.number,cardX+12,cardY+32,{size:8.5,color:COLORS.white,width:cardW-24});
  text(pdf,`Date: ${data.date||'—'}`,cardX+12,cardY+48,{size:8,color:COLORS.white,width:cardW-24});
  text(pdf,`${data.type==='invoice'?'Due date':'Valid until'}: ${data.type==='invoice'?data.dueDate||'—':data.validUntil||'—'}`,cardX+12,cardY+63,{size:7.8,color:COLORS.white,width:cardW-24});
  return Math.max(top+logo,y,cardY+cardH);
}
function customerBox(pdf,data,y){const h=62;pdf.fillColor(COLORS.soft).strokeColor(COLORS.line).lineWidth(.6).roundedRect(M,y,W,h,4).fillAndStroke();text(pdf,'CUSTOMER',M+12,y+9,{font:'bold',size:7.5,color:COLORS.accent});text(pdf,data.customer.name||'Walk-in Customer',M+12,y+24,{font:'bold',size:10.5,width:W-24});const details=[data.customer.address,data.customer.phone,data.customer.email,data.customer.taxId?`Tax ID: ${data.customer.taxId}`:''].filter(Boolean).join('  ·  ');if(details)text(pdf,details,M+12,y+41,{size:7.2,color:COLORS.muted,width:W-24});return y+h;}
function tableHeader(pdf,y){const h=25;pdf.fillColor(COLORS.accent).rect(M,y,W,h).fill();let x=M;text(pdf,'Description',x+8,y+8,{font:'bold',size:7.5,color:COLORS.white,width:COLS.description-16});x+=COLS.description;for(const[label,w]of[['Qty',COLS.qty],['Unit Price',COLS.unitPrice],['Tax',COLS.tax],['Amount',COLS.amount]]){right(pdf,label,x,y+8,w-8,{font:'bold',size:7.5,color:COLORS.white});x+=w;}return y+h;}
function rowHeight(pdf,item){return Math.max(27,height(pdf,String(item.description||'Item'),COLS.description-16,8.5)+14);}
function row(pdf,item,y,index){const h=rowHeight(pdf,item);if(index%2)pdf.fillColor(COLORS.soft).rect(M,y,W,h).fill();pdf.strokeColor(COLORS.line).lineWidth(.4).rect(M,y,W,h).stroke();let x=M;text(pdf,item.description||'Item',x+8,y+8,{size:8.5,width:COLS.description-16});x+=COLS.description;right(pdf,formatNumber(item.qty),x,y+8,COLS.qty-8,{size:8.5});x+=COLS.qty;right(pdf,money(item.unitPrice,item.currency),x,y+8,COLS.unitPrice-8,{size:8.5});x+=COLS.unitPrice;right(pdf,`${Number(item.taxRate||0).toFixed(2)}%`,x,y+8,COLS.tax-8,{size:8.5});x+=COLS.tax;right(pdf,money(itemTotal(item).total,item.currency),x,y+8,COLS.amount-8,{font:'bold',size:8.5});return y+h;}
function totalsBox(pdf,t,currency,y){const w=250,h=100,x=A4.width-M-w;pdf.fillColor(COLORS.white).strokeColor(COLORS.line).lineWidth(.7).roundedRect(x,y,w,h,4).fillAndStroke();[['Subtotal',t.subtotal],['Discount',-t.discount],['Tax',t.tax]].forEach(([label,val],i)=>{const yy=y+12+i*20;text(pdf,label,x+12,yy,{size:8.5,color:COLORS.muted});right(pdf,money(val,currency),x+105,yy,w-117,{size:8.5});});const gy=y+h-30;pdf.fillColor(COLORS.accent).roundedRect(x,gy,w,30,4).fill();text(pdf,'GRAND TOTAL',x+12,gy+9,{font:'bold',size:8.5,color:COLORS.white});right(pdf,money(t.total,currency),x+105,gy+7,w-117,{font:'bold',size:10.5,color:COLORS.white});return h;}
function infoBlock(pdf,title,value,y){if(!value)return 0;const h=Math.max(42,height(pdf,value,W-20,8)+31);pdf.fillColor(COLORS.soft).strokeColor(COLORS.line).lineWidth(.6).roundedRect(M,y,W,h,4).fillAndStroke();text(pdf,title,M+10,y+8,{font:'bold',size:8,color:COLORS.accent});text(pdf,value,M+10,y+22,{size:8,color:COLORS.muted,width:W-20});return h;}
function footer(pdf,page,total,type){pdf.strokeColor(COLORS.line).lineWidth(.6).moveTo(M,FOOTER_Y-7).lineTo(A4.width-M,FOOTER_Y-7).stroke();text(pdf,type==='invoice'?'Invoice':'Quotation',M,FOOTER_Y,{size:7.5,color:COLORS.muted});right(pdf,`Page ${page} of ${total}`,A4.width-M-110,FOOTER_Y,110,{size:7.5,color:COLORS.muted});}
function measureFirstY(data){const p=new PDFDocument({size:'A4'});registerFonts(p);p.addPage({size:'A4',margins:{top:M,bottom:M,left:M,right:M}});const h=header(p,data);const c=customerBox(p,data,h+14);return tableHeader(p,c+14)+4;}

async function renderUnifiedA4({type,doc:input,company}){
  validateDocument(type,input,company);const data=normalizeDocument(type,input,company);data.company.logoUrl=company.logoUrl||company.logo_url||data.company.logoUrl||'';data.company.logoBuffer=await logoBuffer(data.company.logoUrl);const t=totals(data.items);
  const pdf=new PDFDocument({size:'A4',margins:{top:M,bottom:M,left:M,right:M},autoFirstPage:false,bufferPages:true,info:{Title:`${type==='invoice'?'Invoice':'Quotation'} ${data.number}`,Author:data.company.name}});registerFonts(pdf);
  const chunks=[];const done=new Promise((resolve,reject)=>{pdf.on('data',c=>chunks.push(c));pdf.once('end',()=>resolve(Buffer.concat(chunks)));pdf.once('error',reject);});
  const firstY=measureFirstY(data), bottom=FOOTER_Y-18, capacity=bottom-firstY;
  const probe=new PDFDocument({size:'A4'});registerFonts(probe);probe.addPage({size:'A4'});
  const pages=[];let current=[],used=0;
  for(const item of data.items){const h=rowHeight(probe,item);if(current.length&&used+h>capacity){pages.push({rows:current,height:used});current=[];used=0;}current.push(item);used+=h;}
  if(current.length||!pages.length)pages.push({rows:current,height:used});
  const reserve=118+(data.notes?8+Math.max(42,height(probe,data.notes,W-20,8)+31):0)+(data.terms?8+Math.max(42,height(probe,data.terms,W-20,8)+31):0);
  while(pages.length>1&&pages[pages.length-1].height+reserve>capacity){const last=pages[pages.length-1];const moved=last.rows.shift();if(!moved)break;const mh=rowHeight(probe,moved);last.height-=mh;pages[pages.length-2].rows.push(moved);pages[pages.length-2].height+=mh;}
  for(let pi=0;pi<pages.length;pi++){pdf.addPage({size:'A4',margins:{top:M,bottom:M,left:M,right:M}});const h=header(pdf,data);const c=customerBox(pdf,data,h+14);let y=tableHeader(pdf,c+14)+4;pages[pi].rows.forEach((item,i)=>{y=row(pdf,item,y,i);});if(pi===pages.length-1){const by=y+14;const notesH=data.notes?Math.max(42,height(pdf,data.notes,W-20,8)+31):0;const termsH=data.terms?Math.max(42,height(pdf,data.terms,W-20,8)+31):0;const contentH=100+(data.notes?8+notesH:0)+(data.terms?8+termsH:0);const ty=Math.min(by,bottom-contentH);totalsBox(pdf,t,data.currency,ty);let iy=ty+108;if(data.notes)iy+=infoBlock(pdf,'Notes',data.notes,iy)+8;if(data.terms)infoBlock(pdf,type==='invoice'?'Terms & Conditions':'Quotation Terms',data.terms,iy);}}
  const range=pdf.bufferedPageRange();for(let i=range.start;i<range.start+range.count;i++)footer(pdf,i+1,range.count,data.type);pdf.end();return done;
}
module.exports={renderUnifiedA4};
