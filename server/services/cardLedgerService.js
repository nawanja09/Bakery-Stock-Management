// server/services/cardLedgerService.js
//
// Finance -> Card Ledger business rules. Shared by the Card Ledger controller
// and by Bank Receive / Collections (which file card receipts as PENDING card
// transactions instead of posting them to the bank straight away).
//
// Ledger convention (see utils/financeLedger.js): DEBIT = money IN to the bank.
//
// Realise (one or many Pending card transactions, ONE database transaction):
//   The user enters ONE Realise Amount for the whole selection. The server
//   ignores any total / commission / remaining the browser may have calculated:
//     Total Transaction Amount = SUM of the selected rows' amounts (from the DB)
//     Expected Commission      = SUM over each Branch / Department of
//                                (its rows' amount x its ACTIVE Credit Card Rate / 100)
//                                - a department's rate is never applied to
//                                another department's rows
//     Remaining Balance        = Total - Realise Amount - Expected Commission (>= 0)
//                                = the Bank Charge
//   and then writes
//     * card_realisations : one record (total, realise amount, commission,
//                           remaining balance, date)
//     * Bank Ledger       : one DEBIT of the Realise Amount, dated on the
//                           Realise Date, posted through the shared
//                           recordBankTransaction() helper (existing balance rules).
//                           Commission and bank charge are NOT posted to the bank:
//                           they were never received, so nothing is deducted twice.
//     * Hidden Expenses   : "Visa Card Payment commission" (Expected Commission,
//                           only when > 0) and "Credit Card Bank Charge"
//                           (Remaining Balance, only when > 0) - two separate
//                           report-only records for the realisation's company
//     * card_transactions : every selected row -> Completed (original amount kept,
//                           the rate applied is saved on the row)
//   Rules: all selected rows share ONE company and ONE bank account; every row
//   has a Branch / Department with an ACTIVE Credit Card Rate (rows without a
//   department can be given one in the same request); Realise Amount > 0 and
//   Realise Amount + Expected Commission <= Total. Nothing is partially saved:
//   the caller rolls back on any error.
//
// Duplicate protection: rows are locked (FOR UPDATE) in id order, status is
// re-checked under the lock, each status UPDATE is guarded with
// `AND status = 'Pending'`, and card_realisations.finance_transaction_id /
// commission_expense_id / bank_charge_expense_id are UNIQUE, so a repeated
// request (retry, double click, refresh) is refused and writes nothing.

const { recordBankTransaction, rebuildBalanceAfter } = require('../utils/financeLedger');
const {
  HttpError, parseDateOnly, parseId, parsePositiveMoney, dbToCents, centsToNumber, formatCents
} = require('../utils/staffLoanUtils');
const {
  loadDepartmentRates, commissionCents, basisPointsToRate, missingRateMessage
} = require('./creditCardRateService');

// Receive Type (Finance -> Receive Types) that represents a card settlement.
const CARD_RECEIVE_TYPE = 'visa card payment';
const CARD_LEDGER_TRANSACTION_TYPE = 'Visa Card Payment';
// Bank Ledger rows created by a (batch) realisation point at card_realisations.id.
// (The earlier per-row version used 'CARD_REALISE' with a card_transactions id.)
const CARD_LEDGER_REFERENCE_TYPE = 'CARD_REALISATION';
// Realisations saved before the commission split used this single type.
const HIDDEN_EXPENSE_TYPE = 'Visa Card Payment';
const COMMISSION_EXPENSE_TYPE = 'Visa Card Payment commission';
const BANK_CHARGE_EXPENSE_TYPE = 'Credit Card Bank Charge';
const MAX_BATCH = 200;
const REFERENCE_MAX = 100; // finance_transactions / hidden_expenses reference column size
const DESCRIPTION_MAX = 500; // hidden_expenses.description
const SHIFT_NO_MAX = 50;

const isCardReceiveType = (value) =>
  String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase() === CARD_RECEIVE_TYPE;

/**
 * Reference No stored on the Bank Ledger row and the Hidden Expenses of a
 * realisation: the original card reference(s). One card -> its reference
 * unchanged; several -> comma-separated, shortened to "<first> (+N more)" when
 * the list would not fit the 100-character column.
 */
const combineReferences = (references) => {
  const refs = references.map((r) => String(r ?? '').trim()).filter(Boolean);
  if (refs.length === 0) return null;
  const joined = refs.join(', ');
  if (joined.length <= REFERENCE_MAX) return joined;
  const short = `${refs[0]} (+${refs.length - 1} more)`;
  return short.length <= REFERENCE_MAX ? short : short.slice(0, REFERENCE_MAX);
};

/**
 * Remark as SHOWN in the Card Ledger. Remarks written by Collections carry the
 * collection card label, the POS Sale ID and the Shift No, e.g.
 *   "Collection card - Sale #21127, receipt R1 14:07 - SHIFT-211-0104 - Cafe - M"
 * Those three are dropped from the display ("Sale receipt R1 14:07 - Cafe - M");
 * the stored remark is unchanged and Shift No / Branch have their own columns.
 * Remarks typed by users (Bank Receive) are shown as they are.
 */
const displayRemark = (remark) => {
  const text = String(remark ?? '').trim();
  if (!/^Collection\b/i.test(text)) return text;
  return text
    .replace(/^Collection card\s*-\s*/i, '')        // collection card label (per POS payment)
    .replace(/^Collection\s*-\s*Card\b\s*/i, '')     // collection card label (one card line)
    .replace(/^(Sale)\s+#[^\s,]+,?/i, '$1')          // POS Sale ID
    .replace(/\(?\s*\bSHIFT-[^\s)]+\s*\)?/gi, ' ')   // Shift No (collection reference)
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+-(\s+-)+\s+/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,-]+|[\s,-]+$/g, '')
    .replace(/^\((.*)\)$/, '$1');
};

/**
 * Files a card transaction as PENDING. Does NOT touch any bank balance.
 * Requires an open connection (callers wrap it in their own DB transaction).
 * `departmentId` / `shiftNo` (Branch / Department and POS shift of the payment)
 * are optional: Bank Receive does not know them.
 */
const createPendingCardTransaction = async (connection, {
  companyId, bankId, date, amount, referenceNumber = null, remark = null, createdBy = null,
  departmentId = null, shiftNo = null
}) => {
  const ref = referenceNumber ? String(referenceNumber).trim() : null;
  if (ref) {
    const [dupes] = await connection.query(
      'SELECT id FROM card_transactions WHERE LOWER(TRIM(reference_number)) = LOWER(?) LIMIT 1',
      [ref]
    );
    if (dupes.length > 0) {
      throw new HttpError(400, `Reference number "${ref}" is already used by another card transaction`);
    }
  }

  const shift = shiftNo === null || shiftNo === undefined || String(shiftNo).trim() === ''
    ? null : String(shiftNo).trim().slice(0, SHIFT_NO_MAX);
  const [result] = await connection.query(
    `INSERT INTO card_transactions
       (company_id, bank_id, transaction_date, amount, reference_number, remark, status, created_by,
        department_id, shift_no)
     VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?)`,
    [companyId, bankId, date, amount, ref, remark || null, createdBy, parseId(departmentId), shift]
  );
  return result.insertId;
};

const parseTransactionIds = (transactionIds) => {
  if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
    throw new HttpError(400, 'Select at least one card transaction to realise');
  }
  if (transactionIds.length > MAX_BATCH) {
    throw new HttpError(400, `You can realise at most ${MAX_BATCH} card transactions at a time`);
  }

  const seen = new Set();
  const ids = transactionIds.map((raw) => {
    const id = parseId(raw);
    if (!id) throw new HttpError(400, 'Invalid card transaction ID');
    if (seen.has(id)) throw new HttpError(400, 'The same card transaction was selected more than once');
    seen.add(id);
    return id;
  });
  return ids.sort((a, b) => a - b); // fixed lock order: concurrent requests cannot deadlock
};

const parseOptionalDepartment = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const id = parseId(value);
  if (!id) throw new HttpError(400, 'Invalid Branch / Department');
  return id;
};

/**
 * Validates the shape of a realise request. Pure (no database). The amount is
 * checked against the real Total / Expected Commission later, from the database.
 * @returns {{ date: string, ids: number[], realiseCents: number, departmentId: number|null }}
 */
const parseRealiseRequest = ({ transactionIds, realiseAmount, realiseDate, departmentId } = {}) => {
  const ids = parseTransactionIds(transactionIds);

  const amount = parsePositiveMoney(realiseAmount, 'Realise Amount');
  if (amount.error) throw new HttpError(400, amount.error);

  if (realiseDate === undefined || realiseDate === null || String(realiseDate).trim() === '') {
    throw new HttpError(400, 'Realise Date is required');
  }
  const date = parseDateOnly(typeof realiseDate === 'string' ? realiseDate : '');
  if (!date) throw new HttpError(400, 'Please enter a valid Realise Date');

  return { date, ids, realiseCents: amount.cents, departmentId: parseOptionalDepartment(departmentId) };
};

const cardLabel = (card) => (card.reference_number ? `"${card.reference_number}"` : `#${card.id}`);

/**
 * Groups card rows by Branch / Department and applies each department's ACTIVE
 * Credit Card Rate to that department's rows only.
 *   cards: [{ id, amount, department_id }]
 *   fallbackDepartmentId: used for rows that have no department yet
 * @returns {{ groups, problems: string[], unassigned: number, totalCents, commissionCents|null }}
 *   groups: [{ departmentId, departmentName, count, amountCents, basisPoints|null, commissionCents|null }]
 */
const calculateCommission = async (connection, cards, fallbackDepartmentId = null) => {
  const departmentOf = (card) => (card.department_id ? Number(card.department_id) : fallbackDepartmentId);
  const unassigned = cards.filter((c) => !c.department_id).length;
  const rates = await loadDepartmentRates(connection, cards.map(departmentOf));

  const groups = new Map();
  const problems = [];
  let unknownDepartment = false;
  for (const card of cards) {
    const departmentId = departmentOf(card);
    if (!departmentId) continue;
    const info = rates.get(departmentId);
    if (!info) { unknownDepartment = true; continue; }
    if (!groups.has(departmentId)) {
      groups.set(departmentId, {
        departmentId, departmentName: info.departmentName, count: 0, amountCents: 0, basisPoints: info.basisPoints, commissionCents: null
      });
    }
    const group = groups.get(departmentId);
    group.count += 1;
    group.amountCents += dbToCents(card.amount);
  }

  if (unknownDepartment) problems.push('The selected Branch / Department no longer exists');
  const missingDepartment = cards.filter((c) => !departmentOf(c));
  if (missingDepartment.length > 0) {
    problems.push(missingDepartment.length === 1
      ? `Card transaction ${cardLabel(missingDepartment[0])} has no Branch / Department. Select the Branch / Department to apply its Credit Card Rate.`
      : `${missingDepartment.length} selected card transactions have no Branch / Department. Select the Branch / Department to apply its Credit Card Rate.`);
  }
  const list = [...groups.values()].sort((a, b) => String(a.departmentName).localeCompare(String(b.departmentName)));
  for (const group of list) {
    if (group.basisPoints === null) {
      problems.push(missingRateMessage(group.departmentName));
    } else {
      group.commissionCents = commissionCents(group.amountCents, group.basisPoints);
    }
  }

  const totalCents = cards.reduce((sum, c) => sum + dbToCents(c.amount), 0);
  const commission = problems.length > 0 ? null : list.reduce((sum, g) => sum + g.commissionCents, 0);
  return { groups: list, problems, unassigned, totalCents, commissionCents: commission };
};

const groupToJson = (g) => ({
  department_id: g.departmentId,
  department_name: g.departmentName,
  transaction_count: g.count,
  amount: centsToNumber(g.amountCents),
  rate: g.basisPoints === null ? null : basisPointsToRate(g.basisPoints),
  expected_commission: g.commissionCents === null ? null : centsToNumber(g.commissionCents)
});

/**
 * Realise-dialog preview: Total, per-department rate and Expected Commission of
 * the selected Pending rows, from the database (read-only, no locks). The
 * realisation recalculates everything again before saving.
 */
const previewCommission = async (connection, { transactionIds, departmentId } = {}) => {
  const ids = parseTransactionIds(transactionIds);
  const fallback = parseOptionalDepartment(departmentId);
  const [cards] = await connection.query(
    `SELECT id, amount, department_id, reference_number, status
       FROM card_transactions WHERE id IN (?)`,
    [ids]
  );
  if (cards.length !== ids.length) throw new HttpError(404, 'One or more card transactions were not found');
  const realised = cards.find((c) => c.status !== 'Pending');
  if (realised) throw new HttpError(409, `Card transaction ${cardLabel(realised)} has already been realised`);

  const result = await calculateCommission(connection, cards, fallback);
  return {
    total_amount: centsToNumber(result.totalCents),
    groups: result.groups.map(groupToJson),
    unassigned_count: result.unassigned,
    problems: result.problems,
    expected_commission: result.commissionCents === null ? null : centsToNumber(result.commissionCents),
    // Highest Realise Amount the selection allows (Remaining Balance = 0).
    max_realise_amount: result.commissionCents === null ? null : centsToNumber(result.totalCents - result.commissionCents)
  };
};

const commissionDescription = (realisationId, groups) => {
  const parts = groups.map((g) => `${g.departmentName} ${(g.basisPoints / 100).toFixed(2)}% of ${formatCents(g.amountCents)} = ${formatCents(g.commissionCents)}`);
  return `Card Ledger realisation #${realisationId} - ${parts.join('; ')}`.slice(0, DESCRIPTION_MAX);
};

const bankChargeDescription = (realisationId, { totalCents, realiseCents, commission }) =>
  (`Card Ledger realisation #${realisationId} - Total ${formatCents(totalCents)} - Realised ${formatCents(realiseCents)}`
    + ` - Commission ${formatCents(commission)}`).slice(0, DESCRIPTION_MAX);

/**
 * Like parsePositiveMoney, but 0 is allowed (Expected Commission / Remaining
 * Balance can legitimately be edited down to zero).
 */
const parseNonNegativeMoney = (value, label = 'Amount') => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { error: `${label} is required` };
  }
  const text = typeof value === 'number' ? String(value) : String(value).trim();
  if (/^-/.test(text)) return { error: `${label} cannot be negative` };
  const match = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[1] === '' && (match[2] === undefined || match[2] === ''))) {
    return { error: `${label} must be a valid number` };
  }
  const integerPart = match[1] || '0';
  const fractionPart = match[2] || '';
  if (fractionPart.length > 2) return { error: `${label} can have at most 2 decimal places` };
  if (integerPart.replace(/^0+(?=\d)/, '').length > 12) return { error: `${label} is too large` };
  return { cents: Number(integerPart) * 100 + Number(fractionPart.padEnd(2, '0')) };
};

const insertHiddenExpense = async (connection, { date, cents, type, description, companyId, reference, userId }) => {
  const [hidden] = await connection.query(
    `INSERT INTO hidden_expenses
       (expense_date, amount, type, description, company_id, reference_number, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [date, centsToNumber(cents), type, description, companyId, reference, userId]
  );
  return hidden.insertId;
};

/**
 * Realises the selected Pending card transactions with ONE Realise Amount
 * (see header). Requires an open DB transaction on `connection`; the caller
 * commits / rolls back.
 */
const realiseCardTransactions = async (connection, {
  transactionIds, realiseAmount, realiseDate, departmentId, userId = null
}) => {
  const request = parseRealiseRequest({ transactionIds, realiseAmount, realiseDate, departmentId });
  const { date, ids, realiseCents } = request;

  // 1) Lock + load every selected row (the database is the only source of amounts).
  const cards = [];
  for (const id of ids) {
    const [rows] = await connection.query(
      `SELECT id, company_id, bank_id, department_id, amount, reference_number, status,
              DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date
       FROM card_transactions WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) throw new HttpError(404, `Card transaction #${id} not found`);
    cards.push(rows[0]);
  }

  // 2) Validate everything BEFORE any write.
  for (const card of cards) {
    if (card.status !== 'Pending') {
      throw new HttpError(409, `Card transaction ${cardLabel(card)} has already been realised`);
    }
  }
  const first = cards[0];
  if (cards.some((c) => Number(c.company_id) !== Number(first.company_id))) {
    throw new HttpError(400, 'Selected card transactions must belong to the same Company');
  }
  if (cards.some((c) => Number(c.bank_id) !== Number(first.bank_id))) {
    throw new HttpError(400, 'Selected card transactions must belong to the same Bank Account');
  }
  for (const card of cards) {
    if (date < card.transaction_date) {
      throw new HttpError(400, `Realise Date cannot be earlier than the transaction date of ${cardLabel(card)}`);
    }
  }

  const fallbackDepartmentId = cards.some((c) => !c.department_id) ? request.departmentId : null;
  const commission = await calculateCommission(connection, cards, fallbackDepartmentId);
  if (commission.problems.length > 0) throw new HttpError(400, commission.problems.join(' '));

  const { totalCents } = commission;
  const commissionTotal = commission.commissionCents;
  const maxRealiseCents = totalCents - commissionTotal;
  if (realiseCents > maxRealiseCents) {
    throw new HttpError(
      400,
      `Realise Amount cannot be more than Rs. ${formatCents(maxRealiseCents)} `
      + `(Total Transaction Amount Rs. ${formatCents(totalCents)} - Expected Commission Rs. ${formatCents(commissionTotal)})`
    );
  }
  const remainingCents = maxRealiseCents - realiseCents; // the bank charge, always >= 0 here
  const reference = combineReferences(cards.map((c) => c.reference_number));
  const rateOf = new Map(commission.groups.map((g) => [g.departmentId, g.basisPoints]));

  // 3) Write.
  const [created] = await connection.query(
    `INSERT INTO card_realisations
       (company_id, bank_id, realise_date, total_amount, realise_amount, remaining_balance, reference_number, created_by,
        commission_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      first.company_id, first.bank_id, date,
      centsToNumber(totalCents), centsToNumber(realiseCents), centsToNumber(remainingCents),
      reference, userId, centsToNumber(commissionTotal)
    ]
  );
  const realisationId = created.insertId;

  let bankBalance;
  try {
    bankBalance = await recordBankTransaction(connection, {
      bankId: first.bank_id,
      date,
      remark: cards.length === 1
        ? `Card settlement realised (transaction dated ${first.transaction_date})`
        : `Card settlement realised (${cards.length} transactions)`,
      debit: centsToNumber(realiseCents),
      credit: 0,
      transactionType: CARD_LEDGER_TRANSACTION_TYPE,
      referenceNumber: reference,
      referenceType: CARD_LEDGER_REFERENCE_TYPE,
      referenceId: realisationId,
      createdBy: userId
    });
  } catch (error) {
    if (error.message === 'Bank account not found.') {
      throw new HttpError(400, 'The bank account for these card transactions is not active');
    }
    throw error;
  }

  const [ledgerRows] = await connection.query(
    `SELECT id FROM finance_transactions
     WHERE reference_type = ? AND reference_id = ? AND account_type = 'BANK' AND status = 1
     ORDER BY id DESC LIMIT 1`,
    [CARD_LEDGER_REFERENCE_TYPE, realisationId]
  );
  const financeTransactionId = ledgerRows[0]?.id ?? null;

  const expense = { date, companyId: first.company_id, reference, userId };
  const commissionExpenseId = commissionTotal > 0
    ? await insertHiddenExpense(connection, {
      ...expense, cents: commissionTotal, type: COMMISSION_EXPENSE_TYPE,
      description: commissionDescription(realisationId, commission.groups)
    })
    : null;
  const bankChargeExpenseId = remainingCents > 0
    ? await insertHiddenExpense(connection, {
      ...expense, cents: remainingCents, type: BANK_CHARGE_EXPENSE_TYPE,
      description: bankChargeDescription(realisationId, { totalCents, realiseCents, commission: commissionTotal })
    })
    : null;

  await connection.query(
    `UPDATE card_realisations
        SET finance_transaction_id = ?, commission_expense_id = ?, bank_charge_expense_id = ?
      WHERE id = ?`,
    [financeTransactionId, commissionExpenseId, bankChargeExpenseId, realisationId]
  );

  for (const card of cards) {
    const departmentOfCard = card.department_id ? Number(card.department_id) : fallbackDepartmentId;
    const [update] = await connection.query(
      `UPDATE card_transactions
          SET status = 'Completed', realise_date = ?, realisation_id = ?, realised_by = ?, realised_at = NOW(),
              department_id = ?, commission_rate = ?
        WHERE id = ? AND status = 'Pending'`,
      [date, realisationId, userId, departmentOfCard, basisPointsToRate(rateOf.get(departmentOfCard)), card.id]
    );
    if (update.affectedRows !== 1) {
      // Completed by someone else between our check and now: undo everything.
      throw new HttpError(409, `Card transaction ${cardLabel(card)} has already been realised`);
    }
  }

  return {
    realisationId,
    transactionIds: cards.map((c) => c.id),
    totals: {
      totalTransactionAmount: centsToNumber(totalCents),
      expectedCommission: centsToNumber(commissionTotal),
      realiseAmount: centsToNumber(realiseCents),
      remainingBalance: centsToNumber(remainingCents),
      bankCharge: centsToNumber(remainingCents)
    },
    commissionGroups: commission.groups.map(groupToJson),
    financeTransactionId,
    commissionExpenseId,
    bankChargeExpenseId,
    bankBalance
  };
};

/**
 * Reverses a Completed realisation back to Pending (Admin / Super Admin only -
 * enforced by the route). Voids the Bank Ledger debit (finance_transactions,
 * same convention as every other void in this app) and soft-deletes the
 * linked Hidden Expenses (no hard delete), marks the realisation reversed
 * (kept for audit, never deleted - it drops out of the Completed tab) and
 * puts every card transaction it covered back to Pending so it can be
 * corrected and re-realised. Requires an open DB transaction on `connection`;
 * the caller commits / rolls back.
 */
const reverseCardRealisation = async (connection, { realisationId, userId = null } = {}) => {
  const id = parseId(realisationId);
  if (!id) throw new HttpError(400, 'Invalid realisation');

  const [rows] = await connection.query(
    `SELECT id, bank_id, company_id, finance_transaction_id, hidden_expense_id,
            commission_expense_id, bank_charge_expense_id, status
       FROM card_realisations WHERE id = ? FOR UPDATE`,
    [id]
  );
  if (rows.length === 0) throw new HttpError(404, 'Realisation not found');
  const realisation = rows[0];
  if (Number(realisation.status ?? 1) !== 1) throw new HttpError(409, 'This realisation has already been reversed');

  const [cards] = await connection.query(
    'SELECT id FROM card_transactions WHERE realisation_id = ? FOR UPDATE',
    [id]
  );

  let bankBalance = null;
  if (realisation.finance_transaction_id) {
    await connection.query(
      'UPDATE finance_transactions SET status = 0 WHERE id = ? AND status = 1',
      [realisation.finance_transaction_id]
    );
    bankBalance = await rebuildBalanceAfter(connection, 'BANK', realisation.bank_id);
  }

  for (const expenseId of [realisation.commission_expense_id, realisation.bank_charge_expense_id, realisation.hidden_expense_id]) {
    if (expenseId) {
      await connection.query('UPDATE hidden_expenses SET is_deleted = 1 WHERE id = ? AND is_deleted = 0', [expenseId]);
    }
  }

  await connection.query(
    'UPDATE card_realisations SET status = 0, reversed_by = ?, reversed_at = NOW() WHERE id = ?',
    [userId, id]
  );

  await connection.query(
    `UPDATE card_transactions
        SET status = 'Pending', realise_date = NULL, realisation_id = NULL,
            realised_by = NULL, realised_at = NULL, commission_rate = NULL
      WHERE realisation_id = ?`,
    [id]
  );

  return { realisationId: id, bankId: realisation.bank_id, transactionIds: cards.map((c) => c.id), bankBalance };
};

const editDescription = (realisationId, label) =>
  `Card Ledger realisation #${realisationId} - ${label} edited by Super Admin`.slice(0, DESCRIPTION_MAX);

/**
 * Edits a Completed realisation's figures (Super Admin only - enforced by the
 * route): Total Transaction Amount, Expected Commission and Realise Amount.
 * Remaining Balance / Bank Charge is always recalculated (Total - Realise -
 * Expected Commission >= 0), same rule as a normal realise. Branch /
 * Department and Total Transaction Amount can only change when the
 * realisation covers a single card transaction - there is otherwise no
 * single row they could apply to. Keeps the Bank Ledger debit and the two
 * linked Hidden Expenses in sync. Requires an open DB transaction on
 * `connection`; the caller commits / rolls back.
 */
const editCardRealisation = async (connection, {
  realisationId, totalAmount, commissionAmount, realiseAmount, departmentId, userId = null
} = {}) => {
  const id = parseId(realisationId);
  if (!id) throw new HttpError(400, 'Invalid realisation');

  const [rows] = await connection.query(
    `SELECT id, company_id, bank_id, DATE_FORMAT(realise_date, '%Y-%m-%d') AS realise_date,
            reference_number, finance_transaction_id, commission_expense_id, bank_charge_expense_id, status
       FROM card_realisations WHERE id = ? FOR UPDATE`,
    [id]
  );
  if (rows.length === 0) throw new HttpError(404, 'Realisation not found');
  const realisation = rows[0];
  if (Number(realisation.status ?? 1) !== 1) throw new HttpError(409, 'A reversed realisation cannot be edited');

  const [cards] = await connection.query(
    'SELECT id, amount, department_id FROM card_transactions WHERE realisation_id = ? FOR UPDATE',
    [id]
  );
  if (cards.length === 0) throw new HttpError(404, 'No card transactions are linked to this realisation');

  const total = parsePositiveMoney(totalAmount, 'Total Transaction Amount');
  if (total.error) throw new HttpError(400, total.error);
  const commission = parseNonNegativeMoney(commissionAmount, 'Expected Commission');
  if (commission.error) throw new HttpError(400, commission.error);
  const realise = parsePositiveMoney(realiseAmount, 'Realise Amount');
  if (realise.error) throw new HttpError(400, realise.error);
  const newDepartmentId = parseOptionalDepartment(departmentId);

  const existingTotalCents = cards.reduce((sum, c) => sum + dbToCents(c.amount), 0);
  const changesSingleRowFields = total.cents !== existingTotalCents
    || (newDepartmentId !== null && Number(newDepartmentId) !== Number(cards[0]?.department_id));
  if (changesSingleRowFields && cards.length !== 1) {
    throw new HttpError(400, 'Total Transaction Amount and Branch / Department can only be edited when the realisation covers a single card transaction');
  }

  const remainingCents = total.cents - realise.cents - commission.cents;
  if (remainingCents < 0) {
    throw new HttpError(
      400,
      `Realise Amount + Expected Commission cannot be more than Total Transaction Amount Rs. ${formatCents(total.cents)}`
    );
  }

  await connection.query(
    `UPDATE card_realisations
        SET total_amount = ?, commission_amount = ?, realise_amount = ?, remaining_balance = ?,
            updated_by = ?, updated_at = NOW()
      WHERE id = ?`,
    [centsToNumber(total.cents), centsToNumber(commission.cents), centsToNumber(realise.cents), centsToNumber(remainingCents), userId, id]
  );

  if (cards.length === 1) {
    const card = cards[0];
    const updates = [];
    const params = [];
    if (dbToCents(card.amount) !== total.cents) { updates.push('amount = ?'); params.push(centsToNumber(total.cents)); }
    if (newDepartmentId !== null && Number(newDepartmentId) !== Number(card.department_id)) {
      updates.push('department_id = ?'); params.push(newDepartmentId);
    }
    if (updates.length > 0) {
      params.push(card.id);
      await connection.query(`UPDATE card_transactions SET ${updates.join(', ')} WHERE id = ?`, params);
    }
  }

  let bankBalance = null;
  if (realisation.finance_transaction_id) {
    await connection.query(
      'UPDATE finance_transactions SET debit = ? WHERE id = ? AND status = 1',
      [centsToNumber(realise.cents), realisation.finance_transaction_id]
    );
    bankBalance = await rebuildBalanceAfter(connection, 'BANK', realisation.bank_id);
  }

  const expense = { date: realisation.realise_date, companyId: realisation.company_id, reference: realisation.reference_number, userId };

  if (commission.cents > 0) {
    if (realisation.commission_expense_id) {
      await connection.query('UPDATE hidden_expenses SET amount = ?, description = ? WHERE id = ?',
        [centsToNumber(commission.cents), editDescription(id, COMMISSION_EXPENSE_TYPE), realisation.commission_expense_id]);
    } else {
      const newId = await insertHiddenExpense(connection, {
        ...expense, cents: commission.cents, type: COMMISSION_EXPENSE_TYPE, description: editDescription(id, COMMISSION_EXPENSE_TYPE)
      });
      await connection.query('UPDATE card_realisations SET commission_expense_id = ? WHERE id = ?', [newId, id]);
    }
  } else if (realisation.commission_expense_id) {
    await connection.query('UPDATE hidden_expenses SET is_deleted = 1 WHERE id = ? AND is_deleted = 0', [realisation.commission_expense_id]);
    await connection.query('UPDATE card_realisations SET commission_expense_id = NULL WHERE id = ?', [id]);
  }

  if (remainingCents > 0) {
    if (realisation.bank_charge_expense_id) {
      await connection.query('UPDATE hidden_expenses SET amount = ?, description = ? WHERE id = ?',
        [centsToNumber(remainingCents), editDescription(id, BANK_CHARGE_EXPENSE_TYPE), realisation.bank_charge_expense_id]);
    } else {
      const newId = await insertHiddenExpense(connection, {
        ...expense, cents: remainingCents, type: BANK_CHARGE_EXPENSE_TYPE, description: editDescription(id, BANK_CHARGE_EXPENSE_TYPE)
      });
      await connection.query('UPDATE card_realisations SET bank_charge_expense_id = ? WHERE id = ?', [newId, id]);
    }
  } else if (realisation.bank_charge_expense_id) {
    await connection.query('UPDATE hidden_expenses SET is_deleted = 1 WHERE id = ? AND is_deleted = 0', [realisation.bank_charge_expense_id]);
    await connection.query('UPDATE card_realisations SET bank_charge_expense_id = NULL WHERE id = ?', [id]);
  }

  return {
    realisationId: id,
    bankBalance,
    totals: {
      totalTransactionAmount: centsToNumber(total.cents),
      expectedCommission: centsToNumber(commission.cents),
      realiseAmount: centsToNumber(realise.cents),
      remainingBalance: centsToNumber(remainingCents)
    }
  };
};

module.exports = {
  CARD_LEDGER_TRANSACTION_TYPE,
  CARD_LEDGER_REFERENCE_TYPE,
  HIDDEN_EXPENSE_TYPE,
  COMMISSION_EXPENSE_TYPE,
  BANK_CHARGE_EXPENSE_TYPE,
  isCardReceiveType,
  combineReferences,
  displayRemark,
  createPendingCardTransaction,
  parseRealiseRequest,
  calculateCommission,
  previewCommission,
  realiseCardTransactions,
  reverseCardRealisation,
  editCardRealisation
};
