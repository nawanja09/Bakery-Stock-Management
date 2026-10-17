-- 038_period_reopen_requests.sql
--
-- Period close (audit finding H7, services/periodLock.js). Only the current month
-- and the month before it are open; older months are closed. This table holds the
-- requests to re-open a closed month:
--   Pending  -> an Admin / Super Admin asked, with a reason
--   Approved -> the Super Admin approved it until expires_at; while it is unexpired
--               an Admin / Super Admin can post and edit in those months
--   Rejected -> the Super Admin refused
--   Closed   -> closed again before it expired
--
-- config/db.js creates the same table at start-up; this file is for installs
-- where migrations are run by hand.

CREATE TABLE IF NOT EXISTS period_reopen_requests (
  id INT NOT NULL AUTO_INCREMENT,
  period_from DATE NOT NULL,            -- first day of the first month
  period_to DATE NOT NULL,              -- last day of the last month
  reason VARCHAR(500) NOT NULL,
  status ENUM('Pending','Approved','Rejected','Closed') NOT NULL DEFAULT 'Pending',
  requested_by INT NOT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by INT NULL,
  decided_at DATETIME NULL,
  decision_note VARCHAR(500) NULL,
  expires_at DATETIME NULL,
  closed_by INT NULL,
  closed_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_period_reopen_status (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
