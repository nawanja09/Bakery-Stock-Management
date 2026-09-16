-- RM Adjustment Summary source records.
-- Only a successful save from the RM Adjustment page creates/updates a row.
CREATE TABLE IF NOT EXISTS rm_adjustment_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category ENUM('Department', 'Invoice', 'Issuance', 'Wastage') NOT NULL,
  source_record_id INT NOT NULL,
  reference_id VARCHAR(100) NULL,
  updated_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rm_adjustment_source (category, source_record_id),
  KEY idx_rm_adjustment_category_updated (category, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
