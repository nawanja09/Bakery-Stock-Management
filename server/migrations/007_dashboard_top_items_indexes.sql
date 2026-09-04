ALTER TABLE `issuances`
  ADD KEY `idx_issuances_issuance_date` (`issuance_date`);

ALTER TABLE `wastages`
  ADD KEY `idx_wastages_date` (`date`);
