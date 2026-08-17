'use strict';

function normalizeMpesaPhone(input) {
  const raw = String(input ?? '').trim().replace(/[\s()-]/g, '');
  let digits = raw.startsWith('+') ? raw.slice(1) : raw;
  if (/^0[17]\d{8}$/.test(digits)) digits = `254${digits.slice(1)}`;
  else if (/^[17]\d{8}$/.test(digits)) digits = `254${digits}`;
  if (!/^254[17]\d{8}$/.test(digits)) throw new Error('Enter a valid Kenyan M-Pesa mobile number, e.g. 0712345678.');
  return digits;
}
function maskMpesaPhone(phone) {
  const p = String(phone || '');
  return p.length >= 7 ? `${p.slice(0, 4)}…${p.slice(-3)}` : '****';
}
module.exports = { normalizeMpesaPhone, maskMpesaPhone };
