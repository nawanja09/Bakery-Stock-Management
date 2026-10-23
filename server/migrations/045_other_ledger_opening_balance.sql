-- 045_other_ledger_opening_balance.sql
-- Management / Finance -> Other Ledgers: Opening Balance (one per ledger +
-- company). Unlike the Cash Ledger opening balance, it is allowed even when
-- the pair already has other entries - a system account such as AR Account
-- is posted to from the moment Collection exists, so "before anything else"
-- would make it unusable there. Instead its date must be earlier than every
-- other active entry for that pair, so the ledger statement's running
-- balance still starts from it, in order (services/otherLedgerService.setOpeningBalance).
-- Additive only. config/db.js (ensureOtherLedgerOpeningBalanceSchema) applies
-- the same DDL at startup, following this project's convention (no separate
-- migration runner).
--
-- Design notes
--   * An opening balance is a standalone other_ledger_transactions row
--     (source_type = 'OPENING_BALANCE'). It does NOT touch Cash or Bank -
--     Other Ledgers (Director, AR, Short/Excess, ...) are their own
--     sub-ledgers, not a cash position, so setting one up has no Cash / Bank
--     Ledger effect, unlike a Cash Receive or Bank Receive.
--   * source_id is set to the row's own id right after insert (never a real
--     Cash/Bank/Collection record), so the existing UNIQUE KEY
--     uq_olt_source (source_type, source_id) never collides between
--     different ledgers or companies.
--   * The amount entered is always the ledger's own normal-balance direction
--     (other_ledgers.normal_balance): DEBIT for most ledgers and CREDIT for
--     any configured that way, same convention the running balance already
--     uses (services/otherLedgerService.BALANCE_EFFECT_SQL).

ALTER TABLE `other_ledger_transactions` MODIFY COLUMN `source_type`
  ENUM('CASH_RECEIVE','CASH_ISSUED','COLLECTION_AR','COLLECTION_SHORT_EXCESS','COLLECTION_AR_SETTLEMENT','BANK_RECEIVE','BANK_ISSUED','OPENING_BALANCE')
  NOT NULL;
