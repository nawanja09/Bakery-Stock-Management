-- 044_card_realisation_reverse_edit.sql
-- Finance -> Card Ledger -> Completed:
--   * Reverse a realisation back to Pending (Admin / Super Admin only).
--   * Edit a realisation's figures (Super Admin only).
-- Additive only. config/db.js (ensureCardReversalSchema) applies the same DDL
-- at startup, following this project's convention (no separate migration runner).
--
-- Design notes
--   * card_realisations.status: 1 = active (the normal case), 0 = reversed.
--     A reversed realisation is kept for audit - never deleted - and is
--     excluded from the Completed tab. reversed_by / reversed_at record who
--     and when.
--   * Reversing voids the Bank Ledger debit (finance_transactions.status = 0,
--     same convention as every other void in this app) and soft-deletes the
--     linked Hidden Expenses (hidden_expenses.is_deleted = 1 - no hard
--     delete), then puts every card_transactions row the realisation covered
--     back to status = 'Pending' so it can be corrected and re-realised.
--   * Editing updates total_amount / commission_amount / realise_amount /
--     remaining_balance in place (updated_by / updated_at record the editor),
--     keeps the Bank Ledger debit and the two Hidden Expenses in sync, and
--     only changes Branch / Department or Total Transaction Amount when the
--     realisation covers a single card transaction (otherwise there is no
--     single row to apply the change to).

ALTER TABLE `card_realisations`
  ADD COLUMN IF NOT EXISTS `status`       TINYINT(1) NOT NULL DEFAULT 1 AFTER `bank_charge_expense_id`,
  ADD COLUMN IF NOT EXISTS `reversed_by`  INT NULL AFTER `status`,
  ADD COLUMN IF NOT EXISTS `reversed_at`  TIMESTAMP NULL AFTER `reversed_by`,
  ADD COLUMN IF NOT EXISTS `updated_by`   INT NULL AFTER `reversed_at`,
  ADD COLUMN IF NOT EXISTS `updated_at`   TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `updated_by`;
ALTER TABLE `card_realisations` ADD KEY `idx_card_real_status` (`status`);
