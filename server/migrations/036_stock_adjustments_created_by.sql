-- 036_stock_adjustments_created_by.sql
--
-- The signed-in user who saved a stock adjustment (set by the server from the
-- login, never from the form). user_name keeps the "Approved By" name: the
-- approver typed on the form, or that user when none was typed. NULL for older rows.
--
-- config/db.js applies the same change at start-up; this file is for installs
-- where migrations are run by hand.
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS created_by INT NULL;
