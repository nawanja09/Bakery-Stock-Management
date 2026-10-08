-- POS sessions of Stock Management users whose login the Ravon POS accepted
-- (POS /api/login). One row per BSMS user; `finance` = 1 marks the Finance
-- user's session (all-branch POS account), shared for every POS call.
-- Created automatically on first use by server/services/posSessionStore.js;
-- this file documents the table and can be run by hand.
-- token_enc is the POS Bearer token encrypted with AES-256-GCM (key from
-- POS_SESSION_SECRET or JWT_SECRET). POS passwords are never stored.
CREATE TABLE IF NOT EXISTS pos_sessions (
  user_id INT NOT NULL PRIMARY KEY,
  pos_username VARCHAR(150) NOT NULL,
  token_enc TEXT NOT NULL,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  invalidated_at DATETIME NULL,
  finance TINYINT(1) NOT NULL DEFAULT 0
);
