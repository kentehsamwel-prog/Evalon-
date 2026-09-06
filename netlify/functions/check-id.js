// This function runs on Netlify's server, NOT in the visitor's browser.
// That means your API_TOKEN stays hidden from anyone viewing your site's
// source code — only this server-side function can see it.
//
// UPDATED: new PocketPartners v1 endpoint with Bearer token auth,
// and a fresh API token issued by their support team (ticket #1418164).
//
// DEBUGGING: go to your Netlify/Cloudflare project -> Functions ->
// check-id -> real invocation logs, including every console.log below.
//
// IMPORTANT (security): move API_TOKEN into your host's Environment
// Variables instead of leaving the real value hardcoded here, once
// everything is confirmed working.

const https = require('https');

const PARTNER_ID = process.env.PARTNER_ID || '858680';
const API_TOKEN = process.env.API_TOKEN || 'ikY0U2dLzG1k1rttqtCq';

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
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
    const url = `https://pocketpartners.com/api/v1/user-info/${encodeURIComponent(userId)}/${PARTNER_ID}`;
    console.log('[check-id] requesting:', url);

    const upstream = await httpsGet(url, {
      'User-Agent': 'Mozilla/5.0',
      'Authorization': `Bearer ${API_TOKEN}`
    });

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
      uid: pick(data, 'uid', 'user_id', 'trader_id'),
      reg_date: pick(data, 'reg_date', 'registration_date', 'registered_at'),
      country: pick(data, 'country'),
      verified: pick(data, 'verified', 'kyc_verified'),
      status: pick(data, 'status', 'account_status'),
      balance: pick(data, 'balance'),
      total_deposits: pick(data, 'total_deposits', 'deposits'),
      total_withdrawals: pick(data, 'total_withdrawals', 'withdrawals'),
      commission: pick(data, 'commission'),
      campaign: pick(data, 'campaign', 'campaign_info'),
      offer_type: pick(data, 'offer_type', 'offertype')
    };

    const countDeposits = pick(data, 'count_of_deposits', 'deposits_count');
    const ftdAmount = pick(data, 'ftd_amount', 'first_deposit_amount');
    const n = (v) => { const num = parseFloat(v); return isNaN(num) ? 0 : num; };
    safeData.has_deposited = n(countDeposits) > 0 || n(ftdAmount) > 0 || n(safeData.total_deposits) > 0;

    console.log('[check-id] success for user_id:', userId);

    const result = { ok: true, registered: true, data: safeData };
    if (debugMode) {
      result.debug = { raw_upstream_body: data };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
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
