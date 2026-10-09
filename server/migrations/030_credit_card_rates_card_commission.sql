-- 030_credit_card_rates_card_commission.sql
-- Management -> Credit Card Rate, and the Card Ledger commission / bank charge
-- split. Additive only. config/db.js (ensureCreditCardRatesSchema and
-- ensureCardLedgerSchema) applies the same DDL at startup, following this
-- project's convention (no separate migration runner).
--
-- Design notes
--   * credit_card_rates: one commission rate (%) per Branch / Department
--     (departments master). status 1 = Active, 0 = Inactive (same convention as
--     receive_types). At most ONE Active rate per department: enforced by the
--     API and, where the server supports it, by the UNIQUE generated column
--     `active_department_id` (NULL for inactive rows, so history is kept).
--   * card_transactions gain the Branch / Department and the POS Shift No of the
--     card payment (filled from the Collection that created them), plus the
--     commission rate applied when the row was realised (audit snapshot).
--   * Realising now splits the Total Transaction Amount into
--         Expected Commission = SUM per department (amount x rate / 100)
--         Realise Amount      = the Bank Ledger debit (unchanged meaning)
--         Remaining Balance   = Total - Realise Amount - Expected Commission (>= 0)
--     and writes two separate report-only Hidden Expenses:
--         "Visa Card Payment commission" (Expected Commission, when > 0)
--         "Credit Card Bank Charge"     (Remaining Balance, when > 0)
--     card_realisations.remaining_balance keeps "what was not banked and is not
--     commission" (= the bank charge); realisations saved before this change have
--     commission_amount NULL and their single "Visa Card Payment" expense in
--     hidden_expense_id, untouched.
--   * commission_expense_id / bank_charge_expense_id are UNIQUE, so one Hidden
--     Expense can never be linked to two realisations.

CREATE TABLE IF NOT EXISTS `credit_card_rates` (
  `id`                   INT NOT NULL AUTO_INCREMENT,
  `department_id`        INT NOT NULL,
  `rate`                 DECIMAL(7,4) NOT NULL,           -- percent, 0 - 100 (entered with up to 2 decimals)
  `status`               TINYINT(1) NOT NULL DEFAULT 1,   -- 1 Active, 0 Inactive
  `active_department_id` INT AS (IF(`status` = 1, `department_id`, NULL)) STORED,
  `created_by`           INT NULL,
  `updated_by`           INT NULL,
  `created_at`           TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ccr_active_department` (`active_department_id`),
  KEY `idx_ccr_department_status` (`department_id`, `status`),
  CONSTRAINT `fk_ccr_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `card_transactions`
  ADD COLUMN IF NOT EXISTS `department_id`   INT NULL AFTER `bank_id`,
  ADD COLUMN IF NOT EXISTS `shift_no`        VARCHAR(50) NULL AFTER `department_id`,
  ADD COLUMN IF NOT EXISTS `commission_rate` DECIMAL(5,2) NULL AFTER `realisation_id`;
ALTER TABLE `card_transactions` ADD KEY `idx_card_tx_department` (`department_id`);

ALTER TABLE `card_realisations`
  ADD COLUMN IF NOT EXISTS `commission_amount`      DECIMAL(14,2) NULL AFTER `realise_amount`,
  ADD COLUMN IF NOT EXISTS `commission_expense_id`  INT NULL AFTER `hidden_expense_id`,
  ADD COLUMN IF NOT EXISTS `bank_charge_expense_id` INT NULL AFTER `commission_expense_id`;
ALTER TABLE `card_realisations` ADD UNIQUE KEY `uq_card_real_commission_exp` (`commission_expense_id`);
ALTER TABLE `card_realisations` ADD UNIQUE KEY `uq_card_real_bank_charge_exp` (`bank_charge_expense_id`);

-- Hidden Expenses gain the two Card Ledger types (existing values kept).
ALTER TABLE `hidden_expenses`
  MODIFY COLUMN `type` ENUM('PickMe','Credit Card Charge','Visa Card Payment',
                            'Visa Card Payment commission','Credit Card Bank Charge') NOT NULL;

-- Branch / Department and Shift No of card transactions created by Collections
-- before this change (only fills empty values; nothing else is modified).
UPDATE `card_transactions` ct
  JOIN `collection_card_payments` ccp ON ccp.card_transaction_id = ct.id
  JOIN `collections` c ON c.id = ccp.collection_id
   SET ct.department_id = COALESCE(ct.department_id, c.department_id),
       ct.shift_no      = COALESCE(ct.shift_no, c.shift_no)
 WHERE ct.department_id IS NULL OR ct.shift_no IS NULL;
UPDATE `card_transactions` ct
  JOIN `collection_transactions` t ON t.card_transaction_id = ct.id
  JOIN `collections` c ON c.id = t.collection_id
   SET ct.department_id = COALESCE(ct.department_id, c.department_id),
       ct.shift_no      = COALESCE(ct.shift_no, c.shift_no)
 WHERE ct.department_id IS NULL OR ct.shift_no IS NULL;
