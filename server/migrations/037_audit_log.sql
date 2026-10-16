-- 037_audit_log.sql
--
-- Audit Trail (audit finding H6): one row per sign-in event (success, failure,
-- lock-out), sign-out, password change, data-changing request and refused
-- request (403). Written by services/auditLog.js; read on the Audit Trail page
-- (Admin / Super Admin). Passwords and tokens are never stored.
--
-- config/db.js applies the same change at start-up; this file is for installs
-- where migrations are run by hand.

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  user_id INT NULL,                 -- no foreign key: rows outlive the user
  username VARCHAR(100) NULL,       -- also the typed name on a failed sign-in
  user_name VARCHAR(255) NULL,      -- display name at the time
  user_role VARCHAR(50) NULL,
  session_id VARCHAR(64) NULL,      -- one per sign-in (token claim "sid")
  event_type VARCHAR(20) NOT NULL,  -- AUTH | CHANGE | DENIED
  action VARCHAR(40) NOT NULL,      -- LOGIN, LOGIN_FAILED, CREATE, UPDATE, DELETE, APPROVE, PAY ...
  module VARCHAR(60) NULL,
  entity_id VARCHAR(64) NULL,
  record_type VARCHAR(60) NULL,     -- "Purchase invoice", "Issue note" ...
  record_label VARCHAR(255) NULL,   -- "Purchase invoice INV-1024" (services/auditPresenter.js)
  method VARCHAR(10) NULL,
  path VARCHAR(500) NULL,
  query_string VARCHAR(1000) NULL,
  status_code SMALLINT NULL,
  outcome ENUM('SUCCESS','FAILED') NOT NULL,
  message VARCHAR(500) NULL,
  request_body LONGTEXT NULL,       -- JSON, secrets replaced by [REDACTED]
  response_body LONGTEXT NULL,      -- JSON, secrets replaced by [REDACTED]
  old_values LONGTEXT NULL,         -- JSON: the edited record before (services/auditSnapshots.js)
  new_values LONGTEXT NULL,         -- JSON: the same record after; {"deleted":true} when removed
  ip_address VARCHAR(64) NULL,
  forwarded_for VARCHAR(255) NULL,
  user_agent VARCHAR(500) NULL,
  duration_ms INT NULL,
  PRIMARY KEY (id),
  KEY idx_audit_time (occurred_at),
  KEY idx_audit_user_time (user_id, occurred_at),
  KEY idx_audit_session (session_id),
  KEY idx_audit_event_time (event_type, occurred_at),
  KEY idx_audit_module_time (module, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only: the application cannot change or remove a row.
CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log is append-only';
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log is append-only';

-- Installs that created audit_log before these columns existed:
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS record_type VARCHAR(60) NULL AFTER entity_id,
  ADD COLUMN IF NOT EXISTS record_label VARCHAR(255) NULL AFTER record_type,
  ADD COLUMN IF NOT EXISTS old_values LONGTEXT NULL AFTER response_body,
  ADD COLUMN IF NOT EXISTS new_values LONGTEXT NULL AFTER old_values;
