-- 041_reference_locks.sql
--
-- Audit finding R9a. services/referenceValidationService.js refuses a voucher / cheque /
-- reference / invoice number that already exists in any of 11 tables, but it used a plain
-- SELECT: two requests saving the same number at the same moment both passed it.
--
-- Each number now takes a row lock here first (INSERT ... ON DUPLICATE KEY UPDATE holds the
-- row until the transaction ends), so a second request with the same number waits until the
-- first one has committed or rolled back, and then sees it.
--
-- Rows are only ever a lock handle: nothing reads them, they can be deleted at any time and
-- are re-created on use. config/db.js creates the table at start-up as well.
CREATE TABLE IF NOT EXISTS `reference_locks` (
  `ref_norm` varchar(100) NOT NULL,
  `locked_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`ref_norm`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
