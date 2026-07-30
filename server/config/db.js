const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
}).promise();

pool.getConnection()
  .then(() => console.log('MySQL Connected'))
  .catch(err => console.log(err));

const ensureItemTypeSchema = async () => {
  try {
    await pool.query("ALTER TABLE items ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) NULL DEFAULT 'Other' AFTER name");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS item_types (
        id INT NOT NULL AUTO_INCREMENT,
        type_name VARCHAR(50) NOT NULL UNIQUE,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    const defaultTypes = ['Vegetables', 'Meat', 'Packing', 'Other'];
    for (const typeName of defaultTypes) {
      await pool.query(
        'INSERT INTO item_types (type_name) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM item_types WHERE type_name = ?)',
        [typeName, typeName]
      );
    }
  } catch (error) {
    console.warn('Item type schema check skipped:', error.message);
  }
};

ensureItemTypeSchema();

const ensurePaymentMethodsSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id INT NOT NULL AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL UNIQUE,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    const defaults = ['Cash', 'Cheque', 'Bank'];
    for (const name of defaults) {
      await pool.query(
        'INSERT INTO payment_methods (name, is_active) SELECT ?, 1 WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE name = ?)',
        [name, name]
      );
    }
    console.log('✅ payment_methods table ready');
  } catch (error) {
    console.warn('Payment methods schema check skipped:', error.message);
  }
};

ensurePaymentMethodsSchema();

// --- Username-based authentication migration -------------------------------
// Replaces email login with username login:
//   1. Add `username` column (nullable at first so we can backfill it).
//   2. Backfill username from the existing email's local-part for any row
//      that doesn't have one yet, de-duplicating collisions by id suffix.
//   3. Lock it down: NOT NULL + UNIQUE.
//   4. Extend the `role` enum with 'Store Keeper' (existing values untouched).
//   5. Drop the old `email` column (also removes its unique key).
//   6. Seed the two required accounts, but only if a user with that username
//      doesn't already exist — this never overwrites a real, already-migrated
//      admin password with the sample "Admin123" credential.
const ensureUsernameAuthSchema = async () => {
  const bcrypt = require('bcrypt');

  try {
    // 1. Add the column if it isn't there yet.
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100) NULL AFTER name");

    // 2. Backfill from email where possible (no-op once email is dropped).
    try {
      await pool.query(`
        UPDATE users
        SET username = SUBSTRING_INDEX(email, '@', 1)
        WHERE username IS NULL AND email IS NOT NULL
      `);
    } catch (backfillErr) {
      // email column no longer exists on later runs - nothing to backfill.
    }

    // Catch-all for any row still without a username (e.g. no email either).
    await pool.query(`
      UPDATE users SET username = CONCAT('user', id) WHERE username IS NULL
    `);

    // De-duplicate any usernames that collided during backfill.
    await pool.query(`
      UPDATE users u
      JOIN (
        SELECT username FROM users GROUP BY username HAVING COUNT(*) > 1
      ) dup ON u.username = dup.username
      SET u.username = CONCAT(u.username, u.id)
    `);

    // 3. Enforce NOT NULL + UNIQUE.
    await pool.query("ALTER TABLE users MODIFY COLUMN username VARCHAR(100) NOT NULL");
    try {
      await pool.query("ALTER TABLE users ADD UNIQUE KEY username (username)");
    } catch (dupKeyErr) {
      // Unique key already exists - fine.
    }

    // 4. Extend role enum (existing values/order preserved, only appending).
    await pool.query(`
      ALTER TABLE users MODIFY COLUMN role
      ENUM('Admin','Staff','Manager','User','Inventory Officer','Production Staff','Store Keeper')
      NOT NULL DEFAULT 'Staff'
    `);

    // 5. Drop the old email column now that username is populated.
    await pool.query("ALTER TABLE users DROP COLUMN IF EXISTS email");

    // 6. Seed the required accounts if they don't already exist.
    const seedUsers = [
      { name: 'Admin', username: 'admin', password: 'Admin@123', role: 'Admin' },
      { name: 'Store Keeper', username: 'stores', password: 'password', role: 'Store Keeper' }
    ];

    for (const seed of seedUsers) {
      const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [seed.username]);
      if (existing.length === 0) {
        const hashedPassword = await bcrypt.hash(seed.password, 10);
        await pool.query(
          'INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)',
          [seed.name, seed.username, hashedPassword, seed.role]
        );
        console.log(`Seeded default user "${seed.username}" (${seed.role})`);
      }
    }

    console.log('Username auth schema ready');
  } catch (error) {
    console.warn('Username auth schema check skipped:', error.message);
  }
};

ensureUsernameAuthSchema();

module.exports = pool;