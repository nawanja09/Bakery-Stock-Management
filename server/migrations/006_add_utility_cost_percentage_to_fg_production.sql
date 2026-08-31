-- 006_add_utility_cost_percentage_to_fg_production.sql
-- Stores the configurable FG utility markup as a percentage.

ALTER TABLE fg_production
  ADD COLUMN IF NOT EXISTS utility_cost_percentage DECIMAL(5,2) NOT NULL DEFAULT 70
    AFTER recipe_output_quantity;