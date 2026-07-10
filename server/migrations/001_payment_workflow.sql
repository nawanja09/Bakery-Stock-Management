-- =============================================================
-- MIGRATION 001: Purchase Invoice Payment & Supplier Credit
-- Run once against your live / dev database
-- All changes are ADDITIVE – no existing data will be lost
-- =============================================================

-- -------------------------------------------------------------
-- 1. Extend payment_method enum on purchases to include CHEQUE
-- -------------------------------------------------------------
ALTER TABLE purchases
  MODIFY COLUMN payment_method
    ENUM('CASH','BANK_TRANSFER','CREDIT','CHEQUE') NOT NULL DEFAULT 'CASH';

-- -------------------------------------------------------------
-- 2. Add voucher_number to payment_history (if not exists)
-- -------------------------------------------------------------
ALTER TABLE payment_history
  ADD COLUMN IF NOT EXISTS voucher_number VARCHAR(100) NULL AFTER check_number;

-- -------------------------------------------------------------
-- 3. Supplier Overpayments / Advance Payments
--    Records advance payments that have not been linked to any
--    invoice at the time of payment ("Pay Now").
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `supplier_overpayments` (
  `id`                 INT          NOT NULL AUTO_INCREMENT,
  `overpayment_number` VARCHAR(50)  NOT NULL,
  `supplier_id`        INT          NOT NULL,
  `payment_date`       DATE         NOT NULL,
  `payment_method`     ENUM('CASH','BANK_TRANSFER','CHEQUE') NOT NULL DEFAULT 'CASH',
  `voucher_number`     VARCHAR(100) NULL,
  `reference_number`   VARCHAR(100) NULL,
  `original_amount`    DECIMAL(12,2) NOT NULL,
  `remaining_credit`   DECIMAL(12,2) NOT NULL,
  `status`             ENUM('Active','Partially Used','Fully Used') NOT NULL DEFAULT 'Active',
  `notes`              TEXT         NULL,
  `created_by`         INT          NOT NULL,
  `updated_by`         INT          NULL,
  `created_at`         TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `overpayment_number` (`overpayment_number`),
  KEY `supplier_id` (`supplier_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `fk_overpay_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `supplier` (`id`),
  CONSTRAINT `fk_overpay_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- -------------------------------------------------------------
-- 4. Purchase Return Credits
--    Auto-created when a purchase return has no linked invoice
--    (i.e. remaining balance > 0 after any manual settlement).
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `purchase_return_credits` (
  `id`                  INT          NOT NULL AUTO_INCREMENT,
  `credit_number`       VARCHAR(50)  NOT NULL,
  `purchase_return_id`  INT          NOT NULL,
  `supplier_id`         INT          NOT NULL,
  `original_amount`     DECIMAL(12,2) NOT NULL,
  `remaining_credit`    DECIMAL(12,2) NOT NULL,
  `status`              ENUM('Active','Partially Used','Fully Used') NOT NULL DEFAULT 'Active',
  `credit_date`         DATE         NOT NULL,
  `created_at`          TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `credit_number` (`credit_number`),
  KEY `purchase_return_id` (`purchase_return_id`),
  KEY `supplier_id` (`supplier_id`),
  CONSTRAINT `fk_prc_return` FOREIGN KEY (`purchase_return_id`) REFERENCES `purchase_returns` (`id`),
  CONSTRAINT `fk_prc_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `supplier` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- -------------------------------------------------------------
-- 5. Purchase Payment Allocations
--    Maps a single payment_history record to one or more invoices.
--    Supports multi-invoice payments.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `purchase_payment_allocations` (
  `id`                  INT          NOT NULL AUTO_INCREMENT,
  `payment_history_id`  INT          NOT NULL,
  `purchase_id`         INT          NOT NULL,
  `allocated_amount`    DECIMAL(12,2) NOT NULL,
  `created_at`          TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `payment_history_id` (`payment_history_id`),
  KEY `purchase_id` (`purchase_id`),
  CONSTRAINT `fk_ppa_payment` FOREIGN KEY (`payment_history_id`) REFERENCES `payment_history` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ppa_purchase` FOREIGN KEY (`purchase_id`) REFERENCES `purchases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- -------------------------------------------------------------
-- 6. Credit Allocations
--    Maps a supplier credit (overpayment or return credit) to
--    one or more invoices. Supports partial & multi-invoice.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `credit_allocations` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `credit_type`      ENUM('overpayment','return_credit') NOT NULL,
  `overpayment_id`   INT          NULL,
  `return_credit_id` INT          NULL,
  `purchase_id`      INT          NOT NULL,
  `allocated_amount` DECIMAL(12,2) NOT NULL,
  `settlement_date`  DATE         NOT NULL,
  `settled_by`       INT          NOT NULL,
  `notes`            TEXT         NULL,
  `created_at`       TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `purchase_id` (`purchase_id`),
  KEY `overpayment_id` (`overpayment_id`),
  KEY `return_credit_id` (`return_credit_id`),
  CONSTRAINT `fk_ca_purchase` FOREIGN KEY (`purchase_id`) REFERENCES `purchases` (`id`),
  CONSTRAINT `fk_ca_overpayment` FOREIGN KEY (`overpayment_id`) REFERENCES `supplier_overpayments` (`id`),
  CONSTRAINT `fk_ca_return_credit` FOREIGN KEY (`return_credit_id`) REFERENCES `purchase_return_credits` (`id`),
  CONSTRAINT `fk_ca_settled_by` FOREIGN KEY (`settled_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
-- =============================================================  
-- Migration complete.
-- =============================================================
