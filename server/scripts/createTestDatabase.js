// server/scripts/createTestDatabase.js
//
// Creates (or re-creates) the TEST database used by tests/db/*: an empty copy
// of the schema of DB_NAME (every table + trigger, NO data) plus a few
// synthetic rows the tests need (one company, cash account, bank, user and
// supplier - never copied from the real data).
//
//   cd server && node scripts/createTestDatabase.js
//
// Target = DB_NAME_TEST from .env, default "<DB_NAME>_test". Refuses to run
// unless the target name ends with "_test" and differs from DB_NAME, because
// it DROPS the target first. The real database is only read (SHOW CREATE).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const source = process.env.DB_NAME;
const target = process.env.DB_NAME_TEST || `${source}_test`;

const fail = (message) => { console.error(`createTestDatabase: ${message}`); process.exit(1); };
if (!source) fail('DB_NAME is not set in server/.env');
if (!/_test$/.test(target) || target === source) fail(`refusing to use "${target}" - the test database name must end with "_test" and differ from DB_NAME`);
if (!/^[A-Za-z0-9_]+$/.test(source) || !/^[A-Za-z0-9_]+$/.test(target)) fail('database names may only contain letters, digits and _');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, multipleStatements: false
  });
  try {
    const [[schema]] = await conn.query(
      'SELECT default_character_set_name AS cs, default_collation_name AS co FROM information_schema.schemata WHERE schema_name = ?', [source]);
    if (!schema) fail(`source database "${source}" not found`);

    await conn.query(`DROP DATABASE IF EXISTS \`${target}\``);
    await conn.query(`CREATE DATABASE \`${target}\` CHARACTER SET ${schema.cs} COLLATE ${schema.co}`);
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    const [tables] = await conn.query(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name", [source]);
    for (const { name } of tables) {
      const [[row]] = await conn.query(`SHOW CREATE TABLE \`${source}\`.\`${name}\``);
      const ddl = row['Create Table'].replace(/\sAUTO_INCREMENT=\d+/, ''); // start ids from 1
      await conn.query(`USE \`${target}\``);
      await conn.query(ddl);
    }

    const [triggers] = await conn.query(
      'SELECT trigger_name AS name FROM information_schema.triggers WHERE trigger_schema = ? ORDER BY trigger_name', [source]);
    for (const { name } of triggers) {
      const [[row]] = await conn.query(`SHOW CREATE TRIGGER \`${source}\`.\`${name}\``);
      const ddl = row['SQL Original Statement'].replace(/\sDEFINER\s*=\s*`[^`]*`@`[^`]*`/i, '');
      await conn.query(`USE \`${target}\``);
      await conn.query(ddl);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // Synthetic fixtures (tests/db/* read them; nothing is copied from DB_NAME).
    await conn.query(`USE \`${target}\``);
    const [company] = await conn.query("INSERT INTO company (name) VALUES ('Test Company')");
    await conn.query('INSERT INTO cash_accounts (company_id, current_balance) VALUES (?, 0)', [company.insertId]);
    await conn.query(
      "INSERT INTO bank_details (bank_name, account_number, company, status) VALUES ('Test Bank', '0000000000', 'Test Company', 'Active')");
    const unusablePassword = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
    await conn.query(
      "INSERT INTO users (name, username, password, role, status) VALUES ('Test Admin', 'test-admin', ?, 'Admin', 1)", [unusablePassword]);
    await conn.query(
      "INSERT INTO supplier (name, address, city, contact_name, contact_phone) VALUES ('Test Supplier', 'Test', 'Test', 'Test', '0000000000')");

    console.log(`Test database "${target}" created: ${tables.length} tables, ${triggers.length} triggers, synthetic fixtures added (no data copied from "${source}").`);
    console.log(`Run the database tests with: npm run test:db`);
  } finally {
    await conn.end();
  }
})().catch((error) => fail(error.message));
