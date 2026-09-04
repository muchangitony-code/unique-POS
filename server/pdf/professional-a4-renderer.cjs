'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('@leduard/svg-to-pdfkit');
const { adaptDocumentPayload } = require('./document-adapter.cjs');
const { moneyFromInput, mulCents, taxCents, formatMoney, formatNumber } = require('./format');
const { registerFonts } = require('./fonts.cjs');

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 38;
const CW = PAGE_W - M * 2;
const FOOTER_H = 32;
const BOTTOM = PAGE_H - M - FOOTER_H;
const BLUE = '#123d67';
const BLUE_DARK = '#0b2947';
const GREEN = '#168a52';
const INK = '#172033';
const MUTED = '#64748b';
const LINE = '#d8e0e8';

function money(v) { return moneyFromInput(v || 0); }
function calc(item) {
  const gross = mulCents(money(item.unitPrice), item.qty || 0);
  const discount = money(item.discount || 0);
  const net = Math.max(0, gross - discount);
  const tax = taxCents(net, item.taxRate || 0);
  return { gross, discount, tax, total: net + tax };
}
function compute(items) {
  return items.reduce((o, item) => { const c = calc(item); o.subtotal += c.gross; o.discount += c.discount; o.tax += c.tax; o.total += c.total; return o; }, { subtotal: 0, discount: 0, tax: 0, total: 0 });
}
function isSvg(v) { return /^\s*<svg(?:\s|>)/i.test(Buffer.isBuffer(v) ? v.toString('utf8') : String(v || '')); }
function isRaster(v) { return Buffer.isBuffer(v) && v.length > 4 && ((v[0] === 137 && v[1] === 80) || (v[0] === 255 && v[1] === 216)); }
async function loadLogo(source) {
  if (isRaster(source) || isSvg(source)) return source;
  const raw = String(source || '').trim();
  if (!raw) return null;
  const candidates = raw.startsWith('/') ? [path.join(process.cwd(), 'public', raw.slice(1)), path.join(process.cwd(), raw.slice(1))] : [path.resolve(process.cwd(), raw), path.join(process.cwd(), 'public', raw)];
  for (const file of candidates) { try { const b = fs.readFileSync(file); if (isRaster(b)) return b; if (isSvg(b)) return b.toString('utf8'); } catch (_) {} }
  return null;
}
function font(pdf, bold, size) { pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size); }
function h(pdf, value, width, bold, size) { font(pdf, bold, size); return Math.ceil(pdf.heightOfString(String(value || ''), { width })); }
function t(pdf, value, x, y, width, o = {}) { font(pdf, !!o.bold, o.size || 8.5); pdf.fillColor(o.color || INK).text(String(value || ''), x, y, { width, align: o.align || 'left', lineGap: o.lineGap || 0 }); }
function line(pdf, y) { pdf.strokeColor(LINE).lineWidth(.7).moveTo(M, y).lineTo(PAGE_W - M, y).stroke(); }
function date(v) { if (!v) return '—'; const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return String(v); return `${m[3]}/${m[2]}/${m[1]}`; }
function drawLogo(pdf, logo, x, y, w, ht) {
  if (!logo) return;
  try { if (typeof logo === 'string' && isSvg(logo)) SVGtoPDF(pdf, logo, x, y, { width: w, height: ht, preserveAspectRatio: 'xMinYMid meet' }); else pdf.image(logo, x, y, { fit: [w, ht] }); } catch (_) {}
}

async function renderDocument({ type, doc, company }) {
  registerFonts();
  const pdf = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  const chunks = []; pdf.on('data', c => chunks.push(c));
  const d = doc || {}; const c = company || d.company || {}; const items = Array.isArray(d.items) ? d.items : [];
  const currency = d.currency || 'KES'; const totals = compute(items); const logo = await loadLogo(c.logoUrl || c.logo || d.logoUrl);
  let y = M;
  const addPage = () => { pdf.addPage(); y = M; drawTop(true); };
  const need = n => { if (y + n > BOTTOM) addPage(); };
  function drawTop(continued) {
    pdf.rect(0, 0, PAGE_W, 5).fill(BLUE_DARK); pdf.rect(0, 5, PAGE_W, 3).fill(GREEN);
    const leftW = 310; drawLogo(pdf, logo, M, y, 62, 48);
    const tx = logo ? M + 74 : M; const name = c.name || 'Unique Solar Kenya Ltd';
    t(pdf, name, tx, y + 2, leftW - (tx - M), { bold: true, size: 17, color: BLUE_DARK });
    t(pdf, c.tagline || 'SOLAR • ELECTRICAL • A BRIGHTER TOMORROW', tx, y + 25, leftW - (tx - M), { bold: true, size: 7.2, color: GREEN });
    const details = [c.address, c.phone, c.email].filter(Boolean).join('  •  ');
    t(pdf, details, tx, y + 39, leftW - (tx - M), { size: 7.2, color: MUTED });
    const title = type === 'quotation' ? 'QUOTATION' : 'INVOICE';
    t(pdf, title, M + leftW, y + 2, CW - leftW, { bold: true, size: 21, color: BLUE_DARK, align: 'right' });
    t(pdf, `${type === 'quotation' ? 'Quotation' : 'Invoice'} No.: ${d.number || '—'}`, M + leftW, y + 29, CW - leftW, { bold: true, size: 8, color: INK, align: 'right' });
    t(pdf, `Date: ${date(d.date)}`, M + leftW, y + 43, CW - leftW, { size: 7.8, color: MUTED, align: 'right' });
    const due = type === 'quotation' ? d.validUntil : d.dueDate;
    if (!continued) t(pdf, `${type === 'quotation' ? 'Valid Until' : 'Due Date'}: ${date(due)}`, M + leftW, y + 56, CW - leftW, { size: 7.8, color: MUTED, align: 'right' });
    y += continued ? 74 : 88; line(pdf, y); y += 14;
  }
  drawTop(false);
  const gap = 16, cardW = (CW - gap) / 2, rightX = M + cardW + gap;
  const customer = d.customer || {};
  const leftLines = [customer.name || 'Walk-in Customer', customer.address, customer.phone, customer.email].filter(Boolean);
  const rightLines = [d.orderReference ? `Reference: ${d.orderReference}` : '', d.servedBy ? `Prepared by: ${d.servedBy}` : '', d.paymentMethod ? `Payment: ${d.paymentMethod}` : '', d.status ? `Status: ${d.status}` : ''].filter(Boolean);
  const leftH = leftLines.reduce((n,v,i)=>n+h(pdf,v,cardW-22,i===0,i===0?10:8)+5, 0); const rightH = rightLines.reduce((n,v)=>n+h(pdf,v,cardW-22,false,8)+5,0);
  const cardH = Math.max(76, 31 + Math.max(leftH,rightH) + 8); need(cardH + 16);
  [[M,'CUSTOMER DETAILS'],[rightX,'DOCUMENT DETAILS']].forEach(([x,label])=>{ pdf.roundedRect(x,y,cardW,cardH,8).fillColor('#f8fafc').fill().strokeColor(LINE).lineWidth(.7).stroke(); t(pdf,label,x+11,y+10,cardW-22,{bold:true,size:7.2,color:BLUE}); });
  let ly=y+30; leftLines.forEach((v,i)=>{const size=i===0?10:8; t(pdf,v,M+11,ly,cardW-22,{bold:i===0,size,color:i===0?INK:MUTED}); ly+=h(pdf,v,cardW-22,i===0,size)+5;});
  let ry=y+30; rightLines.forEach(v=>{t(pdf,v,rightX+11,ry,cardW-22,{size:8,color:MUTED});ry+=h(pdf,v,cardW-22,false,8)+5;});
  y += cardH + 16;
  const cols=[28,230,44,54,92,CW-448], labels=['#','Description','Qty','Unit','Unit Price','Amount'];
  const tableHeader=()=>{ need(25); pdf.rect(M,y,CW,24).fillColor(BLUE_DARK).fill(); let x=M; labels.forEach((v,i)=>{t(pdf,v,x+4,y+7,cols[i]-8,{bold:true,size:7.4,color:'#fff',align:i>=2?'right':'left'});x+=cols[i];}); y+=24; };
  tableHeader();
  items.forEach((item,index)=>{ const desc=[item.description||item.name||'Item',item.sub].filter(Boolean).join('\n'); const values=[String(index+1),desc,formatNumber(item.qty||0),item.unit||'pcs',formatMoney(item.unitPrice||0,currency),formatMoney(calc(item).total,currency)]; const rowH=Math.max(30,...values.map((v,i)=>h(pdf,v,cols[i]-8,i===1,i===1?8.5:7.8)+9)); if(y+rowH>BOTTOM){ addPage(); tableHeader(); } let x=M; values.forEach((v,i)=>{t(pdf,v,x+4,y+6,cols[i]-8,{bold:i===1,size:i===1?8.5:7.8,color:i===1?INK:'#334155',align:i>=2?'right':'left'});x+=cols[i];}); y+=rowH; line(pdf,y); });
  y += 9;
  const summary=[['Subtotal',totals.subtotal],...(totals.discount?[['Discount',totals.discount]]:[]),['VAT / Tax',totals.tax],['GRAND TOTAL',totals.total]]; const sumH=summary.reduce((n,r)=>n+(r[0]==='GRAND TOTAL'?29:20),0); need(sumH+8); const sx=PAGE_W-M-220;
  summary.forEach(([label,value])=>{const grand=label==='GRAND TOTAL',rh=grand?29:20;if(grand)pdf.roundedRect(sx,y,220,rh,4).fillColor(BLUE_DARK).fill();t(pdf,label,sx+10,y+(grand?8:5),95,{bold:grand,size:grand?10:8.2,color:grand?'#fff':INK});t(pdf,formatMoney(value,currency),sx+100,y+(grand?8:5),110,{bold:true,size:grand?10:8.2,color:grand?'#fff':INK,align:'right'});y+=rh;}); y+=13;
  const section=(title,body)=>{if(!body)return;const bh=h(pdf,body,CW,false,8.1),block=14+bh+12;need(block);t(pdf,title,M,y,CW,{bold:true,size:7.5,color:BLUE});y+=14;t(pdf,body,M,y,CW,{size:8.1,color:'#334155'});y+=bh+12;};
  section('NOTES',d.notes); section('TERMS & CONDITIONS',d.terms); section('WARRANTY',d.warranty); section('RETURN POLICY',d.returnPolicy);
  if(type==='quotation' && !d.terms) section('TERMS & CONDITIONS','Prices are in Kenyan Shillings (KES). This quotation is subject to the validity period shown above and stock availability. Delivery and installation may be charged separately where applicable.');
  const sigH=61; need(sigH); const sw=(CW-24)/2; [['Prepared By',d.servedBy||''],['Authorized Signature','']].forEach(([label,value],i)=>{const x=M+i*(sw+24);t(pdf,label,x,y,sw,{bold:true,size:7.6,color:BLUE});if(value)t(pdf,value,x,y+14,sw,{size:8,color:MUTED});pdf.strokeColor('#94a3b8').lineWidth(.6).moveTo(x,y+43).lineTo(x+sw,y+43).stroke();t(pdf,'Signature / Date',x,y+47,sw,{size:7,color:MUTED});}); y+=sigH;
  const range=pdf.bufferedPageRange(); for(let i=0;i<range.count;i++){pdf.switchToPage(i);pdf.rect(0,PAGE_H-25,PAGE_W,3).fillColor(GREEN).fill();t(pdf,'UNIQUE SOLAR KENYA LTD  •  SOLAR  |  ELECTRICAL  |  A BRIGHTER TOMORROW',M,PAGE_H-20,CW,{bold:true,size:6.8,color:BLUE_DARK,align:'center'});t(pdf,`Page ${i+1} of ${range.count}`,M,PAGE_H-10,CW,{size:6.5,color:MUTED,align:'center'});}
  pdf.end(); return new Promise((resolve,reject)=>{pdf.on('end',()=>resolve(Buffer.concat(chunks)));pdf.on('error',reject);});
}
async function renderPdfBuffer(payload,paper='a4') { const a=adaptDocumentPayload(payload,paper); if(!['invoice','quotation'].includes(a.type)) throw new Error(`Unsupported PDF document type: ${a.type}`); return renderDocument({type:a.type,doc:a.doc,company:a.company}); }
module.exports={renderDocument,renderPdfBuffer,loadLogo};
