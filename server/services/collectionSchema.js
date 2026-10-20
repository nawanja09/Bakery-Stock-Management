// server/services/collectionSchema.js
//
// Strict "RAVON contract v1" for the records BSMS pulls from POS / Restaurant (audit M4).
//
// collectionMapper.js is deliberately forgiving: it tries many alias names per amount and
// reads a missing amount as 0. That is how a renamed or restructured RAVON field could be
// read as 0, or as the wrong figure, with the record still looking valid. This module is the
// opposite: it states exactly which fields, of which type, a record must have - the shapes
// verified against the live systems (see the header of collectionMapper.js) - and checks the
// amounts add up. A record that does not match is NOT mapped or staged: the sync quarantines
// it (services/collectionQuarantine.js) with the reason, and the rest of the batch carries on.
//
// Pure: no database, no network. Applied by collectionSyncService only (the mapper keeps its
// lenient behaviour for its own callers and tests).
//
// COLLECTION_SCHEMA_MODE: strict (default) = refuse a record that does not match;
//                          warn = accept it but report the mismatch; off = no check.

const CONTRACT_VERSION = 'ravon-collections-v1';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const isScalarId = (v) => (typeof v === 'string' && v.trim() !== '') || (typeof v === 'number' && Number.isFinite(v));
const isNumeric = (v) => (typeof v === 'number' && Number.isFinite(v))
  || (typeof v === 'string' && /^[-+]?\d+(\.\d+)?$/.test(v.trim().replace(/,/g, '')));
const num = (v) => Number(typeof v === 'string' ? v.trim().replace(/,/g, '') : v);
const isDateText = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v.replace(/(\.\d{3})\d+/, '$1')));
const sameMoney = (a, b) => Math.abs(a - b) <= 0.01;

const mode = () => {
  const value = String(process.env.COLLECTION_SCHEMA_MODE || 'strict').trim().toLowerCase();
  return ['strict', 'warn', 'off'].includes(value) ? value : 'strict';
};

// Top-level fields each source is known to carry. Anything else is reported (never rejected):
// it may be a new payment type whose money BSMS would otherwise ignore.
const KNOWN_FIELDS = {
  SHIFT: ['shift_id', 'shift_no', 'branch', 'cashier', 'opened_at', 'closed_at', 'completed_at',
    'cash', 'card', 'online', 'credit', 'short_excess', 'collection'],
  CREDIT_PAYMENT: ['id', 'reference_no', 'date_time', 'customer', 'branch', 'received_by', 'payment_method',
    'cash', 'card', 'bank_transfer', 'setoff', 'amount', 'collection', 'allocations', 'allocated',
    'unallocated', 'notes'],
  EMPLOYEE_DEDUCTION: ['id', 'deduction_date', 'employee', 'source_type', 'source_label', 'source', 'reason',
    'shortage', 'offset', 'amount', 'offsets', 'status', 'created_by', 'created_at', 'voided_by', 'voided_at']
};

const needNumber = (problems, label, value) => {
  if (!isNumeric(value)) problems.push(`${label} is missing or not a number`);
};
const needObject = (problems, label, value) => {
  if (!isObject(value)) { problems.push(`${label} is missing`); return false; }
  return true;
};

const checkShift = (raw, problems) => {
  if (!isScalarId(raw.shift_id)) problems.push('shift_id is missing');
  if (!isScalarId(raw.shift_no)) problems.push('shift_no is missing');
  if (!isDateText(raw.closed_at) && !isDateText(raw.completed_at)) problems.push('closed_at / completed_at is missing or not a date');
  // branch is optional: RAVON Restaurant is one location and sends none (BSMS applies its default branch).

  const cashOk = needObject(problems, 'cash', raw.cash);
  const cashValue = cashOk ? (isNumeric(raw.cash.actual) ? raw.cash.actual : raw.cash.counted) : undefined;
  if (cashOk && !isNumeric(cashValue)) problems.push('cash.actual / cash.counted is missing or not a number');
  const cardOk = needObject(problems, 'card', raw.card);
  if (cardOk) needNumber(problems, 'card.total', raw.card.total);
  const onlineOk = needObject(problems, 'online', raw.online);
  if (onlineOk) needNumber(problems, 'online.total', raw.online.total);
  const creditOk = needObject(problems, 'credit', raw.credit);
  if (creditOk) needNumber(problems, 'credit.total', raw.credit.total);
  const shortOk = needObject(problems, 'short_excess', raw.short_excess);
  if (shortOk) needNumber(problems, 'short_excess.total', raw.short_excess.total);
  needNumber(problems, 'collection', raw.collection);

  // collection = cash + card + online + credit (verified on 95 live shifts). If the parts do not
  // add up to the POS's own total, a field was renamed, restructured or misread.
  if (problems.length === 0) {
    const parts = num(cashValue) + num(raw.card.total) + num(raw.online.total) + num(raw.credit.total);
    if (!sameMoney(parts, num(raw.collection))) {
      problems.push(`cash + card + online + credit (${parts.toFixed(2)}) does not equal collection (${num(raw.collection).toFixed(2)})`);
    }
  }
};

const checkCreditPayment = (raw, problems) => {
  if (!isScalarId(raw.id)) problems.push('id is missing');
  if (!isDateText(raw.date_time)) problems.push('date_time is missing or not a date');
  needNumber(problems, 'cash', raw.cash);
  needNumber(problems, 'card', raw.card);
  needNumber(problems, 'bank_transfer', raw.bank_transfer);
  if (!isBlank(raw.setoff)) needNumber(problems, 'setoff', raw.setoff);
  needNumber(problems, 'collection', raw.collection);
  if (problems.length === 0) {
    const parts = num(raw.cash) + num(raw.card) + num(raw.bank_transfer);
    if (!sameMoney(parts, num(raw.collection))) {
      problems.push(`cash + card + bank_transfer (${parts.toFixed(2)}) does not equal collection (${num(raw.collection).toFixed(2)})`);
    }
  }
};

const checkDeduction = (raw, problems) => {
  if (!isScalarId(raw.id)) problems.push('id is missing');
  if (!isDateText(raw.deduction_date) && !isDateText(raw.created_at)) problems.push('deduction_date / created_at is missing or not a date');
  needNumber(problems, 'amount', raw.amount);
  if (isNumeric(raw.amount) && num(raw.amount) < 0) problems.push('amount is negative');
  const employeeOk = isObject(raw.employee) && (!isBlank(raw.employee.name) || !isBlank(raw.employee.id));
  if (!employeeOk) problems.push('employee (id or name) is missing');
  if (!isBlank(raw.status) && typeof raw.status !== 'string') problems.push('status is not text');
};

const CHECKS = { SHIFT: checkShift, CREDIT_PAYMENT: checkCreditPayment, EMPLOYEE_DEDUCTION: checkDeduction };

/**
 * @returns {{ ok: boolean, problems: string[], unknownFields: string[] }}
 *   problems = every way the record departs from the contract (empty when it matches);
 *   unknownFields = top-level fields the contract does not know (reported, never a failure).
 */
const checkContract = (source, raw) => {
  const problems = [];
  const check = CHECKS[source];
  if (!check) return { ok: false, problems: [`Unknown collection source "${String(source).slice(0, 30)}"`], unknownFields: [] };
  if (!isObject(raw)) return { ok: false, problems: ['Record is not an object'], unknownFields: [] };
  check(raw, problems);
  const known = new Set(KNOWN_FIELDS[source]);
  const unknownFields = Object.keys(raw).filter((key) => !known.has(key)).slice(0, 20);
  return { ok: problems.length === 0, problems, unknownFields };
};

module.exports = { CONTRACT_VERSION, KNOWN_FIELDS, checkContract, mode };
