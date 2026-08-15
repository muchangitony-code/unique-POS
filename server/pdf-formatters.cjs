'use strict';

function sanitizeText(value) {
  return String(value == null ? '' : value)
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, '');
}

function numberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatNumber2(value) {
  return numberValue(value).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCurrency2(value, currency = 'KES') {
  const code = sanitizeText(currency || 'KES').toUpperCase() || 'KES';
  return `${code} ${formatNumber2(value)}`;
}

function wrapText(text, font, size, maxWidth) {
  const source = sanitizeText(text).replace(/\r\n?/g, '\n');
  const paragraphs = source.split('\n');
  const lines = [];
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) { lines.push(''); continue; }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        line = word;
      } else {
        let chunk = '';
        for (const ch of Array.from(word)) {
          const next = chunk + ch;
          if (font.widthOfTextAtSize(next, size) <= maxWidth) chunk = next;
          else { if (chunk) lines.push(chunk); chunk = ch; }
        }
        line = chunk;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

module.exports = { sanitizeText, numberValue, formatNumber2, formatCurrency2, wrapText };
