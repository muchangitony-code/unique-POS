'use strict';
const { getAccessToken, mpesaBaseUrl } = require('./auth.cjs');
const { nairobiTimestamp, stkPassword } = require('./stkPush.cjs');

async function queryStkPush(config, { checkoutRequestId }) {
  const timestamp = nairobiTimestamp();
  const token = await getAccessToken(config);
  const payload = { BusinessShortCode: config.shortcode, Password: stkPassword(config.shortcode, config.passkey, timestamp), Timestamp: timestamp, CheckoutRequestID: checkoutRequestId };
  const response = await fetch(`${mpesaBaseUrl(config.env)}/mpesa/stkpushquery/v1/query`, { method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, body:JSON.stringify(payload) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.errorMessage || body.errorCode || 'M-Pesa status query failed.');
  return body;
}
module.exports = { queryStkPush };
