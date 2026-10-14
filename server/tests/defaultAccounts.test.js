// No accounts with passwords written in the source (found 2026-10-14):
// config/db.js used to (re)create seven logins - admin, superadmin,
// accountants, finance... - with plain-text passwords on every server start,
// and re-activated "finance" whenever it was disabled. Accounts are now made
// with scripts/createUser.js (password typed at a hidden prompt).
require('./helpers/noDatabase');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { passwordProblem, parseArgs, createOrReset, PASSWORD_MIN, ROLES } = require('../scripts/createUser');

test('config/db.js creates no accounts and holds no passwords', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'config', 'db.js'), 'utf8');
  assert.doesNotMatch(src, /password:\s*'[^']+'/, 'no password literals');
  assert.doesNotMatch(src, /INSERT INTO users/i, 'no account creation at start-up');
  assert.doesNotMatch(src, /UPDATE users SET[^`'"]*status\s*=\s*1/i, 'no forced re-activation of a disabled account');
});

test('the script uses the same minimum length as Change Password', () => {
  const auth = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'authController.js'), 'utf8');
  assert.match(auth, new RegExp(`PASSWORD_MIN = ${PASSWORD_MIN};`));
  assert.equal(passwordProblem('short', 'x') !== null, true);
  assert.equal(passwordProblem('x'.repeat(73), 'x') !== null, true, '> 72 bytes');
  assert.match(passwordProblem('Finance1', 'finance1'), /username/);
  assert.equal(passwordProblem('a-good-pass', 'finance'), null);
});

test('arguments: no password on the command line, a valid role, reset mode', () => {
  assert.throws(() => parseArgs(['--username', 'x', '--role', 'Admin', '--password', 'secret123']), /Never pass a password/);
  assert.throws(() => parseArgs(['--username', 'x', '--password=secret123']), /Never pass a password/);
  assert.throws(() => parseArgs(['--username', 'x', '--role', 'Admin']), /--username: 2-100/);
  assert.throws(() => parseArgs(['--username', 'xy', '--role', 'God']), /--role must be one of/);
  assert.throws(() => parseArgs(['--role', 'Admin']), /--username is required/);
  assert.deepEqual(parseArgs(['--username', 'acc1', '--role', 'Accountant']),
    { reset: false, username: 'acc1', role: 'Accountant', name: 'acc1' });
  assert.deepEqual(parseArgs(['--username', 'finance', '--reset-password']), { reset: true, username: 'finance' });
  assert.ok(!ROLES.includes('Staff'), 'legacy roles without permissions are not offered');
});

const fakeDb = (rows) => {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/^SELECT id, role FROM users/.test(sql)) return [rows.filter((r) => r.username === params[0])];
      return [{ affectedRows: 1, insertId: 99 }];
    }
  };
};
const hash = async (pw, cost) => `hashed(${cost}):${pw.length}`;

test('create: stores only a cost-12 hash; an existing username is refused', async () => {
  const db = fakeDb([]);
  const msg = await createOrReset(db, { username: 'acc1', name: 'Accountant 1', role: 'Accountant', reset: false }, 'a-long-password', { hash });
  assert.match(msg, /Created "acc1" \(Accountant\)/);
  const insert = db.calls.find((c) => /^INSERT INTO users/.test(c.sql));
  assert.equal(insert.params[2], 'hashed(12):15');
  assert.ok(!JSON.stringify(db.calls).includes('a-long-password'), 'the plain password never reaches SQL');
  await assert.rejects(createOrReset(fakeDb([{ id: 1, username: 'acc1', role: 'Accountant' }]),
    { username: 'acc1', name: 'x', role: 'Accountant', reset: false }, 'a-long-password', { hash }), /already exists/);
});

test('reset: replaces the hash and signs the user out everywhere', async () => {
  const db = fakeDb([{ id: 7, username: 'finance', role: 'Finance' }]);
  const msg = await createOrReset(db, { username: 'finance', reset: true }, 'new-finance-pass', { hash });
  assert.match(msg, /signed out/);
  const update = db.calls.find((c) => /^UPDATE users SET password/.test(c.sql));
  assert.match(update.sql, /token_version = token_version \+ 1/);
  assert.deepEqual(update.params, ['hashed(12):16', 7]);
  await assert.rejects(createOrReset(fakeDb([]), { username: 'ghost', reset: true }, 'new-finance-pass', { hash }), /No user/);
});
