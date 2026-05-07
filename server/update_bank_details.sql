-- Update bank_details table to include missing columns
USE backery_system;

-- Add missing columns (assuming branch_name already exists)
ALTER TABLE bank_details 
ADD COLUMN account_type VARCHAR(50) DEFAULT 'Current' AFTER branch_name,
ADD COLUMN currency VARCHAR(10) DEFAULT 'LKR' AFTER account_type,
ADD COLUMN opening_balance DECIMAL(15, 2) DEFAULT 0.00 AFTER currency,
ADD COLUMN current_balance DECIMAL(15, 2) DEFAULT 0.00 AFTER opening_balance,
ADD COLUMN contact_person VARCHAR(255) NULL AFTER current_balance,
ADD COLUMN contact_phone VARCHAR(50) NULL AFTER contact_person,
ADD COLUMN contact_email VARCHAR(100) NULL AFTER contact_phone,
ADD COLUMN notes TEXT NULL AFTER contact_email,
ADD COLUMN status VARCHAR(20) DEFAULT 'Active' AFTER notes;
