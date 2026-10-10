// server/services/collectionMapper.js
//
// Turns one raw POS record (completed shift collection / credit payment /
// employee deduction) into the normalized shape stored in `collections`.
// Pure: no database, no network.
//
// POS field names
//   SHIFT records were VERIFIED against the live /api/completed-shifts/collection
//   response (2026-10-07):
//     { shift_id: 211, shift_no: "0104", branch: { id, name: "Cafe - M" },
//       cashier: { id, name }, opened_at, closed_at, completed_at (UTC ISO),
//       cash: { declared, actual (may be null), counted },
//       card: { total, count, transactions[] }, online: { total, ... },
//       credit: { total }, short_excess: { by_method, total, status: "short"|"excess" },
//       collection }                       collection = cash + card + online + credit
//   Credit payments and employee deductions returned no records yet, so their
//   record fields are still looked up under several likely names.
// Matching ignores case, spaces, underscores and dashes; a dotted name such as
// `cash.actual` reads a nested value. A record that cannot be understood is NOT
// guessed at: it is skipped and the sync reports the reason with the record's
// real field names. `node scripts/posCollectionProbe.js` prints the live shape.
// The untouched POS record is always kept in collections.raw_payload.
//
// Short/Excess (stored signed: + short, - excess)
//   The POS sends short_excess.total NEGATIVE for a short (status "short") and
//   positive for an excess. The status, when present, decides; otherwise the
//   sign does. Short = Short/Excess Account DEBIT, excess = CREDIT. It is NOT part
//   of the POS `collection` figure, so it is not part of total_amount either.

// The system a record comes from (collections.source_system). Ids are only
// unique within one system: POS shift 211 and Restaurant shift 211 are
// different records.
const SYSTEMS = Object.freeze({
  POS: 'POS',
  RESTAURANT: 'RESTAURANT'
});

const SOURCES = Object.freeze({
  SHIFT: 'SHIFT',
  CREDIT_PAYMENT: 'CREDIT_PAYMENT',
  EMPLOYEE_DEDUCTION: 'EMPLOYEE_DEDUCTION'
});

const PAYMENT_METHODS = Object.freeze({
  CASH: 'CASH',
  CARD: 'CARD',
  BANK: 'BANK',
  AR: 'AR',
  SHORT_EXCESS: 'SHORT_EXCESS',
  // Not a received amount: the AR Account CREDIT of a Credit Payment (the
  // customer's outstanding balance settled). See collectionService.settlementsOf.
  AR_SETTLEMENT: 'AR_SETTLEMENT'
});

// ---- alias tables (first match wins) -----------------------------------------
const COMMON = {
  date: ['collection_date', 'transaction_date', 'date', 'shift_date', 'payment_date', 'deduction_date',
    'business_date', 'end_time', 'ended_at', 'closed_at', 'completed_at', 'created_at'],
  // Company only - a POS branch maps to a DEPARTMENT (departmentMapper.js), not a company.
  company: ['company_name', 'company.name', 'company', 'company_code'],
  branchId: ['branch.id', 'branch_id'],
  branchName: ['branch.name', 'branch_name', 'branch', 'outlet.name', 'outlet_name'],
  cashier: ['cashier_name', 'cashier.name', 'cashier', 'user_name', 'user.name', 'username', 'created_by_name'],
  bankAccount: ['bank_account_no', 'bank_account_number', 'account_no', 'account_number', 'bank_account', 'bank.account_number'],
  total: ['collection', 'collection_total', 'total_collection', 'total_amount', 'grand_total', 'total']
};

const SHIFT = {
  id: ['shift_id', 'id', 'shift.id'],
  shiftNo: ['shift_no', 'shift_number', 'shift_code'],
  // Verified names first (cash.actual is null on some shifts -> cash.counted).
  cash: ['cash.actual', 'cash.counted', 'actual_cash_by_cashier_total', 'actual_cash_total', 'actual_cash', 'cash_total', 'cash_amount', 'cash'],
  card: ['card.total', 'individual_card_total', 'card_total', 'card_amount', 'card'],
  bank: ['online.total', 'bank_online_total', 'online_total', 'bank_total', 'online_amount', 'bank_amount', 'online', 'bank'],
  ar: ['credit.total', 'ar_total', 'ar_amount', 'ar', 'credit_total'],
  shortExcess: ['short_excess.total', 'short_excess', 'short_excess_amount', 'short_excess_total'],
  shortExcessStatus: ['short_excess.status'],
  short: ['short_amount', 'shortage_amount', 'shortage'],
  excess: ['excess_amount', 'over_amount']
};

const CREDIT_PAYMENT = {
  id: ['id', 'payment_id', 'credit_payment_id', 'transaction_id'],
  // Verified: the POS sends the payment time as date_time ("2026-10-08T04:25:10.000000Z",
  // UTC) and no other date field. Converted to the business (Sri Lanka) date.
  date: ['date_time', 'datetime', 'payment_date_time', ...COMMON.date],
  reference: ['reference_no', 'reference', 'receipt_no', 'transaction_no', 'invoice_no', 'payment_no'],
  shift: ['shift_no', 'shift_number', 'shift_id'],
  method: ['payment_type', 'payment_method', 'payment_mode', 'method', 'type', 'pay_type'],
  amount: ['amount', 'paid_amount', 'payment_amount', 'total_amount', 'total'],
  customer: ['customer_name', 'customer.name', 'customer', 'party_name'],
  // Verified per-method columns of /api/credit-payments/collection -> BSMS columns.
  receivedColumns: [['cash', 'cash_amount'], ['card', 'card_amount'], ['bank_transfer', 'bank_amount']]
};

const DEDUCTION = {
  id: ['id', 'deduction_id', 'employee_deduction_id'],
  reference: ['reference_no', 'reference', 'deduction_no'],
  // Verified: { source: { shift_id, shift_no, branch } } - links the deduction to its shift.
  shift: ['shift_id', 'shift_no', 'shift_number', 'shift.id', 'source.shift_id'],
  employeeId: ['employee_id', 'employee.id', 'staff_id', 'emp_id', 'cashier_id', 'user_id'],
  employeeName: ['employee_name', 'employee.name', 'staff_name', 'cashier_name', 'name'],
  amount: ['deduction_amount', 'deducted_amount', 'amount', 'total_amount', 'total']
};

// Objects that may hold the amounts (e.g. { totals: { cash: ... } }).
const AMOUNT_CONTAINERS = ['totals', 'summary', 'payments', 'collection', 'amounts', 'payment_summary'];

// POS payment type text -> BSMS payment method.
const METHOD_WORDS = [
  [PAYMENT_METHODS.CASH, ['cash']],
  [PAYMENT_METHODS.CARD, ['card', 'visa', 'master', 'mastercard', 'amex', 'creditcard', 'debitcard', 'pos card']],
  [PAYMENT_METHODS.BANK, ['bank', 'online', 'transfer', 'bank_transfer', 'banktransfer', 'deposit', 'bankdeposit', 'cheque', 'qr', 'lankaqr']],
  [PAYMENT_METHODS.AR, ['ar', 'credit', 'oncredit', 'onaccount', 'account', 'accountsreceivable']]
];

// ---- helpers -------------------------------------------------------------------
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const normKey = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

const getPath = (obj, path) => {
  let current = obj;
  for (const segment of String(path).split('.')) {
    if (!isPlainObject(current)) return undefined;
    const wanted = normKey(segment);
    const key = Object.keys(current).find((k) => normKey(k) === wanted);
    if (key === undefined) return undefined;
    current = current[key];
  }
  return current;
};

// First scalar value found under any alias (objects/arrays are never returned).
const pick = (obj, aliases) => {
  for (const alias of aliases) {
    const value = getPath(obj, alias);
    if (!isEmpty(value) && !isPlainObject(value) && !Array.isArray(value)) return value;
  }
  return undefined;
};

const pickAmountRaw = (raw, aliases) => {
  const direct = pick(raw, aliases);
  if (direct !== undefined) return direct;
  for (const container of AMOUNT_CONTAINERS) {
    const inner = getPath(raw, container);
    if (isPlainObject(inner)) {
      const value = pick(inner, aliases);
      if (value !== undefined) return value;
    }
  }
  return undefined;
};

// "1,250.50" / 1250.5 / "1250.50" -> 1250.5 ; garbage -> NaN ; missing -> 0.
const toMoney = (value) => {
  if (isEmpty(value)) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toFixed(2)) : NaN;
  if (typeof value !== 'string') return NaN;
  const cleaned = value.trim().replace(/,/g, '').replace(/^(rs\.?|lkr)\s*/i, '');
  if (!/^[-+]?\d+(\.\d+)?$/.test(cleaned)) return NaN;
  return Number(Number(cleaned).toFixed(2));
};

const round2 = (n) => Number((Number(n) || 0).toFixed(2));

const BUSINESS_TIMEZONE = () => process.env.RAVON_POS_TIMEZONE || 'Asia/Colombo';

// Calendar date of a POS value. A timestamp with a zone ("...T08:36:35.000000Z",
// "+05:30") is converted to the business time zone first, so a shift closed at
// 20:00 UTC counts on the next Sri Lankan day; a plain date is used as sent.
const toDateOnly = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (/T\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const d = new Date(text.replace(/(\.\d{3})\d+/, '$1'));
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: BUSINESS_TIMEZONE(), year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
};

const str = (value, max) => (isEmpty(value) ? null : String(value).trim().slice(0, max));

const toPaymentMethod = (value) => {
  if (isEmpty(value)) return null;
  const word = normKey(value);
  for (const [method, words] of METHOD_WORDS) {
    if (words.some((w) => normKey(w) === word)) return method;
  }
  // "Card - Visa", "Bank Transfer (BOC)" ...
  for (const [method, words] of METHOD_WORDS) {
    if (words.some((w) => normKey(w).length > 2 && word.includes(normKey(w)))) return method;
  }
  return null;
};

const fail = (reason, raw) => ({
  ok: false,
  reason,
  fields: isPlainObject(raw) ? Object.keys(raw).slice(0, 40) : []
});

// A valid POS record that is deliberately not a collection (an overpayment
// set-off, a voided deduction). A per-source mapper returns this instead of an
// error text; it is reported as "excluded", not as a record that could not be read.
const excluded = (reason) => ({ excluded: reason });

const base = (source, raw, sourceId, date) => ({
  source_type: source,
  source_id: sourceId,
  reference_no: null,
  collection_date: date,
  shift_id: null,
  shift_no: null,
  shift_reference: null,
  cashier_name: str(pick(raw, COMMON.cashier), 255),
  employee_id: null,
  employee_name: null,
  pos_company: str(pick(raw, COMMON.company), 255),
  pos_branch_id: str(pick(raw, COMMON.branchId), 50),
  pos_branch_name: str(pick(raw, COMMON.branchName), 255),
  pos_payment_method: null,
  pos_bank_account: str(pick(raw, COMMON.bankAccount), 100),
  cash_amount: 0,
  card_amount: 0,
  bank_amount: 0,
  ar_amount: 0,
  short_excess_amount: 0,
  deduction_amount: 0,
  total_amount: 0,
  pos_total_amount: null,
  raw_payload: JSON.stringify(raw)
});

// ---- per-source mappers -------------------------------------------------------------
const mapShift = (raw, record) => {
  const amounts = {
    cash: toMoney(pickAmountRaw(raw, SHIFT.cash)),
    card: toMoney(pickAmountRaw(raw, SHIFT.card)),
    bank: toMoney(pickAmountRaw(raw, SHIFT.bank)),
    ar: toMoney(pickAmountRaw(raw, SHIFT.ar))
  };
  // Stored signed: + short, - excess (see header).
  const shortRaw = pickAmountRaw(raw, SHIFT.short);
  const excessRaw = pickAmountRaw(raw, SHIFT.excess);
  let shortExcess;
  if (shortRaw !== undefined || excessRaw !== undefined) {
    shortExcess = round2(Math.abs(toMoney(shortRaw)) - Math.abs(toMoney(excessRaw)));
  } else {
    const value = toMoney(pickAmountRaw(raw, SHIFT.shortExcess));
    const status = String(pick(raw, SHIFT.shortExcessStatus) ?? '').trim().toLowerCase();
    if (status === 'short') shortExcess = round2(Math.abs(value));
    else if (status === 'excess') shortExcess = round2(-Math.abs(value));
    else shortExcess = round2(-value); // POS sign: negative = short
  }

  if ([...Object.values(amounts), shortExcess].some((n) => Number.isNaN(n))) {
    return 'An amount field is not a valid number';
  }
  if (Object.values(amounts).some((n) => n < 0)) return 'Negative cash / card / bank / AR amounts are not supported';
  if (Object.values(amounts).every((n) => n === 0) && shortExcess === 0) {
    return 'No cash / card / bank / AR / short-excess amount found';
  }

  // Shift Reference = "<shift_id>-<shift_no>", e.g. "211-0104".
  const shiftNo = str(pick(raw, SHIFT.shiftNo), 50);
  if (!shiftNo) return `No shift number found (tried: ${SHIFT.shiftNo.join(', ')})`;
  const shiftReference = `${record.source_id}-${shiftNo}`.slice(0, 100);

  // Individual card payments: summary columns for the list (the payments
  // themselves are read from raw_payload when shown / posted).
  const cardDetails = cardPaymentsOf(raw);
  record.card_txn_count = cardDetails.available ? cardDetails.count : null;
  record.card_txn_total = cardDetails.available ? cardDetails.total : null;

  Object.assign(record, {
    reference_no: shiftReference,
    shift_id: record.source_id,
    shift_no: shiftNo,
    shift_reference: shiftReference,
    cash_amount: amounts.cash,
    card_amount: amounts.card,
    bank_amount: amounts.bank,
    ar_amount: amounts.ar,
    short_excess_amount: shortExcess,
    // Same definition as the POS `collection` figure (short/excess excluded).
    total_amount: round2(amounts.cash + amounts.card + amounts.bank + amounts.ar)
  });
  return null;
};

const mapCreditPayment = (raw, record) => {
  const methodRaw = pick(raw, CREDIT_PAYMENT.method);
  Object.assign(record, {
    reference_no: str(pick(raw, CREDIT_PAYMENT.reference), 100),
    shift_id: str(pick(raw, CREDIT_PAYMENT.shift), 100),
    pos_payment_method: str(methodRaw, 50)
  });
  if (!record.cashier_name) record.cashier_name = str(pick(raw, CREDIT_PAYMENT.customer), 255);

  // Verified POS shape: one column per method. amount = cash + card +
  // bank_transfer + setoff, and the POS `collection` = cash + card +
  // bank_transfer (money actually received). An overpayment set-off only reuses
  // money received earlier, so it is never booked as cash / bank. The columns -
  // not the payment_method text - decide the split ("Bank Transfer" may also
  // carry cash; "Cash + Overpayment Setoff" carries a set-off).
  const columns = CREDIT_PAYMENT.receivedColumns.map(([key]) => getPath(raw, key));
  if (columns.every((v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== ''))) {
    const received = {};
    for (const [key, column] of CREDIT_PAYMENT.receivedColumns) received[column] = toMoney(getPath(raw, key));
    const values = Object.values(received);
    if (values.some((n) => Number.isNaN(n))) return 'An amount field is not a valid number';
    if (values.some((n) => n < 0)) return 'Negative payment amounts are not supported';
    if (values.every((n) => n === 0)) {
      return toMoney(getPath(raw, 'setoff')) > 0
        ? excluded('Overpayment set-off - no new money received (POS collection is 0)')
        : 'No cash / card / bank transfer amount found';
    }
    Object.assign(record, received, { total_amount: round2(values.reduce((a, b) => a + b, 0)) });
    return null;
  }

  if (methodRaw !== undefined) {
    // One payment = one method + one amount (the documented shape).
    const method = toPaymentMethod(methodRaw);
    if (!method) return `Unknown payment type "${String(methodRaw).slice(0, 40)}" (expected Cash / Card / Bank / AR)`;
    const amount = toMoney(pickAmountRaw(raw, CREDIT_PAYMENT.amount));
    if (!Number.isFinite(amount) || amount <= 0) return 'Payment amount missing or not greater than 0';
    const column = { CASH: 'cash_amount', CARD: 'card_amount', BANK: 'bank_amount', AR: 'ar_amount' }[method];
    record[column] = amount;
    record.total_amount = amount;
    return null;
  }

  // No payment type: the record carries one column per method instead.
  const amounts = {
    cash_amount: toMoney(pickAmountRaw(raw, SHIFT.cash)),
    card_amount: toMoney(pickAmountRaw(raw, SHIFT.card)),
    bank_amount: toMoney(pickAmountRaw(raw, SHIFT.bank)),
    ar_amount: toMoney(pickAmountRaw(raw, SHIFT.ar))
  };
  const values = Object.values(amounts);
  if (values.some((n) => Number.isNaN(n))) return 'An amount field is not a valid number';
  if (values.some((n) => n < 0)) return 'Negative payment amounts are not supported';
  if (values.every((n) => n === 0)) return 'No payment type and no cash / card / bank / AR amount found';
  Object.assign(record, amounts, { total_amount: round2(values.reduce((a, b) => a + b, 0)) });
  return null;
};

const mapDeduction = (raw, record) => {
  // Deductions are read with status=all: a cancelled / reversed one is not a recovery.
  const status = str(pick(raw, ['status', 'deduction_status']), 50);
  if (status && /cancel|void|revers|delet/i.test(status)) return excluded(`Deduction is ${status}`);
  const amount = toMoney(pickAmountRaw(raw, DEDUCTION.amount));
  if (!Number.isFinite(amount) || amount <= 0) return 'Deduction amount missing or not greater than 0';
  const employeeId = str(pick(raw, DEDUCTION.employeeId), 100);
  const employeeName = str(pick(raw, DEDUCTION.employeeName), 255);
  if (!employeeId && !employeeName) return 'Deduction has no employee name or id';
  Object.assign(record, {
    reference_no: str(pick(raw, DEDUCTION.reference), 100),
    shift_id: str(pick(raw, DEDUCTION.shift), 100),
    employee_id: employeeId,
    employee_name: employeeName,
    deduction_amount: amount,
    total_amount: amount
  });
  return null;
};

const ID_ALIASES = {
  [SOURCES.SHIFT]: SHIFT.id,
  [SOURCES.CREDIT_PAYMENT]: CREDIT_PAYMENT.id,
  [SOURCES.EMPLOYEE_DEDUCTION]: DEDUCTION.id
};
// Date fields per source (sources not listed use COMMON.date).
const DATE_ALIASES = {
  [SOURCES.CREDIT_PAYMENT]: CREDIT_PAYMENT.date
};
const MAPPERS = {
  [SOURCES.SHIFT]: mapShift,
  [SOURCES.CREDIT_PAYMENT]: mapCreditPayment,
  [SOURCES.EMPLOYEE_DEDUCTION]: mapDeduction
};

/**
 * @returns {{ok: true, record: object} | {ok: false, reason: string, fields: string[]}}
 */
const mapPosRecord = (source, raw) => {
  if (!isPlainObject(raw)) return fail('Record is not an object', raw);
  if (!MAPPERS[source]) return fail(`Unknown collection source "${source}"`, raw);

  const sourceId = str(pick(raw, ID_ALIASES[source]), 100);
  if (!sourceId) return fail(`No unique id found (tried: ${ID_ALIASES[source].join(', ')})`, raw);

  const dateAliases = DATE_ALIASES[source] || COMMON.date;
  const date = toDateOnly(pick(raw, dateAliases));
  if (!date) return fail(`No usable date found (tried: ${dateAliases.slice(0, 8).join(', ')}...)`, raw);

  const record = base(source, raw, sourceId, date);
  const error = MAPPERS[source](raw, record);
  if (error && error.excluded) return { ok: false, excluded: true, reason: error.excluded };
  if (error) return fail(error, raw);

  if (source !== SOURCES.EMPLOYEE_DEDUCTION) {
    const posTotal = pickAmountRaw(raw, COMMON.total);
    if (posTotal !== undefined) {
      const value = toMoney(posTotal);
      if (Number.isNaN(value)) return fail('Total is not a valid number', raw);
      record.pos_total_amount = value;
    }
  }
  return { ok: true, record };
};

// ---- per-system record adapters ---------------------------------------------------
// RAVON Restaurant runs the same Laravel API as RAVON POS: verified without
// credentials that it exposes the same routes, the same /api/login validation
// (username / password), the same 401 envelope and the same rate limits. Its
// record JSON could NOT be verified (that needs a real login), so no field
// names are invented for it: the adapter is the identity and the POS mapper
// above reads the record exactly as it reads a POS one. A Restaurant record the
// mapper cannot understand is NOT guessed at - it is skipped and reported with
// its real field names (sync result `invalid` / `invalidSamples`), and
// `node scripts/posCollectionProbe.js --login restaurant` prints the live shape.
// If the shape turns out to differ, translate it HERE (and add a fixture to
// tests/collectionIntegration.test.js) - nothing else needs to change.
const RECORD_ADAPTERS = {
  [SYSTEMS.POS]: (source, raw) => raw,
  [SYSTEMS.RESTAURANT]: (source, raw) => raw
};

/**
 * mapPosRecord for a record of `system` ('POS' | 'RESTAURANT'); the result
 * carries source_system. Unknown systems are refused.
 */
const mapSystemRecord = (system, source, raw) => {
  const adapt = RECORD_ADAPTERS[system];
  if (!adapt) return fail(`Unknown source system "${String(system).slice(0, 30)}"`, raw);
  const result = mapPosRecord(source, adapt(source, raw));
  if (result.ok) result.record.source_system = system;
  return result;
};

// Pulls the record array out of the usual envelopes (bare array, {data: []},
// Laravel paginator {data: {data: []}}, {items|results|records: []}, ...).
const EXTRACT_KEYS = ['data', 'items', 'results', 'records', 'collections', 'shifts', 'payments', 'deductions'];
const extractRecords = (payload, depth = 0) => {
  if (Array.isArray(payload)) return payload;
  if (!isPlainObject(payload) || depth > 2) return null;
  for (const key of EXTRACT_KEYS) {
    const value = getPath(payload, key);
    if (Array.isArray(value)) return value;
    if (isPlainObject(value)) {
      const inner = extractRecords(value, depth + 1);
      if (inner) return inner;
    }
  }
  return null;
};

// ---- individual card payments of a shift -----------------------------------------
// VERIFIED against the live POS (95 shifts, 4,339 payments): card.transactions[]
// holds one entry per card payment
//   { type: "sale" | "order_advance", sale_id, order_id, receipt_no,
//     payment_method: "card" | "card_and_cash", amount, date_time (UTC ISO) }
// and its amounts add up to card.total (count = card.count). Each payment is
// posted to the Card Ledger on its own; the shift's card total is a summary only.

/** POS id of one card payment: "sale-9532", "order_advance-614", or the receipt number. */
const cardPaymentId = (t) => {
  const type = str(t.type, 30) || 'payment';
  if (!isEmpty(t.sale_id)) return `${type}-${String(t.sale_id).trim()}`;
  if (!isEmpty(t.order_id)) return `${type}-${String(t.order_id).trim()}`;
  if (!isEmpty(t.receipt_no)) return `${type}-${String(t.receipt_no).trim()}`;
  if (!isEmpty(t.id)) return `${type}-${String(t.id).trim()}`;
  return null;
};

/**
 * Individual card payments of a SHIFT record (raw POS object or its JSON text).
 * Never invents amounts: payments are exactly what the POS sent.
 * @returns {{ available: boolean, payments: Array, count: number, total: number,
 *            posTotal: number|null, posCount: number|null, problems: string[] }}
 *   payments[i] = { key, pos_type, sale_id, order_id, receipt_no, payment_method,
 *                   amount, date_time, date }  (key is unique within the shift)
 */
const cardPaymentsOf = (rawOrJson) => {
  let raw = rawOrJson;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (e) { raw = null; }
  }
  const card = isPlainObject(raw) ? getPath(raw, 'card') : undefined;
  const list = isPlainObject(card) ? getPath(card, 'transactions') : undefined;
  const posTotalRaw = isPlainObject(card) ? pick(card, ['total']) : undefined;
  const posCountRaw = isPlainObject(card) ? pick(card, ['count']) : undefined;
  const result = {
    available: Array.isArray(list),
    payments: [],
    count: 0,
    total: 0,
    posTotal: posTotalRaw === undefined ? null : toMoney(posTotalRaw),
    posCount: posCountRaw === undefined ? null : Number(posCountRaw),
    problems: []
  };
  if (!Array.isArray(list)) return result;

  const seen = new Map();
  list.forEach((t, index) => {
    if (!isPlainObject(t)) { result.problems.push(`Card payment #${index + 1} is not an object`); return; }
    const amount = toMoney(t.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      result.problems.push(`Card payment #${index + 1} (${cardPaymentId(t) || 'no id'}) has no valid amount`);
      return;
    }
    let key = cardPaymentId(t);
    if (!key) { result.problems.push(`Card payment #${index + 1} has no POS id (sale / order / receipt)`); return; }
    // The same POS id twice in one shift (e.g. a sale paid with two cards): keep both, numbered.
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (n > 1) key = `${key}-${n}`;
    result.payments.push({
      key: key.slice(0, 120),
      occurrence: n, // > 1 when the POS sent the same id more than once in this shift
      pos_type: str(t.type, 30),
      sale_id: str(t.sale_id, 50),
      order_id: str(t.order_id, 50),
      receipt_no: str(t.receipt_no, 100),
      payment_method: str(t.payment_method, 50),
      amount,
      date_time: str(t.date_time, 40),
      date: toDateOnly(t.date_time)
    });
  });
  result.count = result.payments.length;
  result.total = round2(result.payments.reduce((sum, p) => sum + p.amount, 0));
  return result;
};

/**
 * Reconciliation of a shift's card total with its individual card payments.
 * @returns {{ ok: boolean, reason: string|null, difference: number }}
 */
const reconcileCard = (cardAmount, details) => {
  const expected = round2(cardAmount);
  if (expected === 0) return { ok: true, reason: null, difference: 0 };
  if (!details.available) {
    return { ok: false, reason: 'the POS sent no individual card payments for this shift', difference: expected };
  }
  if (details.problems.length) return { ok: false, reason: details.problems[0], difference: round2(expected - details.total) };
  const difference = round2(expected - details.total);
  if (Math.abs(difference) > 0.009) {
    return {
      ok: false,
      difference,
      reason: `the ${details.count} individual card payments add up to ${details.total.toFixed(2)}, `
        + `not the card total ${expected.toFixed(2)} (difference ${difference.toFixed(2)})`
    };
  }
  if (details.posCount !== null && Number.isFinite(details.posCount) && details.posCount !== details.count) {
    return { ok: false, difference: 0, reason: `the POS card count is ${details.posCount} but ${details.count} card payments were sent` };
  }
  return { ok: true, reason: null, difference: 0 };
};

/**
 * Ledger postings a collection needs, from its stored amounts.
 * SHORT_EXCESS is signed (+ short / - excess). An employee deduction posts
 * only a Short/Excess CREDIT (the shortage recovered from the employee).
 * @returns {Array<{method: string, amount: number}>}
 */
const postingsOf = (row) => {
  if (row.source_type === SOURCES.EMPLOYEE_DEDUCTION) {
    const amount = round2(row.deduction_amount);
    return amount > 0 ? [{ method: PAYMENT_METHODS.SHORT_EXCESS, amount: -amount }] : [];
  }
  return [
    { method: PAYMENT_METHODS.CASH, amount: round2(row.cash_amount) },
    { method: PAYMENT_METHODS.CARD, amount: round2(row.card_amount) },
    { method: PAYMENT_METHODS.BANK, amount: round2(row.bank_amount) },
    { method: PAYMENT_METHODS.AR, amount: round2(row.ar_amount) },
    { method: PAYMENT_METHODS.SHORT_EXCESS, amount: round2(row.short_excess_amount) }
  ].filter((p) => p.amount !== 0);
};

module.exports = {
  SYSTEMS,
  SOURCES,
  PAYMENT_METHODS,
  mapPosRecord,
  mapSystemRecord,
  extractRecords,
  postingsOf,
  cardPaymentsOf,
  reconcileCard,
  toPaymentMethod,
  toMoney,
  toDateOnly
};
