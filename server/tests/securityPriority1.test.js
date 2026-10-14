// Regression tests for Priority-1 security fixes (docs/security-financial-reaudit-2026-10-14.md):
//   M6 - login brute-force protection (per account + per IP), password policy
//   #6 - a wrong CURRENT password on change-password is a 400, not a 401
//        (a 401 makes the client sign the user out)
// No MySQL: config/db is a fake answering the two users queries.
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

process.env.JWT_SECRET = 'p'.repeat(48);

const users = new Map(); // username -> row
const updates = [];
const fakePool = {
  query: async (sql, params = []) => {
    if (/FROM users WHERE username = \?/.test(sql)) return [users.has(params[0]) ? [users.get(params[0])] : []];
    if (/SELECT \* FROM users WHERE id = \?/.test(sql)) return [[...users.values()].filter((u) => u.id === params[0])];
    if (/SELECT token_version FROM users/.test(sql)) return [[{ token_version: 1 }]];
    if (/^UPDATE users SET password/.test(sql.trim())) { updates.push(params); return [{ affectedRows: 1 }]; }
    return [[]];
  }
};
const dbPath = require.resolve('../config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePool };

const throttle = require('../services/loginThrottle');
const { loginUser, changePassword } = require('../controllers/authController');

const addUser = (id, username, password, status = 1) =>
  users.set(username, { id, username, name: username, role: 'Accountant', status, token_version: 0, password: bcrypt.hashSync(password, 4) });
addUser(1, 'accountant1', 'right-pass-1');
addUser(2, 'accountant2', 'right-pass-2');
addUser(3, 'olduser', 'old-pass-3', 0);

const call = async (handler, { body, ip = '10.0.0.1', user } = {}) => {
  const out = { status: 200, body: null, headers: {} };
  const res = {
    status(code) { out.status = code; return res; },
    json(b) { out.body = b; return res; },
    set(k, v) { out.headers[k] = v; return res; }
  };
  await handler({ body, ip, user }, res);
  return out;
};
const login = (username, password, ip) => call(loginUser, { body: { username, password }, ip });

test.beforeEach(() => { throttle.reset(); delete process.env.LOGIN_MAX_FAILURES_PER_IP; });

test('M6: 5 wrong passwords lock that account (429 + Retry-After), even for the right password', async () => {
  for (let i = 0; i < 5; i += 1) assert.equal((await login('accountant1', 'wrong')).status, 401);
  const locked = await login('accountant1', 'right-pass-1');
  assert.equal(locked.status, 429);
  assert.match(locked.body.error, /Too many failed attempts/);
  assert.ok(Number(locked.headers['Retry-After']) > 0);
  // Other accounts are unaffected; the lock is case-insensitive.
  assert.equal((await login('accountant2', 'right-pass-2')).status, 200);
  assert.equal((await login('ACCOUNTANT1', 'right-pass-1')).status, 429);
});

test('M6: a successful login clears the account\'s failures', async () => {
  for (let i = 0; i < 4; i += 1) await login('accountant1', 'wrong');
  assert.equal((await login('accountant1', 'right-pass-1')).status, 200);
  for (let i = 0; i < 4; i += 1) await login('accountant1', 'wrong');
  assert.equal((await login('accountant1', 'right-pass-1')).status, 200, 'still under the limit');
});

test('M6: one IP guessing many usernames is blocked by the per-IP limit', async () => {
  process.env.LOGIN_MAX_FAILURES_PER_IP = '3';
  await login('a', 'x', '10.9.9.9'); await login('b', 'x', '10.9.9.9'); await login('c', 'x', '10.9.9.9');
  assert.equal((await login('accountant2', 'right-pass-2', '10.9.9.9')).status, 429);
  assert.equal((await login('accountant2', 'right-pass-2', '10.1.1.1')).status, 200, 'another IP is fine');
});

test('M6: unknown usernames and inactive accounts do not leak before the password is right', async () => {
  assert.equal((await login('nobody', 'whatever')).status, 401);
  assert.equal((await login('olduser', 'wrong')).status, 401, 'inactive + wrong password = plain 401');
  assert.equal((await login('olduser', 'old-pass-3')).status, 403, 'inactive is only revealed with the right password');
});

test('M6: malformed login bodies are a 400', async () => {
  assert.equal((await call(loginUser, { body: { username: ['x'], password: 'p' } })).status, 400);
  assert.equal((await call(loginUser, { body: { username: 'x' } })).status, 400);
});

const change = (body, userId = 2) => call(changePassword, { body, user: { userId } });

test('#6: a wrong current password is a 400 (never 401, which would sign the user out)', async () => {
  const r = await change({ currentPassword: 'wrong', newPassword: 'brand-new-pass' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'Current password is incorrect');
});

test('M6: new password policy - length, different from current, not the username', async () => {
  assert.equal((await change({ currentPassword: 'right-pass-2', newPassword: 'short' })).status, 400);
  assert.match((await change({ currentPassword: 'right-pass-2', newPassword: 'right-pass-2' })).body.error, /different/);
  assert.match((await change({ currentPassword: 'right-pass-2', newPassword: 'Accountant2' })).body.error, /username/);
  assert.equal((await change({ currentPassword: 'right-pass-2', newPassword: 'x'.repeat(73) })).status, 400);
});

test('M6: a valid change stores a cost-12 bcrypt hash and returns a fresh token', async () => {
  updates.length = 0;
  const r = await change({ currentPassword: 'right-pass-2', newPassword: 'a-much-better-pass' });
  assert.equal(r.status, 200);
  assert.ok(r.body.token);
  assert.match(updates[0][0], /^\$2[aby]\$12\$/);
});

test('M6: guessing the current password through a session is throttled too', async () => {
  for (let i = 0; i < 5; i += 1) await change({ currentPassword: 'wrong', newPassword: 'another-good-pass' }, 1);
  assert.equal((await change({ currentPassword: 'right-pass-1', newPassword: 'another-good-pass' }, 1)).status, 429);
});

// ---------------------------------------------------------------- #3 /uploads
test('#3: /uploads serves only signed, unexpired links to image files', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const express = require('express');
  const { serveSignedUploads, signUploadPath } = require('../utils/signedUploads');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bsms-uploads-'));
  fs.mkdirSync(path.join(root, 'cutlery-assets'));
  fs.writeFileSync(path.join(root, 'cutlery-assets', 'asset-1.png'), 'PNGDATA');
  fs.writeFileSync(path.join(root, 'cutlery-assets', 'evil.html'), '<script>alert(1)</script>');

  const app = express();
  app.use('/uploads', serveSignedUploads(root));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (p) => fetch(base + p);
  try {
    const signed = signUploadPath('/uploads/cutlery-assets/asset-1.png');
    const ok = await get(signed);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), 'PNGDATA');
    assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');

    assert.equal((await get('/uploads/cutlery-assets/asset-1.png')).status, 403, 'no signature');
    assert.equal((await get(signed.replace(/sig=./, 'sig=X'))).status, 403, 'tampered signature');
    const { searchParams } = new URL(base + signed);
    assert.equal((await get(`/uploads/cutlery-assets/asset-2.png?${searchParams}`)).status, 403, 'signature of another file');
    const expired = signUploadPath('/uploads/cutlery-assets/asset-1.png', Date.now() - 10 * 3600 * 1000);
    assert.equal((await get(expired)).status, 403, 'expired link');
    assert.equal((await get(signUploadPath('/uploads/cutlery-assets/evil.html'))).status, 404, 'non-image never served');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('#3: the upload filter refuses a non-image extension even with an image MIME type', () => {
  const routerPath = require.resolve('../routes/cutleryAssets');
  const src = require('fs').readFileSync(routerPath, 'utf8');
  assert.match(src, /ALLOWED_EXTENSIONS\.includes\(ext\)/);
  const { ALLOWED_EXTENSIONS } = require('../utils/signedUploads');
  assert.ok(!ALLOWED_EXTENSIONS.includes('.html') && !ALLOWED_EXTENSIONS.includes('.svg'));
});

// ---------------------------------------------------------------- #4 CORS / headers / body limit
test('#4: CORS only for CORS_ORIGINS; security headers; JSON body limit', async () => {
  const express = require('express');
  const { applyHttpSecurity, allowedOrigins } = require('../middleware/httpSecurity');

  assert.deepEqual(allowedOrigins(undefined), ['http://localhost:3000'], 'default = local dev');
  assert.deepEqual(allowedOrigins(' https://stock.ravonbakers.lk/ , https://cjtradingcompany.lk '),
    ['https://stock.ravonbakers.lk', 'https://cjtradingcompany.lk']);

  const app = express();
  applyHttpSecurity(app, { origins: ['https://stock.ravonbakers.lk'] });
  app.post('/api/echo', (req, res) => res.json({ size: JSON.stringify(req.body).length }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api/echo`;
  const post = (origin, body = {}) => fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body)
  });
  try {
    const good = await post('https://stock.ravonbakers.lk');
    assert.equal(good.headers.get('access-control-allow-origin'), 'https://stock.ravonbakers.lk');
    const evil = await post('https://evil.example');
    assert.equal(evil.headers.get('access-control-allow-origin'), null, 'other origins get no CORS grant');
    const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(preflight.headers.get('access-control-allow-origin'), null);

    assert.equal(good.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(good.headers.get('x-frame-options'), 'DENY');
    assert.equal(good.headers.get('cache-control'), 'no-store');
    assert.match(good.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal(good.headers.get('x-powered-by'), null);

    assert.equal((await post(null, { blob: 'x'.repeat(200 * 1024) })).status, 413, 'bodies over 100kb are refused');
    assert.equal((await post(null, { blob: 'x'.repeat(50 * 1024) })).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
