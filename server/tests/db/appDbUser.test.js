// scripts/createAppDbUser.js against the local MySQL / MariaDB server: a
// temporary application account and two scratch schemas (<run> and <run>_audit)
// are created, every forbidden operation is tried as that account, and all of it
// is removed again. Never touches the real or the test database.
//
// Skipped (with a message) when the administrator account in .env may not create
// users / databases / triggers.

require('./useTestDatabase'); // .env loaded; skips when no test database is set up

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { setUpAppDbUser } = require('../../scripts/createAppDbUser');
const { createAuditLogTable } = require('../../services/auditLog');

const RUN = crypto.randomBytes(4).toString('hex');
const MAIN = `bsms_privtest_${RUN}`;
const AUDIT = `${MAIN}_audit`;
const APP_USER = `bsms_t_${RUN}`;
const APP_HOST = '%';
const PASSWORD = `Db-${crypto.randomBytes(12).toString('hex')}`;

let admin;
let app;
let skipReason = null;

const connect = (user, password, database) => mysql.createConnection({
  host: process.env.DB_HOST, port: process.env.DB_PORT, user, password, database
});

test.before(async () => {
  admin = await connect(process.env.DB_ADMIN_USER || process.env.DB_USER,
    process.env.DB_ADMIN_USER ? process.env.DB_ADMIN_PASSWORD : process.env.DB_PASSWORD);
  try {
    await admin.query(`CREATE DATABASE \`${MAIN}\``);
    await admin.query(`CREATE TABLE \`${MAIN}\`.items_t (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50))`);
    // An audit_log in the application database from before the move, with one row.
    await createAuditLogTable(admin, MAIN);
    await admin.query(
      `INSERT INTO \`${MAIN}\`.audit_log (event_type, action, outcome, message) VALUES ('AUTH', 'LOGIN', 'SUCCESS', ?)`, [`old row ${RUN}`]);
    // Can this server create accounts and grant rights at all? (A crashed
    // mysql.global_priv / mysql.db on a local XAMPP install cannot.)
    await admin.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', [`probe_${RUN}`, 'localhost', PASSWORD]);
    await admin.query(`GRANT SELECT ON \`${MAIN}\`.* TO ?@?`, [`probe_${RUN}`, 'localhost']);
  } catch (error) {
    skipReason = `this database server cannot create users / grant rights (${error.message})`;
  } finally {
    await admin.query('DROP USER IF EXISTS ?@?', [`probe_${RUN}`, 'localhost']).catch(() => {});
  }
});

test.after(async () => {
  if (app) await app.end().catch(() => {});
  if (admin) {
    await admin.query('DROP USER IF EXISTS ?@?', [APP_USER, APP_HOST]).catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS \`${AUDIT}\``).catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS \`${MAIN}\``).catch(() => {});
    await admin.end();
  }
});

const denied = async (sql, params = []) => {
  await assert.rejects(app.query(sql, params), (error) => {
    assert.match(error.message, /denied|append-only/i, `${sql} -> ${error.message}`);
    return true;
  }, sql);
};

test('the application account can work normally but cannot touch the audit trail', async (t) => {
  if (skipReason) return t.skip(skipReason);

  const summary = await setUpAppDbUser(admin, {
    database: MAIN, auditDatabase: AUDIT, appUser: APP_USER, appHost: APP_HOST, password: PASSWORD
  });
  assert.match(summary, /Copied 1 audit row/);

  // The old audit rows were moved, and the old table kept under another name.
  const [moved] = await admin.query(`SELECT message FROM \`${AUDIT}\`.audit_log`);
  assert.deepEqual(moved.map((r) => r.message), [`old row ${RUN}`]);
  const [old] = await admin.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'audit_log%'", [MAIN]);
  assert.match(old[0].TABLE_NAME, /^audit_log_moved_\d{8}$/);

  app = await connect(APP_USER, PASSWORD, MAIN);

  // Normal work in the application database, including start-up schema changes.
  await app.query('INSERT INTO items_t (name) VALUES (?)', ['Flour']);
  await app.query("UPDATE items_t SET name = 'Sugar' WHERE name = 'Flour'");
  await app.query("DELETE FROM items_t WHERE name = 'Sugar'");
  await app.query('CREATE TABLE IF NOT EXISTS new_feature_t (id INT PRIMARY KEY)');
  await app.query('ALTER TABLE items_t ADD COLUMN IF NOT EXISTS note VARCHAR(20) NULL');
  await denied('DROP TABLE items_t');

  // The audit trail: add and read only.
  await app.query(`INSERT INTO \`${AUDIT}\`.audit_log (event_type, action, outcome) VALUES ('AUTH', 'LOGOUT', 'SUCCESS')`);
  const [rows] = await app.query(`SELECT COUNT(*) AS n FROM \`${AUDIT}\`.audit_log`);
  assert.equal(Number(rows[0].n), 2);
  await denied(`UPDATE \`${AUDIT}\`.audit_log SET action = 'X'`);
  await denied(`DELETE FROM \`${AUDIT}\`.audit_log`);
  await denied(`TRUNCATE TABLE \`${AUDIT}\`.audit_log`);
  await denied(`ALTER TABLE \`${AUDIT}\`.audit_log DROP COLUMN message`);
  await denied(`DROP TABLE \`${AUDIT}\`.audit_log`);
  await denied(`DROP TRIGGER \`${AUDIT}\`.audit_log_no_delete`);
  await denied(`CREATE TABLE \`${AUDIT}\`.other_t (id INT)`);
  await denied(`GRANT SELECT ON \`${AUDIT}\`.audit_log TO '${APP_USER}'@'${APP_HOST}'`);

  // Even the administrator cannot change rows: the triggers refuse it.
  await assert.rejects(admin.query(`DELETE FROM \`${AUDIT}\`.audit_log`), /append-only/);
});

test('running it again resets the password and keeps exactly the same rights', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const second = `${PASSWORD}-2`;
  await setUpAppDbUser(admin, { database: MAIN, auditDatabase: AUDIT, appUser: APP_USER, appHost: APP_HOST, password: second });
  await assert.rejects(connect(APP_USER, PASSWORD, MAIN), /denied/);
  const again = await connect(APP_USER, second, MAIN);
  try {
    const [grants] = await again.query('SHOW GRANTS');
    const text = grants.map((g) => Object.values(g)[0]).join('\n');
    assert.doesNotMatch(text, /TRIGGER|DROP|SUPER|FILE|GRANT OPTION|ALL PRIVILEGES/);
    assert.match(text, new RegExp(`GRANT SELECT, INSERT ON \`${AUDIT}\`.\`audit_log\``));
  } finally {
    await again.end();
  }
});
