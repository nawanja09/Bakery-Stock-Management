// server/services/auditPresenter.js
//
// Turns an Audit Trail row into plain language for people without IT
// knowledge (the Audit Trail page, Admin / Super Admin):
//   * describeRecord()   - "Purchase invoice INV-1024" instead of "#12" (stored per row)
//   * presentAuditRow()  - one sentence of what happened, who created the record,
//                          who changed it, the approver, the reason, and every
//                          changed value as "Previous value -> New value" with real
//                          names instead of ids and formatted money / dates.
// The raw request / response stays available as "technical details".

// ---------------------------------------------------------------------------
// Records: type + the number / name people know them by.
// ---------------------------------------------------------------------------
const join = (...parts) => parts.filter((p) => p !== null && p !== undefined && p !== '').join(' - ');

const RECORD_TYPES = {
  purchases: ['Purchase invoice', (r) => r.invoice_no],
  purchase_returns: ['Purchase return', (r) => r.return_number],
  payment_history: ['Supplier payment', (r) => r.voucher_number || r.check_number],
  issuances: ['Issue note', () => null],
  wastages: ['Wastage note', (r) => r.wastage_note_number],
  stock_adjustments: ['Stock adjustment', (r) => r.reference_note],
  opening_balances: ['Opening balance', () => null],
  orders: ['Purchase order', (r) => r.order_number || r.order_no],
  items: ['RM item', (r) => join(r.item_code, r.name)],
  item_types: ['Item type', (r) => r.type_name],
  supplier: ['Supplier', (r) => r.name],
  departments: ['Department', (r) => r.name],
  company: ['Company', (r) => r.name],
  expenses: ['Expense bill', (r) => r.bill_number],
  expenses_cheque_registry: ['Cheque', (r) => r.cheque_number],
  cash_expenses: ['Cash expense', (r) => r.voucher_number],
  hidden_expenses: ['Hidden expense', (r) => r.reference_number || r.type],
  petty_cash_vouchers: ['Petty cash voucher', (r) => r.voucher_number],
  petty_cash_reimbursements: ['Petty cash reimbursement', (r) => r.reference_number],
  cheque_expenses: ['Cheque expense', (r) => r.voucher_number || r.cheque_number],
  bank_charges: ['Bank charge', (r) => r.reference_number],
  bank_details: ['Bank account', (r) => join(r.bank_name, r.account_number)],
  online_expenses: ['Online expense', (r) => r.bill_number],
  payees: ['Payee', (r) => r.payee_name],
  expense_types: ['Expense type', (r) => r.name],
  sub_expense_types: ['Sub expense type', (r) => r.name],
  bank_charges_types: ['Bank charge type', (r) => r.type_name],
  payment_methods: ['Payment method', (r) => r.name],
  finance_transactions: ['Cash / bank entry', (r) => r.reference_number || r.invoice_number],
  staff_loans: ['Staff loan', () => null],
  other_ledgers: ['Other ledger', (r) => r.name],
  receive_types: ['Receive type', (r) => r.type_name],
  credit_card_rates: ['Card commission rate', () => null],
  incomes: ['Income entry', () => null],
  inhand_adjustments: ['In-hand adjustment', (r) => r.reference_no],
  employees: ['Employee', (r) => join(r.employee_code, r.employee_name)],
  cutlery_assets: ['Cutlery asset', (r) => r.asset_name],
  cutlery_locations: ['Cutlery location', (r) => r.location_name],
  cutlery_purchases: ['Cutlery purchase', (r) => r.invoice_number || r.purchase_id],
  cutlery_damages: ['Cutlery damage', (r) => r.damage_id],
  cutlery_transfers: ['Cutlery transfer', (r) => r.transfer_id],
  fg_production: ['FG item', (r) => r.fg_item_name],
  fg_production_recipes: ['Recipe line', () => null]
};

// "POST /api/<segment>" creates a record of this table.
const CREATE_TABLES = {
  purchases: 'purchases',
  'purchase-returns': 'purchase_returns',
  issuances: 'issuances',
  wastages: 'wastages',
  adjustments: 'stock_adjustments',
  'opening-balance': 'opening_balances',
  orders: 'orders',
  items: 'items',
  'item-types': 'item_types',
  suppliers: 'supplier',
  departments: 'departments',
  companies: 'company',
  'new-expenses': 'expenses',
  'cash-expenses': 'cash_expenses',
  'hidden-expenses': 'hidden_expenses',
  payees: 'payees',
  'expense-types': 'expense_types',
  'sub-expense-types': 'sub_expense_types',
  'bank-charges-types': 'bank_charges_types',
  'payment-methods': 'payment_methods',
  'staff-loans': 'staff_loans',
  'other-ledgers': 'other_ledgers',
  'receive-types': 'receive_types',
  'credit-card-rates': 'credit_card_rates',
  incomes: 'incomes',
  inhand: 'inhand_adjustments',
  employees: 'employees',
  'cutlery-assets': 'cutlery_assets',
  'cutlery-locations': 'cutlery_locations',
  'cutlery-purchases': 'cutlery_purchases',
  'cutlery-damages': 'cutlery_damages',
  'cutlery-transfers': 'cutlery_transfers',
  'fg-production': 'fg_production'
};

const segmentsOf = (url = '') => String(url).split('?')[0].replace(/^\/api\/?/i, '').split('/').filter(Boolean);

// The new record's id in a create response: { purchase_id }, { issuance_id }, { company: { id } } ...
const createdIdOf = (body) => {
  if (!body || typeof body !== 'object') return null;
  if (body.id) return body.id;
  for (const [key, value] of Object.entries(body)) {
    if (/_id$/.test(key) && (typeof value === 'number' || /^\d+$/.test(String(value)))) return value;
    if (value && typeof value === 'object' && !Array.isArray(value) && value.id) return value.id;
  }
  return null;
};

/**
 * { type, label } of the record an event is about, or { type: null, label: null }.
 * table = the snapshot table (edits) - for a create it is found from the path.
 */
const describeRecord = ({ table, before, after, method, url, requestBody, responseBody, entityId }) => {
  const segments = segmentsOf(url);
  // Collection approve / reject / restore: the ids are in the request.
  if (segments[0] === 'collections' && ['approve', 'reject', 'restore'].includes(segments[1])) {
    const ids = (Array.isArray(requestBody?.items) ? requestBody.items.map((i) => i?.id) : requestBody?.ids || []).filter(Boolean);
    return { type: 'POS collection', label: ids.length ? `POS collection #${ids.join(', #')}` : 'POS collections' };
  }
  if (Array.isArray(responseBody?.updated_invoices) && responseBody.updated_invoices.length) {
    const invoices = responseBody.updated_invoices.map((i) => i.invoice_no).filter(Boolean);
    return { type: 'Supplier payment', label: `Payment for invoice ${invoices.join(', ')}` };
  }
  const tableName = table
    || (String(method).toUpperCase() === 'POST' && segments.length === 1 ? CREATE_TABLES[segments[0]] : null);
  const spec = tableName && RECORD_TYPES[tableName];
  if (!spec) {
    return entityId ? { type: null, label: `#${entityId}` } : { type: null, label: null };
  }
  const [type, nameOf] = spec;
  const row = after?.row || before?.row;
  const fromRow = row && nameOf(row);
  if (fromRow) return { type, label: `${type} ${fromRow}` };
  if (row?.id) return { type, label: `${type} #${row.id}` };
  const fromBody = nameOf(requestBody || {}) || nameOf(responseBody || {}) || nameOf(responseBody?.overpayment || {});
  if (fromBody) return { type, label: `${type} ${fromBody}` };
  const id = createdIdOf(responseBody) || entityId;
  return { type, label: id ? `${type} #${id}` : `New ${type.toLowerCase()}` };
};

// ---------------------------------------------------------------------------
// Values in plain words.
// ---------------------------------------------------------------------------
const FIELD_LABELS = {
  invoice_no: 'Invoice number', invoice_date: 'Invoice date', purchase_date: 'Purchase date',
  supplier_id: 'Supplier', company_id: 'Company', company: 'Company', subtotal: 'Amount without VAT', vat_amount: 'VAT amount',
  vat_rate: 'VAT rate (%)', total_with_vat: 'Total (with VAT)', bill_amount: 'Bill amount', paid_amount: 'Paid amount',
  balance_amount: 'Balance to pay', balance: 'Balance', payment_status: 'Payment status', payment_method: 'Payment method',
  check_number: 'Cheque / reference number', remarks: 'Remarks', remark: 'Remark', prepared_by: 'Prepared by',
  item_id: 'Item', rm_item_id: 'Item', item_name: 'Item name', quantity: 'Quantity', unit_price: 'Unit price',
  department_id: 'Department', received_by: 'Received by', approved_by: 'Approved by', issued_by: 'Issued by',
  issuance_date: 'Issue date', reason: 'Reason', date: 'Date', estimated_loss: 'Estimated loss',
  system_qty: 'Quantity in system', actual_qty: 'Counted quantity', variance: 'Difference', amount: 'Amount',
  user_name: 'Approved by', reference_note: 'Reference note', name: 'Name', status: 'Status', is_active: 'Active',
  description: 'Description', bill_number: 'Bill number', bill_date: 'Bill date', total_bill_amount: 'Total bill amount',
  without_vat_amount: 'Amount without VAT', payee_id: 'Payee', payee_name: 'Payee', voucher_number: 'Voucher number',
  cheque_number: 'Cheque number', bank_id: 'Bank account', bank_name: 'Bank', payment_date: 'Payment date',
  created_by: 'Created by', updated_by: 'Last edited by', entered_by: 'Entered by', return_number: 'Return number',
  return_date: 'Return date', settled_amount: 'Settled amount', total_amount: 'Total amount', loan_amount: 'Loan amount',
  reorder_level: 'Re-order level', unit: 'Unit', item_code: 'Item code', item_type: 'Item type', transaction_date: 'Date',
  debit: 'Money in', credit: 'Money out', party_name: 'Party', employee_name: 'Employee name', employee_code: 'Employee code',
  rate: 'Rate (%)', expense_type: 'Expense type', sub_expense_type: 'Sub expense type', expense_type_id: 'Expense type',
  sub_expense_type_id: 'Sub expense type', expense_date: 'Expense date', voucher_date: 'Voucher date', type_name: 'Name',
  allocated_amount: 'Amount paid to this invoice', purchase_id: 'Invoice', payment_status_text: 'Payment status',
  wastage_note_number: 'Wastage note number', is_realised: 'Realised', realise_date: 'Realise date',
  reference_number: 'Reference number', reference_no: 'Reference number', release_date: 'Release date',
  release_status: 'Release status', cheque_date: 'Cheque date', vat_applicable: 'VAT applicable',
  auto_add_to_stock: 'Kept in stock', deleted: 'Deleted', is_deleted: 'Deleted', time_of_day: 'Time of day',
  employee_id: 'Employee', other_ledger_id: 'Other ledger', location_id: 'Location', location_from_id: 'From location',
  location_to_id: 'To location', asset_name: 'Asset name', fg_item_name: 'FG item', recipe_output_quantity: 'Recipe output',
  utility_cost_percentage: 'Utility cost (%)', loan_number: 'Loan number', issued_date: 'Issued date', vehicle_number: 'Vehicle number',
  account_number: 'Account number', current_balance: 'Current balance', opening_balance: 'Opening balance'
};

// Internal fields that mean nothing to a reader.
const HIDDEN_FIELDS = new Set([
  'id', 'created_at', 'updated_at', 'request_id', 'balance_status', 'token_version', 'password', 'raw_payload',
  'settlement_details', 'attachment_path', 'image_path', 'Time', 'cash_book_id', 'finance_txn_id', 'reversal_txn_id',
  'issue_finance_transaction_id', 'ledger_transaction_id', 'active_department_id', 'external_item_id',
  'transaction_direction', 'reference_type', 'reference_id', 'balance_after', 'source_id', 'source_type'
]);

const USER_FIELDS = new Set([
  'prepared_by', 'created_by', 'updated_by', 'entered_by', 'issued_by', 'settled_by', 'returned_by',
  'approved_by', 'cancelled_by', 'completed_by'
]);

// Foreign keys shown by name: field -> [table, name column]
const REFERENCES = {
  supplier_id: ['supplier', 'name'],
  company_id: ['company', 'name'],
  item_id: ['items', 'name'],
  rm_item_id: ['items', 'name'],
  department_id: ['departments', 'name'],
  bank_id: ['bank_details', 'bank_name'],
  payee_id: ['payees', 'payee_name'],
  purchase_id: ['purchases', 'invoice_no'],
  expense_type_id: ['expense_types', 'name'],
  sub_expense_type_id: ['sub_expense_types', 'name'],
  employee_id: ['employees', 'employee_name'],
  other_ledger_id: ['other_ledgers', 'name']
};

const FLAG_FIELDS = new Set(['is_active', 'is_deleted', 'deleted', 'vat_registered', 'vat_applicable', 'auto_add_to_stock', 'is_realised', 'returned']);
const MONEY_FIELD = /(amount|price|total|balance|paid|subtotal|cost|loss|debit|credit|charge|rate_amount|current_balance)/;
const QUANTITY_FIELD = /(qty|quantity|variance|reorder_level)/;

const prettify = (field) => String(field).replace(/_id$/, '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const labelOf = (field) => FIELD_LABELS[field] || prettify(field);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatDate = (text) => {
  const m = String(text).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return String(text);
  const day = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  return m[4] && !(m[4] === '00' && m[5] === '00') ? `${day}, ${m[4]}:${m[5]}` : day;
};

const formatNumber = (value, decimals) => Number(value).toLocaleString('en-US', {
  minimumFractionDigits: decimals, maximumFractionDigits: decimals
});

const EMPTY = '(empty)';

/** A stored value as a person reads it. `names` resolves ids: names[table][id]. */
const formatValue = (field, value, names = {}) => {
  if (value === null || value === undefined || value === '') return EMPTY;
  if (USER_FIELDS.has(field) && /^\d+$/.test(String(value))) {
    return names.users?.[value] || `User #${value}`;
  }
  if (REFERENCES[field]) {
    const [table] = REFERENCES[field];
    return names[table]?.[value] || `#${value}`;
  }
  if (FLAG_FIELDS.has(field)) return Number(value) ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}.*)?$/.test(text)) return formatDate(text);
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    if (/rate|percentage/.test(field)) return `${Number(text)}`;
    if (MONEY_FIELD.test(field)) return formatNumber(text, 2);
    if (QUANTITY_FIELD.test(field)) return formatNumber(text, Number(text) % 1 ? 3 : 0);
  }
  return text;
};

// ---------------------------------------------------------------------------
// Line items ("Invoice item added: Flour - quantity 10, unit price 1,200.00").
// ---------------------------------------------------------------------------
const CHILD_LABELS = {
  purchase_items: 'Invoice item',
  issuance_items: 'Issued item',
  wastage_items: 'Wasted item',
  order_items: 'Ordered item',
  purchase_payment_allocations: 'Invoice in this payment',
  online_expense_payments: 'Payment',
  cutlery_purchase_items: 'Item',
  cutlery_damage_items: 'Item',
  cutlery_transfer_items: 'Item'
};
const CHILD_DETAIL_FIELDS = ['quantity', 'unit_price', 'estimated_loss', 'allocated_amount', 'amount'];
const CHILD_HIDDEN = new Set([...HIDDEN_FIELDS, 'purchase_id', 'issuance_id', 'wastage_id', 'order_id', 'payment_history_id',
  'expense_id', 'damage_id', 'transfer_id', 'purchase_item_id', 'item_name', 'item_id', 'status', 'is_deleted']);

const childName = (row, names) => row.item_name || (row.item_id && names.items?.[row.item_id])
  || (row.purchase_id && names.purchases?.[row.purchase_id] && `Invoice ${names.purchases[row.purchase_id]}`)
  || `#${row.id}`;

const childDetails = (row, names) => CHILD_DETAIL_FIELDS
  .filter((f) => row[f] !== undefined && row[f] !== null)
  .map((f) => `${labelOf(f).toLowerCase()} ${formatValue(f, row[f], names)}`)
  .join(', ');

const lineItemSentences = (children = {}, names = {}) => {
  const out = [];
  for (const [table, diff] of Object.entries(children)) {
    const label = CHILD_LABELS[table] || prettify(table);
    for (const row of diff.added || []) out.push({ kind: 'added', text: `${label} added: ${childName(row, names)}${childDetails(row, names) ? ` - ${childDetails(row, names)}` : ''}` });
    for (const row of diff.removed || []) out.push({ kind: 'removed', text: `${label} removed: ${childName(row, names)}${childDetails(row, names) ? ` - ${childDetails(row, names)}` : ''}` });
    for (const { before, after } of diff.changed || []) {
      const parts = Object.keys({ ...before, ...after })
        .filter((f) => !CHILD_HIDDEN.has(f) && JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null))
        .map((f) => `${labelOf(f).toLowerCase()} ${formatValue(f, before[f], names)} -> ${formatValue(f, after[f], names)}`);
      if (parts.length) out.push({ kind: 'changed', text: `${label} changed: ${childName(after, names)} - ${parts.join(', ')}` });
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// Names for ids (one query per table).
// ---------------------------------------------------------------------------
const collectIds = (rows = [], ids = {}) => {
  const add = (table, value) => {
    if (value === null || value === undefined || value === '' || !/^\d+$/.test(String(value))) return;
    (ids[table] = ids[table] || new Set()).add(Number(value));
  };
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const [field, value] of Object.entries(row)) {
      if (USER_FIELDS.has(field)) add('users', value);
      if (REFERENCES[field]) add(REFERENCES[field][0], value);
    }
  }
  return ids;
};

const NAME_COLUMNS = { users: 'name', ...Object.fromEntries(Object.values(REFERENCES).map(([t, c]) => [t, c])) };

const lookupNames = async (db, ids) => {
  const names = {};
  for (const [table, set] of Object.entries(ids)) {
    if (!set.size || !NAME_COLUMNS[table]) continue;
    try {
      const [rows] = await db.query('SELECT id, ?? AS label FROM ?? WHERE id IN (?)', [NAME_COLUMNS[table], table, [...set]]);
      names[table] = Object.fromEntries(rows.map((r) => [r.id, r.label]));
    } catch (error) {
      names[table] = {};
    }
  }
  return names;
};

// ---------------------------------------------------------------------------
// The whole event in plain words.
// ---------------------------------------------------------------------------
const VERBS = {
  CREATE: 'created', UPDATE: 'edited', DELETE: 'deleted', APPROVE: 'approved', REJECT: 'rejected',
  RESTORE: 'restored', CANCEL: 'cancelled', SUBMIT: 'submitted', PAY: 'recorded a payment for',
  SETTLE: 'settled', ADJUST: 'adjusted', RELEASE: 'released', STATUS_CHANGE: 'changed the status of',
  CONNECT: 'connected', SYNC: 'imported collections from'
};

const HTTP_MEANING = {
  400: 'The information entered was not accepted',
  401: 'Not signed in, or the session had expired',
  403: 'No permission',
  404: 'The record was not found',
  409: 'Someone else changed it first, or it was already done',
  429: 'Too many attempts - blocked for a while',
  500: 'A server error stopped it'
};

const deviceOf = (userAgent) => {
  const ua = String(userAgent || '');
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : null;
  const system = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone / iPad'
    : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : null;
  if (!browser && !system) return 'Other program';
  return [browser, system].filter(Boolean).join(' on ');
};

const firstOf = (sources, fields) => {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const field of fields) {
      const value = source[field];
      if (value !== null && value !== undefined && String(value).trim() !== '') return { field, value };
    }
  }
  return null;
};

/**
 * Plain-language view of one stored audit row (with parsed JSON columns and the
 * diff from services/auditSnapshots.diffSnapshots in row.changes).
 */
const presentAuditRow = async (row, db) => {
  const before = row.old_values?.row || null;
  const after = row.new_values?.row || null;
  const request = row.request_body && typeof row.request_body === 'object' ? row.request_body : {};
  const response = row.response_body && typeof row.response_body === 'object' ? row.response_body : {};
  const changes = row.changes;

  const childRows = changes ? Object.values(changes.children || {}).flatMap((d) => [
    ...(d.added || []), ...(d.removed || []), ...(d.changed || []).flatMap((c) => [c.before, c.after])
  ]) : [];
  const names = await lookupNames(db, collectIds([before, after, request, ...childRows]));

  const who = row.user_name || row.username || 'Someone';
  const record = row.record_label
    || describeRecord({ before: row.old_values, after: row.new_values, method: row.method, url: row.path, requestBody: request, responseBody: response, entityId: row.entity_id }).label;

  // One sentence.
  let headline;
  if (row.action === 'LOGIN') headline = `${who} signed in.`;
  else if (row.action === 'LOGOUT') headline = `${who} signed out.`;
  else if (row.action === 'LOGIN_FAILED') headline = row.user_id ? `${who} could not sign in.` : `Someone tried to sign in with the username "${row.username || '?'}" and failed.`;
  else if (row.action === 'LOGIN_BLOCKED') headline = `Signing in as "${row.username || '?'}" was blocked after too many wrong attempts.`;
  else if (row.action === 'PASSWORD_CHANGE') headline = row.outcome === 'FAILED' ? `${who} tried to change their password.` : `${who} changed their password.`;
  else if (row.action === 'ACCESS_DENIED') headline = `${who} tried to use ${row.module || 'a page'} without permission.`;
  else if (row.event_type === 'SYNC') headline = `${who} imported collections from ${String(row.module || 'POS').replace(/^Collection - /, '')}.`;
  else headline = `${who} ${VERBS[row.action] || String(row.action || 'changed').toLowerCase()} ${record || `a record in ${row.module || 'the system'}`}.`;

  // Who created the record (edits: from the record; creates: this user).
  const creator = firstOf([before, after], ['prepared_by', 'created_by', 'entered_by', 'issued_by', 'returned_by']);
  const createdBy = creator ? formatValue(creator.field, creator.value, names)
    : (row.action === 'CREATE' && row.outcome === 'SUCCESS' ? who : null);
  const createdAt = (before || after)?.created_at ? formatDate((before || after).created_at)
    : (row.action === 'CREATE' && row.outcome === 'SUCCESS' ? formatDate(row.occurred_at) : null);

  const approverField = firstOf([request, after, before], ['approved_by', 'user_name']);
  const approver = approverField ? formatValue('approved_by', approverField.value, names) : null;

  const reasonField = firstOf([request, after], ['reason', 'cancel_reason', 'rejection_reason', 'remarks', 'remark', 'notes', 'note', 'description', 'reference_note']);
  const reason = reasonField ? String(reasonField.value) : null;

  const visible = (field) => !HIDDEN_FIELDS.has(field);
  const changeRows = changes && !changes.deleted
    ? (changes.fields || []).filter((c) => visible(c.field)).map((c) => ({
      field: c.field,
      label: labelOf(c.field),
      before: formatValue(c.field, c.before, names),
      after: formatValue(c.field, c.after, names)
    }))
    : [];
  const deletedValues = changes?.deleted && before
    ? Object.entries(before).filter(([field, value]) => visible(field) && value !== null && value !== '')
      .map(([field, value]) => ({ field, label: labelOf(field), before: formatValue(field, value, names), after: 'Deleted' }))
    : [];

  // A create: what was entered, in plain words.
  const enteredValues = row.action === 'CREATE' && !changes
    ? Object.entries(request).filter(([field, value]) => visible(field) && !USER_FIELDS.has(field)
      && value !== null && value !== '' && typeof value !== 'object')
      .map(([field, value]) => ({ field, label: labelOf(field), value: formatValue(field, value, names) }))
    : [];

  const sync = row.event_type === 'SYNC' ? {
    fetched: response.fetched ?? 0,
    created: response.created ?? 0,
    updated: response.updated ?? 0,
    rejected: response.rejected ?? 0,
    unmapped: response.unmapped ?? 0,
    error: response.error || null,
    rejectedRecords: (response.sources || []).flatMap((s) => (s.rejectedRecords || []).map((r) => ({
      source: prettify(String(s.source || '').toLowerCase()),
      record: Number.isInteger(r.index) ? r.index + 1 : null,
      reason: r.reason
    })))
  } : null;

  return {
    headline,
    when: formatDate(row.occurred_at),
    who: row.user_id ? { name: who, role: row.user_role } : (row.username ? { name: `"${row.username}" (not signed in)`, role: null } : null),
    action: VERBS[row.action] || null,
    record,
    recordType: row.record_type || null,
    module: row.module,
    createdBy,
    createdAt,
    approver,
    reason,
    result: row.outcome === 'FAILED' ? 'Failed' : 'Successful',
    resultMessage: row.outcome === 'FAILED' ? (row.message || HTTP_MEANING[row.status_code] || 'It did not go through') : (row.message || null),
    device: deviceOf(row.user_agent),
    ip: row.ip_address,
    changes: changeRows,
    deleted: Boolean(changes?.deleted),
    deletedValues,
    lineItems: changes ? lineItemSentences(changes.children, names) : [],
    enteredValues,
    sync
  };
};

module.exports = { describeRecord, presentAuditRow, formatValue, labelOf, deviceOf, RECORD_TYPES };
