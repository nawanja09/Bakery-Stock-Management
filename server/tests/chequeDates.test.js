// Cheque release dates (no database needed).
// Bug fixed 2026-10-14: DATE values read from MySQL arrive as JS Date objects;
// String(date).slice(0, 10) turned them into "Wed Sep 16", which MariaDB stored
// as 0000-00-00 - a ledger row with that date drops out of every date-range
// report and balance. utils/dateOnly.toYmd() is now used everywhere instead.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const dbPath = require.resolve('../config/db');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async () => [[]], getConnection: async () => { throw new Error('no db in this test'); } }
};

const { toYmd, todayYmd } = require('../utils/dateOnly');

test('toYmd: a DB Date object keeps its LOCAL calendar day (never "Wed Sep 16", never the previous day)', () => {
  const fromDb = new Date(2026, 8, 16); // what mysql2 returns for DATE '2026-09-16'
  assert.equal(toYmd(fromDb), '2026-09-16');
  assert.equal(toYmd(new Date(2026, 0, 1)), '2026-01-01', 'year start: toISOString() would give 2025-12-31 east of UTC');
});

test('toYmd: strings are kept only when they are real dates', () => {
  assert.equal(toYmd('2026-09-16'), '2026-09-16');
  assert.equal(toYmd(' 2026-09-16 10:30:00 '), '2026-09-16', 'DATETIME keeps its date');
  for (const bad of ['Wed Sep 16', '0000-00-00', '2026-02-30', '2026-13-01', '', 'abc', null, undefined, 20260916, new Date('x')]) {
    assert.equal(toYmd(bad), null, String(bad));
  }
  assert.match(todayYmd(), /^\d{4}-\d{2}-\d{2}$/);
});

test('no cheque code turns a date into text with String(...).slice(0, 10) any more', () => {
  for (const rel of ['services/chequeReleaseService.js', 'controllers/chequeRegistryController.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    assert.doesNotMatch(src, /String\([^)]*date[^)]*\)\.slice\(0,\s*10\)/i, rel);
    assert.doesNotMatch(src, /toISOString\(\)\.slice\(0,\s*10\)/, `${rel}: use todayYmd() (local calendar)`);
  }
});

test('PATCH cheque registry refuses an unreadable release date before touching the ledger', async () => {
  const { updateChequeRegistryRecord } = require('../controllers/chequeRegistryController');
  const call = async (body) => {
    const out = { status: 200, body: null };
    const res = { status(code) { out.status = code; return res; }, json(b) { out.body = b; return res; } };
    await updateChequeRegistryRecord({ params: { id: '1' }, body }, res);
    return out;
  };
  for (const release_date of ['Wed Sep 16', '2026-02-30', 'tomorrow']) {
    const r = await call({ status: 'Released', release_date });
    assert.equal(r.status, 400, release_date);
    assert.match(r.body.error, /valid date/);
  }
});
