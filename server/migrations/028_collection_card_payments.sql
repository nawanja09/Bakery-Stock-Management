-- 028_collection_card_payments.sql
-- Collection: post a shift's INDIVIDUAL POS card payments to the Card Ledger
-- instead of the shift's card total. Additive only. config/db.js
-- (ensureCollectionsSchema) applies the same DDL at startup.
--
-- Design notes
--   * The POS sends every card payment of a shift in card.transactions[]
--     ({ type: sale | order_advance, sale_id, order_id, receipt_no,
--        payment_method, amount, date_time }); they add up to card.total.
--   * collections.card_txn_count / card_txn_total summarise those payments for
--     the list (reconciliation against card_amount); the payments themselves
--     stay in collections.raw_payload until approval.
--   * On approval each card payment becomes ONE Pending card_transactions row
--     through the existing Card Ledger helper (cardLedgerService.
--     createPendingCardTransaction - no second Card Ledger implementation), with
--     its own date, POS reference and details. The shift's CARD line in
--     collection_transactions remains the per-method summary (amount = total).
--   * collection_card_payments links each POS card payment to the Card Ledger
--     row it created. UNIQUE pos_card_key ("SHIFT:<shift id>:<type>-<POS id>")
--     prevents the same POS card payment from being posted twice.
--   * Approval is refused (nothing is posted, no balancing entry is invented)
--     when the payments do not add up to the shift's card total.

ALTER TABLE `collections`
  ADD COLUMN IF NOT EXISTS `card_txn_count` INT NULL AFTER `card_amount`,
  ADD COLUMN IF NOT EXISTS `card_txn_total` DECIMAL(14,2) NULL AFTER `card_txn_count`;

CREATE TABLE IF NOT EXISTS `collection_card_payments` (
  `id`                          INT NOT NULL AUTO_INCREMENT,
  `collection_id`               INT NOT NULL,
  `collection_transaction_id`   INT NOT NULL,             -- the shift's CARD summary line
  `pos_card_key`                VARCHAR(191) NOT NULL,    -- SHIFT:<shift id>:<type>-<sale/order/receipt id>
  `pos_type`                    VARCHAR(30) NULL,         -- sale / order_advance
  `pos_sale_id`                 VARCHAR(50) NULL,
  `pos_order_id`                VARCHAR(50) NULL,
  `pos_receipt_no`              VARCHAR(100) NULL,
  `pos_payment_method`          VARCHAR(50) NULL,         -- card / card_and_cash
  `pos_date_time`               VARCHAR(40) NULL,         -- as sent by the POS (UTC ISO)
  `transaction_date`            DATE NOT NULL,            -- business date of the payment
  `amount`                      DECIMAL(14,2) NOT NULL,
  `card_transaction_id`         INT NOT NULL,             -- the Card Ledger row
  `created_by`                  INT NULL,
  `created_at`                  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ccp_pos_card` (`pos_card_key`),
  UNIQUE KEY `uq_ccp_card_tx` (`card_transaction_id`),
  KEY `idx_ccp_collection` (`collection_id`),
  CONSTRAINT `fk_ccp_collection` FOREIGN KEY (`collection_id`) REFERENCES `collections` (`id`),
  CONSTRAINT `fk_ccp_line` FOREIGN KEY (`collection_transaction_id`) REFERENCES `collection_transactions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
