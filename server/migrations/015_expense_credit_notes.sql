-- ============================================================
-- Migration: New Expenses - Credit Note module
--
-- Adds a payee-scoped Credit Note, following the same "Advance
-- Payment"-style credit pattern already used by payee_overpayments
-- (see 002_new_expenses_module.sql). A Credit Note is raised from an
-- expense bill and can be set off ("applied") against any pending
-- expense bill for the SAME payee + SAME company. Applying a Credit
-- Note never posts a Cash/Bank ledger entry - see
-- payee_credit_note_allocations.
--
-- NOTE: This file is documentation only. The tables are actually
-- created automatically at server startup by ensureCreditNotesSchema()
-- in server/config/db.js (this repo has no separate migration
-- runner - see the comment on ensureExpenseFinanceLinkSchema for the
-- established convention).
-- ============================================================

CREATE TABLE IF NOT EXISTS payee_credit_notes (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  credit_note_number   VARCHAR(50) NOT NULL,
  expense_id           INT NULL,          -- originating expense bill the credit note was raised against
  payee_id             INT NULL,
  payee_name           VARCHAR(255) NOT NULL,
  company_id           INT NOT NULL,
  credit_note_date     DATE NOT NULL,
  without_vat_amount   DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  vat_amount           DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_amount         DECIMAL(15,2) NOT NULL,
  remaining_credit     DECIMAL(15,2) NOT NULL,
  status               ENUM('Active','Partially Used','Fully Used','Cancelled') NOT NULL DEFAULT 'Active',
  notes                TEXT NULL,
  created_by           INT NULL,
  created_at           TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_credit_note_number (credit_note_number),
  INDEX idx_pcn_payee (payee_id),
  INDEX idx_pcn_company (company_id),
  INDEX idx_pcn_expense (expense_id),
  FOREIGN KEY (payee_id) REFERENCES payees(id),
  FOREIGN KEY (company_id) REFERENCES company(id),
  FOREIGN KEY (expense_id) REFERENCES expenses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS payee_credit_note_allocations (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  credit_note_id    INT NOT NULL,
  expense_id        INT NOT NULL,          -- pending expense bill the credit note was set off against
  allocated_amount  DECIMAL(15,2) NOT NULL,
  applied_date      DATE NOT NULL,
  applied_by        INT NULL,
  notes             TEXT NULL,
  created_at        TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_pcna_credit_note (credit_note_id),
  INDEX idx_pcna_expense (expense_id),
  FOREIGN KEY (credit_note_id) REFERENCES payee_credit_notes(id),
  FOREIGN KEY (expense_id) REFERENCES expenses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
