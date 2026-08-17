'use strict';
const { normalizeMpesaPhone, maskMpesaPhone } = require('./phone.cjs');
const { getAccessToken, mpesaBaseUrl } = require('./auth.cjs');
const { initiateStkPush, nairobiTimestamp, stkPassword } = require('./stkPush.cjs');
const { queryStkPush } = require('./query.cjs');
function mpesaConfig(env = process.env) {
  const config = { env: String(env.MPESA_ENV || 'sandbox').toLowerCase(), consumerKey: env.MPESA_CONSUMER_KEY, consumerSecret: env.MPESA_CONSUMER_SECRET, shortcode: env.MPESA_SHORTCODE, passkey: env.MPESA_PASSKEY, callbackUrl: env.MPESA_CALLBACK_URL, transactionType: env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline' };
  if (!['sandbox','production'].includes(config.env)) throw new Error('MPESA_ENV must be sandbox or production.');
  if (!['CustomerPayBillOnline','CustomerBuyGoodsOnline'].includes(config.transactionType)) throw new Error('MPESA_TRANSACTION_TYPE is invalid.');
  if (!config.shortcode || !config.passkey || !config.callbackUrl) throw new Error('M-Pesa shortcode, passkey and callback URL are required.');
  if (!/^https:\/\//i.test(config.callbackUrl)) throw new Error('MPESA_CALLBACK_URL must be a public HTTPS URL.');
  return config;
}
module.exports = { mpesaConfig, normalizeMpesaPhone, maskMpesaPhone, getAccessToken, mpesaBaseUrl, initiateStkPush, queryStkPush, nairobiTimestamp, stkPassword };
