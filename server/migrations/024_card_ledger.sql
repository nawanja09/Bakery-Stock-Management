-- 024_card_ledger.sql
-- Finance -> Card Ledger (Pending / Completed).
-- Additive only. config/db.js (ensureCardLedgerSchema) applies the same DDL at
-- startup, following this project's convention (no separate migration runner).
--
-- Design notes
--   * A card transaction is a RECEIVABLE until the bank settles it. While
--     status = 'Pending' it has NO row in finance_transactions, so it cannot
--     touch any Bank Balance or Bank Ledger.
--   * "Realise" (status Pending -> Completed) posts ONE debit (money in) to the
--     bank account through the shared recordBankTransaction() helper, dated on
--     realise_date, in the same DB transaction as the status change.
--   * finance_transaction_id points at that Bank Ledger row. It is UNIQUE, so
--     the database itself refuses to link two card rows to one ledger row, and
--     the realise UPDATE is guarded with `WHERE status = 'Pending'`, so a
--     card transaction can never be added to the Bank Balance twice.

CREATE TABLE IF NOT EXISTS `card_transactions` (
  `id`                     INT NOT NULL AUTO_INCREMENT,
  `company_id`             INT NOT NULL,
  `bank_id`                INT NOT NULL,
  `transaction_date`       DATE NOT NULL,
  `amount`                 DECIMAL(14,2) NOT NULL,
  `reference_number`       VARCHAR(100) NULL,
  `remark`                 VARCHAR(255) NULL,
  `status`                 ENUM('Pending','Completed') NOT NULL DEFAULT 'Pending',
  `realise_date`           DATE NULL,
  `finance_transaction_id` INT NULL,
  `realised_by`            INT NULL,
  `realised_at`            TIMESTAMP NULL,
  `created_by`             INT NULL,
  `created_at`             TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_card_tx_finance_tx` (`finance_transaction_id`),
  KEY `idx_card_tx_status_date` (`status`, `transaction_date`),
  KEY `idx_card_tx_bank` (`bank_id`),
  KEY `idx_card_tx_company` (`company_id`),
  CONSTRAINT `fk_card_tx_company` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`),
  CONSTRAINT `fk_card_tx_bank` FOREIGN KEY (`bank_id`) REFERENCES `bank_details` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OPTIONAL one-time backfill (NOT run automatically).
-- Before this module, "Visa Card Payment" receipts were posted straight to the
-- Bank Ledger. To show that history under the Completed tab (without touching
-- any balance - the ledger rows already exist), run this once. It is
-- idempotent: rows already linked are skipped.
--
-- INSERT INTO card_transactions
--   (company_id, bank_id, transaction_date, amount, reference_number, remark,
--    status, realise_date, finance_transaction_id, realised_by, realised_at, created_by, created_at)
-- SELECT ft.company_id, ft.bank_id, ft.transaction_date, ft.debit, ft.reference_number, ft.remark,
--        'Completed', ft.transaction_date, ft.id, ft.created_by, ft.created_at, ft.created_by, ft.created_at
-- FROM finance_transactions ft
-- WHERE ft.account_type = 'BANK' AND ft.status = 1
--   AND ft.transaction_type = 'Visa Card Payment' AND ft.reference_type = 'BANK_RECEIVE'
--   AND NOT EXISTS (SELECT 1 FROM card_transactions c WHERE c.finance_transaction_id = ft.id);
