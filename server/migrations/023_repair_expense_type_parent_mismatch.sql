-- 023_repair_expense_type_parent_mismatch.sql
--
-- Repairs saved expense rows whose expense_type_id no longer agrees with the
-- parent of their saved sub expense type. The edit forms trust expense_type_id,
-- so such a row shows the wrong Expense Type and an empty Sub Expense Type list.
--
-- Safety: never deletes anything and never touches rows that are already
-- consistent. A row is changed ONLY when
--   (a) it has a sub_expense_type_id that exists, and
--   (b) that sub type's parent differs from the row's expense_type_id, and
--   (c) the row's saved expense_type NAME equals that parent's name
--       (i.e. the name text and the sub type agree; only the id is stale).
-- Idempotent: running it twice changes nothing the second time.
--
-- 1) PREVIEW first (read-only) - review the rows listed:
--    SELECT v.id, v.expense_type_id AS stale_id, v.expense_type, s.expense_type_id AS correct_id, v.sub_expense_type
--    FROM petty_cash_vouchers v
--    JOIN sub_expense_types s ON s.id = v.sub_expense_type_id
--    JOIN expense_types et ON et.id = s.expense_type_id
--    WHERE v.expense_type_id <> s.expense_type_id
--      AND v.expense_type COLLATE utf8mb4_unicode_ci = et.name COLLATE utf8mb4_unicode_ci;
--
-- 2) Then run the updates below. Take a backup / snapshot of the tables first.

UPDATE petty_cash_vouchers v
JOIN sub_expense_types s ON s.id = v.sub_expense_type_id
JOIN expense_types et ON et.id = s.expense_type_id
SET v.expense_type_id = s.expense_type_id
WHERE v.expense_type_id <> s.expense_type_id
  AND v.expense_type COLLATE utf8mb4_unicode_ci = et.name COLLATE utf8mb4_unicode_ci;

UPDATE cash_expenses c
JOIN sub_expense_types s ON s.id = c.sub_expense_type_id
JOIN expense_types et ON et.id = s.expense_type_id
SET c.expense_type_id = s.expense_type_id
WHERE c.expense_type_id <> s.expense_type_id
  AND c.expense_type COLLATE utf8mb4_unicode_ci = et.name COLLATE utf8mb4_unicode_ci;

UPDATE expenses e
JOIN sub_expense_types s ON s.id = e.sub_expense_type_id
JOIN expense_types et ON et.id = s.expense_type_id
SET e.expense_type_id = s.expense_type_id
WHERE e.expense_type_id <> s.expense_type_id
  AND e.expense_type COLLATE utf8mb4_unicode_ci = et.name COLLATE utf8mb4_unicode_ci;
