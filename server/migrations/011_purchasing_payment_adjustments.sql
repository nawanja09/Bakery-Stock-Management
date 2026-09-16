-- ============================================================
-- Migration: Purchasing Payment Adjustment audit trail
--
-- Backs the new "Purchasing Payment Adjustment" tab under RM Adjustment
-- and its "Purchasing Payment" row in the RM Adjustment Summary /
-- Stores Adjustment Summary. One row is written every time an existing
-- purchase payment's Date or Amount is adjusted, keeping the
-- before/after values for audit purposes even though payment_history
-- and purchase_payment_allocations only ever hold the current state.
--
-- Additive only - no existing table is touched.
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_payment_adjustments (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  payment_history_id      INT NOT NULL,
  purchase_id             INT NOT NULL,
  invoice_no              VARCHAR(100) NULL,
  supplier_id             INT NULL,
  supplier_name           VARCHAR(255) NULL,
  voucher_number          VARCHAR(100) NULL,
  original_payment_date   DATE NOT NULL,
  updated_payment_date    DATE NOT NULL,
  original_amount         DECIMAL(12,2) NOT NULL,
  adjusted_amount         DECIMAL(12,2) NOT NULL,
  adjustment_difference   DECIMAL(12,2) NOT NULL,
  status                  ENUM('Adjusted') NOT NULL DEFAULT 'Adjusted',
  notes                   TEXT NULL,
  updated_by              INT NULL,
  created_at              TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ppa_payment  (payment_history_id),
  KEY idx_ppa_purchase (purchase_id),
  CONSTRAINT fk_ppa_payment  FOREIGN KEY (payment_history_id) REFERENCES payment_history(id),
  CONSTRAINT fk_ppa_purchase FOREIGN KEY (purchase_id)        REFERENCES purchases(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
