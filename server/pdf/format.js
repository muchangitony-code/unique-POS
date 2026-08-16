'use strict';

const CURRENCIES = { KES: { symbol: 'KSh', before: false }, USD: { symbol: '$', before: true }, EUR: { symbol: '€', before: true }, GBP: { symbol: '£', before: true }, ZAR: { symbol: 'R', before: true }, UGX: { symbol: 'USh', before: false }, TZS: { symbol: 'TSh', before: false }, NGN: { symbol: '₦', before: true }, INR: { symbol: '₹', before: true } };
function moneyFromInput(value) {
  const s = String(value ?? '0').trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) throw new Error(`Invalid money value: ${value}`);
  const neg = s[0] === '-';
  const raw = neg ? s.slice(1) : s;
  const [whole, frac = ''] = raw.split('.');
  let cents = Number(`${whole}${(frac + '00').slice(0, 2)}`);
  if (frac.length > 2 && Number(frac[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) throw new Error('Money value exceeds safe integer range');
  return neg ? -cents : cents;
}
function mulCents(cents, qty) { const q = String(qty); if (!/^\d+(?:\.\d+)?$/.test(q)) throw new Error(`Invalid quantity: ${qty}`); const [w, f = ''] = q.split('.'); const qInt = Number(`${w}${f.slice(0, 4).padEnd(4, '0')}`); const value = Math.round((cents * qInt) / 10000); if (!Number.isSafeInteger(value)) throw new Error('Line total exceeds safe integer range'); return value; }
function taxCents(base, rate) { const r = String(rate ?? '0'); if (!/^\d+(?:\.\d+)?$/.test(r)) throw new Error(`Invalid tax rate: ${rate}`); const [w, f = ''] = r.split('.'); const rateInt = Number(`${w}${f.slice(0, 4).padEnd(4, '0')}`); return Math.round((base * rateInt) / 1000000); }
function groupDigits(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function formatMoney(cents, currency = 'KES') { if (!Number.isInteger(cents)) throw new Error('formatMoney expects integer cents'); const cfg = CURRENCIES[String(currency).toUpperCase()] || { symbol: String(currency).toUpperCase(), before: false }; const neg = cents < 0; const abs = Math.abs(cents); const whole = groupDigits(String(Math.floor(abs / 100))); const frac = String(abs % 100).padStart(2, '0'); const amount = `${whole}.${frac}`; const body = cfg.before ? `${cfg.symbol}${amount}` : `${cfg.symbol} ${amount}`; return neg ? `-${body}` : body; }
function formatNumber(value) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value); }
module.exports = { moneyFromInput, mulCents, taxCents, formatMoney, formatNumber };
