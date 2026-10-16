// server/scripts/createAppDbUser.js
//
// Least-privilege database account for the application, and a protected schema
// for the Audit Trail (audit finding H6 / N6). Run by an administrator with a
// database account that may create users, databases and triggers (e.g. root).
//
//   cd server
//   node scripts/createAppDbUser.js            # shows what it would do, changes nothing
//   node scripts/createAppDbUser.js --apply    # does it (asks for the new account's password)
//
//   --app-user bsms_app        name of the application account (default bsms_app)
//   --app-host localhost       where the application connects from (default localhost)
//   --audit-db <DB_NAME>_audit schema for audit_log (default <DB_NAME>_audit)
//   --allow-drop               also allow DROP on the application database (only if a
//                              start-up migration reports "DROP command denied")
//
// Administrator login: DB_ADMIN_USER / DB_ADMIN_PASSWORD when set, otherwise the
// DB_USER / DB_PASSWORD in .env. The new account's password is typed at a hidden
// prompt (or BSMS_APP_DB_PASSWORD for automation), never as an argument.
//
// Result
//   <DB_NAME>.*            SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES,
//                          CREATE TEMPORARY TABLES, LOCK TABLES (what the app and its
//                          start-up schema checks use) - no DROP unless --allow-drop
//   <AUDIT_DB>.audit_log   SELECT, INSERT only: the application cannot change, delete,
//                          truncate, alter or drop audit rows, nor drop the append-only
//                          triggers (no TRIGGER privilege anywhere)
//   no global privileges, no GRANT OPTION, no SUPER / FILE / PROCESS.
// Existing rows of <DB_NAME>.audit_log are copied into <AUDIT_DB>.audit_log and the
// old table is renamed audit_log_moved_<date> (kept, not dropped).
//
// Afterwards set in .env:  DB_USER=<app user>  DB_PASSWORD=<its password>  AUDIT_DB=<audit db>
// and restart the server. Stop the server while running --apply, so no audit row
// is written to the old table during the move. Running it again is safe (it
// resets the password and re-applies exactly these privileges).
const path = require('path');

const NAME = /^[A-Za-z0-9_]{1,64}$/;
const USER = /^[A-Za-z0-9_.-]{1,32}$/;
const HOST = /^[A-Za-z0-9_.%:-]{1,255}$/;
const PASSWORD_MIN = 16;

const MAIN_PRIVILEGES = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'INDEX', 'REFERENCES',
  'CREATE TEMPORARY TABLES', 'LOCK TABLES'
];
const AUDIT_PRIVILEGES = ['SELECT', 'INSERT'];

const parseArgs = (argv, env = process.env) => {
  const out = { apply: false, allowDrop: false, appUser: 'bsms_app', appHost: 'localhost' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') out.apply = true;
    else if (arg === '--allow-drop') out.allowDrop = true;
    else if (['--app-user', '--app-host', '--audit-db'].includes(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      out[{ '--app-user': 'appUser', '--app-host': 'appHost', '--audit-db': 'auditDatabase' }[arg]] = value.trim();
      i += 1;
    } else if (arg.startsWith('--password')) {
      throw new Error('Never pass a password as an argument (it stays in shell history) - you will be asked for it');
    } else {
      throw new Error(`Unknown argument "${arg}"`);
    }
  }
  out.database = env.DB_NAME;
  out.auditDatabase = out.auditDatabase || (out.database ? `${out.database}_audit` : '');
  if (!NAME.test(out.database || '')) throw new Error('DB_NAME in .env is missing or not a plain name');
  if (!NAME.test(out.auditDatabase)) throw new Error('--audit-db must contain only letters, digits and _');
  if (out.auditDatabase === out.database) throw new Error('--audit-db must be a different schema from DB_NAME');
  if (!USER.test(out.appUser)) throw new Error('--app-user: 1-32 letters, digits, . _ -');
  if (!HOST.test(out.appHost)) throw new Error('--app-host: a host name, IP or pattern such as 10.0.0.%');
  return out;
};

const q = (name) => `\`${name}\``;

/** The statements --apply runs, for the dry run (password hidden). */
const planSql = ({ database, auditDatabase, appUser, appHost, allowDrop }) => {
  const main = allowDrop ? [...MAIN_PRIVILEGES, 'DROP'] : MAIN_PRIVILEGES;
  const account = `'${appUser}'@'${appHost}'`;
  return [
    `CREATE DATABASE IF NOT EXISTS ${q(auditDatabase)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    `-- ${q(auditDatabase)}.audit_log with the append-only triggers (services/auditLog.createAuditLogTable)`,
    `-- copy rows from ${q(database)}.audit_log, then RENAME it to audit_log_moved_<date>`,
    `CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY '********';`,
    `ALTER USER ${account} IDENTIFIED BY '********';`,
    `REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${account};`,
    `GRANT ${main.join(', ')} ON ${q(database)}.* TO ${account};`,
    `GRANT ${AUDIT_PRIVILEGES.join(', ')} ON ${q(auditDatabase)}.audit_log TO ${account};`
  ];
};

const tableExists = async (db, schema, table) => {
  const [rows] = await db.query(
    'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [schema, table]);
  return rows.length > 0;
};

// Rows of <database>.audit_log -> <auditDatabase>.audit_log (by id, so a re-run
// adds nothing twice); then the old table is renamed so nothing writes to it.
const moveExistingAuditRows = async (db, { database, auditDatabase }) => {
  if (!(await tableExists(db, database, 'audit_log'))) return { copied: 0, renamedTo: null };
  const [cols] = await db.query(
    `SELECT c.COLUMN_NAME FROM information_schema.COLUMNS c
       JOIN information_schema.COLUMNS n
         ON n.TABLE_SCHEMA = ? AND n.TABLE_NAME = 'audit_log' AND n.COLUMN_NAME = c.COLUMN_NAME
      WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = 'audit_log'
      ORDER BY c.ORDINAL_POSITION`,
    [auditDatabase, database]
  );
  const list = cols.map((c) => q(c.COLUMN_NAME)).join(', ');
  const [result] = await db.query(
    `INSERT IGNORE INTO ${q(auditDatabase)}.audit_log (${list}) SELECT ${list} FROM ${q(database)}.audit_log`);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let renamedTo = `audit_log_moved_${stamp}`;
  for (let n = 2; await tableExists(db, database, renamedTo); n += 1) renamedTo = `audit_log_moved_${stamp}_${n}`;
  await db.query(`RENAME TABLE ${q(database)}.audit_log TO ${q(database)}.${q(renamedTo)}`);
  return { copied: result.affectedRows, renamedTo };
};

/**
 * Creates / resets the application account with exactly the privileges above.
 * `admin` = a mysql2/promise connection with administrator rights.
 * Returns a summary (no secrets).
 */
const setUpAppDbUser = async (admin, { database, auditDatabase, appUser, appHost, password, allowDrop = false }) => {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    throw new Error(`The database password must be at least ${PASSWORD_MIN} characters`);
  }
  const { createAuditLogTable } = require('../services/auditLog');
  await admin.query(`CREATE DATABASE IF NOT EXISTS ${q(auditDatabase)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await createAuditLogTable(admin, auditDatabase);
  const [triggers] = await admin.query(
    "SELECT COUNT(*) AS n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? AND EVENT_OBJECT_TABLE = 'audit_log'",
    [auditDatabase]
  );
  if (Number(triggers[0].n) < 2) throw new Error('The append-only triggers could not be created - this account needs the TRIGGER privilege');
  const moved = await moveExistingAuditRows(admin, { database, auditDatabase });

  await admin.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', [appUser, appHost, password]);
  await admin.query('ALTER USER ?@? IDENTIFIED BY ?', [appUser, appHost, password]);
  await admin.query('REVOKE ALL PRIVILEGES, GRANT OPTION FROM ?@?', [appUser, appHost]);
  const main = allowDrop ? [...MAIN_PRIVILEGES, 'DROP'] : MAIN_PRIVILEGES;
  await admin.query(`GRANT ${main.join(', ')} ON ${q(database)}.* TO ?@?`, [appUser, appHost]);
  await admin.query(`GRANT ${AUDIT_PRIVILEGES.join(', ')} ON ${q(auditDatabase)}.audit_log TO ?@?`, [appUser, appHost]);

  return [
    `Account '${appUser}'@'${appHost}': ${main.join(', ')} on ${database}; SELECT, INSERT on ${auditDatabase}.audit_log.`,
    moved.renamedTo
      ? `Copied ${moved.copied} audit row(s) to ${auditDatabase}.audit_log; the old table is now ${database}.${moved.renamedTo}.`
      : `${auditDatabase}.audit_log is ready (there was no old audit_log to move).`,
    `Now set in .env: DB_USER=${appUser}, DB_PASSWORD=<that password>, AUDIT_DB=${auditDatabase} - and restart the server.`
  ].join('\n');
};

const readPassword = async () => {
  if (process.env.BSMS_APP_DB_PASSWORD) return process.env.BSMS_APP_DB_PASSWORD;
  const { askHidden } = require('./createUser');
  const first = await askHidden(`New password for the application database account (at least ${PASSWORD_MIN} characters): `);
  if (first.length < PASSWORD_MIN) throw new Error(`The database password must be at least ${PASSWORD_MIN} characters`);
  const second = await askHidden('Type it again: ');
  if (first !== second) throw new Error('The two passwords do not match');
  return first;
};

const main = async () => {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const options = parseArgs(process.argv.slice(2));
  if (!options.apply) {
    console.log('Dry run - nothing is changed. These statements would run (add --apply to run them):\n');
    console.log(planSql(options).join('\n'));
    return;
  }
  const password = await readPassword();
  const mysql = require('mysql2/promise');
  const admin = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_ADMIN_USER || process.env.DB_USER,
    password: process.env.DB_ADMIN_USER ? process.env.DB_ADMIN_PASSWORD : process.env.DB_PASSWORD,
    database: options.database
  });
  try {
    console.log(await setUpAppDbUser(admin, { ...options, password }));
  } finally {
    await admin.end();
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`createAppDbUser: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, planSql, setUpAppDbUser, MAIN_PRIVILEGES, AUDIT_PRIVILEGES };
