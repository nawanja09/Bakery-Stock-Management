-- 019_hidden_expenses.sql
--
-- Hidden Expenses module (Expenses > Hidden Expenses).
--
-- These are report-only expense records (e.g. PickMe rides, credit card
-- charges) that must show up on the Expenses Report but must NEVER post
-- to the Cash Ledger or the Bank Ledger. They are therefore saved in their
-- own table, completely separate from `expenses` / `cash_expenses` /
-- `petty_cash_vouchers`, and no finance_transactions / cash / bank ledger
-- row is ever written for them (see server/routes/hiddenExpenseRoutes.js —
-- it never calls recordCashTransaction / recordBankTransaction).
--
CREATE TABLE IF NOT EXISTS `hidden_expenses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `expense_date` date NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `type` enum('PickMe','Credit Card Charge') NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hidden_expenses_date` (`expense_date`),
  KEY `idx_hidden_expenses_deleted` (`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
