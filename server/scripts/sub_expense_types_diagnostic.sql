-- READ-ONLY diagnostic. Run in phpMyAdmin on the PRODUCTION database.
-- Nothing here modifies data.

-- 1. Tables/columns exist and row counts (expect sub types > 0)
SELECT 'expense_types' AS tbl, COUNT(*) AS n FROM expense_types
UNION ALL SELECT 'sub_expense_types', COUNT(*) FROM sub_expense_types;

-- 2. Sub types whose parent is missing or inactive (would be hidden / filtered out)
SELECT s.id, s.name, s.expense_type_id, et.name AS parent, et.status AS parent_status
FROM sub_expense_types s LEFT JOIN expense_types et ON et.id = s.expense_type_id
WHERE et.id IS NULL OR et.status <> 1;

-- 3. Active expense types and how many ACTIVE sub types each one has.
--    A type with 0 shows an empty Sub Expense Type dropdown - this is expected
--    data, not an API fault.
SELECT et.id, et.name, COUNT(s.id) AS active_sub_types
FROM expense_types et
LEFT JOIN sub_expense_types s ON s.expense_type_id = et.id AND s.status = 1
WHERE COALESCE(et.status, 1) = 1
GROUP BY et.id, et.name
ORDER BY active_sub_types DESC, et.name;

-- 4. Saved records whose expense_type_id disagrees with their sub type's parent
SELECT 'expenses' AS src, e.id, e.expense_type_id, e.expense_type COLLATE utf8mb4_unicode_ci AS expense_type, e.sub_expense_type_id, s.expense_type_id AS sub_parent
FROM expenses e JOIN sub_expense_types s ON s.id = e.sub_expense_type_id WHERE e.expense_type_id <> s.expense_type_id
UNION ALL
SELECT 'petty_cash_vouchers', v.id, v.expense_type_id, v.expense_type COLLATE utf8mb4_unicode_ci, v.sub_expense_type_id, s.expense_type_id
FROM petty_cash_vouchers v JOIN sub_expense_types s ON s.id = v.sub_expense_type_id WHERE v.expense_type_id <> s.expense_type_id
UNION ALL
SELECT 'cash_expenses', c.id, c.expense_type_id, c.expense_type COLLATE utf8mb4_unicode_ci, c.sub_expense_type_id, s.expense_type_id
FROM cash_expenses c JOIN sub_expense_types s ON s.id = c.sub_expense_type_id WHERE c.expense_type_id <> s.expense_type_id;

-- 5. Collations (sub_expense_types is utf8mb4_general_ci; most other tables are
--    utf8mb4_unicode_ci. Comparing names across them needs an explicit COLLATE.)
SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('expense_types','sub_expense_types','expenses','petty_cash_vouchers','cash_expenses');

-- API check (replace HOST and TOKEN) - expect HTTP 200 and a JSON array, e.g. 18 rows for type 41:
--   curl -i -H "Authorization: Bearer TOKEN" "https://HOST/api/sub-expense-types?expense_type_id=41&activeOnly=true"
--   404 -> deployed backend is old (route missing).  401 -> token/JWT_SECRET.  Browser CORS error -> CORS_ORIGINS.
