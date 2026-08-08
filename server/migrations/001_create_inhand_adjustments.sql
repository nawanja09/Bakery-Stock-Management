-- ============================================================
-- Migration: Inhand Adjustments (Adjustment Module ↔ Finance Module integration)
-- Run this SQL script against your bakery management database.
-- ============================================================

-- -------------------------------------------------------
-- Table: inhand_adjustments
--   Stores Cash In / Cheque In entries from the Adjustment
--   Module.  When approved, a corresponding Finance ledger
--   row is created via the posting engine and its ID is
--   stored in finance_txn_id (duplicate-post guard).
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS inhand_adjustments (
  id               INT          AUTO_INCREMENT PRIMARY KEY,

  -- Auto-generated reference number, e.g. IH-2026-00001
  reference_no     VARCHAR(50)  NOT NULL UNIQUE,

  transaction_date DATE         NOT NULL,
  payment_type     ENUM('Cash In','Cheque In') NOT NULL,

  -- Cash In: cash_accounts are looked up via company_id
  company_id       INT          NULL,

  -- Cheque In: bank ledger
  bank_id          INT          NULL,
  cheque_number    VARCHAR(100) NULL,
  bank_name        VARCHAR(200) NULL,
  cheque_date      DATE         NULL,

  -- Common
  amount           DECIMAL(15,2) NOT NULL,
  party_name       VARCHAR(200)  NULL,
  remark           TEXT          NULL,

  -- Workflow status
  status           ENUM('Draft','Pending','Approved','Cancelled')
                   NOT NULL DEFAULT 'Draft',

  -- Finance link – set atomically during approval posting.
  -- NULL means not yet posted; NOT NULL acts as the duplicate-post guard.
  finance_txn_id   INT          NULL,
  posted_at        DATETIME     NULL,

  -- Reversal link – set when an Approved entry is cancelled
  reversal_txn_id  INT          NULL,

  -- Audit columns
  created_by       INT          NOT NULL,
  approved_by      INT          NULL,
  approved_at      DATETIME     NULL,
  cancelled_by     INT          NULL,
  cancelled_at     DATETIME     NULL,

  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_ih_status         (status),
  INDEX idx_ih_payment_type   (payment_type),
  INDEX idx_ih_date           (transaction_date),
  INDEX idx_ih_company        (company_id),
  INDEX idx_ih_bank           (bank_id),

  FOREIGN KEY (company_id)  REFERENCES company(id),
  FOREIGN KEY (bank_id)     REFERENCES bank_details(id),
  FOREIGN KEY (created_by)  REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- -------------------------------------------------------
-- Table: inhand_audit_log
--   Immutable audit trail for every state change on an
--   inhand_adjustments record.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS inhand_audit_log (
  id             INT          AUTO_INCREMENT PRIMARY KEY,
  inhand_id      INT          NOT NULL,
  action         VARCHAR(50)  NOT NULL,  -- CREATED | SUBMITTED | APPROVED | CANCELLED | REVERSED | DUPLICATE_BLOCKED
  performed_by   INT          NOT NULL,
  performed_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details        JSON         NULL,      -- snapshot of relevant fields at the time of the action

  INDEX idx_ial_inhand (inhand_id),
  FOREIGN KEY (inhand_id)    REFERENCES inhand_adjustments(id),
  FOREIGN KEY (performed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
