-- ============================================================
-- Migration: New Expenses Module
-- Replaces the separate Online Expenses / Cheque Expenses screens
-- with a single New Expenses workflow (bill entry -> select bills
-- -> Payment Details -> pay by Cash/Cheque/Bank with overpayment
-- tracking).
--
-- This migration is additive only: the existing online_expenses /
-- cheque_expenses tables and their API routes are left untouched
-- so historical data and any reports built on them keep working.
-- Run this SQL script against your bakery management database.
-- ============================================================

-- -------------------------------------------------------
-- Table: expense_types
--   Backs the "Expenses Type" dropdown on the New Expenses form.
--   Seeded with the types that were previously hard-coded in the
--   Online Expenses / Cheque Expenses screens.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_types (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  status      TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)',
  created_by  INT NULL,
  created_at  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_expense_type_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO expense_types (name) VALUES
  ('Raw material'), ('Electricity'), ('Gas'), ('Water'), ('Insurance'),
  ('Internet'), ('Utilities'), ('Maintenance'), ('Travel'), ('Training'),
  ('Vehicle Maintain'), ('Other');

-- -------------------------------------------------------
-- Table: expenses
--   One row per expense bill submitted on the New Expenses form.
--   payee_id / expense_type_id link to the lookup tables; the name
--   columns are kept denormalised (same pattern as online_expenses)
--   so existing report queries against a plain payee/expense-type
--   string keep working even if a payee or type is renamed later.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  bill_date          DATE NOT NULL,
  bill_number        VARCHAR(100) NULL,
  payee_id           INT NULL,
  payee_name         VARCHAR(255) NOT NULL,
  vat_reg_number     VARCHAR(100) NULL,
  expense_type_id    INT NULL,
  expense_type       VARCHAR(100) NOT NULL,
  without_vat_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  vat_amount         DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_bill_amount  DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  paid_amount        DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  balance            DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  description        TEXT NULL,
  payment_status     ENUM('Pending','Partially Paid','Paid') NOT NULL DEFAULT 'Pending',
  created_by         INT NULL,
  updated_by         INT NULL,
  created_at         TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted         TINYINT(1) NOT NULL DEFAULT 0,

  INDEX idx_exp_payee (payee_id),
  INDEX idx_exp_type (expense_type_id),
  INDEX idx_exp_status (payment_status),
  FOREIGN KEY (payee_id) REFERENCES payees(id),
  FOREIGN KEY (expense_type_id) REFERENCES expense_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- -------------------------------------------------------
-- Table: expense_payments
--   One row per "Submit Payment" action on the Payment Details
--   form. A single payment can settle several bills for the same
--   payee at once (see expense_payment_allocations).
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_payments (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  payment_date       DATE NOT NULL,
  payee_id           INT NULL,
  payee_name         VARCHAR(255) NOT NULL,
  payment_type_id    INT NULL,
  payment_type       VARCHAR(50) NOT NULL,           -- Cash / Cheque / Bank (from payment_methods)
  bank_id            INT NULL,
  cheque_number      VARCHAR(50) NULL,
  voucher_number     VARCHAR(50) NULL,
  reference_number   VARCHAR(50) NULL,
  total_bill_amount  DECIMAL(15,2) NOT NULL DEFAULT 0.00,  -- sum of bills covered
  transfer_amount    DECIMAL(15,2) NOT NULL DEFAULT 0.00,  -- amount actually paid out
  overpayment_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  description        TEXT NULL,
  created_by         INT NULL,
  created_at         TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_exppay_payee (payee_id),
  INDEX idx_exppay_bank (bank_id),
  FOREIGN KEY (payee_id) REFERENCES payees(id),
  FOREIGN KEY (payment_type_id) REFERENCES payment_methods(id),
  FOREIGN KEY (bank_id) REFERENCES bank_details(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- -------------------------------------------------------
-- Table: expense_payment_allocations
--   How much of an expense_payments row was applied to each bill.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_payment_allocations (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  payment_id   INT NOT NULL,
  expense_id   INT NOT NULL,
  amount       DECIMAL(15,2) NOT NULL,
  created_at   TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_epa_payment (payment_id),
  INDEX idx_epa_expense (expense_id),
  FOREIGN KEY (payment_id) REFERENCES expense_payments(id),
  FOREIGN KEY (expense_id) REFERENCES expenses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- -------------------------------------------------------
-- Table: payee_overpayments
--   Credit balance recorded against a payee whenever a Transfer
--   Amount exceeds the Total Bill Amount for a payment.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS payee_overpayments (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  payee_id          INT NULL,
  payee_name        VARCHAR(255) NOT NULL,
  payment_id        INT NOT NULL,
  amount            DECIMAL(15,2) NOT NULL,
  remaining_credit  DECIMAL(15,2) NOT NULL,
  status            ENUM('Active','Partially Used','Fully Used') NOT NULL DEFAULT 'Active',
  created_at        TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_po_payee (payee_id),
  FOREIGN KEY (payee_id) REFERENCES payees(id),
  FOREIGN KEY (payment_id) REFERENCES expense_payments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
