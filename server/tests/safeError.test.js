require('./helpers/noDatabase');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ClientError, sendServerError } = require('../utils/safeError');

// Audit R9b: a 500 must not carry the database's own error text.

const fakeRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

test('an unexpected error answers with a fixed message, not the database text', () => {
  const error = Object.assign(new Error("Table 'ravonbakers_stock.purchases' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' });
  const log = console.error;
  console.error = () => {};
  const res = fakeRes();
  try { sendServerError(res, error, 'test'); } finally { console.error = log; }
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Server error' });
  assert.doesNotMatch(JSON.stringify(res.body), /purchases|ravonbakers|ER_NO_SUCH_TABLE/);
});

test('the detail still goes to the server log', () => {
  const lines = [];
  const log = console.error;
  console.error = (...args) => lines.push(args);
  try { sendServerError(fakeRes(), new Error('boom'), 'Error saving thing'); } finally { console.error = log; }
  assert.equal(lines.length, 1);
  assert.equal(lines[0][0], 'Error saving thing:');
  assert.equal(lines[0][1].message, 'boom');
});

test('a ClientError keeps its own text and status', () => {
  const res = fakeRes();
  sendServerError(res, new ClientError('Purchase return not found', 404));
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Purchase return not found' });
  const bad = fakeRes();
  sendServerError(bad, new ClientError('Supplier ID is required'));
  assert.equal(bad.statusCode, 400);
});

test('no controller or route sends error.message in a 500 any more', () => {
  const root = path.join(__dirname, '..');
  const offenders = [];
  for (const dir of ['controllers', 'routes']) {
    for (const file of fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(root, dir, file), 'utf8');
      if (/'Server error: ' \+ \w+\.message|`Server error: \$\{/.test(src)) offenders.push(`${dir}/${file}`);
      if (/'Server error',\s*details:\s*\w+\.message/.test(src)) offenders.push(`${dir}/${file} (details)`);
    }
  }
  assert.deepEqual(offenders, []);
});
