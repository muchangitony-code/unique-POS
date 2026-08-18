'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const rendererPath = path.join(root, 'server', 'pdf', 'a4-renderer.cjs');
const BUILD_MARKER = 'PDF_SVG_LOGO_PATCH_V2';

function patchPdfRenderer() {
  let source = fs.readFileSync(rendererPath, 'utf8');
  if (source.includes(BUILD_MARKER)) return;

  const loadReplacement = String.raw`async function loadLogo(source) {
  // PDF_SVG_LOGO_PATCH_V1 / PDF_SVG_LOGO_PATCH_V2: safe SVG/PNG/JPEG logo loading.
  const svgText = (value) => {
    const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value || '');
    return /^\s*<svg(?:\s|>)/i.test(text) && Buffer.byteLength(text, 'utf8') <= MAX_LOGO ? text : null;
  };

  if (imageBuffer(source)) return source;
  const raw = String(source || '').trim();
  if (!raw) return null;

  const data = decodeDataImage(raw);
  if (data) return data;

  const svgData = raw.match(/^data:image\/svg\+xml(?:;charset=[^;]+)?;base64,(.+)$/i);
  if (svgData) {
    try {
      const decoded = Buffer.from(svgData[1], 'base64');
      const svg = svgText(decoded);
      if (svg) return svg;
    } catch (_) {}
  }

  if (/^(iVBOR|\/9j\/)/.test(raw)) {
    try {
      const buffer = Buffer.from(raw, 'base64');
      if (buffer.length <= MAX_LOGO && imageBuffer(buffer)) return buffer;
    } catch (_) {}
  }

  const candidates = [];
  if (raw.startsWith('/')) {
    candidates.push(path.join(process.cwd(), 'public', raw.replace(/^\/+/, '')));
    candidates.push(path.join(process.cwd(), raw.replace(/^\/+/, '')));
  } else if (!/^https?:\/\//i.test(raw)) {
    candidates.push(path.join(process.cwd(), raw));
    candidates.push(path.join(process.cwd(), 'public', raw));
  }

  for (const filename of candidates) {
    try {
      const buffer = fs.readFileSync(filename);
      if (buffer.length > MAX_LOGO) continue;
      if (imageBuffer(buffer)) return buffer;
      const svg = svgText(buffer);
      if (svg) return svg;
    } catch (_) {}
  }

  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const response = await fetch(raw, { redirect: 'follow' });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_LOGO) return null;
    if (imageBuffer(buffer)) return buffer;
    const svg = svgText(buffer);
    if (svg) return svg;
    return null;
  } catch (_) {
    return null;
  }
}`;

  const loadPattern = /async function loadLogo\(source\) \{[\s\S]*?\n\}\n\nasync function makeQrBuffer/;
  if (!loadPattern.test(source)) throw new Error('PDF build guard: could not locate loadLogo function');
  source = source.replace(loadPattern, `${loadReplacement}\n\nasync function makeQrBuffer`);

  const drawReplacement = String.raw`function drawLogo(pdf, x, y, size, buffer) {
  pdf.save();
  pdf.strokeColor(C.orangeSoft).lineWidth(.7).roundedRect(x, y, size, size, 7).stroke();
  if (typeof buffer === 'string' && /^\s*<svg(?:\s|>)/i.test(buffer)) {
    try {
      const SVGtoPDF = require('@leduard/svg-to-pdfkit');
      SVGtoPDF(pdf, buffer, x + 4, y + 4, {
        width: size - 8,
        height: size - 8,
        preserveAspectRatio: 'xMidYMid meet'
      });
    } catch (_) {}
  } else if (buffer) {
    try {
      pdf.image(buffer, x + 4, y + 4, { fit: [size - 8, size - 8], align: 'center', valign: 'center' });
    } catch (_) {}
  }
  pdf.restore();
}`;

  const drawPattern = /function drawLogo\(pdf, x, y, size, buffer\) \{[\s\S]*?\n\}\n\nfunction drawTopBar/;
  if (!drawPattern.test(source)) throw new Error('PDF build guard: could not locate drawLogo function');
  source = source.replace(drawPattern, `${drawReplacement}\n\nfunction drawTopBar`);

  fs.writeFileSync(rendererPath, source, 'utf8');
}

function syntaxCheck(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`PDF build guard: syntax check failed for ${file}\n${result.stderr || result.stdout}`);
  }
}

patchPdfRenderer();
syntaxCheck(rendererPath);
require(path.join(root, 'scripts', 'build.cjs'));
