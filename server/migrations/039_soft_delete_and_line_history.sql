-- 039_soft_delete_and_line_history.sql
--
-- Audit finding H5: nothing is hard deleted.
--
-- 1) A deleted stock adjustment stays in stock_adjustments, flagged, with who / when / why;
--    its stock movement is flagged too. Stock, lists and reports only count is_deleted = 0.
-- 2) The item lines of an invoice / issue note / wastage note / cutlery document are
--    rewritten when it is edited. The replaced lines are copied here first, as they were.
--
-- config/db.js applies the same changes at start-up; this file is for installs where
-- migrations are run by hand.

ALTER TABLE stock_adjustments
  ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS deleted_by INT NULL,
  ADD COLUMN IF NOT EXISTS delete_reason VARCHAR(500) NULL;

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS deleted_by INT NULL;

CREATE TABLE IF NOT EXISTS record_line_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_table VARCHAR(60) NOT NULL,      -- purchase_items, issuance_items, wastage_items ...
  record_id INT NOT NULL,                 -- the invoice / note whose lines were replaced
  line_count INT NOT NULL,
  lines_json LONGTEXT NOT NULL,           -- the old rows, as JSON
  archived_by INT NULL,
  archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_line_history_record (source_table, record_id, archived_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
