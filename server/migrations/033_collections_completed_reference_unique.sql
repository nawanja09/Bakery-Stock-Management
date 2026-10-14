-- 033: at most ONE completed collection per (source_system, source_type, reference_no)
--
-- Why: the "POS reference already approved under another id" check in
-- services/collectionService.js is a plain SELECT. Two users approving two
-- pending copies of the same reference at the same moment both passed it and
-- both posted Cash / Bank / Card - the shift total was counted twice. This key
-- makes the database refuse the second approval (ER_DUP_ENTRY -> 409, the whole
-- approval transaction rolls back).
--
-- completed_ref_key is NULL for pending / rejected rows and for rows without a
-- reference, so only approved rows compete for the key.
--
-- Applied automatically at server start (config/db.js
-- ensureCollectionsCompletedReferenceUnique). Manual run:

-- 1) Must return no rows. If it does, resolve those approvals by hand first.
SELECT source_system, source_type, reference_no, COUNT(*) AS n
  FROM collections
 WHERE status = 'completed' AND reference_no IS NOT NULL
 GROUP BY source_system, source_type, reference_no
HAVING n > 1;

-- 2) MariaDB syntax (PERSISTENT). On MySQL 8 use STORED instead.
ALTER TABLE `collections`
  ADD COLUMN `completed_ref_key` VARCHAR(220)
    AS (IF(`status` = 'completed' AND `reference_no` IS NOT NULL,
           CONCAT(`source_system`, ':', `source_type`, ':', `reference_no`), NULL)) PERSISTENT,
  ADD UNIQUE KEY `uq_collections_completed_ref` (`completed_ref_key`);

-- Down:
--   ALTER TABLE `collections` DROP INDEX `uq_collections_completed_ref`, DROP COLUMN `completed_ref_key`;
