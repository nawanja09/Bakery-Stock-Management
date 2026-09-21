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
        category ENUM('Department', 'Invoice', 'Issuance', 'Wastage') NOT NULL,
        source_record_id INT NOT NULL,
        reference_id VARCHAR(100) NULL,
        updated_by INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_rm_adjustment_source (category, source_record_id),
        KEY idx_rm_adjustment_category_updated (category, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
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
      ['finished_goods_items', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['finished_goods_opening_balances', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['finished_goods_sales', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['finished_goods_transfers', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['finished_goods_wastages', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['cutlery_purchase_items', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['cutlery_transfer_items', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['finished_goods_sale_items', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['finished_goods_transfer_items', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
      ['finished_goods_wastage_items', "ADD COLUMN IF NOT EXISTS status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)'"],
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
      ENUM('Admin','Staff','Manager','User','Store Keeper','Accountant','View Only','Super Admin')
      NOT NULL DEFAULT 'Staff'
    `);

    // 5. Drop the old email column now that username is populated.
    await pool.query("ALTER TABLE users DROP COLUMN IF EXISTS email");

    // 6. Seed the required accounts if they don't already exist.
    const seedUsers = [
      { name: 'Admin', username: 'admin', password: 'Admin123', role: 'Admin' },
      { name: 'Store Keeper', username: 'stores', password: 'password', role: 'Store Keeper' },
      { name: 'Accountant', username: 'accountant', password: 'password', role: 'Accountant' },
      { name: 'QB', username: 'QB', password: 'password', role: 'View Only' },
      { name: 'Super Admin', username: 'superadmin', password: 'SuperAdmin123', role: 'Super Admin' }
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

ensureFinanceSchema();

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
};

ensurePaymentHistorySchema();

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

module.exports = pool;
