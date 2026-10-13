// server/scripts/seedDemoCollectionUser.js
//
// LOCAL DEMO ONLY - creates / resets the Stock Management login used to test
// the Collection page against the local Cafe and Restaurant demo data
// (BsmsCollectionDemoSeeder in both Laravel apps):
//
//   node scripts/seedDemoCollectionUser.js
//
//   username demo.finance   password Demo-bbbf5de31c   role Accountant
//
// The same username / password exist in the Cafe and the Restaurant demo data,
// so it also works in per-user mode (no integration key). Accountant is a role
// with the Collection page (config/rolePermissions.js). Uses DB_* from .env.
// Never run against a production database.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const USERNAME = 'demo.finance';
const PASSWORD = 'Demo-bbbf5de31c';
const ROLE = 'Accountant';

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME
  });
  try {
    const hash = await bcrypt.hash(PASSWORD, 10);
    const [rows] = await db.query('SELECT id FROM users WHERE username = ?', [USERNAME]);
    if (rows.length) {
      await db.query('UPDATE users SET password = ?, role = ?, status = 1 WHERE id = ?', [hash, ROLE, rows[0].id]);
    } else {
      await db.query('INSERT INTO users (name, username, password, role, status) VALUES (?, ?, ?, ?, 1)', ['Demo Finance', USERNAME, hash, ROLE]);
    }
    console.log(`Stock Management demo login ready: ${USERNAME} (role ${ROLE}) in database ${process.env.DB_NAME}`);
  } finally {
    await db.end();
  }
})().catch((error) => { console.error('Failed:', error.message); process.exit(1); });
