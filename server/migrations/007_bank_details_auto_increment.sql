-- Ensure new bank accounts receive generated IDs on legacy installations.
ALTER TABLE `bank_details`
  MODIFY COLUMN `id` int(11) NOT NULL AUTO_INCREMENT;