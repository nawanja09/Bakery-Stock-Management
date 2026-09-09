ALTER TABLE stock_adjustments
  ADD COLUMN IF NOT EXISTS request_id VARCHAR(64) NULL,
  ADD UNIQUE KEY IF NOT EXISTS uq_stock_adjustments_request_id (request_id);