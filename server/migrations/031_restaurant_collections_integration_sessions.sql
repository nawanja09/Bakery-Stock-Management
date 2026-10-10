-- 031_restaurant_collections_integration_sessions.sql
-- Collection module: RAVON Restaurant (restaurant.ravonbakers.lk) records next to
-- RAVON POS ones, and POS / Restaurant sessions without any stored credentials.
-- config/db.js (ensureCollectionsSourceSystem, ensureIntegrationSessionsSchema)
-- applies the same steps at startup, following this project's convention (no
-- separate migration runner). Every step checks information_schema first, so the
-- file is safe to run again and works on MySQL 5.7+/8 and MariaDB.
--
-- 1. collections.source_system ENUM('POS','RESTAURANT') NOT NULL DEFAULT 'POS'
--    * Existing rows are POS: the column default backfills them (plus an explicit
--      UPDATE for safety).
--    * Ids are unique only within one system, so the unique key becomes
--      (source_system, source_type, source_id). The new key is added BEFORE the
--      old uq_collections_source (source_type, source_id) is dropped, so
--      uniqueness is never lost. Existing POS rows satisfy both keys.
--    * idx_collections_system_reference serves the "already completed under a
--      different id" duplicate check, which now includes source_system.
--    * Ledger references of POS records are unchanged ("SHIFT-211-0104");
--      Restaurant ones are "RST-..." and their card keys "RESTAURANT:..."
--      (services/collectionService.js) - no schema change needed for that.
--
-- 2. pos_sessions gets `provider` ('pos' | 'restaurant'); the primary key becomes
--    (user_id, provider). A pos_sessions table from the earlier POS-only session
--    store (PRIMARY KEY user_id) is upgraded in place: its rows become provider
--    'pos' and keep working (same encryption key derivation). Only the encrypted
--    Bearer token is stored - never a username/password of POS or Restaurant.
--
-- Down (only if no RESTAURANT row exists - check first!):
--   SELECT COUNT(*) FROM collections WHERE source_system = 'RESTAURANT';  -- must be 0
--   ALTER TABLE collections ADD UNIQUE KEY uq_collections_source (source_type, source_id);
--   ALTER TABLE collections DROP INDEX uq_collections_system_source,
--                           DROP INDEX idx_collections_system_reference,
--                           DROP COLUMN source_system;
--   DELETE FROM pos_sessions WHERE provider <> 'pos';
--   ALTER TABLE pos_sessions DROP PRIMARY KEY, ADD PRIMARY KEY (user_id), DROP COLUMN provider;

-- ---------------------------------------------------------------- collections
SET @has_col := (SELECT COUNT(*) FROM information_schema.columns
                  WHERE table_schema = DATABASE() AND table_name = 'collections' AND column_name = 'source_system');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `collections` ADD COLUMN `source_system` ENUM(''POS'',''RESTAURANT'') NOT NULL DEFAULT ''POS'' AFTER `id`',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `collections` SET `source_system` = 'POS' WHERE `source_system` IS NULL OR `source_system` = '';

SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics
                  WHERE table_schema = DATABASE() AND table_name = 'collections' AND index_name = 'uq_collections_system_source');
SET @sql := IF(@has_idx = 0,
  'ALTER TABLE `collections` ADD UNIQUE KEY `uq_collections_system_source` (`source_system`, `source_type`, `source_id`)',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_old := (SELECT COUNT(*) FROM information_schema.statistics
                  WHERE table_schema = DATABASE() AND table_name = 'collections' AND index_name = 'uq_collections_source');
SET @sql := IF(@has_old > 0, 'ALTER TABLE `collections` DROP INDEX `uq_collections_source`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_ref := (SELECT COUNT(*) FROM information_schema.statistics
                  WHERE table_schema = DATABASE() AND table_name = 'collections' AND index_name = 'idx_collections_system_reference');
SET @sql := IF(@has_ref = 0,
  'ALTER TABLE `collections` ADD KEY `idx_collections_system_reference` (`source_system`, `source_type`, `reference_no`)',
  'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------- pos_sessions
CREATE TABLE IF NOT EXISTS `pos_sessions` (
  `user_id`        INT NOT NULL,
  `provider`       VARCHAR(20) NOT NULL DEFAULT 'pos',   -- 'pos' | 'restaurant'
  `pos_username`   VARCHAR(150) NOT NULL,                -- the POS / Restaurant account name (not a secret)
  `token_enc`      TEXT NOT NULL,                        -- AES-256-GCM encrypted Bearer token
  `expires_at`     DATETIME NULL,
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `invalidated_at` DATETIME NULL,                        -- the system answered 401
  `finance`        TINYINT(1) NOT NULL DEFAULT 0,        -- shared Finance session
  `all_branches`   TINYINT(1) NULL,                      -- GET /api/me: no branch restriction
  PRIMARY KEY (`user_id`, `provider`),
  KEY `idx_pos_sessions_provider` (`provider`, `finance`, `invalidated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns
                  WHERE table_schema = DATABASE() AND table_name = 'pos_sessions' AND column_name = 'provider');
SET @sql := IF(@has_col = 0,
  'ALTER TABLE `pos_sessions` ADD COLUMN `provider` VARCHAR(20) NOT NULL DEFAULT ''pos'' AFTER `user_id`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns
                  WHERE table_schema = DATABASE() AND table_name = 'pos_sessions' AND column_name = 'finance');
SET @sql := IF(@has_col = 0, 'ALTER TABLE `pos_sessions` ADD COLUMN `finance` TINYINT(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns
                  WHERE table_schema = DATABASE() AND table_name = 'pos_sessions' AND column_name = 'all_branches');
SET @sql := IF(@has_col = 0, 'ALTER TABLE `pos_sessions` ADD COLUMN `all_branches` TINYINT(1) NULL', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Primary key (user_id) -> (user_id, provider)
SET @pk := (SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics
             WHERE table_schema = DATABASE() AND table_name = 'pos_sessions' AND index_name = 'PRIMARY');
SET @sql := IF(@pk IS NULL, 'ALTER TABLE `pos_sessions` ADD PRIMARY KEY (`user_id`, `provider`)',
            IF(@pk <> 'user_id,provider', 'ALTER TABLE `pos_sessions` DROP PRIMARY KEY, ADD PRIMARY KEY (`user_id`, `provider`)', 'DO 0'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics
                  WHERE table_schema = DATABASE() AND table_name = 'pos_sessions' AND index_name = 'idx_pos_sessions_provider');
SET @sql := IF(@has_idx = 0,
  'ALTER TABLE `pos_sessions` ADD KEY `idx_pos_sessions_provider` (`provider`, `finance`, `invalidated_at`)', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
