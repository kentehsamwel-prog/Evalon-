// This function runs on Netlify's server, NOT in the visitor's browser.
// That means your PARTNER_ID and API_TOKEN stay hidden from anyone viewing
// your site's source code — only this server-side function can see them.
//
// DEBUGGING: once this is connected via GitHub, go to your Netlify project
// -> Functions -> check-id -> you'll see real invocation logs there,
// including every console.log/console.error below. That will finally show
// us exactly what's failing (wrong hash, wrong URL, network error, etc).
//
// IMPORTANT (security): once things are working, move PARTNER_ID and
// API_TOKEN into Netlify's Environment Variables (Site configuration ->
// Environment variables) instead of leaving the real values hardcoded here.

const crypto = require('crypto');
const https = require('https');

const PARTNER_ID = process.env.PARTNER_ID || '858680';
const API_TOKEN = process.env.API_TOKEN || '0lNHhVt8trByyUNZncA5';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    }).on('error', reject);
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const userId = event.queryStringParameters && event.queryStringParameters.user_id
    ? event.queryStringParameters.user_id.trim()
    : '';

  const debugMode = event.queryStringParameters && event.queryStringParameters.debug === '1';

  if (!userId) {
    console.error('[check-id] missing user_id in request');
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: 'missing_user_id' })
    };
  }

  try {
    const hash = crypto
      .createHash('md5')
      .update(`${userId}:${PARTNER_ID}:${API_TOKEN}`)
      .digest('hex');

    const url = `https://affiliate.pocketoption.com/api/user-info/${encodeURIComponent(userId)}/${PARTNER_ID}/${hash}`;
    console.log('[check-id] requesting:', url);

    const upstream = await httpsGet(url);
    console.log('[check-id] upstream status:', upstream.statusCode);
    console.log('[check-id] upstream body (first 300 chars):', upstream.body.slice(0, 300));

    let data;
    try { data = JSON.parse(upstream.body); } catch (e) {
      console.error('[check-id] JSON parse failed:', e.message);
      data = null;
    }

    const upstreamOk = upstream.statusCode >= 200 && upstream.statusCode < 300;

    if (!upstreamOk || !data) {
      const failResponse = { ok: false, registered: false, reason: 'not_found_or_upstream_error' };
      if (debugMode) {
        failResponse.debug = {
          upstream_status: upstream.statusCode,
          upstream_body_snippet: upstream.body.slice(0, 300),
          url_used: url
        };
      }
      return { statusCode: 200, headers, body: JSON.stringify(failResponse) };
    }

    function pick(obj, ...aliases) {
      const keys = Object.keys(obj);
      for (const alias of aliases) {
        const found = keys.find(k => k.toLowerCase().replace(/[\s_]/g,'') === alias.toLowerCase().replace(/[\s_]/g,''));
        if (found !== undefined) return obj[found];
      }
      return undefined;
    }

    const safeData = {
      uid: pick(data, 'uid', 'user_id'),
      reg_date: pick(data, 'reg_date', 'registration_date'),
      country: pick(data, 'country'),
      verified: pick(data, 'verified'),
      status: pick(data, 'status')
    };

    const countDeposits = pick(data, 'count_of_deposits');
    const ftdAmount = pick(data, 'ftd_amount');
    const n = (v) => { const num = parseFloat(v); return isNaN(num) ? 0 : num; };
    safeData.has_deposited = n(countDeposits) > 0 || n(ftdAmount) > 0;

    console.log('[check-id] success for user_id:', userId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, registered: true, data: safeData })
    };
  } catch (err) {
    console.error('[check-id] exception:', err.message);
    const errResponse = { ok: false, error: 'server_error' };
    if (debugMode) errResponse.debug = { message: err.message };
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(errResponse)
    };
  }
};
