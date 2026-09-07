-- 008_orders_module.sql
-- RM Orders module: Low Stock -> Create Order -> Pending -> Order Complete -> Purchasing Invoice -> Completed
-- Non-destructive / additive only. This file documents the schema; the app also
-- self-applies it at startup via config/db.js (ensureOrdersSchema), following this
-- project's existing migration convention (no separate migration-runner).

CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_no` VARCHAR(30) NOT NULL,
  `status` ENUM('PENDING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `supplier_id` INT NULL,
  `expected_receive_date` DATE NOT NULL,
  `ordered_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_date` DATETIME NULL,
  `cancelled_date` DATETIME NULL,
  `invoice_id` INT NULL,
  `created_by` INT NULL,
  `completed_by` INT NULL,
  `cancelled_by` INT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_orders_order_no` (`order_no`),
  KEY `idx_orders_status` (`status`),
  KEY `idx_orders_supplier` (`supplier_id`),
  KEY `idx_orders_invoice` (`invoice_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_items` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `item_id` INT NOT NULL,
  `quantity` DECIMAL(10,2) NOT NULL,
  `unit` VARCHAR(20) NULL,
  `current_stock_at_order` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `buffer_stock_at_order` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `required_quantity` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_items_order` (`order_id`),
  KEY `idx_order_items_item` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nullable link from a Purchasing Invoice back to the Order it was created from.
-- NULL for every normal invoice created without an Order (existing behaviour
-- must keep working unchanged).
ALTER TABLE `purchases` ADD COLUMN IF NOT EXISTS `order_id` INT NULL AFTER `company_id`;
ALTER TABLE `purchases` ADD INDEX IF NOT EXISTS `idx_purchases_order_id` (`order_id`);
