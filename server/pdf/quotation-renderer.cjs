'use strict';
const PDFDocument=require('pdfkit');
const {adaptDocumentPayload}=require('./document-adapter.cjs');
const {formatMoney,formatNumber,moneyFromInput,mulCents,taxCents}=require('./format');
const {registerFonts}=require('./fonts.cjs');
const M=40,FOOTER=30;
function calc(i){const gross=mulCents(moneyFromInput(i.unitPrice),i.qty||0),discount=moneyFromInput(i.discount||0),net=Math.max(0,gross-discount),tax=taxCents(net,i.taxRate||0);return{gross,discount,tax,total:net+tax};}
function renderPdfBuffer(payload,paper='a4'){
 const a=adaptDocumentPayload(payload,paper);if(a.type!=='quotation')throw new Error('quotation-renderer only supports quotations');
 const d=a.doc||{},c=a.company||{},currency=d.currency||'KES',items=Array.isArray(d.items)?d.items:[];
 const totals=items.reduce((s,i)=>{const r=calc(i);s.subtotal+=r.gross;s.discount+=r.discount;s.tax+=r.tax;s.total+=r.total;return s;},{subtotal:0,discount:0,tax:0,total:0});
 registerFonts();const pdf=new PDFDocument({size:'A4',margin:M,bufferPages:true}),chunks=[];pdf.on('data',x=>chunks.push(x));
 const W=pdf.page.width,H=pdf.page.height,CW=W-M*2,BOTTOM=H-M-FOOTER;let y=M;
 const set=o=>pdf.font(o.bold?'Helvetica-Bold':'Helvetica').fontSize(o.size||9);
 const h=(v,w,o={})=>{set(o);return Math.ceil(pdf.heightOfString(String(v??''),{width:w,align:o.align||'left',lineGap:o.lineGap||0}));};
 const text=(v,x,top,w,o={})=>{set(o).fillColor(o.color||'#172033').text(String(v??''),x,top,{width:w,align:o.align||'left',lineGap:o.lineGap||0});};
 const newPage=()=>{pdf.addPage();y=M;};const need=n=>{if(y+n>BOTTOM)newPage();};const rule=top=>pdf.strokeColor('#d5dce6').lineWidth(.6).moveTo(M,top).lineTo(W-M,top).stroke();
 // Header contains only fixed-size identity fields.
 const lw=CW*.58,rw=CW-lw,rx=M+lw,name=c.name||'Company',companyLines=[c.address,c.phone,c.email,c.website,c.taxId&&`KRA PIN: ${c.taxId}`].filter(Boolean);
 const companyH=h(name,lw-12,{bold:true,size:17})+6+companyLines.reduce((n,v)=>n+h(v,lw-12,{size:8.5})+2,0),headerH=Math.max(companyH,82)+16;need(headerH);const hy=y;text(name,M,hy,lw-12,{bold:true,size:17});let yy=hy+h(name,lw-12,{bold:true,size:17})+6;for(const v of companyLines){text(v,M,yy,lw-12,{size:8.5,color:'#526176'});yy+=h(v,lw-12,{size:8.5})+2;}text('QUOTATION',rx,hy,rw,{bold:true,size:20,align:'right'});let qy=hy+32;[`Quote No: ${d.number||'—'}`,`Date: ${d.date||'—'}`,`Valid Until: ${d.validUntil||'—'}`].forEach(v=>{text(v,rx,qy,rw,{bold:true,size:8.5,align:'right'});qy+=16;});y=hy+headerH-8;rule(y);y+=16;
 // Two measured cards. Long terms are deliberately excluded from these cards.
 const gap=18,cardW=(CW-gap)/2,card2X=M+cardW+gap,customer=d.customer||{};
 const left=[customer.name||'Walk-in Customer',customer.address,customer.phone,customer.email].filter(Boolean),right=[`Quote No: ${d.number||'—'}`,d.orderReference?`Reference: ${d.orderReference}`:null,`Currency: ${currency}`].filter(Boolean);
 const cardBody=(arr,first)=>arr.reduce((n,v,i)=>n+h(v,cardW-24,{bold:first&&i===0,size:first&&i===0?11:8.5})+5,0);
 const cardH=Math.max(92,36+Math.max(cardBody(left,true),cardBody(right,false))+14);need(cardH+18);const cardY=y;
 for(const [x,title] of [[M,'BILL TO'],[card2X,'DOCUMENT INFORMATION']]){pdf.roundedRect(x,cardY,cardW,cardH,12).lineWidth(.8).strokeColor('#d5dce6').stroke();text(title,x+12,cardY+14,cardW-24,{bold:true,size:8,color:'#40536b'});}
 yy=cardY+36;left.forEach((v,i)=>{const o={bold:i===0,size:i===0?11:8.5,color:i===0?'#172033':'#526176'};text(v,M+12,yy,cardW-24,o);yy+=h(v,cardW-24,o)+5;});qy=cardY+36;right.forEach(v=>{text(v,card2X+12,qy,cardW-24,{size:8.5});qy+=h(v,cardW-24,{size:8.5})+5;});y=cardY+cardH+18;
 // Table geometry sums exactly to available content width and starts after the complete card boundary.
 const cols=[30,225,45,55,100,CW-455],labels=['#','Description','Qty','Unit','Unit Price','Total'];
 const tableHeader=()=>{need(26);pdf.rect(M,y,CW,24).fillColor('#24496f').fill();let x=M;labels.forEach((v,i)=>{text(v,x+4,y+7,cols[i]-8,{bold:true,size:7.5,color:'#ffffff',align:i>=2?'right':'left'});x+=cols[i];});y+=24;};tableHeader();
 items.forEach((item,index)=>{const desc=[item.description||item.name||'Item',item.sub].filter(Boolean).join('\n'),values=[String(index+1),desc,formatNumber(item.qty||0),item.unit||'pcs',formatMoney(item.unitPrice||0,currency),formatMoney(calc(item).total,currency)];const rowH=Math.max(32,...values.map((v,i)=>h(v,cols[i]-8,{bold:i===1,size:i===1?8.5:8,align:i>=2?'right':'left'})+10));if(y+rowH>BOTTOM){newPage();tableHeader();}let x=M;values.forEach((v,i)=>{text(v,x+4,y+6,cols[i]-8,{bold:i===1,size:i===1?8.5:8,align:i>=2?'right':'left',color:i===1?'#172033':'#344257'});x+=cols[i];});y+=rowH;rule(y);});
 const summary=[['Subtotal',totals.subtotal],...(totals.discount?[['Discount',totals.discount]]:[]),['VAT',totals.tax],['GRAND TOTAL',totals.total]],summaryH=summary.reduce((n,r)=>n+(r[0]==='GRAND TOTAL'?28:20),22);need(summaryH);y+=8;const sx=W-M-220;summary.forEach(([label,value])=>{const grand=label==='GRAND TOTAL',rh=grand?28:20;if(grand)pdf.strokeColor('#24496f').lineWidth(1).moveTo(sx,y).lineTo(W-M,y).stroke();text(label,sx,y+5,90,{bold:grand,size:grand?10:8.5});text(formatMoney(value,currency),sx+90,y+5,130,{bold:grand,size:grand?10:8.5,align:'right'});y+=rh;});y+=14;
 // Every long-text section is full width and measured before drawing.
 const section=(title,body)=>{if(!body)return;const th=h(title,CW,{bold:true,size:8}),bh=h(body,CW,{size:8.5}),block=th+5+bh+14;need(block);text(title,M,y,CW,{bold:true,size:8,color:'#40536b'});y+=th+5;text(body,M,y,CW,{size:8.5,color:'#344257'});y+=bh+14;};
 section('NOTES',d.notes);section('TERMS & CONDITIONS',d.terms);section('WARRANTY',d.warranty);section('RETURN POLICY',d.returnPolicy);
 const sigH=68;need(sigH);const sg=14,sw=(CW-sg*2)/3;['Prepared By','Customer Acceptance','Approved By'].forEach((label,i)=>{const x=M+i*(sw+sg);text(label,x,y,sw,{bold:true,size:8});pdf.strokeColor('#94a3b8').lineWidth(.6).moveTo(x,y+44).lineTo(x+sw,y+44).stroke();text('Signature / Date',x,y+48,sw,{size:7.2,color:'#64748b'});});y+=sigH;
 const pay=d.paymentDetails||{},paymentLines=[pay.paybill&&`M-PESA Paybill: ${pay.paybill}`,pay.till&&`M-PESA Till: ${pay.till}`,pay.account&&`Account No.: ${pay.account}`,pay.bank&&`Bank: ${pay.bank}`].filter(Boolean);if(paymentLines.length)section('HOW TO PAY',paymentLines.join('\n'));
 const range=pdf.bufferedPageRange();for(let i=0;i<range.count;i++){pdf.switchToPage(i);text(`Page ${i+1} of ${range.count}`,M,H-22,CW,{size:7,color:'#64748b',align:'center'});}pdf.end();return new Promise((resolve,reject)=>{pdf.on('end',()=>resolve(Buffer.concat(chunks)));pdf.on('error',reject);});
}
module.exports={renderPdfBuffer};
