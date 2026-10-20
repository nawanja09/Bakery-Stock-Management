-- VAT rate is a single, management-editable setting (default 18%) instead of
-- being hardcoded wherever Purchases / Expenses VAT is calculated.
CREATE TABLE IF NOT EXISTS vat_rate_settings (
  id INT PRIMARY KEY,
  vat_rate DECIMAL(5,2) NOT NULL DEFAULT 18.00,
  updated_by INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO vat_rate_settings (id, vat_rate)
SELECT 1, 18.00 FROM (SELECT 1) AS dummy
WHERE NOT EXISTS (SELECT 1 FROM vat_rate_settings WHERE id = 1);
