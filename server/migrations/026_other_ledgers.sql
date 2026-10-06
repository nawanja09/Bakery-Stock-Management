-- 026_other_ledgers.sql
-- Management -> Other Ledgers / Finance -> Other Ledgers.
-- Additive only: nothing existing is altered or migrated. The app also
-- self-applies this at startup (config/db.js ensureOtherLedgersSchema).
--
-- Design notes
--   * The SOURCE transaction stays the primary record:
--       - Cash Receive (Other Ledger)  -> finance_transactions row, reference_type = 'CASH_RECEIVE'
--       - Cash Issued                  -> finance_transactions row, reference_type = 'CASH_ISSUED'
--     other_ledger_transactions is only the linked ledger impact of that row
--     (source_type + source_id = finance_transactions.id). UNIQUE(source_type,
--     source_id) guarantees one impact per source, so edits update in place and
--     can never create a duplicate.
--   * Balance is never stored. Balance = SUM(credit) - SUM(debit) over active rows.
--       Cash Receive + Other Ledger -> Cash DEBIT,  Other Ledger CREDIT
--       Cash Issued + Other Ledger  -> Cash CREDIT, Other Ledger DEBIT
--   * status: 1 = Active, 0 = Inactive/voided (same convention as the rest of BSMS).

CREATE TABLE IF NOT EXISTS `other_ledgers` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(100) NOT NULL,
  `status`     TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_other_ledgers_status` (`status`),
  KEY `idx_other_ledgers_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `other_ledger_transactions` (
  `id`               INT NOT NULL AUTO_INCREMENT,
  `other_ledger_id`  INT NOT NULL,
  `transaction_date` DATE NOT NULL,
  `debit`            DECIMAL(14,2) NOT NULL DEFAULT 0,
  `credit`           DECIMAL(14,2) NOT NULL DEFAULT 0,
  `source_type`      ENUM('CASH_RECEIVE','CASH_ISSUED') NOT NULL,
  `source_id`        INT NOT NULL,
  `company_id`       INT NULL,
  `reference_no`     VARCHAR(100) NULL,
  `remark`           VARCHAR(255) NULL,
  `status`           TINYINT(1) NOT NULL DEFAULT 1,
  `created_by`       INT NULL,
  `created_at`       TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_olt_source` (`source_type`, `source_id`),
  KEY `idx_olt_ledger_date` (`other_ledger_id`, `transaction_date`),
  CONSTRAINT `fk_olt_other_ledger` FOREIGN KEY (`other_ledger_id`) REFERENCES `other_ledgers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
