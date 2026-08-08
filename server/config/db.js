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
      ENUM('Admin','Staff','Manager','User','Store Keeper','Accountant')
      NOT NULL DEFAULT 'Staff'
    `);

    // 5. Drop the old email column now that username is populated.
    await pool.query("ALTER TABLE users DROP COLUMN IF EXISTS email");

    // 6. Seed the required accounts if they don't already exist.
    const seedUsers = [
      { name: 'Admin', username: 'admin', password: 'Admin123', role: 'Admin' },
      { name: 'Store Keeper', username: 'stores', password: 'password', role: 'Store Keeper' },
      { name: 'Accountant', username: 'accountant', password: 'password', role: 'Accountant' }
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

// --- Finance module (Cash & Bank ledgers) -----------------------------------
// `cash_accounts` holds one running-balance row per company for "Cash In Hand".
// `finance_transactions` is a shared ledger for both Cash and Bank entries -
// account_type + company_id identify a Cash row, account_type + bank_id
// identify a Bank row (bank_id references bank_details).
//
// Ledger convention (formal double-entry, as used for these Cash/Bank asset
// accounts):
//   DEBIT  = money IN to the account (a receipt/deposit) -> increases balance
//   CREDIT = money OUT of the account (a payment)         -> decreases balance
//   New Balance = Previous Balance + Debit - Credit
const ensureFinanceSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cash_accounts (
        id INT NOT NULL AUTO_INCREMENT,
        company_id INT NOT NULL,
        current_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY company_id (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS finance_transactions (
        id INT NOT NULL AUTO_INCREMENT,
        account_type ENUM('CASH','BANK') NOT NULL,
        company_id INT NOT NULL,
        bank_id INT NULL,
        transaction_date DATE NOT NULL,
        transaction_type VARCHAR(50) NULL,
        reference_number VARCHAR(100) NULL,
        invoice_number VARCHAR(100) NULL,
        party_name VARCHAR(255) NULL,
        transaction_direction ENUM('IN','OUT') NULL,
        remark VARCHAR(255) NULL,
        debit DECIMAL(14,2) NOT NULL DEFAULT 0,
        credit DECIMAL(14,2) NOT NULL DEFAULT 0,
        balance_after DECIMAL(14,2) NOT NULL DEFAULT 0,
        reference_type VARCHAR(50) NULL,
        reference_id INT NULL,
        created_by INT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_cash_lookup (account_type, company_id, transaction_date),
        KEY idx_bank_lookup (account_type, bank_id, transaction_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    // Add the newer traceability columns for installs that already have the
    // finance_transactions table from before this update.
    const newColumns = [
      "ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(50) NULL AFTER transaction_date",
      "ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100) NULL AFTER transaction_type",
      "ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100) NULL AFTER reference_number",
      "ADD COLUMN IF NOT EXISTS party_name VARCHAR(255) NULL AFTER invoice_number",
      "ADD COLUMN IF NOT EXISTS transaction_direction ENUM('IN','OUT') NULL AFTER party_name"
    ];
    for (const clause of newColumns) {
      try {
        await pool.query(`ALTER TABLE finance_transactions ${clause}`);
      } catch (colErr) {
        // Column already present on some MySQL/MariaDB versions that don't
        // support IF NOT EXISTS here - safe to ignore.
      }
    }

    // Seed a zero-balance cash account for every existing company.
    await pool.query(`
      INSERT INTO cash_accounts (company_id, current_balance)
      SELECT c.id, 0 FROM company c
      WHERE NOT EXISTS (SELECT 1 FROM cash_accounts ca WHERE ca.company_id = c.id)
    `);

    console.log('Finance (Cash & Bank ledger) schema ready');
  } catch (error) {
    console.warn('Finance schema check skipped:', error.message);
  }
};

ensureFinanceSchema();

// --- Connect the Expenses modules to Finance -------------------------------
// Adds the columns each expense table needs to post a Cash/Bank ledger entry:
//   - company_id: which company's Cash In Hand this expense belongs to
//   - bank_id: which bank account the money actually left from (bank-funded
//     expenses only)
// Money-out timing differs per module, so each is hooked at the point money
// actually leaves the account, not when the record is first created:
//   - Cheque Expenses: at REALISE time (cheque_expenses.bank_id)
//   - Bank Charges: at creation (bank_charges.bank_id)
//   - Online Expenses: at payment time (online_expense_payments.bank_id)
//   - Petty Cash: at REIMBURSEMENT time only (petty_cash_reimbursements) -
//     Vouchers (spending from the float) don't touch Finance, since that
//     money already left Cash/Bank when the float was last topped up.
const ensureExpenseFinanceLinkSchema = async () => {
  const alterations = [
    ["cheque_expenses", "ADD COLUMN IF NOT EXISTS company_id INT NULL AFTER bill_date"],
    ["cheque_expenses", "ADD COLUMN IF NOT EXISTS bank_id INT NULL AFTER company_id"],
    ["bank_charges", "ADD COLUMN IF NOT EXISTS company_id INT NULL AFTER charge_date"],
    ["bank_charges", "ADD COLUMN IF NOT EXISTS bank_id INT NULL AFTER company_id"],
    ["online_expense_payments", "ADD COLUMN IF NOT EXISTS company_id INT NULL AFTER payment_date"],
    ["online_expense_payments", "ADD COLUMN IF NOT EXISTS bank_id INT NULL AFTER company_id"],
    ["petty_cash_reimbursements", "ADD COLUMN IF NOT EXISTS company_id INT NULL AFTER reimbursement_date"],
    ["petty_cash_reimbursements", "ADD COLUMN IF NOT EXISTS funding_source ENUM('CASH','BANK') NULL AFTER company_id"],
    ["petty_cash_reimbursements", "ADD COLUMN IF NOT EXISTS bank_id INT NULL AFTER funding_source"]
  ];

  for (const [table, clause] of alterations) {
    try {
      await pool.query(`ALTER TABLE ${table} ${clause}`);
    } catch (error) {
      // Column already present, or the table doesn't exist yet on a fresh
      // install (these tables are created by application code, not this
      // file) - either way, safe to move on.
    }
  }

  console.log('Expenses <-> Finance link schema ready');
};

ensureExpenseFinanceLinkSchema();

module.exports = pool;