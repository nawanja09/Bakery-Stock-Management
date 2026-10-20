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

// RM Adjustment Summary is an audit view, so this table must be available
// before the first Summary request even on installations where SQL migration
// files are applied manually.
const ensureRmAdjustmentRecordsSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rm_adjustment_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category ENUM('Department', 'Invoice', 'Issuance', 'Wastage', 'Petty Cash Voucher', 'Expense Bill', 'Cash Receive', 'Bank Receive') NOT NULL,
        source_record_id INT NOT NULL,
        reference_id VARCHAR(100) NULL,
        updated_by INT NULL,
        original_values JSON NULL,
        updated_values JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_rm_adjustment_source (category, source_record_id),
        KEY idx_rm_adjustment_category_updated (category, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    // Upgrade installations where this table was created by migration 012 or
    // by an older version of this bootstrap. CREATE TABLE IF NOT EXISTS does
    // not update existing tables.
    await pool.query(`
      ALTER TABLE rm_adjustment_records
        MODIFY COLUMN category ENUM('Department', 'Invoice', 'Issuance', 'Wastage', 'Petty Cash Voucher', 'Expense Bill', 'Cash Receive', 'Bank Receive') NOT NULL,
        ADD COLUMN IF NOT EXISTS original_values JSON NULL,
        ADD COLUMN IF NOT EXISTS updated_values JSON NULL
    `);

    // Financial edits need multiple immutable snapshots for one source row.
    // Remove the old uniqueness constraint when upgrading from migration 012.
    const [uniqueIndexes] = await pool.query(`
      SELECT INDEX_NAME
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'rm_adjustment_records'
        AND INDEX_NAME = 'uq_rm_adjustment_source'
      LIMIT 1
    `);
    if (uniqueIndexes.length) {
      await pool.query('ALTER TABLE rm_adjustment_records DROP INDEX uq_rm_adjustment_source');
    }

    const [sourceIndexes] = await pool.query(`
      SELECT INDEX_NAME
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'rm_adjustment_records'
        AND INDEX_NAME = 'idx_rm_adjustment_source'
      LIMIT 1
    `);
    if (!sourceIndexes.length) {
      await pool.query('ALTER TABLE rm_adjustment_records ADD KEY idx_rm_adjustment_source (category, source_record_id)');
    }
    console.log('RM adjustment summary schema ready');
  } catch (error) {
    console.warn('RM adjustment summary schema check skipped:', error.message);
  }
};

ensureRmAdjustmentRecordsSchema();

const ensureSoftDeleteStatusSchema = async () => {
  try {
    const alterations = [
      ['purchases', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['items', "ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Inactive'"],
      ['wastages', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['supplier', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['payees', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['users', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['payment_methods', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['cutlery_assets', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['cutlery_purchases', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['cutlery_transfers', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['cutlery_locations', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['cutlery_purchase_items', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['cutlery_transfer_items', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['stock_adjustments', 'ADD COLUMN IF NOT EXISTS request_id VARCHAR(64) NULL']
    ];

    for (const [table, clause] of alterations) {
      try {
        await pool.query(`ALTER TABLE ${table} ${clause}`);
      } catch (error) {
        // Table may not exist yet, or the server may not support the clause.
      }
    }

    try {
      await pool.query('CREATE UNIQUE INDEX uq_stock_adjustments_request_id ON stock_adjustments (request_id)');
    } catch (error) {
      // The index may already exist on an upgraded database.
    }

    const backfills = [
      'UPDATE purchases SET status = 0 WHERE deleted = 1',
      'UPDATE wastages SET status = 0 WHERE deleted = 1',
      'UPDATE supplier SET status = 0 WHERE is_deleted = 1',
      'UPDATE payment_methods SET status = 0 WHERE is_active = 0'
    ];

    for (const sql of backfills) {
      try {
        await pool.query(sql);
      } catch (error) {
        // Safe to ignore if the column or table doesn't exist yet.
      }
    }

    console.log('Soft delete status schema ready');
  } catch (error) {
    console.warn('Soft delete status schema check skipped:', error.message);
  }
};

ensureSoftDeleteStatusSchema();

// --- Username-based authentication migration -------------------------------
// Replaces email login with username login:
//   1. Add `username` column (nullable at first so we can backfill it).
//   2. Backfill username from the existing email's local-part for any row
//      that doesn't have one yet, de-duplicating collisions by id suffix.
//   3. Lock it down: NOT NULL + UNIQUE.
//   4. Extend the `role` enum with the app's newer roles.
//   5. Drop the old `email` column (also removes its unique key).
//   6. Seed default accounts only when their usernames do not already exist.
const ensureUsernameAuthSchema = async () => {

  try {
    // 1. Add the column if it isn't there yet.
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100) NULL AFTER name");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'");
    // Login tokens carry this as `tv`; middleware/authenticate.js refuses a token
    // whose tv differs. Bump it (password change, forced sign-out) to revoke
    // every token issued before.
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0 COMMENT 'bump to revoke all issued login tokens'");

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
      ENUM('Admin','Staff','Manager','User','Store Keeper','Accountant','View Only','Super Admin','Finance')
      NOT NULL DEFAULT 'Staff'
    `);

    // 5. Drop the old email column now that username is populated.
    await pool.query("ALTER TABLE users DROP COLUMN IF EXISTS email");

    // 6. The original "accountant" login becomes Accountant 2. Renamed in place so
    //    its id, password, status and every record linked to it are kept.
    const [[legacyAccountant]] = await pool.query(
      "SELECT id, name FROM users WHERE username = 'accountant' AND role = 'Accountant'"
    );
    if (legacyAccountant) {
      const [taken] = await pool.query("SELECT id FROM users WHERE username = 'accountant2'");
      if (taken.length === 0) {
        await pool.query(
          "UPDATE users SET username = 'accountant2', name = IF(name = 'Accountant', 'Accountant 2', name) WHERE id = ?",
          [legacyAccountant.id]
        );
        console.log('Renamed user "accountant" to "accountant2"');
      } else {
        console.warn('User "accountant" not renamed: "accountant2" already exists');
      }
    }

    // 7. No accounts are created here. This used to (re)create seven accounts
    //    with passwords written in this file - known to anyone with the code -
    //    on every start, and re-activated "finance" whenever it was disabled.
    //    Accounts are created with scripts/createUser.js (password typed in,
    //    never stored in code or logs).
    const [[admins]] = await pool.query(
      "SELECT COUNT(*) AS n FROM users WHERE role IN ('Admin', 'Super Admin') AND COALESCE(status, 1) = 1"
    );
    if (Number(admins.n) === 0) {
      console.warn('No active Admin / Super Admin account exists. Create one with: node scripts/createUser.js');
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
        status TINYINT(1) NOT NULL DEFAULT 1,
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
        status TINYINT(1) NOT NULL DEFAULT 1,
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

    for (const clause of [
      "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 AFTER current_balance"
    ]) {
      try {
        await pool.query(`ALTER TABLE cash_accounts ${clause}`);
      } catch (colErr) {
        // Column already present on some MySQL/MariaDB versions.
      }
    }

    for (const clause of [
      "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 AFTER created_by"
    ]) {
      try {
        await pool.query(`ALTER TABLE finance_transactions ${clause}`);
      } catch (colErr) {
        // Column already present on some MySQL/MariaDB versions.
      }
    }

    try {
      await pool.query(
        "ALTER TABLE bank_details ADD COLUMN IF NOT EXISTS record_status TINYINT(1) NOT NULL DEFAULT 1"
      );
    } catch (colErr) {
      // Column already present on some MySQL/MariaDB versions.
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

// Resolves once the Cash / Bank ledger schema (and a cash account for every
// company) is in place - tests/db wait for it before creating fixtures.
pool.financeSchemaReady = ensureFinanceSchema();

const ensureAutoIncrementPrimaryKeys = async () => {
  const repairTables = [
    'bank_details',
    'purchases',
    'purchase_items',
    'payment_history',
    'purchase_payment_allocations',
    'purchase_return_credits'
  ];

  for (const table of repairTables) {
    try {
      await pool.query(`ALTER TABLE ${table} MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT`);
    } catch (error) {
      // Some legacy installs may already have the correct schema, or the table
      // may not exist yet on a fresh setup. Ignore those cases and continue.
      try {
        await pool.query(`ALTER TABLE ${table} ADD PRIMARY KEY (id)`);
      } catch (_) {
        // Safe to ignore when the table is absent or already keyed.
      }
    }
  }

  console.log('Purchase/ledger ID schema repair check complete');
};

ensureAutoIncrementPrimaryKeys();

const ensurePaymentHistorySchema = async () => {
  try {
    await pool.query('ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS bank_id INT NULL AFTER check_number');
  } catch (error) {
    try {
      await pool.query('ALTER TABLE payment_history ADD COLUMN bank_id INT NULL AFTER check_number');
    } catch (_) {}
  }

  try {
    await pool.query('ALTER TABLE expenses_cheque_registry ADD COLUMN IF NOT EXISTS bank_id INT NULL AFTER bank');
  } catch (error) {
    try {
      await pool.query('ALTER TABLE expenses_cheque_registry ADD COLUMN bank_id INT NULL AFTER bank');
    } catch (_) {}
  }

  // Supplier payment Idempotency-Key: the same key twice records one payment
  // (purchaseController.makePayment). See migrations/034_payment_history_request_id.sql.
  try {
    await pool.query('ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS request_id VARCHAR(64) NULL');
    await pool.query('ALTER TABLE payment_history ADD UNIQUE KEY IF NOT EXISTS uq_payment_history_request (request_id)');
  } catch (error) {
    console.warn('payment_history.request_id schema check skipped:', error.message);
  }

  // Settlement payment methods (ADVANCE_PAYMENT / PURCHASE_RETURN / SUPPLIER_CREDIT)
  // and the repair of rows saved before them - services/settlementPaymentMethods.js.
  try {
    await require('../services/settlementPaymentMethods').ensureSettlementPaymentMethods(pool);
  } catch (error) {
    console.warn('payment_history settlement methods check skipped:', error.message);
  }
};

// Resolves once payment_history has its optional columns - tests/db wait for it.
pool.paymentHistorySchemaReady = ensurePaymentHistorySchema();

// Stock adjustments: the signed-in user who saved it (user_name is the approver
// typed on the form, or that user). See migrations/036_stock_adjustments_created_by.sql.
const ensureStockAdjustmentCreatedBy = async () => {
  try {
    await pool.query('ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS created_by INT NULL');
    // Soft delete (audit H5): a deleted adjustment stays in the table, flagged, with who / when / why.
    // See migrations/039_stock_adjustments_soft_delete.sql.
    for (const table of ['stock_adjustments', 'stock_movements']) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) NOT NULL DEFAULT 0`);
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL`);
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_by INT NULL`);
    }
    await pool.query('ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS delete_reason VARCHAR(500) NULL');
    // Maker-checker (audit H4): a new adjustment is Pending and has no stock effect
    // (every "current stock" query also requires status = 'Approved') until a user
    // OTHER than the one who created it approves it. Existing rows default to
    // 'Approved' so historical stock is not changed retroactively.
    // See migrations/040_stock_adjustment_approval.sql.
    await pool.query("ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS status ENUM('Pending','Approved') NOT NULL DEFAULT 'Approved'");
    await pool.query('ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS approved_by INT NULL');
    await pool.query('ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS approved_at DATETIME NULL');
  } catch (error) {
    console.warn('stock_adjustments soft-delete schema check skipped:', error.message);
  }
};
pool.stockAdjustmentSchemaReady = ensureStockAdjustmentCreatedBy();

// Item lines replaced when an invoice / note is edited are copied here first (services/lineHistory.js).
const ensureLineHistorySchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS record_line_history (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        source_table VARCHAR(60) NOT NULL,
        record_id INT NOT NULL,
        line_count INT NOT NULL,
        lines_json LONGTEXT NOT NULL,
        archived_by INT NULL,
        archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_line_history_record (source_table, record_id, archived_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (error) {
    console.warn('record_line_history schema check skipped:', error.message);
  }
};
pool.lineHistorySchemaReady = ensureLineHistorySchema();

// Period close (services/periodLock.js): requests to re-open a closed month.
// See migrations/038_period_reopen_requests.sql.
const ensurePeriodLockSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS period_reopen_requests (
        id INT NOT NULL AUTO_INCREMENT,
        period_from DATE NOT NULL,
        period_to DATE NOT NULL,
        reason VARCHAR(500) NOT NULL,
        status ENUM('Pending','Approved','Rejected','Closed') NOT NULL DEFAULT 'Pending',
        requested_by INT NOT NULL,
        requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        decided_by INT NULL,
        decided_at DATETIME NULL,
        decision_note VARCHAR(500) NULL,
        expires_at DATETIME NULL,
        closed_by INT NULL,
        closed_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_period_reopen_status (status, expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (error) {
    console.warn('period_reopen_requests schema check skipped:', error.message);
  }
};
pool.periodLockSchemaReady = ensurePeriodLockSchema();

// Row-lock handles for duplicate voucher / invoice numbers (audit R9a) -
// services/referenceValidationService.js, migrations/041_reference_locks.sql.
pool.referenceLocksSchemaReady = pool.query(`
  CREATE TABLE IF NOT EXISTS reference_locks (
    ref_norm VARCHAR(100) NOT NULL,
    locked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ref_norm)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
`).catch((error) => console.warn('reference_locks schema check skipped:', error.message));

// Audit Trail (append-only) - services/auditLog.js, migrations/037_audit_log.sql.
pool.auditLogSchemaReady = require('../services/auditLog').ensureAuditLogSchema(pool)
  .catch((error) => console.warn('audit_log schema check skipped:', error.message));
pool.ensurePaymentHistorySchema = ensurePaymentHistorySchema;

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
//   - Petty Cash: NEVER posted to Finance. Vouchers and reimbursements are
//     tracked only inside the Petty Cash module (petty_cash_vouchers /
//     petty_cash_reimbursements); the Cash Ledger is not read or written.
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
    ["petty_cash_reimbursements", "ADD COLUMN IF NOT EXISTS bank_id INT NULL AFTER funding_source"],
    // Petty Cash is Cash-only end-to-end, so vouchers only ever need a
    // company_id (identifying which company's Cash Book was spent) -
    // never a bank_id.
    ["petty_cash_vouchers", "ADD COLUMN IF NOT EXISTS company_id INT NULL AFTER employee_name"]
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

const ensureBankChargesTypeSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bank_charges_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type_name VARCHAR(100) NOT NULL,
        status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_bank_charges_type_name (type_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);

    const defaults = ['Service Charge', 'Cheque Return', 'Overdraft Interest', 'Other'];
    for (const name of defaults) {
      await pool.query(
        'INSERT IGNORE INTO bank_charges_types (type_name) VALUES (?)',
        [name]
      );
    }

    try {
      await pool.query("ALTER TABLE bank_charges ADD COLUMN bank_charge_type_id INT NULL AFTER charges_type");
    } catch (e) { }

    try {
      await pool.query("ALTER TABLE bank_charges ADD CONSTRAINT fk_bank_charges_type FOREIGN KEY (bank_charge_type_id) REFERENCES bank_charges_types(id)");
    } catch (e) { }

    console.log('Bank Charges Type schema ready');
  } catch (error) {
    console.warn('Bank Charges Type schema check skipped:', error.message);
  }
};

ensureBankChargesTypeSchema();

// FG Production - Ravon POS integration.
// FG Items are no longer created/managed inside BSMS - the Ravon Bakers
// POS system is now the source of truth. `external_item_id` stores the
// POS item's ID; `fg_item_name` remains as a display/cache value only.
// Existing fg_production rows created before this change will have
// external_item_id = NULL and keep displaying their existing fg_item_name.
const ensureFgProductionExternalItemSchema = async () => {
  try {
    await pool.query(
      "ALTER TABLE fg_production ADD COLUMN IF NOT EXISTS external_item_id VARCHAR(64) NULL COMMENT 'Ravon POS item ID - source of truth for FG Items' AFTER fg_item_name"
    );
    await pool.query(
      "ALTER TABLE fg_production ADD COLUMN IF NOT EXISTS utility_cost_percentage DECIMAL(5,2) NOT NULL DEFAULT 70 AFTER recipe_output_quantity"
    );
    await pool.query(
      'ALTER TABLE fg_production ADD INDEX IF NOT EXISTS idx_fg_production_external_item_id (external_item_id)'
    );
    console.log('✅ fg_production.external_item_id schema ready');
  } catch (error) {
    console.warn('FG Production external_item_id schema check skipped:', error.message);
  }
};

ensureFgProductionExternalItemSchema();

// --- RM Orders module (Low Stock -> Order -> Purchasing Invoice) -----------
// Adds `orders` / `order_items` (new, additive tables) and a nullable
// `purchases.order_id` link back to the originating Order. Creating an Order
// never touches RM stock - stock only ever changes through the existing
// Purchasing Invoice workflow (purchase_items), exactly as before.
const ensureOrdersSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT NOT NULL AUTO_INCREMENT,
        order_no VARCHAR(30) NOT NULL,
        status ENUM('PENDING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
        supplier_id INT NULL,
        expected_receive_date DATE NOT NULL,
        ordered_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_date DATETIME NULL,
        cancelled_date DATETIME NULL,
        invoice_id INT NULL,
        created_by INT NULL,
        completed_by INT NULL,
        cancelled_by INT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_orders_order_no (order_no),
        KEY idx_orders_status (status),
        KEY idx_orders_supplier (supplier_id),
        KEY idx_orders_invoice (invoice_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT NOT NULL AUTO_INCREMENT,
        order_id INT NOT NULL,
        item_id INT NOT NULL,
        quantity DECIMAL(10,2) NOT NULL,
        unit VARCHAR(20) NULL,
        current_stock_at_order DECIMAL(10,2) NOT NULL DEFAULT 0,
        buffer_stock_at_order DECIMAL(10,2) NOT NULL DEFAULT 0,
        required_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_order_items_order (order_id),
        KEY idx_order_items_item (item_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    try {
      await pool.query("ALTER TABLE purchases ADD COLUMN IF NOT EXISTS order_id INT NULL AFTER company_id");
    } catch (e) { /* already present */ }

    try {
      await pool.query("ALTER TABLE purchases ADD INDEX IF NOT EXISTS idx_purchases_order_id (order_id)");
    } catch (e) { /* already present */ }

    console.log('RM Orders module schema ready');
  } catch (error) {
    console.warn('RM Orders module schema check skipped:', error.message);
  }
};

ensureOrdersSchema();

const ensureIncomeSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS incomes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        income_date DATE NOT NULL,
        company_id INT NOT NULL,
        department_id INT NOT NULL,
        amount DECIMAL(14,2) NOT NULL,
        created_by INT NULL,
        status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_incomes_company FOREIGN KEY (company_id) REFERENCES company(id),
        CONSTRAINT fk_incomes_department FOREIGN KEY (department_id) REFERENCES departments(id),
        KEY idx_incomes_date (income_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Incomes table ready');
  } catch (error) {
    console.warn('Incomes schema check skipped:', error.message);
  }
};

ensureIncomeSchema();

// --- Cash Expenses module -----------------------------------------------------
// `cash_expenses` is a dedicated table for recording cash-based expenses that
// debit a company's Cash In Hand account (linked through company_id).
const ensureCashExpensesSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cash_expenses (
        id             INT NOT NULL AUTO_INCREMENT,
        voucher_number VARCHAR(50) NOT NULL,
        expense_date   DATE NOT NULL,
        company_id     INT NOT NULL,
        expense_type   VARCHAR(255) NOT NULL,
        description    VARCHAR(500) NULL,
        amount         DECIMAL(14,2) NOT NULL,
        created_by     INT NULL,
        status         TINYINT(1) NOT NULL DEFAULT 1,
        created_at     TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_cash_exp_voucher (voucher_number),
        KEY idx_cash_exp_company (company_id),
        KEY idx_cash_exp_date (expense_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    console.log('Cash Expenses schema ready');
  } catch (error) {
    console.warn('Cash Expenses schema check skipped:', error.message);
  }
};

ensureCashExpensesSchema();

// --- New Expenses: sub expense types ------------------------------------
// This is deliberately additive: existing expense rows keep their original
// type and receive nullable sub-type columns until they are edited.
const ensureSubExpenseTypesSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sub_expense_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        expense_type_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        status TINYINT(1) NOT NULL DEFAULT 1,
        created_by INT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_sub_expense_type_parent_name (expense_type_id, name),
        KEY idx_sub_expense_type_parent_status (expense_type_id, status),
        CONSTRAINT fk_sub_expense_type_parent FOREIGN KEY (expense_type_id) REFERENCES expense_types(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    await pool.query('ALTER TABLE expenses ADD COLUMN IF NOT EXISTS sub_expense_type_id INT NULL AFTER expense_type_id');
    await pool.query('ALTER TABLE expenses ADD COLUMN IF NOT EXISTS sub_expense_type VARCHAR(100) NULL AFTER expense_type');
  } catch (error) {
    console.warn('Sub expense type schema check skipped:', error.message);
  }

  // Petty Cash Vouchers and Cash Expenses now use the same managed Expenses
  // Type / Sub Expenses Type lists. The existing expense_type name column is
  // kept (reports and ledger remarks read it); the id / sub type columns are
  // nullable so historical rows stay valid until they are edited.
  const classificationColumns = [
    ['petty_cash_vouchers', 'ADD COLUMN IF NOT EXISTS expense_type_id INT NULL AFTER expense_type'],
    ['petty_cash_vouchers', 'ADD COLUMN IF NOT EXISTS sub_expense_type_id INT NULL AFTER expense_type_id'],
    ['petty_cash_vouchers', 'ADD COLUMN IF NOT EXISTS sub_expense_type VARCHAR(100) NULL AFTER sub_expense_type_id'],
    ['cash_expenses', 'ADD COLUMN IF NOT EXISTS expense_type_id INT NULL AFTER expense_type'],
    ['cash_expenses', 'ADD COLUMN IF NOT EXISTS sub_expense_type_id INT NULL AFTER expense_type_id'],
    ['cash_expenses', 'ADD COLUMN IF NOT EXISTS sub_expense_type VARCHAR(100) NULL AFTER sub_expense_type_id']
  ];
  for (const [table, clause] of classificationColumns) {
    try {
      await pool.query(`ALTER TABLE ${table} ${clause}`);
    } catch (error) {
      console.warn(`Expense classification column check skipped for ${table}:`, error.message);
    }
  }
  // Link historical rows to the managed Expenses Type by exact name (only rows
  // not linked yet). The explicit collation avoids a mix-collation error
  // between tables created with different collations.
  for (const table of ['petty_cash_vouchers', 'cash_expenses']) {
    try {
      await pool.query(
        `UPDATE ${table} t
         JOIN expense_types et ON et.name = t.expense_type COLLATE utf8mb4_unicode_ci
         SET t.expense_type_id = et.id
         WHERE t.expense_type_id IS NULL`
      );
    } catch (error) {
      console.warn(`Expense type back-fill skipped for ${table}:`, error.message);
    }
  }
};

ensureSubExpenseTypesSchema();

// --- New Expenses: Credit Note module -----------------------------------
// A Credit Note is a payee-scoped credit (same idea as payee_overpayments,
// the existing "Advance Payment"-style credit for this module) that is
// raised from an expense bill and can later be set off against a pending
// expense bill for the SAME payee + SAME company. Applying a Credit Note
// never touches Cash/Bank (see expense_credit_note_allocations) - it only
// reduces the target bill's balance, mirroring how supplier_overpayments /
// purchase_return_credits settle a purchase invoice without a cash entry.
const ensureCreditNotesSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payee_credit_notes (
        id                   INT NOT NULL AUTO_INCREMENT,
        credit_note_number   VARCHAR(50) NOT NULL,
        expense_id           INT NULL,
        payee_id             INT NULL,
        payee_name           VARCHAR(255) NOT NULL,
        company_id           INT NOT NULL,
        credit_note_date     DATE NOT NULL,
        without_vat_amount   DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        vat_amount           DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        total_amount         DECIMAL(15,2) NOT NULL,
        remaining_credit     DECIMAL(15,2) NOT NULL,
        status               ENUM('Active','Partially Used','Fully Used','Cancelled') NOT NULL DEFAULT 'Active',
        notes                TEXT NULL,
        created_by           INT NULL,
        created_at           TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at           TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_credit_note_number (credit_note_number),
        KEY idx_pcn_payee (payee_id),
        KEY idx_pcn_company (company_id),
        KEY idx_pcn_expense (expense_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payee_credit_note_allocations (
        id                INT NOT NULL AUTO_INCREMENT,
        credit_note_id    INT NOT NULL,
        expense_id        INT NOT NULL,
        allocated_amount  DECIMAL(15,2) NOT NULL,
        applied_date      DATE NOT NULL,
        applied_by        INT NULL,
        notes             TEXT NULL,
        created_at        TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_pcna_credit_note (credit_note_id),
        KEY idx_pcna_expense (expense_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    console.log('Payee Credit Notes schema ready');
  } catch (error) {
    console.warn('Payee Credit Notes schema check skipped:', error.message);
  }
};

ensureCreditNotesSchema();

// Employee Management module: employees are company staff records used for
// HR purposes (separate from `users`, which are application login accounts).
// department_id links to the existing `departments` master (reused, not
// duplicated - see departmentController.js). designation has no existing
// master table in this project, so it is stored as validated free text for
// now; it can be swapped for a designation_id FK later without any other
// change to this module.
// `company` mirrors the pattern already used by bank_details.company: the
// dropdown is populated from the `company` master (JH/RR/RD, see
// companyController.js) but the chosen name is stored as plain text on the
// row itself, not as a company_id FK - kept a simple VARCHAR (not an ENUM)
// so it never needs a schema change when a new company is added via the
// Companies page.
const ensureEmployeesSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id               INT NOT NULL AUTO_INCREMENT,
        employee_code    VARCHAR(30) NOT NULL,
        employee_name    VARCHAR(150) NOT NULL,
        nic              VARCHAR(20) NOT NULL,
        contact_number   VARCHAR(15) NOT NULL,
        department_id    INT NULL,
        designation      VARCHAR(100) NOT NULL,
        company          VARCHAR(100) NULL,
        joining_date     DATE NOT NULL,
        status           ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
        created_by       INT NULL,
        created_at       TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_employees_employee_code (employee_code),
        UNIQUE KEY uniq_employees_nic (nic),
        KEY idx_employees_department (department_id),
        KEY idx_employees_status (status),
        CONSTRAINT fk_employees_department FOREIGN KEY (department_id) REFERENCES departments(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Existing installs (table already created before this change) won't
    // have the column yet - add it in place, same "ADD COLUMN IF NOT
    // EXISTS" pattern used everywhere else in this file.
    await pool.query("ALTER TABLE employees ADD COLUMN IF NOT EXISTS company VARCHAR(100) NULL AFTER designation");
    // Older installs used NOT NULL for employee details that are now optional.
    await pool.query(`ALTER TABLE employees
      MODIFY COLUMN nic VARCHAR(20) NULL,
      MODIFY COLUMN contact_number VARCHAR(15) NULL,
      MODIFY COLUMN department_id INT NULL,
      MODIFY COLUMN designation VARCHAR(100) NULL,
      MODIFY COLUMN joining_date DATE NULL,
      MODIFY COLUMN company VARCHAR(100) NULL`);

    console.log('Employees schema ready');
  } catch (error) {
    console.warn('Employees schema check skipped:', error.message);
  }
};

// Finance -> Staff Loans.
// `staff_loans` references employees.id (Employee Management - reused, not
// duplicated) and company.id (whose Cash Book pays out the loan and receives
// repayments; issue_finance_transaction_id points at the payout's Cash Out row).
// `staff_loan_repayments` stores every repayment separately; the outstanding
// balance is always derived as loan_amount - SUM(repayments) and is never
// stored, so it cannot drift from the repayment history. See
// migrations/017_staff_loans.sql for the documented schema.
const ensureStaffLoansSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff_loans (
        id             INT NOT NULL AUTO_INCREMENT,
        employee_id    INT NOT NULL,
        company_id     INT NOT NULL,
        loan_amount    DECIMAL(14,2) NOT NULL,
        issued_date    DATE NOT NULL,
        cheque_details VARCHAR(500) NULL,
        issue_finance_transaction_id INT NULL,
        status         ENUM('Active','Settled') NOT NULL DEFAULT 'Active',
        created_by     INT NULL,
        created_at     TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at     TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_staff_loans_employee (employee_id),
        KEY idx_staff_loans_company (company_id),
        KEY idx_staff_loans_status (status),
        KEY idx_staff_loans_issued_date (issued_date),
        CONSTRAINT fk_staff_loans_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
        CONSTRAINT fk_staff_loans_company FOREIGN KEY (company_id) REFERENCES company(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff_loan_repayments (
        id                     INT NOT NULL AUTO_INCREMENT,
        staff_loan_id          INT NOT NULL,
        amount                 DECIMAL(14,2) NOT NULL,
        received_date          DATE NOT NULL,
        finance_transaction_id INT NULL,
        created_by             INT NULL,
        created_at             TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at             TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_staff_loan_repayments_loan (staff_loan_id),
        KEY idx_staff_loan_repayments_date (received_date),
        CONSTRAINT fk_staff_loan_repayments_loan FOREIGN KEY (staff_loan_id) REFERENCES staff_loans(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Installs that created staff_loans before loan payouts were posted to the
    // Cash Book: add the link to the Cash Out row (additive, safe to re-run).
    try {
      await pool.query(
        "ALTER TABLE staff_loans ADD COLUMN IF NOT EXISTS issue_finance_transaction_id INT NULL AFTER cheque_details"
      );
    } catch (colErr) {
      // Column already present on some MySQL/MariaDB versions that don't
      // support IF NOT EXISTS here - safe to ignore.
    }

    console.log('Staff Loans schema ready');
  } catch (error) {
    console.warn('Staff Loans schema check skipped:', error.message);
  }
};

// The staff-loan tables have foreign keys to `employees`, so they are created
// only after the employees table check has finished (the schema checks in this
// file otherwise start concurrently).
ensureEmployeesSchema().then(ensureStaffLoansSchema);

// Finance -> Intercompany Transaction.
// A pure fund movement between two companies' Cash/Bank accounts (e.g. JH
// Bank -> RD Cash). This table is the audit trail: the actual balance
// changes are posted as two ordinary finance_transactions rows (one CREDIT
// on the From account, one DEBIT on the To account) via the existing
// recordCashTransaction/recordBankTransaction helpers, tagged
// reference_type = 'INTERCOMPANY_TRANSFER' and reference_id = this row's id.
// It is intentionally NOT written to `expenses`, `petty_cash_vouchers` or
// `bank_charges`, so it can never appear on the Expense Report (see
// reportController.getExpensesReport, which only reads those three tables).
const ensureIntercompanyTransactionsSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS intercompany_transactions (
        id                  INT NOT NULL AUTO_INCREMENT,
        from_company_id     INT NOT NULL,
        from_account_type   ENUM('CASH','BANK') NOT NULL,
        from_bank_id        INT NULL,
        from_balance_after  DECIMAL(14,2) NULL,
        to_company_id       INT NOT NULL,
        to_account_type     ENUM('CASH','BANK') NOT NULL,
        to_bank_id          INT NULL,
        to_balance_after    DECIMAL(14,2) NULL,
        amount              DECIMAL(14,2) NOT NULL,
        transaction_date    DATE NOT NULL,
        description         VARCHAR(255) NULL,
        status              TINYINT(1) NOT NULL DEFAULT 1,
        created_by          INT NULL,
        created_at          TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_ict_from_company (from_company_id),
        KEY idx_ict_to_company (to_company_id),
        KEY idx_ict_date (transaction_date),
        CONSTRAINT fk_ict_from_company FOREIGN KEY (from_company_id) REFERENCES company(id),
        CONSTRAINT fk_ict_to_company FOREIGN KEY (to_company_id) REFERENCES company(id),
        CONSTRAINT fk_ict_from_bank FOREIGN KEY (from_bank_id) REFERENCES bank_details(id),
        CONSTRAINT fk_ict_to_bank FOREIGN KEY (to_bank_id) REFERENCES bank_details(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('Intercompany Transactions schema ready');
  } catch (error) {
    console.warn('Intercompany Transactions schema check skipped:', error.message);
  }
};

ensureIntercompanyTransactionsSchema();

// Finance -> Card Ledger.
// A card transaction stays PENDING (no bank posting at all) until it is
// realised. Realising one or more Pending rows creates ONE card_realisations
// record (total, Realise Amount, Remaining Balance), ONE Bank Ledger debit for
// the Realise Amount and ONE Hidden Expense ("Visa Card Payment") for the
// Remaining Balance; the card rows only point at the realisation. The unique
// links on card_realisations stop one ledger / hidden-expense row from being
// attached to two realisations. See migrations/024_card_ledger.sql.
const ensureCardLedgerSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS card_transactions (
        id                     INT NOT NULL AUTO_INCREMENT,
        company_id             INT NOT NULL,
        bank_id                INT NOT NULL,
        transaction_date       DATE NOT NULL,
        amount                 DECIMAL(14,2) NOT NULL,
        reference_number       VARCHAR(100) NULL,
        remark                 VARCHAR(255) NULL,
        status                 ENUM('Pending','Completed') NOT NULL DEFAULT 'Pending',
        realise_date           DATE NULL,
        realise_amount         DECIMAL(14,2) NULL,
        remaining_balance      DECIMAL(14,2) NULL,
        finance_transaction_id INT NULL,
        hidden_expense_id      INT NULL,
        realisation_id         INT NULL,
        realised_by            INT NULL,
        realised_at            TIMESTAMP NULL,
        created_by             INT NULL,
        created_at             TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at             TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_card_tx_status_date (status, transaction_date),
        KEY idx_card_tx_bank (bank_id),
        KEY idx_card_tx_company (company_id),
        KEY idx_card_tx_realisation (realisation_id),
        CONSTRAINT fk_card_tx_company FOREIGN KEY (company_id) REFERENCES company(id),
        CONSTRAINT fk_card_tx_bank FOREIGN KEY (bank_id) REFERENCES bank_details(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS card_realisations (
        id                     INT NOT NULL AUTO_INCREMENT,
        company_id             INT NOT NULL,
        bank_id                INT NOT NULL,
        realise_date           DATE NOT NULL,
        total_amount           DECIMAL(14,2) NOT NULL,
        realise_amount         DECIMAL(14,2) NOT NULL,
        remaining_balance      DECIMAL(14,2) NOT NULL,
        reference_number       VARCHAR(100) NULL,
        finance_transaction_id INT NULL,
        hidden_expense_id      INT NULL,
        created_by             INT NULL,
        created_at             TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_card_real_finance_tx (finance_transaction_id),
        UNIQUE KEY uq_card_real_hidden_exp (hidden_expense_id),
        KEY idx_card_real_bank_date (bank_id, realise_date),
        KEY idx_card_real_company (company_id),
        CONSTRAINT fk_card_real_company FOREIGN KEY (company_id) REFERENCES company(id),
        CONSTRAINT fk_card_real_bank FOREIGN KEY (bank_id) REFERENCES bank_details(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Installs created by earlier versions of this module (additive / safe to re-run).
    for (const ddl of [
      "ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS realise_amount DECIMAL(14,2) NULL AFTER realise_date",
      "ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(14,2) NULL AFTER realise_amount",
      "ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS hidden_expense_id INT NULL AFTER finance_transaction_id",
      "ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS realisation_id INT NULL AFTER hidden_expense_id",
      "ALTER TABLE card_transactions ADD KEY idx_card_tx_realisation (realisation_id)",
      // One realisation now covers several card rows, so the per-row unique links of
      // the earlier version must go (the unique links live on card_realisations).
      "ALTER TABLE card_transactions DROP INDEX uq_card_tx_finance_tx",
      "ALTER TABLE card_transactions DROP INDEX uq_card_tx_hidden_expense"
    ]) {
      try { await pool.query(ddl); } catch (ddlErr) { /* already applied / not present */ }
    }

    // Rows realised before batch realisation existed: give each its own
    // card_realisations record so the Completed tab reads one source. Rows
    // realised in full by the very first version had no Realise Amount:
    // they count as realised in full (remaining 0). Idempotent.
    await pool.query(`
      INSERT INTO card_realisations
        (company_id, bank_id, realise_date, total_amount, realise_amount, remaining_balance,
         reference_number, finance_transaction_id, hidden_expense_id, created_by, created_at)
      SELECT company_id, bank_id, realise_date, amount, COALESCE(realise_amount, amount),
             COALESCE(remaining_balance, 0), reference_number, finance_transaction_id,
             hidden_expense_id, realised_by, COALESCE(realised_at, created_at)
      FROM card_transactions
      WHERE status = 'Completed' AND realisation_id IS NULL
        AND finance_transaction_id IS NOT NULL AND realise_date IS NOT NULL
    `);
    await pool.query(`
      UPDATE card_transactions ct
        JOIN card_realisations cr ON cr.finance_transaction_id = ct.finance_transaction_id
         SET ct.realisation_id = cr.id
       WHERE ct.status = 'Completed' AND ct.realisation_id IS NULL
    `);

    // Hidden Expenses gain the "Visa Card Payment" type (existing values are kept).
    // The list must include every later type too (ensureCardCommissionSchema),
    // otherwise this startup step would shrink the ENUM again.
    try {
      await pool.query(
        "ALTER TABLE hidden_expenses MODIFY COLUMN `type` ENUM('PickMe','Credit Card Charge','Visa Card Payment','Visa Card Payment commission','Credit Card Bank Charge') NOT NULL"
      );
    } catch (enumErr) {
      console.warn('Hidden Expenses type update skipped:', enumErr.message);
    }

    console.log('Card Ledger schema ready');
  } catch (error) {
    console.warn('Card Ledger schema check skipped:', error.message);
  }
};

const cardLedgerReady = ensureCardLedgerSchema();

// Management / Finance -> Other Ledgers (Director, AR, Short, Excess, ...).
// Additive only. The source transaction (a finance_transactions row with
// reference_type CASH_RECEIVE or CASH_ISSUED) stays the primary record;
// other_ledger_transactions holds its linked ledger impact, one row per
// source (UNIQUE source_type + source_id). Balances are always derived
// (credit - debit); nothing is stored as a balance. See
// migrations/026_other_ledgers.sql.
const ensureOtherLedgersSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS other_ledgers (
        id         INT NOT NULL AUTO_INCREMENT,
        name       VARCHAR(100) NOT NULL,
        status     TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_other_ledgers_status (status),
        KEY idx_other_ledgers_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS other_ledger_transactions (
        id               INT NOT NULL AUTO_INCREMENT,
        other_ledger_id  INT NOT NULL,
        transaction_date DATE NOT NULL,
        debit            DECIMAL(14,2) NOT NULL DEFAULT 0,
        credit           DECIMAL(14,2) NOT NULL DEFAULT 0,
        source_type      ENUM('CASH_RECEIVE','CASH_ISSUED') NOT NULL,
        source_id        INT NOT NULL,
        company_id       INT NULL,
        reference_no     VARCHAR(100) NULL,
        remark           VARCHAR(255) NULL,
        status           TINYINT(1) NOT NULL DEFAULT 1,
        created_by       INT NULL,
        created_at       TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_olt_source (source_type, source_id),
        KEY idx_olt_ledger_date (other_ledger_id, transaction_date),
        CONSTRAINT fk_olt_other_ledger FOREIGN KEY (other_ledger_id) REFERENCES other_ledgers(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Company-wise Other Ledgers: which companies may post to which ledger.
    // A transaction can only use a ledger linked to its own company, and every
    // balance / statement is read per company (other_ledger_transactions.company_id).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS other_ledger_company_map (
        other_ledger_id INT NOT NULL,
        company_id      INT NOT NULL,
        created_at      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (other_ledger_id, company_id),
        KEY idx_olcm_company (company_id),
        CONSTRAINT fk_olcm_other_ledger FOREIGN KEY (other_ledger_id) REFERENCES other_ledgers(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // Keep existing history valid: every ledger stays linked to each company it
    // already has transactions for. Idempotent (a company with transactions on a
    // ledger cannot be unlinked, so this never re-adds a removed link).
    // Ledgers with no transactions yet get no link: they are linked to their
    // companies under Other Ledgers management before they can be used.
    await pool.query(`
      INSERT IGNORE INTO other_ledger_company_map (other_ledger_id, company_id)
      SELECT DISTINCT olt.other_ledger_id, olt.company_id
        FROM other_ledger_transactions olt
        JOIN company c ON c.id = olt.company_id
       WHERE olt.status = 1
    `);

    console.log('Other Ledgers schema ready');
  } catch (error) {
    console.warn('Other Ledgers schema check skipped:', error.message);
  }
};

const otherLedgersReady = ensureOtherLedgersSchema();

// Collection module (POS -> Pending -> Completed / Rejected) and the two system
// Other Ledger accounts it posts to. Additive only - see
// migrations/027_collections.sql for the design notes.
const SYSTEM_OTHER_LEDGERS = ['AR Account', 'Short/Excess Account'];

// An earlier, never-released draft of this module created `collections` with a
// different layout (source / source_reference ...). CREATE TABLE IF NOT EXISTS
// would keep that table, so it is moved aside (renamed, nothing deleted) when it
// holds only pending staging rows. Pending rows are simply re-read from the POS.
const retireDraftCollectionsTable = async () => {
  const [cols] = await pool.query(
    `SELECT column_name AS name FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'collections'`
  );
  const names = new Set(cols.map((c) => String(c.name).toLowerCase()));
  if (names.size === 0 || names.has('source_type') || !names.has('source_reference')) return;

  const [[{ settled }]] = await pool.query("SELECT COUNT(*) AS settled FROM collections WHERE status <> 'pending'");
  if (Number(settled) > 0) {
    throw new Error('the old draft `collections` table has completed/rejected rows - migrate it by hand (see migrations/027_collections.sql)');
  }
  const [[ct]] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'collection_transactions'`
  );
  if (Number(ct.n) > 0) {
    const [[{ line_count: lineCount }]] = await pool.query('SELECT COUNT(*) AS line_count FROM collection_transactions');
    if (Number(lineCount) > 0) throw new Error('collection_transactions is not empty - migrate the old draft `collections` table by hand');
    // Its foreign key points at `collections`; recreate it after the rename.
    await pool.query('DROP TABLE collection_transactions');
  }
  const [[legacy]] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'collections_legacy_draft'`
  );
  const target = Number(legacy.n) > 0 ? `collections_legacy_draft_${Date.now()}` : 'collections_legacy_draft';
  await pool.query(`RENAME TABLE collections TO ${target}`);
  console.warn(`Collections: old draft table renamed to ${target}; pending records will be re-read from the POS`);
};

// --- information_schema helpers (work on MySQL and MariaDB, so every step can
// be checked first and safely re-run) ------------------------------------------
const columnExists = async (table, column) => {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
};
// Column list of an index, in order ('' when the index does not exist).
const indexColumns = async (table, index) => {
  const [rows] = await pool.query(
    `SELECT column_name AS col FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
      ORDER BY seq_in_index`,
    [table, index]
  );
  return rows.map((r) => String(r.col).toLowerCase()).join(',');
};

// collections.source_system ('POS' | 'RESTAURANT'). Existing rows are POS (the
// column default backfills them). The unique key becomes (source_system,
// source_type, source_id) - added BEFORE the old (source_type, source_id) one is
// dropped, so uniqueness is never lost. Idempotent; see
// migrations/031_restaurant_collections_integration_sessions.sql.
let collectionsSourceSystemOk = false;
const ensureCollectionsSourceSystem = async () => {
  if (!(await columnExists('collections', 'source_system'))) {
    await pool.query("ALTER TABLE collections ADD COLUMN source_system ENUM('POS','RESTAURANT') NOT NULL DEFAULT 'POS' AFTER id");
  }
  await pool.query("UPDATE collections SET source_system = 'POS' WHERE source_system IS NULL OR source_system = ''");
  if (!(await indexColumns('collections', 'uq_collections_system_source'))) {
    await pool.query('ALTER TABLE collections ADD UNIQUE KEY uq_collections_system_source (source_system, source_type, source_id)');
  }
  if (await indexColumns('collections', 'uq_collections_source')) {
    await pool.query('ALTER TABLE collections DROP INDEX uq_collections_source');
  }
  if (!(await indexColumns('collections', 'idx_collections_system_reference'))) {
    await pool.query('ALTER TABLE collections ADD KEY idx_collections_system_reference (source_system, source_type, reference_no)');
  }
  collectionsSourceSystemOk = true;
};

// One COMPLETED collection per (source_system, source_type, reference_no):
// completed_ref_key is NULL for every other row, so only approved rows compete
// for the UNIQUE key. Two users approving two pending copies of the same POS
// reference at the same moment can then never both post to the ledgers - the
// second status flip fails with ER_DUP_ENTRY and its transaction rolls back.
// See migrations/033_collections_completed_reference_unique.sql.
const ensureCollectionsCompletedReferenceUnique = async () => {
  if (await indexColumns('collections', 'uq_collections_completed_ref')) return;
  const [dupes] = await pool.query(
    `SELECT source_system, source_type, reference_no, COUNT(*) AS n FROM collections
      WHERE status = 'completed' AND reference_no IS NOT NULL
      GROUP BY source_system, source_type, reference_no HAVING n > 1 LIMIT 5`
  );
  if (dupes.length) {
    throw new Error(`completed collections already share a reference (${dupes.map((d) => `${d.source_system}:${d.source_type}:${d.reference_no}`).join(', ')}) - resolve them by hand`);
  }
  if (!(await columnExists('collections', 'completed_ref_key'))) {
    await pool.query(
      `ALTER TABLE collections ADD COLUMN completed_ref_key VARCHAR(220)
         AS (IF(status = 'completed' AND reference_no IS NOT NULL,
                CONCAT(source_system, ':', source_type, ':', reference_no), NULL)) PERSISTENT`
    );
  }
  await pool.query('ALTER TABLE collections ADD UNIQUE KEY uq_collections_completed_ref (completed_ref_key)');
};

const ensureCollectionsSchema = async () => {
  try {
    await retireDraftCollectionsTable();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS collections (
        id                   INT NOT NULL AUTO_INCREMENT,
        source_system        ENUM('POS','RESTAURANT') NOT NULL DEFAULT 'POS',
        source_type          ENUM('SHIFT','CREDIT_PAYMENT','EMPLOYEE_DEDUCTION') NOT NULL,
        source_id            VARCHAR(100) NOT NULL,
        reference_no         VARCHAR(100) NULL,
        collection_date      DATE NOT NULL,
        shift_id             VARCHAR(100) NULL,
        shift_no             VARCHAR(50) NULL,
        shift_reference      VARCHAR(100) NULL,
        cashier_name         VARCHAR(255) NULL,
        employee_id          VARCHAR(100) NULL,
        employee_name        VARCHAR(255) NULL,
        pos_company          VARCHAR(255) NULL,
        company_id           INT NULL,
        pos_branch_id        VARCHAR(50) NULL,
        pos_branch_name      VARCHAR(255) NULL,
        department_id        INT NULL,
        pos_payment_method   VARCHAR(50) NULL,
        pos_bank_account     VARCHAR(100) NULL,
        cash_amount          DECIMAL(14,2) NOT NULL DEFAULT 0,
        card_amount          DECIMAL(14,2) NOT NULL DEFAULT 0,
        bank_amount          DECIMAL(14,2) NOT NULL DEFAULT 0,
        ar_amount            DECIMAL(14,2) NOT NULL DEFAULT 0,
        short_excess_amount  DECIMAL(14,2) NOT NULL DEFAULT 0,
        deduction_amount     DECIMAL(14,2) NOT NULL DEFAULT 0,
        total_amount         DECIMAL(14,2) NOT NULL DEFAULT 0,
        pos_total_amount     DECIMAL(14,2) NULL,
        linked_collection_id INT NULL,
        status               ENUM('pending','completed','rejected') NOT NULL DEFAULT 'pending',
        approved_by          INT NULL,
        approved_at          DATETIME NULL,
        rejected_by          INT NULL,
        rejected_at          DATETIME NULL,
        rejection_reason     VARCHAR(255) NULL,
        raw_payload          LONGTEXT NULL,
        last_synced_at       DATETIME NULL,
        created_at           TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at           TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_collections_system_source (source_system, source_type, source_id),
        KEY idx_collections_reference (source_type, reference_no),
        KEY idx_collections_system_reference (source_system, source_type, reference_no),
        KEY idx_collections_status_date (status, collection_date),
        KEY idx_collections_company (company_id),
        KEY idx_collections_shift (shift_id),
        KEY idx_collections_department (department_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Shift reference + POS branch -> department (added after the first release).
    for (const stmt of [
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS shift_no VARCHAR(50) NULL AFTER shift_id',
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS shift_reference VARCHAR(100) NULL AFTER shift_no',
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS pos_branch_id VARCHAR(50) NULL AFTER company_id',
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS pos_branch_name VARCHAR(255) NULL AFTER pos_branch_id',
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS department_id INT NULL AFTER pos_branch_name',
      'ALTER TABLE collections ADD KEY IF NOT EXISTS idx_collections_department (department_id)',
      // Individual card payments of a shift (count / sum of card.transactions[]).
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS card_txn_count INT NULL AFTER card_amount',
      'ALTER TABLE collections ADD COLUMN IF NOT EXISTS card_txn_total DECIMAL(14,2) NULL AFTER card_txn_count'
    ]) {
      try { await pool.query(stmt); } catch (alterErr) { console.warn('Collections schema alter skipped:', alterErr.message); }
    }

    // RAVON Restaurant records next to POS ones (migrations/031_...sql). Without
    // it a Restaurant record could collide with a POS one, so the Restaurant sync
    // is refused (pool.collectionsSourceSystemOk) until this succeeded.
    try {
      await ensureCollectionsSourceSystem();
    } catch (systemErr) {
      console.error('Collections source_system migration FAILED - Restaurant sync disabled:', systemErr.message);
    }
    try {
      await ensureCollectionsCompletedReferenceUnique();
    } catch (refErr) {
      console.error('Collections completed-reference UNIQUE key FAILED - duplicate approvals are only checked in code:', refErr.message);
    }

    // Records BSMS did not accept from POS / Restaurant, and approved collections that changed
    // upstream afterwards (services/collectionQuarantine.js, audit M4).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS collection_data_issues (
        id               INT NOT NULL AUTO_INCREMENT,
        issue_key        CHAR(64) NOT NULL,
        source_system    ENUM('POS','RESTAURANT') NOT NULL,
        source_type      ENUM('SHIFT','CREDIT_PAYMENT','EMPLOYEE_DEDUCTION') NOT NULL,
        source_id        VARCHAR(100) NULL,
        kind             ENUM('REJECTED','CHANGED_AFTER_APPROVAL') NOT NULL,
        reason           VARCHAR(1000) NOT NULL,
        fields           VARCHAR(2000) NULL,
        raw_payload      MEDIUMTEXT NULL,
        collection_id    INT NULL,
        seen_count       INT NOT NULL DEFAULT 1,
        first_seen_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        status           ENUM('OPEN','RESOLVED') NOT NULL DEFAULT 'OPEN',
        resolved_by      INT NULL,
        resolved_at      DATETIME NULL,
        resolution_note  VARCHAR(500) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_collection_data_issues_key (issue_key),
        KEY idx_collection_data_issues_status (status, last_seen_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS collection_transactions (
        id                          INT NOT NULL AUTO_INCREMENT,
        collection_id               INT NOT NULL,
        transaction_date            DATE NOT NULL,
        reference_no                VARCHAR(100) NULL,
        payment_method              ENUM('CASH','CARD','BANK','AR','SHORT_EXCESS','AR_SETTLEMENT') NOT NULL,
        amount                      DECIMAL(14,2) NOT NULL,
        company_id                  INT NOT NULL,
        bank_account_id             INT NULL,
        finance_transaction_id      INT NULL,
        card_transaction_id         INT NULL,
        other_ledger_id             INT NULL,
        other_ledger_transaction_id INT NULL,
        related_collection_id       INT NULL,
        source_type                 ENUM('SHIFT','CREDIT_PAYMENT','EMPLOYEE_DEDUCTION') NOT NULL,
        source_id                   VARCHAR(100) NOT NULL,
        created_by                  INT NULL,
        created_at                  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at                  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_ct_collection_method (collection_id, payment_method),
        KEY idx_ct_method_date (payment_method, transaction_date),
        KEY idx_ct_source (source_type, source_id),
        CONSTRAINT fk_ct_collection FOREIGN KEY (collection_id) REFERENCES collections(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // One row per individual POS card payment posted to the Card Ledger: the
    // shift's CARD line in collection_transactions is only the summary. The
    // UNIQUE POS key (source + shift + POS payment id) makes posting the same
    // card payment twice impossible, whichever collection tries it.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS collection_card_payments (
        id                          INT NOT NULL AUTO_INCREMENT,
        collection_id               INT NOT NULL,
        collection_transaction_id   INT NOT NULL,
        pos_card_key                VARCHAR(191) NOT NULL,
        pos_type                    VARCHAR(30) NULL,
        pos_sale_id                 VARCHAR(50) NULL,
        pos_order_id                VARCHAR(50) NULL,
        pos_receipt_no              VARCHAR(100) NULL,
        pos_payment_method          VARCHAR(50) NULL,
        pos_date_time               VARCHAR(40) NULL,
        transaction_date            DATE NOT NULL,
        amount                      DECIMAL(14,2) NOT NULL,
        card_transaction_id         INT NOT NULL,
        created_by                  INT NULL,
        created_at                  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_ccp_pos_card (pos_card_key),
        UNIQUE KEY uq_ccp_card_tx (card_transaction_id),
        KEY idx_ccp_collection (collection_id),
        CONSTRAINT fk_ccp_collection FOREIGN KEY (collection_id) REFERENCES collections(id),
        CONSTRAINT fk_ccp_line FOREIGN KEY (collection_transaction_id) REFERENCES collection_transactions(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Other Ledger additions need the Other Ledger tables first.
    await otherLedgersReady;
    for (const stmt of [
      'ALTER TABLE other_ledgers ADD COLUMN IF NOT EXISTS is_system TINYINT(1) NOT NULL DEFAULT 0',
      "ALTER TABLE other_ledgers ADD COLUMN IF NOT EXISTS normal_balance ENUM('CREDIT','DEBIT') NOT NULL DEFAULT 'CREDIT'",
      // Transaction direction: money issued from Cash/Bank TO an Other Ledger is
      // IN for that ledger, money received FROM it is OUT. Stored debit/credit
      // rows are unchanged (Issued = Other Ledger DEBIT, Received = CREDIT); every
      // Other Ledger is debit-normal, so balance = SUM(debit) - SUM(credit).
      "ALTER TABLE other_ledgers MODIFY COLUMN normal_balance ENUM('CREDIT','DEBIT') NOT NULL DEFAULT 'DEBIT'",
      "UPDATE other_ledgers SET normal_balance = 'DEBIT' WHERE normal_balance <> 'DEBIT'",
      // BANK_RECEIVE / BANK_ISSUED: Bank Ledger rows linked to an Other Ledger
      // (Finance -> Bank Ledger -> Bank Received / Bank Issued).
      "ALTER TABLE other_ledger_transactions MODIFY COLUMN source_type ENUM('CASH_RECEIVE','CASH_ISSUED','COLLECTION_AR','COLLECTION_SHORT_EXCESS','COLLECTION_AR_SETTLEMENT','BANK_RECEIVE','BANK_ISSUED') NOT NULL",
      // Credit Payment approval also credits the AR Account (collectionService
      // AR_SETTLEMENT line). Adding an ENUM value keeps every existing row.
      "ALTER TABLE collection_transactions MODIFY COLUMN payment_method ENUM('CASH','CARD','BANK','AR','SHORT_EXCESS','AR_SETTLEMENT') NOT NULL"
    ]) {
      try { await pool.query(stmt); } catch (alterErr) { console.warn('Collections schema alter skipped:', alterErr.message); }
    }

    // The two system accounts. An existing ledger with exactly that name is
    // adopted (marked system); its balance side is only switched to DEBIT when
    // it has no transactions yet, so no existing balance can flip sign.
    for (const name of SYSTEM_OTHER_LEDGERS) {
      const [rows] = await pool.query(
        'SELECT id FROM other_ledgers WHERE LOWER(TRIM(name)) = LOWER(?) ORDER BY status DESC, id ASC LIMIT 1', [name]
      );
      if (rows.length === 0) {
        await pool.query("INSERT INTO other_ledgers (name, status, is_system, normal_balance) VALUES (?, 1, 1, 'DEBIT')", [name]);
      } else {
        const [used] = await pool.query('SELECT 1 FROM other_ledger_transactions WHERE other_ledger_id = ? LIMIT 1', [rows[0].id]);
        await pool.query('UPDATE other_ledgers SET is_system = 1, status = 1 WHERE id = ?', [rows[0].id]);
        if (used.length === 0) await pool.query("UPDATE other_ledgers SET normal_balance = 'DEBIT' WHERE id = ?", [rows[0].id]);
      }
    }
    // The system accounts serve every company (each company's entries and
    // balance are kept apart by company_id), so they are linked to all of them.
    await pool.query(`
      INSERT IGNORE INTO other_ledger_company_map (other_ledger_id, company_id)
      SELECT ol.id, c.id FROM other_ledgers ol CROSS JOIN company c WHERE ol.is_system = 1
    `);

    // POS "MASActive" is the "MAS Intimo" department (departmentMapper
    // normalizePosBranchName). Rows staged before that rule get the Stock
    // Management name; the original POS name stays in raw_payload. Pending rows
    // that were unmapped because of it are mapped. Idempotent.
    try {
      await pool.query(
        "UPDATE collections SET pos_branch_name = REPLACE(pos_branch_name, 'MASActive', 'MAS Intimo') WHERE pos_branch_name LIKE BINARY '%MASActive%'"
      );
      await pool.query(
        `UPDATE collections c JOIN departments d ON d.name = 'MAS Intimo'
            SET c.department_id = d.id
          WHERE c.status = 'pending' AND c.department_id IS NULL
            AND (c.pos_branch_name = 'MAS Intimo' OR c.pos_branch_name LIKE 'MAS Intimo -%' OR c.pos_branch_name LIKE 'MAS Intimo (%')`
      );
    } catch (renameErr) {
      console.warn('Collections MASActive -> MAS Intimo update skipped:', renameErr.message);
    }

    // POS "MASBrew" is the existing "MAS Ayathi Brew Bar" department (same rule).
    // Rows staged before it get the Stock Management name (also fixing any stored
    // as "MAS Ayathi brew bar"); not-yet-approved rows left unmapped because of
    // it get the department - only when exactly one such department exists.
    // Completed rows and every other branch are untouched. Idempotent.
    try {
      await pool.query(
        "UPDATE collections SET pos_branch_name = REPLACE(pos_branch_name, 'MASBrew', 'MAS Ayathi Brew Bar') WHERE pos_branch_name LIKE BINARY '%MASBrew%'"
      );
      await pool.query(
        "UPDATE collections SET pos_branch_name = REPLACE(pos_branch_name, 'MAS Ayathi brew bar', 'MAS Ayathi Brew Bar') WHERE pos_branch_name LIKE BINARY '%MAS Ayathi brew bar%'"
      );
      const [brewDepartments] = await pool.query("SELECT id FROM departments WHERE name = 'MAS Ayathi Brew Bar'");
      if (brewDepartments.length === 1) {
        await pool.query(
          `UPDATE collections SET department_id = ?
            WHERE status IN ('pending', 'rejected') AND department_id IS NULL
              AND (pos_branch_name = 'MAS Ayathi Brew Bar' OR pos_branch_name LIKE 'MAS Ayathi Brew Bar -%' OR pos_branch_name LIKE 'MAS Ayathi Brew Bar (%')`,
          [brewDepartments[0].id]
        );
      }
    } catch (renameErr) {
      console.warn('Collections MASBrew -> MAS Ayathi Brew Bar update skipped:', renameErr.message);
    }

    // Card payment summary for shifts staged before it existed (read from the
    // stored POS payload; nothing is invented). Summary columns only, once each.
    try {
      const { cardPaymentsOf } = require('../services/collectionMapper');
      const [shifts] = await pool.query(
        "SELECT id, raw_payload FROM collections WHERE source_type = 'SHIFT' AND card_txn_count IS NULL AND card_amount <> 0"
      );
      for (const row of shifts) {
        const details = cardPaymentsOf(row.raw_payload);
        if (!details.available) continue;
        await pool.query(
          'UPDATE collections SET card_txn_count = ?, card_txn_total = ? WHERE id = ? AND card_txn_count IS NULL',
          [details.count, details.total, row.id]
        );
      }
    } catch (backfillErr) {
      console.warn('Collections card payment summary backfill skipped:', backfillErr.message);
    }

    console.log('Collections schema ready');
  } catch (error) {
    console.warn('Collections schema check skipped:', error.message);
  }
};

pool.collectionsSchemaReady = ensureCollectionsSchema();
pool.collectionsSourceSystemOk = () => collectionsSourceSystemOk;

// POS / Restaurant sessions of Stock Management users (services/posSessionStore.js):
// only the encrypted Bearer token, never a password. One row per (user, provider).
// Upgrades the earlier POS-only table (PRIMARY KEY user_id, no provider column):
// its rows become provider 'pos' and keep working. Idempotent; see
// migrations/031_restaurant_collections_integration_sessions.sql.
const ensureIntegrationSessionsSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pos_sessions (
        user_id        INT NOT NULL,
        provider       VARCHAR(20) NOT NULL DEFAULT 'pos',
        pos_username   VARCHAR(150) NOT NULL,
        token_enc      TEXT NOT NULL,
        expires_at     DATETIME NULL,
        created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        invalidated_at DATETIME NULL,
        finance        TINYINT(1) NOT NULL DEFAULT 0,
        all_branches   TINYINT(1) NULL,
        PRIMARY KEY (user_id, provider),
        KEY idx_pos_sessions_provider (provider, finance, invalidated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    if (!(await columnExists('pos_sessions', 'provider'))) {
      await pool.query("ALTER TABLE pos_sessions ADD COLUMN provider VARCHAR(20) NOT NULL DEFAULT 'pos' AFTER user_id");
    }
    if (!(await columnExists('pos_sessions', 'finance'))) {
      await pool.query('ALTER TABLE pos_sessions ADD COLUMN finance TINYINT(1) NOT NULL DEFAULT 0');
    }
    if (!(await columnExists('pos_sessions', 'all_branches'))) {
      await pool.query('ALTER TABLE pos_sessions ADD COLUMN all_branches TINYINT(1) NULL');
    }
    const primary = await indexColumns('pos_sessions', 'PRIMARY');
    if (primary !== 'user_id,provider') {
      await pool.query(`ALTER TABLE pos_sessions ${primary ? 'DROP PRIMARY KEY, ' : ''}ADD PRIMARY KEY (user_id, provider)`);
    }
    if (!(await indexColumns('pos_sessions', 'idx_pos_sessions_provider'))) {
      await pool.query('ALTER TABLE pos_sessions ADD KEY idx_pos_sessions_provider (provider, finance, invalidated_at)');
    }
  } catch (error) {
    console.warn('POS / Restaurant session table check skipped:', error.message);
  }
};
pool.integrationSessionsSchemaReady = ensureIntegrationSessionsSchema();

// Management -> Credit Card Rate, and the Card Ledger commission / bank charge
// split (see migrations/030_credit_card_rates_card_commission.sql). Runs after
// the Card Ledger and Collections schemas because it extends / reads both.
// Additive only; every step is safe to re-run.
const ensureCardCommissionSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS credit_card_rates (
        id                   INT NOT NULL AUTO_INCREMENT,
        department_id        INT NOT NULL,
        rate                 DECIMAL(7,4) NOT NULL,
        status               TINYINT(1) NOT NULL DEFAULT 1,
        created_by           INT NULL,
        updated_by           INT NULL,
        created_at           TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at           TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_ccr_department_status (department_id, status),
        CONSTRAINT fk_ccr_department FOREIGN KEY (department_id) REFERENCES departments(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    for (const ddl of [
      // One ACTIVE rate per department at database level (NULL for inactive rows).
      // The API checks this too, so a server without generated columns still works.
      "ALTER TABLE credit_card_rates ADD COLUMN IF NOT EXISTS active_department_id INT AS (IF(status = 1, department_id, NULL)) STORED AFTER status",
      "ALTER TABLE credit_card_rates ADD UNIQUE KEY uq_ccr_active_department (active_department_id)",
      "ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS department_id INT NULL AFTER bank_id",
      "ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS shift_no VARCHAR(50) NULL AFTER department_id",
      "ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2) NULL AFTER realisation_id",
      "ALTER TABLE card_transactions ADD KEY idx_card_tx_department (department_id)",
      "ALTER TABLE card_realisations ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(14,2) NULL AFTER realise_amount",
      "ALTER TABLE card_realisations ADD COLUMN IF NOT EXISTS commission_expense_id INT NULL AFTER hidden_expense_id",
      "ALTER TABLE card_realisations ADD COLUMN IF NOT EXISTS bank_charge_expense_id INT NULL AFTER commission_expense_id",
      "ALTER TABLE card_realisations ADD UNIQUE KEY uq_card_real_commission_exp (commission_expense_id)",
      "ALTER TABLE card_realisations ADD UNIQUE KEY uq_card_real_bank_charge_exp (bank_charge_expense_id)"
    ]) {
      try { await pool.query(ddl); } catch (ddlErr) { /* already applied */ }
    }

    // Hidden Expenses gain the two Card Ledger types (existing values are kept).
    try {
      await pool.query(
        "ALTER TABLE hidden_expenses MODIFY COLUMN `type` ENUM('PickMe','Credit Card Charge','Visa Card Payment','Visa Card Payment commission','Credit Card Bank Charge') NOT NULL"
      );
    } catch (enumErr) {
      console.warn('Hidden Expenses card commission types skipped:', enumErr.message);
    }

    // Branch / Department + Shift No of card rows created by Collections before
    // these columns existed. Only empty values are filled. Idempotent.
    try {
      for (const link of [
        'JOIN collection_card_payments l ON l.card_transaction_id = ct.id',
        'JOIN collection_transactions l ON l.card_transaction_id = ct.id'
      ]) {
        await pool.query(`
          UPDATE card_transactions ct
            ${link}
            JOIN collections c ON c.id = l.collection_id
             SET ct.department_id = COALESCE(ct.department_id, c.department_id),
                 ct.shift_no      = COALESCE(ct.shift_no, c.shift_no)
           WHERE ct.department_id IS NULL OR ct.shift_no IS NULL
        `);
      }
    } catch (backfillErr) {
      console.warn('Card Ledger department / shift backfill skipped:', backfillErr.message);
    }

    console.log('Credit Card Rate schema ready');
  } catch (error) {
    console.warn('Credit Card Rate schema check skipped:', error.message);
  }
};

pool.cardCommissionSchemaReady = Promise.all([cardLedgerReady, pool.collectionsSchemaReady])
  .then(ensureCardCommissionSchema);

module.exports = pool;