-- Migration: 013_expenses_cheque_registry.sql
-- Creates a centralized Expenses Cheque Registry table that stores cheque
-- records from all three sources:
--   BANK_TO_CASH       : Finance -> Cash/Bank Transfer (Bank->Cash + cheque number)
--   PURCHASING_PAYMENT : RM Purchasing -> Recording Payment (Payment Type = Cheque)
--   EXPENSE_PAYMENT    : New Expenses -> Payment Details (Payment Type = Cheque)
--
-- The UNIQUE KEY on (source_type, source_id) prevents duplicate entries.

CREATE TABLE IF NOT EXISTS `expenses_cheque_registry` (
  `id`            INT(11)      NOT NULL AUTO_INCREMENT,
  `source_type`   ENUM('BANK_TO_CASH','PURCHASING_PAYMENT','EXPENSE_PAYMENT') NOT NULL,
  `source_id`     INT(11)      NOT NULL,
  `date`          DATE         NOT NULL,
  `name`          VARCHAR(255) DEFAULT NULL,
  `cheque_number` VARCHAR(100) NOT NULL,
  `amount`        DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `cheque_date`   DATE         DEFAULT NULL,
  `deposit_date`  DATE         DEFAULT NULL,
  `slip_number`   VARCHAR(100) DEFAULT NULL,
  `bank`          VARCHAR(255) DEFAULT NULL,
  `release_date`  DATE         DEFAULT NULL,
  `returned`      TINYINT(1)   NOT NULL DEFAULT 0,
  `status`        VARCHAR(50)  NOT NULL DEFAULT 'Active',
  `created_at`    TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_source` (`source_type`, `source_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
