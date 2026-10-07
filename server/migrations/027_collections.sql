-- 027_collections.sql
-- Collection module: POS (shift collections, credit payments, employee
-- deductions) -> Pending -> Completed (approved) / Rejected, plus the two system
-- Other Ledger accounts it posts to. Additive only. config/db.js
-- (ensureCollectionsSchema) applies the same DDL at startup, following this
-- project's convention (no separate migration runner).
--
-- Design notes
--   * `collections` holds ONE row per POS record (the header). The backend
--     stages POS records here as 'pending' when the Pending tab is opened; that
--     never touches a ledger. UNIQUE (source_type, source_id) makes importing or
--     approving the same POS record twice impossible.
--   * `collection_transactions` holds ONE row per payment method actually posted
--     (CASH / CARD / BANK / AR / SHORT_EXCESS), created only on approval, with the
--     id of the ledger row it produced. UNIQUE (collection_id, payment_method)
--     means a collection can never post the same method twice.
--   * Approval runs in ONE DB transaction (header status + lines + every ledger
--     row); any failure rolls everything back, so a collection is never left
--     Completed without its ledger entries.
--       CASH         -> finance_transactions  CASH  DEBIT   (existing Cash Ledger)
--       BANK         -> finance_transactions  BANK  DEBIT   (the company's chosen bank account)
--       CARD         -> card_transactions     Pending       (existing Card Ledger; reaches the
--                                                            bank when realised there)
--       AR           -> other_ledger_transactions, "AR Account"            DEBIT
--       SHORT_EXCESS -> other_ledger_transactions, "Short/Excess Account"  short DEBIT / excess CREDIT
--       Employee deduction -> "Short/Excess Account" CREDIT (recovery), linked to the
--                             shift collection it settles (collections.linked_collection_id)
--   * other_ledgers gets two additive columns: is_system (protects the two system
--     accounts from rename / inactivation) and normal_balance. 'CREDIT' = the
--     existing behaviour (balance = credit - debit) and is the default, so every
--     existing ledger's balance is unchanged; 'DEBIT' (balance = debit - credit)
--     is used by the two new accounts.

CREATE TABLE IF NOT EXISTS `collections` (
  `id`                   INT NOT NULL AUTO_INCREMENT,
  `source_type`          ENUM('SHIFT','CREDIT_PAYMENT','EMPLOYEE_DEDUCTION') NOT NULL,
  `source_id`            VARCHAR(100) NOT NULL,              -- the POS record id
  `reference_no`         VARCHAR(100) NULL,                  -- POS reference / receipt / shift no.
  `collection_date`      DATE NOT NULL,
  `shift_id`             VARCHAR(100) NULL,                  -- POS shift_id, e.g. 211
  `shift_no`             VARCHAR(50) NULL,                   -- POS shift_no, e.g. 0104
  `shift_reference`      VARCHAR(100) NULL,                  -- "<shift_id>-<shift_no>", e.g. 211-0104
  `cashier_name`         VARCHAR(255) NULL,
  `employee_id`          VARCHAR(100) NULL,                  -- POS employee id (deductions)
  `employee_name`        VARCHAR(255) NULL,
  `pos_company`          VARCHAR(255) NULL,                  -- company / branch as sent by the POS
  `company_id`           INT NULL,                           -- matched BSMS company (or chosen on approval)
  `pos_branch_id`        VARCHAR(50) NULL,                   -- POS branch.id
  `pos_branch_name`      VARCHAR(255) NULL,                  -- POS branch.name, e.g. "Cafe - M"
  `department_id`        INT NULL,                           -- existing department it maps to, e.g. "Cafe"
  `pos_payment_method`   VARCHAR(50) NULL,                   -- credit payments: the POS payment type
  `pos_bank_account`     VARCHAR(100) NULL,                  -- bank account no. if the POS sent one
  `cash_amount`          DECIMAL(14,2) NOT NULL DEFAULT 0,
  `card_amount`          DECIMAL(14,2) NOT NULL DEFAULT 0,
  `bank_amount`          DECIMAL(14,2) NOT NULL DEFAULT 0,
  `ar_amount`            DECIMAL(14,2) NOT NULL DEFAULT 0,
  `short_excess_amount`  DECIMAL(14,2) NOT NULL DEFAULT 0,   -- signed: + short, - excess
  `deduction_amount`     DECIMAL(14,2) NOT NULL DEFAULT 0,   -- employee deductions
  `total_amount`         DECIMAL(14,2) NOT NULL DEFAULT 0,
  `pos_total_amount`     DECIMAL(14,2) NULL,                 -- total as sent by the POS (validated on approval)
  `linked_collection_id` INT NULL,                           -- deduction -> the shift collection it settles
  `status`               ENUM('pending','completed','rejected') NOT NULL DEFAULT 'pending',
  `approved_by`          INT NULL,
  `approved_at`          DATETIME NULL,
  `rejected_by`          INT NULL,
  `rejected_at`          DATETIME NULL,
  `rejection_reason`     VARCHAR(255) NULL,
  `raw_payload`          LONGTEXT NULL,                      -- untouched POS record, for audit
  `last_synced_at`       DATETIME NULL,
  `created_at`           TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_collections_source` (`source_type`, `source_id`),
  KEY `idx_collections_reference` (`source_type`, `reference_no`),
  KEY `idx_collections_status_date` (`status`, `collection_date`),
  KEY `idx_collections_company` (`company_id`),
  KEY `idx_collections_shift` (`shift_id`),
  KEY `idx_collections_department` (`department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- For a `collections` table created before the shift reference / department columns:
ALTER TABLE `collections`
  ADD COLUMN IF NOT EXISTS `shift_no` VARCHAR(50) NULL AFTER `shift_id`,
  ADD COLUMN IF NOT EXISTS `shift_reference` VARCHAR(100) NULL AFTER `shift_no`,
  ADD COLUMN IF NOT EXISTS `pos_branch_id` VARCHAR(50) NULL AFTER `company_id`,
  ADD COLUMN IF NOT EXISTS `pos_branch_name` VARCHAR(255) NULL AFTER `pos_branch_id`,
  ADD COLUMN IF NOT EXISTS `department_id` INT NULL AFTER `pos_branch_name`;

CREATE TABLE IF NOT EXISTS `collection_transactions` (
  `id`                          INT NOT NULL AUTO_INCREMENT,
  `collection_id`               INT NOT NULL,
  `transaction_date`            DATE NOT NULL,
  `reference_no`                VARCHAR(100) NULL,
  `payment_method`              ENUM('CASH','CARD','BANK','AR','SHORT_EXCESS') NOT NULL,
  `amount`                      DECIMAL(14,2) NOT NULL,       -- SHORT_EXCESS signed: + short (debit), - excess (credit)
  `company_id`                  INT NOT NULL,
  `bank_account_id`             INT NULL,                     -- BANK: account debited; CARD: settlement account
  `finance_transaction_id`      INT NULL,                     -- CASH / BANK ledger row
  `card_transaction_id`         INT NULL,                     -- CARD ledger row
  `other_ledger_id`             INT NULL,                     -- AR Account / Short/Excess Account
  `other_ledger_transaction_id` INT NULL,                     -- AR / SHORT_EXCESS ledger row
  `related_collection_id`       INT NULL,                     -- deduction line -> shift collection
  `source_type`                 ENUM('SHIFT','CREDIT_PAYMENT','EMPLOYEE_DEDUCTION') NOT NULL,
  `source_id`                   VARCHAR(100) NOT NULL,
  `created_by`                  INT NULL,
  `created_at`                  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`                  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ct_collection_method` (`collection_id`, `payment_method`),
  KEY `idx_ct_method_date` (`payment_method`, `transaction_date`),
  KEY `idx_ct_source` (`source_type`, `source_id`),
  CONSTRAINT `fk_ct_collection` FOREIGN KEY (`collection_id`) REFERENCES `collections` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `other_ledgers`
  ADD COLUMN IF NOT EXISTS `is_system` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `normal_balance` ENUM('CREDIT','DEBIT') NOT NULL DEFAULT 'CREDIT';

ALTER TABLE `other_ledger_transactions`
  MODIFY COLUMN `source_type` ENUM('CASH_RECEIVE','CASH_ISSUED','COLLECTION_AR','COLLECTION_SHORT_EXCESS') NOT NULL;

INSERT INTO `other_ledgers` (`name`, `status`, `is_system`, `normal_balance`)
SELECT 'AR Account', 1, 1, 'DEBIT'
 WHERE NOT EXISTS (SELECT 1 FROM `other_ledgers` WHERE LOWER(TRIM(`name`)) = 'ar account');
INSERT INTO `other_ledgers` (`name`, `status`, `is_system`, `normal_balance`)
SELECT 'Short/Excess Account', 1, 1, 'DEBIT'
 WHERE NOT EXISTS (SELECT 1 FROM `other_ledgers` WHERE LOWER(TRIM(`name`)) = 'short/excess account');
