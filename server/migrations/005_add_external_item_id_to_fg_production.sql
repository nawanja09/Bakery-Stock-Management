-- 005_add_external_item_id_to_fg_production.sql
--
-- FG Items are no longer created/managed inside BSMS. The Ravon Bakers POS
-- system (pos.ravonbakers.lk) is now the source of truth for FG Items.
-- This adds `external_item_id` to fg_production as the reference to the
-- Ravon POS item. `fg_item_name` is kept as a display/cache value.
--
-- This is also applied automatically and idempotently at server startup
-- via server/config/db.js -> ensureFgProductionExternalItemSchema().
-- This file is kept for manual/reference use only.

ALTER TABLE fg_production
  ADD COLUMN IF NOT EXISTS external_item_id VARCHAR(64) NULL
    COMMENT 'Ravon POS item ID - source of truth for FG Items'
    AFTER fg_item_name;

ALTER TABLE fg_production
  ADD INDEX IF NOT EXISTS idx_fg_production_external_item_id (external_item_id);

-- Existing rows created before this migration will have
-- external_item_id = NULL. They keep displaying their existing
-- fg_item_name and are not deleted or modified by this migration.
