-- 017_staff_loans.sql
-- Finance -> Staff Loans module.
-- Non-destructive / additive only. This file documents the schema; the app
-- also self-applies it at startup via config/db.js (ensureStaffLoansSchema),
-- following this project's existing migration convention (no separate
-- migration-runner).
--
-- Design notes
--   * `employees` (Employee Management) is reused as-is: staff_loans only
--     stores employees.id. No employee columns/tables are created or changed.
--   * `company_id` identifies whose Cash Book pays out the loan and receives
--     repayments - the Cash Book (cash_accounts / finance_transactions) is
--     kept per company.
--   * The outstanding balance is NEVER stored. It is always derived as
--       loan_amount - SUM(staff_loan_repayments.amount)
--     so it cannot drift from the repayment history.
--   * `status` ('Active' / 'Settled') is maintained in the same DB
--     transaction as each repayment; the API derives the status it returns
--     from the computed balance.
--   * Creating a loan posts a CREDIT (money out - the company pays the
--     employee) to the Cash Book on `issued_date`, in the same DB transaction
--     as the loan insert, through the shared recordCashTransaction() helper
--     (reference_type = 'STAFF_LOAN_ISSUE'). `issue_finance_transaction_id`
--     points at that Cash Book row. The Cash Book balance is never edited
--     directly.
--   * Each repayment row points at the Cash Book row it created
--     (finance_transaction_id) for traceability. The Cash Book row itself is
--     written by the shared recordCashTransaction() helper as a DEBIT
--     (money in), with reference_type = 'STAFF_LOAN_REPAYMENT'.

CREATE TABLE IF NOT EXISTS `staff_loans` (
  `id`             INT NOT NULL AUTO_INCREMENT,
  `employee_id`    INT NOT NULL,
  `company_id`     INT NOT NULL,
  `loan_amount`    DECIMAL(14,2) NOT NULL,
  `issued_date`    DATE NOT NULL,
  `cheque_details` VARCHAR(500) NULL,
  `issue_finance_transaction_id` INT NULL,
  `status`         ENUM('Active','Settled') NOT NULL DEFAULT 'Active',
  `created_by`     INT NULL,
  `created_at`     TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_staff_loans_employee` (`employee_id`),
  KEY `idx_staff_loans_company` (`company_id`),
  KEY `idx_staff_loans_status` (`status`),
  KEY `idx_staff_loans_issued_date` (`issued_date`),
  CONSTRAINT `fk_staff_loans_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`),
  CONSTRAINT `fk_staff_loans_company` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff_loan_repayments` (
  `id`                     INT NOT NULL AUTO_INCREMENT,
  `staff_loan_id`          INT NOT NULL,
  `amount`                 DECIMAL(14,2) NOT NULL,
  `received_date`          DATE NOT NULL,
  `finance_transaction_id` INT NULL,
  `created_by`             INT NULL,
  `created_at`             TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_staff_loan_repayments_loan` (`staff_loan_id`),
  KEY `idx_staff_loan_repayments_date` (`received_date`),
  CONSTRAINT `fk_staff_loan_repayments_loan` FOREIGN KEY (`staff_loan_id`) REFERENCES `staff_loans` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- For databases where `staff_loans` already exists (created before loan payouts
-- were posted to the Cash Book). config/db.js applies this automatically at
-- startup; run it by hand only if you apply this file manually. Additive only.
ALTER TABLE `staff_loans`
  ADD COLUMN IF NOT EXISTS `issue_finance_transaction_id` INT NULL AFTER `cheque_details`;
