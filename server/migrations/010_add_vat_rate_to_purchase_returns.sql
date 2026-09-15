-- Add vat_rate to purchase_returns for consistent VAT calculation logic
ALTER TABLE `purchase_returns`
  ADD COLUMN IF NOT EXISTS `vat_rate` decimal(5,2) NOT NULL DEFAULT 18.00
    COMMENT 'VAT rate applied to this return (mirrors purchases.vat_rate)';
