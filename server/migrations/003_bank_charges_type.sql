-- ============================================================
-- Migration: Bank Charges Type Management
-- Creates bank_charges_types table and links it to bank_charges
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_charges_types (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  type_name   VARCHAR(100) NOT NULL,
  status      TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Active, 0=Deleted',
  created_at  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_bank_charges_type_name (type_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO bank_charges_types (type_name) VALUES
  ('Service Charge'), ('Cheque Return'), ('Overdraft Interest'), ('Other');

-- Link to bank_charges table
-- We keep charges_type as string for backward compatibility with old records,
-- and add bank_charge_type_id for the new FK relationship
ALTER TABLE bank_charges ADD COLUMN IF NOT EXISTS bank_charge_type_id INT NULL AFTER charges_type;
-- Since some records might have null, we ensure it can be null
-- Adding constraint
ALTER TABLE bank_charges ADD CONSTRAINT fk_bank_charges_type FOREIGN KEY (bank_charge_type_id) REFERENCES bank_charges_types(id);
