-- 032_remove_finished_goods_module.sql
-- Retires the database objects of the removed standalone Finished Goods module
-- (Items, Opening Balances, Production Management, Transfers, Wastage, Sales,
-- FG Reports, Bakery Stock Report, FG ingredients/recipes and Cost Calculator).
--
-- REVERSIBLE: nothing is dropped. Every table is RENAMEd to a `zz_removed_`
-- prefix so its rows, indexes and foreign keys are kept intact. InnoDB foreign
-- keys follow a renamed table, so the archived tables still reference each
-- other (and the shared departments / users / items tables) exactly as before.
-- Undo with 032_remove_finished_goods_module.down.sql.
--
-- RENAME TABLE is atomic: if any table is missing or a target name already
-- exists, the whole statement fails and NO table is renamed.
--
-- NOT touched (still used by other modules):
--   fg_production, fg_production_recipes  -> FG Production (/api/fg-production)
--   departments, items, users, purchases   -> shared master / Raw Material data
--   cutlery_transfers, cutlery_transfer_items -> Cutlery module
--
-- Run only after the code that removed the module is deployed, and after a
-- fresh backup, e.g.:
--   mysqldump --single-transaction --routines --triggers --events \
--     --databases ravonbakers_stock > ravonbakers_stock-before-032.sql
--
-- Once the archived tables are confirmed unneeded they can be dropped in a
-- later, separate migration (children first). That step is NOT reversible.

RENAME TABLE
  finished_goods_items            TO zz_removed_finished_goods_items,
  finished_goods_ingredients      TO zz_removed_finished_goods_ingredients,
  finished_goods_opening_balances TO zz_removed_finished_goods_opening_balances,
  finished_goods_productions      TO zz_removed_finished_goods_productions,
  finished_goods_production_items TO zz_removed_finished_goods_production_items,
  finished_goods_sales            TO zz_removed_finished_goods_sales,
  finished_goods_sale_items       TO zz_removed_finished_goods_sale_items,
  finished_goods_transfers        TO zz_removed_finished_goods_transfers,
  finished_goods_transfer_items   TO zz_removed_finished_goods_transfer_items,
  finished_goods_wastages         TO zz_removed_finished_goods_wastages,
  finished_goods_wastage_items    TO zz_removed_finished_goods_wastage_items,
  transfer_destinations           TO zz_removed_transfer_destinations,
  cost_calculations               TO zz_removed_cost_calculations,
  cost_calculation_ingredients    TO zz_removed_cost_calculation_ingredients;
