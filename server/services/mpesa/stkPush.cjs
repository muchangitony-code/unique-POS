'use strict';
const { getAccessToken, mpesaBaseUrl } = require('./auth.cjs');

function nairobiTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(date);
  const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${v.year}${v.month}${v.day}${v.hour}${v.minute}${v.second}`;
}
function stkPassword(shortcode, passkey, timestamp) {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}
function accountReference(value) {
  const s = String(value || 'INVOICE').replace(/[^A-Za-z0-9_-]/g, '');
  return (s || 'INVOICE').slice(0, 12);
}
async function initiateStkPush(config, { phone, amountKes, invoiceNumber }) {
  const timestamp = nairobiTimestamp();
  const token = await getAccessToken(config);
  const payload = {
    BusinessShortCode: config.shortcode,
    Password: stkPassword(config.shortcode, config.passkey, timestamp),
    Timestamp: timestamp,
    TransactionType: config.transactionType,
    Amount: Math.trunc(amountKes),
    PartyA: phone,
    PartyB: config.shortcode,
    PhoneNumber: phone,
    CallBackURL: config.callbackUrl,
    AccountReference: accountReference(invoiceNumber),
    TransactionDesc: `Invoice ${accountReference(invoiceNumber)}`
  };
  const response = await fetch(`${mpesaBaseUrl(config.env)}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ResponseCode !== '0') throw new Error(body.errorMessage || body.ResponseDescription || 'M-Pesa STK Push could not be initiated.');
  return body;
}
module.exports = { initiateStkPush, nairobiTimestamp, stkPassword };
