// server/tests/db/useTestDatabase.js
//
// Require this FIRST in every test under tests/db/ (before anything that loads
// config/db). It points the app's database pool at the TEST database
// (DB_NAME_TEST, default "<DB_NAME>_test", created by
// `node scripts/createTestDatabase.js`) - never at the real one.
//
// If the test database is not configured or does not exist, the test is
// SKIPPED (exit 0) instead of falling back to the real database.
const path = require('path');
const { execFileSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const real = process.env.DB_NAME;
const target = process.env.DB_NAME_TEST || (real ? `${real}_test` : '');

const skip = (why) => {
  console.log(`SKIPPED (${path.basename(require.main ? require.main.filename : 'db test')}): ${why}`);
  process.exit(0);
};

if (!target || !/_test$/.test(target) || target === real) {
  skip(`no safe test database ("${target}") - DB_NAME_TEST must end with "_test" and differ from DB_NAME`);
}

// Does the test database exist? Checked in a child process so this module can stay synchronous.
const probe = `
  const m = require('mysql2/promise');
  m.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME })
    .then((c) => c.end().then(() => process.exit(0)))
    .catch(() => process.exit(3));`;
try {
  execFileSync(process.execPath, ['-e', probe], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, DB_NAME: target },
    stdio: 'ignore',
    timeout: 15000
  });
} catch (error) {
  skip(`test database "${target}" is not reachable - create it with: node scripts/createTestDatabase.js`);
}

// dotenv never overrides a variable that is already set, so config/db now
// connects to the test database.
process.env.DB_NAME = target;
process.env.BSMS_TEST_DATABASE = target;
// Period close (services/periodLock.js) is relative to "today". Pin it so tests that use fixed
// dates keep passing as the calendar moves (the open window is then Sept + Oct 2026).
process.env.PERIOD_LOCK_TODAY = process.env.PERIOD_LOCK_TODAY || '2026-10-16';
