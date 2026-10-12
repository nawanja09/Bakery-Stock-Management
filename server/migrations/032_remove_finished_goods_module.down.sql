-- 032_remove_finished_goods_module.down.sql
-- Reverts 032_remove_finished_goods_module.sql: restores the original table
-- names. Rows, indexes and foreign keys were never changed, so the tables come
-- back exactly as they were. (The application code for the module must be
-- restored separately, e.g. from git tag `pre-fg-module-removal`.)
--
-- Atomic: if any archived table is missing, nothing is renamed.

RENAME TABLE
  zz_removed_finished_goods_items            TO finished_goods_items,
  zz_removed_finished_goods_ingredients      TO finished_goods_ingredients,
  zz_removed_finished_goods_opening_balances TO finished_goods_opening_balances,
  zz_removed_finished_goods_productions      TO finished_goods_productions,
  zz_removed_finished_goods_production_items TO finished_goods_production_items,
  zz_removed_finished_goods_sales            TO finished_goods_sales,
  zz_removed_finished_goods_sale_items       TO finished_goods_sale_items,
  zz_removed_finished_goods_transfers        TO finished_goods_transfers,
  zz_removed_finished_goods_transfer_items   TO finished_goods_transfer_items,
  zz_removed_finished_goods_wastages         TO finished_goods_wastages,
  zz_removed_finished_goods_wastage_items    TO finished_goods_wastage_items,
  zz_removed_transfer_destinations           TO transfer_destinations,
  zz_removed_cost_calculations               TO cost_calculations,
  zz_removed_cost_calculation_ingredients    TO cost_calculation_ingredients;
