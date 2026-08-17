'use strict';

let cached = null;

function baseUrl(env) {
  return env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
}

async function getAccessToken(config) {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60000) return cached.token;
  const key = config.consumerKey;
  const secret = config.consumerSecret;
  if (!key || !secret) throw new Error('M-Pesa consumer credentials are not configured.');
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const response = await fetch(`${baseUrl(config.env)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(body.error_description || 'Unable to obtain M-Pesa access token.');
  const expiresIn = Number(body.expires_in || 3600);
  cached = { token: body.access_token, expiresAt: now + Math.max(60000, expiresIn * 1000) };
  return cached.token;
}

function mpesaBaseUrl(env) { return baseUrl(env); }
module.exports = { getAccessToken, mpesaBaseUrl };
