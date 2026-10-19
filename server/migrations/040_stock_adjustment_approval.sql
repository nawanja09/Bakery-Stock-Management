-- 040_stock_adjustment_approval.sql
--
-- Audit finding H4 (part 2): a stock adjustment must be approved by a user other
-- than the one who entered it before it affects stock. Existing rows are left
-- 'Approved' by the column default (they already took effect; this does not
-- retroactively change historical stock). New adjustments are inserted 'Pending'
-- by the application and only count toward stock once approved - every place
-- that sums stock_adjustments.variance for "current stock" now also requires
-- status = 'Approved'.
--
-- config/db.js applies the same change at start-up; this file is for installs
-- where migrations are run by hand.

ALTER TABLE stock_adjustments
  ADD COLUMN IF NOT EXISTS status ENUM('Pending','Approved') NOT NULL DEFAULT 'Approved',
  ADD COLUMN IF NOT EXISTS approved_by INT NULL,
  ADD COLUMN IF NOT EXISTS approved_at DATETIME NULL;
