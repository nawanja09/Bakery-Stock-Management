-- Additive schema for the sub-expense-type feature. Startup schema checks in
-- config/db.js apply this automatically for installations without a migration runner.
CREATE TABLE IF NOT EXISTS sub_expense_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expense_type_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Inactive',
  created_by INT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_sub_expense_type_parent_name (expense_type_id, name),
  KEY idx_sub_expense_type_parent_status (expense_type_id, status),
  CONSTRAINT fk_sub_expense_type_parent FOREIGN KEY (expense_type_id) REFERENCES expense_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS sub_expense_type_id INT NULL AFTER expense_type_id,
  ADD COLUMN IF NOT EXISTS sub_expense_type VARCHAR(100) NULL AFTER expense_type;
