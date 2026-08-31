const crypto = require('node:crypto');

const DEEPGRAM_API = 'https://api.deepgram.com/v1';
const MIN_FREE_CREDIT_USD = Number(process.env.BOOKI_FREE_CREDIT_RESERVE_USD || '1');
const TOKEN_TTL_SECONDS = 60;
const recentRequests = new Map();

function json(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(body));
}

function sameValue(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function originAllowed(request) {
  const origin = request.headers.origin;
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const requestHost = String(request.headers.host || '').toLowerCase();
    if (url.host.toLowerCase() === requestHost) return true;
    return [
      'https://yehuditamos.github.io',
      'https://mitarim-reading.web.app',
      'https://mitarim-reading.firebaseapp.com',
    ].includes(url.origin);
  } catch (_) {
    return false;
  }
}

function withinRateLimit(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || 'unknown');
  const ip = forwarded.split(',')[0].trim();
  const now = Date.now();
  const windowStart = now - 10 * 60 * 1000;
  const previous = (recentRequests.get(ip) || []).filter(time => time > windowStart);
  if (previous.length >= 12) return false;
  previous.push(now);
  recentRequests.set(ip, previous);
  return true;
}

async function deepgram(path, apiKey, options = {}) {
  return fetch(`${DEEPGRAM_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

async function remainingCredit(apiKey) {
  const projectsResponse = await deepgram('/projects', apiKey);
  if (!projectsResponse.ok) throw new Error(`projects_${projectsResponse.status}`);
  const projects = (await projectsResponse.json()).projects || [];
  if (projects.length !== 1 || !projects[0].project_id) throw new Error('project_ambiguous');

  const balanceResponse = await deepgram(`/projects/${encodeURIComponent(projects[0].project_id)}/balances`, apiKey);
  if (!balanceResponse.ok) throw new Error(`balance_${balanceResponse.status}`);
  const balances = (await balanceResponse.json()).balances || [];
  return balances.reduce((total, balance) => {
    const amount = Number(balance.amount);
    return total + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return json(response, 405, { error:'method_not_allowed' });
  if (!originAllowed(request)) return json(response, 403, { error:'private_test_only' });
  if (!withinRateLimit(request)) return json(response, 429, { error:'try_again_later' });

  const apiKey = process.env.DEEPGRAM_API_KEY;
  const expectedCode = process.env.BOOKI_TEST_CODE;
  const suppliedCode = request.headers['x-booki-test-code'];
  if (!apiKey || !expectedCode) return json(response, 503, { error:'test_not_configured' });
  if (!sameValue(suppliedCode, expectedCode)) return json(response, 403, { error:'private_test_only' });

  try {
    // Fail closed: if the free balance cannot be verified, no listening token is issued.
    const creditUsd = await remainingCredit(apiKey);
    if (creditUsd <= MIN_FREE_CREDIT_USD) {
      return json(response, 402, { error:'free_credit_finished' });
    }

    const tokenResponse = await deepgram('/auth/grant', apiKey, {
      method:'POST',
      body:JSON.stringify({ ttl_seconds:TOKEN_TTL_SECONDS }),
    });
    if (tokenResponse.status === 402) return json(response, 402, { error:'free_credit_finished' });
    if (!tokenResponse.ok) throw new Error(`grant_${tokenResponse.status}`);
    const token = await tokenResponse.json();
    return json(response, 200, {
      accessToken:token.access_token,
      expiresIn:token.expires_in,
      remainingCreditUsd:Math.floor(creditUsd * 100) / 100,
    });
  } catch (error) {
    console.error('Booki token broker error:', error?.message || error);
    return json(response, 503, { error:'listening_service_unavailable' });
  }
};
