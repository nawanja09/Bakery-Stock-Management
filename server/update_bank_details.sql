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


-- First, make sure to drop the table if it exists
DROP TABLE IF EXISTS `bank_details`;

-- Create the bank_details table with correct foreign key
CREATE TABLE `bank_details` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bank_name` varchar(255) NOT NULL,
  `account_number` varchar(100) DEFAULT NULL,
  `branch_name` varchar(255) DEFAULT NULL,
  `account_type` varchar(50) DEFAULT 'Current',
  `currency` varchar(10) DEFAULT 'LKR',
  `opening_balance` decimal(15,2) DEFAULT '0.00',
  `current_balance` decimal(15,2) DEFAULT '0.00',
  `contact_person` varchar(255) DEFAULT NULL,
  `contact_phone` varchar(50) DEFAULT NULL,
  `contact_email` varchar(100) DEFAULT NULL,
  `notes` text,
  `status` varchar(20) DEFAULT 'Active',
  `created_by` int DEFAULT NULL,  -- Removed UNSIGNED to match users.id
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `fk_bank_details_created_by` 
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) 
    ON DELETE SET NULL  -- Optional: what happens when user is deleted
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;