-- =====================================================================
-- Soft-delete migration: adds a status column (1=Active, 0=Deleted) to
-- every application table.
--
-- IMPORTANT: This dump file is not 100% in sync with the live database
-- (e.g. `supplier` already has an `is_deleted` column live that isn't in
-- this dump). Before running this migration, verify each table's actual
-- columns on your live DB, e.g.:
--   SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ('status','record_status');
--
-- `ADD COLUMN IF NOT EXISTS` requires MySQL 8.0.29+/MariaDB 10.3+. If your
-- server is older, drop the 'IF NOT EXISTS' and pre-check manually.
--
-- `supplier_backup_20260309` is a one-off backup snapshot and is skipped.
-- =====================================================================

ALTER TABLE `bank_charges`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `bank_details`
  ADD COLUMN IF NOT EXISTS `record_status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `cheque_expenses`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `company`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `cost_calculation_ingredients`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `cost_calculations`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `credit_allocations`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `cutlery_assets`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `cutlery_damage_items`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `cutlery_damages`
  ADD COLUMN IF NOT EXISTS `record_status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `cutlery_locations`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `cutlery_purchase_items`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `cutlery_purchases`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `cutlery_stock`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `cutlery_stock_history`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `cutlery_suppliers`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `cutlery_transfer_items`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `cutlery_transfers`
  ADD COLUMN IF NOT EXISTS `record_status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `departments`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `finished_goods_ingredients`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `finished_goods_items`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `items`
  ADD COLUMN IF NOT EXISTS `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Inactive';

ALTER TABLE `finished_goods_opening_balances`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `finished_goods_production_items`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `finished_goods_productions`
  ADD COLUMN IF NOT EXISTS `record_status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `finished_goods_sale_items`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `finished_goods_sales`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `finished_goods_transfer_items`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `finished_goods_transfers`
  ADD COLUMN IF NOT EXISTS `record_status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `finished_goods_wastage_items`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `finished_goods_wastages`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `issuance_items`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `issuances`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `item_types`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `online_expense_payments`
  ADD COLUMN IF NOT EXISTS `record_status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `online_expenses`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `opening_balances`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `payees`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `payment_history`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `petty_cash_balance`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `petty_cash_reimbursements`
  ADD COLUMN IF NOT EXISTS `record_status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `petty_cash_vouchers`
  ADD COLUMN IF NOT EXISTS `record_status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `production_cost_calculations`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `purchase_items`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `purchase_payment_allocations`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `purchase_return_credits`
  ADD COLUMN IF NOT EXISTS `record_status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `purchase_return_items`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `purchase_returns`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `purchases`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `return_items`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `returns`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `stock_adjustments`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `stock_movements`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `supplier`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `supplier_overpayments`
  ADD COLUMN IF NOT EXISTS `record_status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `supplier_payment_allocations`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `supplier_payments`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `transfer_destinations`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `wastage_items`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

ALTER TABLE `wastages`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

-- ---------------------------------------------------------------------
-- Backfill from pre-existing inverted delete flags so the new column
-- reflects current data immediately.
-- ---------------------------------------------------------------------

UPDATE `purchases` SET `status` = 0 WHERE `deleted` = 1;
UPDATE `wastages` SET `status` = 0 WHERE `deleted` = 1;
UPDATE `supplier` SET `status` = 0 WHERE `is_deleted` = 1;

-- ---------------------------------------------------------------------
-- `payment_methods` is not present in the provided dump (built after the
-- dump was taken) but exists live with its own `is_active` toggle. Add the
-- standard soft-delete column here too and keep it distinct from
-- `is_active` (which still governs whether a method shows in the active
-- dropdown; `status` governs whether the record exists at all).
-- ---------------------------------------------------------------------
ALTER TABLE `payment_methods`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';

-- ---------------------------------------------------------------------
-- payment_methods isn't in the SQL dump but already exists live with a
-- working `status` column (confirmed in paymentMethodController.js).
-- Included defensively; the IF NOT EXISTS guard makes this a no-op if
-- the column is already there.
-- ---------------------------------------------------------------------
ALTER TABLE `payment_methods`
  ADD COLUMN IF NOT EXISTS `status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)';
