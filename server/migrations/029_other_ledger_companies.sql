-- 029_other_ledger_companies.sql
-- Company-wise Other Ledgers. Additive only. The app also self-applies this at
-- startup (config/db.js ensureOtherLedgersSchema / collections schema).
--
--   * other_ledger_company_map lists the companies each Other Ledger is linked to.
--     A transaction (Cash Receive / Cash Issued / Bank Receive / Bank Issued /
--     Collection) may only post to a ledger linked to ITS company; an unlinked
--     ledger is rejected, never redirected to another company's ledger.
--   * Every other_ledger_transactions row already stores company_id, so balances
--     and statements are read per company. No existing row is changed.
--   * Bank Ledger rows linked to an Other Ledger use source_type BANK_RECEIVE /
--     BANK_ISSUED.

ALTER TABLE `other_ledger_transactions`
  MODIFY COLUMN `source_type` ENUM('CASH_RECEIVE','CASH_ISSUED','COLLECTION_AR','COLLECTION_SHORT_EXCESS',
    'COLLECTION_AR_SETTLEMENT','BANK_RECEIVE','BANK_ISSUED') NOT NULL;

CREATE TABLE IF NOT EXISTS `other_ledger_company_map` (
  `other_ledger_id` INT NOT NULL,
  `company_id`      INT NOT NULL,
  `created_at`      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`other_ledger_id`, `company_id`),
  KEY `idx_olcm_company` (`company_id`),
  CONSTRAINT `fk_olcm_other_ledger` FOREIGN KEY (`other_ledger_id`) REFERENCES `other_ledgers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing history stays valid: link each ledger to every company it already has
-- active transactions for.
INSERT IGNORE INTO `other_ledger_company_map` (`other_ledger_id`, `company_id`)
SELECT DISTINCT olt.other_ledger_id, olt.company_id
  FROM other_ledger_transactions olt
  JOIN company c ON c.id = olt.company_id
 WHERE olt.status = 1;

-- System accounts (AR Account, Short/Excess Account) serve every company.
INSERT IGNORE INTO `other_ledger_company_map` (`other_ledger_id`, `company_id`)
SELECT ol.id, c.id FROM other_ledgers ol CROSS JOIN company c WHERE ol.is_system = 1;

-- Transaction direction: Cash/Bank Issued TO an Other Ledger is IN for that
-- ledger (stored as Other Ledger DEBIT), Cash/Bank Received FROM it is OUT
-- (stored as CREDIT). Stored rows are unchanged; every Other Ledger becomes
-- debit-normal, so its balance = SUM(debit) - SUM(credit).
ALTER TABLE `other_ledgers`
  MODIFY COLUMN `normal_balance` ENUM('CREDIT','DEBIT') NOT NULL DEFAULT 'DEBIT';
UPDATE `other_ledgers` SET `normal_balance` = 'DEBIT' WHERE `normal_balance` <> 'DEBIT';
