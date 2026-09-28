// utils/expenseClassification.js
//
// Shared validation for the Expenses Type / Sub Expenses Type pair used by
// Petty Cash Vouchers and Cash Expenses (the same managed lists that drive
// New Expenses: expense_types + sub_expense_types).
//
// The client sends ids. The names stored on the record are always taken from
// the managed tables (never from the request body), so a record can never
// hold a type/sub type combination that is not in Expenses Type Management.
//
// `existing` is the stored record (edits only). It lets an edit keep values
// that were valid when saved but have since been made inactive, and lets a
// legacy record that has no sub type yet be edited without being forced to
// pick one, as long as its Expenses Type is left unchanged.

class ExpenseClassificationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExpenseClassificationError';
  }
}

const toId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const resolveExpenseClassification = async (connection, input = {}, existing = null) => {
  const typeId = toId(input.expense_type_id);
  const subId = toId(input.sub_expense_type_id);
  const typeName = input.expense_type ? String(input.expense_type).trim() : '';

  const sameAsStoredType = (id) => Boolean(existing && existing.expense_type_id && Number(existing.expense_type_id) === Number(id));
  const sameAsStoredSub = (id) => Boolean(existing && existing.sub_expense_type_id && Number(existing.sub_expense_type_id) === Number(id));

  // ---- Expenses Type -------------------------------------------------------
  let type = null;
  if (typeId) {
    const [rows] = await connection.query('SELECT id, name, status FROM expense_types WHERE id = ?', [typeId]);
    type = rows[0] || null;
    if (!type || (Number(type.status) !== 1 && !sameAsStoredType(type.id))) {
      throw new ExpenseClassificationError('Selected Expenses Type was not found or is inactive');
    }
  } else if (typeName) {
    // Name-only callers (older clients). Accept an active managed type, or the
    // unchanged legacy name already stored on the record being edited.
    const [rows] = await connection.query(
      'SELECT id, name, status FROM expense_types WHERE name = ? ORDER BY status DESC LIMIT 1',
      [typeName]
    );
    type = rows[0] || null;
    const unchangedLegacy = existing && String(existing.expense_type || '') === typeName;
    if (!type && unchangedLegacy) {
      return {
        expenseTypeId: existing.expense_type_id || null,
        expenseTypeName: typeName,
        subExpenseTypeId: existing.sub_expense_type_id || null,
        subExpenseTypeName: existing.sub_expense_type || null
      };
    }
    if (!type || (Number(type.status) !== 1 && !(existing && Number(existing.expense_type_id) === Number(type.id)))) {
      throw new ExpenseClassificationError('Selected Expenses Type was not found or is inactive');
    }
  } else {
    throw new ExpenseClassificationError('Expenses Type is required');
  }

  // ---- Sub Expenses Type ---------------------------------------------------
  if (subId) {
    const [rows] = await connection.query(
      'SELECT id, name, status FROM sub_expense_types WHERE id = ? AND expense_type_id = ?',
      [subId, type.id]
    );
    const sub = rows[0];
    if (!sub || (Number(sub.status) !== 1 && !sameAsStoredSub(sub.id))) {
      throw new ExpenseClassificationError('Selected Sub Expenses Type does not belong to the selected active Expenses Type');
    }
    return { expenseTypeId: type.id, expenseTypeName: type.name, subExpenseTypeId: sub.id, subExpenseTypeName: sub.name };
  }

  // No sub type submitted: allowed only when the type has nothing to choose
  // from, or when a legacy record (no sub type saved) keeps its Expenses Type.
  const [[{ activeCount }]] = await connection.query(
    'SELECT COUNT(*) AS activeCount FROM sub_expense_types WHERE expense_type_id = ? AND status = 1',
    [type.id]
  );
  const legacyBlankSub = existing && !existing.sub_expense_type_id && sameAsStoredType(type.id);
  const legacyBlankByName = existing && !existing.sub_expense_type_id && !existing.expense_type_id &&
    String(existing.expense_type || '') === type.name;
  if (Number(activeCount) > 0 && !legacyBlankSub && !legacyBlankByName) {
    throw new ExpenseClassificationError('Sub Expenses Type is required for the selected Expenses Type');
  }
  return { expenseTypeId: type.id, expenseTypeName: type.name, subExpenseTypeId: null, subExpenseTypeName: null };
};

module.exports = { resolveExpenseClassification, ExpenseClassificationError };
