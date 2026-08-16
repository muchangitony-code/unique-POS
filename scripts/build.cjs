'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const fontDir = path.join(root, 'assets', 'fonts');
const regular = path.join(fontDir, 'DejaVuSans.ttf');
const bold = path.join(fontDir, 'DejaVuSans-Bold.ttf');
const sourceBundle = path.join(root, 'index.cjs');
const runtimeBundle = path.join(root, 'index.runtime.cjs');
const pdfRenderer = path.join(root, 'server', 'pdf', 'index.cjs');

for (const file of [regular, bold]) {
  if (!fs.existsSync(file)) throw new Error(`Missing PDF font: ${file}`);
  if (!fs.statSync(file).isFile() || fs.statSync(file).size === 0) throw new Error(`Invalid PDF font: ${file}`);
}

if (!fs.existsSync(sourceBundle)) throw new Error(`Missing application bundle: ${sourceBundle}`);

// Keep long company names from colliding with address/contact lines in PDF headers.
function fixPdfHeaderLayout() {
  if (!fs.existsSync(pdfRenderer)) return;
  const source = fs.readFileSync(pdfRenderer, 'utf8');
  const start = source.indexOf('function header(pdf,data){');
  const end = source.indexOf('\n\nfunction tableHeader', start);
  if (start < 0 || end < 0) return;
  const replacement = `function header(pdf,data){\n const top=20; pdf.fillColor(COLORS.accent).rect(0,0,A4.width,5).fill(); drawLogo(pdf,M,top+1,62);\n const companyX=M+76, companyW=245;\n const companyName=data.company.name||'Unique Solar Kenya Ltd';\n pdf.font('bold').fontSize(12.5);\n const nameHeight=Math.max(16,pdf.heightOfString(String(companyName),{width:companyW,lineGap:0}));\n text(pdf,companyName,companyX,top+3,{font:'bold',size:12.5,color:COLORS.accent,width:companyW});\n let infoY=top+3+nameHeight+7;\n if(data.company.address){ text(pdf,data.company.address,companyX,infoY,{size:7.6,color:COLORS.muted,width:companyW}); infoY+=13; }\n const contact=[data.company.phone,data.company.email].filter(Boolean).join('  ·  ');\n if(contact){ text(pdf,contact,companyX,infoY,{size:7.6,color:COLORS.muted,width:companyW}); infoY+=13; }\n if(data.company.taxId) text(pdf,\`Tax ID: \${data.company.taxId}\`,companyX,infoY,{size:7.6,color:COLORS.muted,width:companyW});\n const cardW=175,cardH=76,cardX=A4.width-M-cardW,cardY=top;\n pdf.fillColor(COLORS.accent).roundedRect(cardX,cardY,cardW,cardH,5).fill();\n text(pdf,data.type==='invoice'?'INVOICE':'QUOTATION',cardX+12,cardY+10,{font:'bold',size:13.5,color:COLORS.white,width:cardW-24});\n text(pdf,data.number,cardX+12,cardY+31,{size:8.5,color:COLORS.white,width:cardW-24});\n text(pdf,\`Date: \${data.date}\`,cardX+12,cardY+45,{size:8,color:COLORS.white,width:cardW-24});\n text(pdf,\`\${data.type==='invoice'?'Due date':'Valid until'}: \${data.type==='invoice'?data.dueDate||'—':data.validUntil||'—'}\`,cardX+12,cardY+58,{size:8,color:COLORS.white,width:cardW-24});\n const customerY=103,customerH=58;\n pdf.fillColor(COLORS.soft).strokeColor(COLORS.line).lineWidth(.6).roundedRect(M,customerY,CONTENT_W,customerH,4).fillAndStroke();\n text(pdf,'CUSTOMER',M+12,customerY+8,{font:'bold',size:7.5,color:COLORS.accent});\n text(pdf,data.customer.name,M+12,customerY+22,{font:'bold',size:10.5,width:300});\n const details=[data.customer.address,data.customer.phone,data.customer.email,data.customer.taxId?\`Tax ID: \${data.customer.taxId}\`:''].filter(Boolean).join('  ·  ');\n if(details) text(pdf,details,M+12,customerY+38,{size:7.3,color:COLORS.muted,width:CONTENT_W-100});\n const status=data.type==='invoice'?'UNPAID':'VALID'; pdf.fillColor(COLORS.white).strokeColor(COLORS.accent).roundedRect(A4.width-M-78,customerY+18,66,20,10).fillAndStroke(); text(pdf,status,A4.width-M-74,customerY+24,{font:'bold',size:6.8,color:COLORS.accent,width:58,align:'center'});\n return customerY+customerH+10;\n}`;
  fs.writeFileSync(pdfRenderer, source.slice(0,start) + replacement + source.slice(end), 'utf8');
}

fixPdfHeaderLayout();

const bundleAssets = path.join(root, 'build', 'assets', 'fonts');
fs.mkdirSync(bundleAssets, { recursive: true });
for (const file of [regular, bold]) fs.copyFileSync(file, path.join(bundleAssets, path.basename(file)));

function buildRuntimeBundle() {
  const source = fs.readFileSync(sourceBundle, 'utf8');
  const startMarker = 'async function renderPdfBuffer(payload, paper) {';
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error('Bundled index.cjs does not expose the PDF renderer marker');

  const endMarkers = [
    'router17.get(\\"/documents/:type/:id/preview\\"',
    'router17.get("/documents/:type/:id/preview"'
  ];
  const end = endMarkers.map((marker) => source.indexOf(marker, start)).find((index) => index >= 0);
  if (end == null) throw new Error('Bundled index.cjs does not expose the document preview route marker');

  let transformed = source.slice(0, start) +
    'async function renderPdfBuffer(payload, paper) {\n' +
    '  return await require("./server/pdf/index.cjs").renderPdfBuffer(payload, paper);\n' +
    '}\n' +
    source.slice(end);

  const oldHeaders = 'const fileBase = `${type}-${payload.documentNumber || id}`.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");\n    const disposition = String(req.query.disposition || "").toLowerCase() === "attachment" || String(req.query.download || "") === "1" ? "attachment" : "inline";\n    res.setHeader("Content-Type", "application/pdf");\n    res.setHeader("Content-Disposition", `${disposition}; filename="${fileBase}.pdf"`);';
  const newHeaders = 'const fileBase = String(payload.documentNumber || id).replace(/[^a-zA-Z0-9._-]+/g, "-");\n    res.setHeader("Content-Type", "application/pdf");\n    res.setHeader("Content-Disposition", `inline; filename="${fileBase}.pdf"`);';
  transformed = transformed.replace(oldHeaders, newHeaders);

  const oldError = 'console.error("[documents.pdf] Failed to generate PDF", error40);\n    res.status(500).json({ error: "Unable to generate document PDF." });';
  const newError = 'logger.error({ err: error40 }, "[documents.pdf] Failed to generate PDF");\n    const detail = error40 && error40.message ? String(error40.message) : "Unable to generate document PDF.";\n    if (error40?.statusCode === 400 || error40?.status === 400) res.status(400).json({ error: detail });\n    else res.status(500).json({ error: detail });';
  transformed = transformed.replace(oldError, newError);

  fs.writeFileSync(runtimeBundle, transformed, 'utf8');
}

buildRuntimeBundle();

const requiredFiles = [
  'app.js', 'index.cjs', 'product-bulk.cjs', 'public/index.html', 'public/app.js', 'public/styles.css', 'public/quotation-custom-items.js',
  'server/pdf/index.cjs', 'server/pdf/schema.cjs', 'server/pdf/format.js', 'server/pdf/fonts.cjs', 'server/pdf/bundle-loader.cjs',
  'scripts/bootstrap-db.cjs', 'scripts/database-url.cjs', 'scripts/run-migrations.cjs', 'scripts/schema-config.cjs', 'scripts/sql-utils.cjs', 'scripts/validate-startup-env.cjs',
  'assets/fonts/DejaVuSans.ttf', 'assets/fonts/DejaVuSans-Bold.ttf', 'assets/fonts/LICENSE.txt', 'index.runtime.cjs'
];
for (const file of requiredFiles) if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing required runtime file: ${file}`);
for (const file of requiredFiles.filter((file) => file.endsWith('.js') || file.endsWith('.cjs'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`[build] PDF fonts verified; deterministic runtime bundle generated at ${runtimeBundle}`);
