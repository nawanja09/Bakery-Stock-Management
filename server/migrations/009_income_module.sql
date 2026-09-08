-- ============================================================
-- Migration: Income Module
-- Creates the incomes table backing the dedicated Income page
-- (Date, Company, Department, Amount) entered via the
-- "New Income" form. Kept separate from finance_transactions,
-- which has no department dimension and is a general ledger,
-- not a manual income log.
-- ============================================================

CREATE TABLE IF NOT EXISTS incomes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  income_date   DATE NOT NULL,
  company_id    INT NOT NULL,
  department_id INT NOT NULL,
  amount        DECIMAL(14,2) NOT NULL,
  created_by    INT NULL,
  status        TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted (soft delete)',
  created_at    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_incomes_company FOREIGN KEY (company_id) REFERENCES company(id),
  CONSTRAINT fk_incomes_department FOREIGN KEY (department_id) REFERENCES departments(id),
  KEY idx_incomes_date (income_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
