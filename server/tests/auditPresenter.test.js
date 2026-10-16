require('./helpers/noDatabase'); // unit test: never the real database
const test = require('node:test');
const assert = require('node:assert/strict');
const { describeRecord, presentAuditRow, formatValue, deviceOf } = require('../services/auditPresenter');
const { diffSnapshots } = require('../services/auditSnapshots');

// Names the presenter looks up for ids: one fake table each.
const NAMES = {
  users: { 2: 'Admin', 10: 'Accountant 1' },
  supplier: { 5: 'ABC Traders', 6: 'Lanka Foods' },
  items: { 4: 'Flour' },
  company: { 1: 'Ravon Bakers' }
};
const fakeDb = {
  query: async (sql, [, table, ids]) => [ids.filter((id) => NAMES[table]?.[id]).map((id) => ({ id, label: NAMES[table][id] }))]
};

test('the Record column names the record the way people know it', () => {
  assert.deepEqual(describeRecord({ table: 'purchases', before: { row: { id: 12, invoice_no: 'INV-1024' } } }),
    { type: 'Purchase invoice', label: 'Purchase invoice INV-1024' });
  assert.equal(describeRecord({ method: 'POST', url: '/api/issuances', responseBody: { issuance_id: 55 } }).label, 'Issue note #55');
  assert.equal(describeRecord({ method: 'POST', url: '/api/wastages', responseBody: { wastage_note_number: 'WN-7' } }).label, 'Wastage note WN-7');
  assert.equal(describeRecord({ table: 'items', after: { row: { id: 4, item_code: 'RM-01', name: 'Flour' } } }).label, 'RM item RM-01 - Flour');
  assert.equal(describeRecord({ method: 'POST', url: '/api/purchases/pay-multiple', responseBody: { updated_invoices: [{ invoice_no: 'A1' }, { invoice_no: 'A2' }] } }).label,
    'Payment for invoice A1, A2');
  assert.equal(describeRecord({ method: 'POST', url: '/api/collections/approve', requestBody: { items: [{ id: 3 }, { id: 9 }] } }).label,
    'POS collection #3, #9');
});

test('values read like normal words: money, dates, yes / no, names instead of ids', () => {
  assert.equal(formatValue('total_with_vat', '12500.5000'), '12,500.50');
  assert.equal(formatValue('purchase_date', '2026-10-08 00:00:00'), '8 Oct 2026');
  assert.equal(formatValue('created_at', '2026-10-16 09:15:02'), '16 Oct 2026, 09:15');
  assert.equal(formatValue('vat_applicable', 1), 'Yes');
  assert.equal(formatValue('quantity', '10.0000'), '10');
  assert.equal(formatValue('quantity', '2.5000'), '2.500');
  assert.equal(formatValue('supplier_id', 5, { supplier: { 5: 'ABC Traders' } }), 'ABC Traders');
  assert.equal(formatValue('prepared_by', 10, { users: { 10: 'Accountant 1' } }), 'Accountant 1');
  assert.equal(formatValue('approved_by', 'Sampath'), 'Sampath');
  assert.equal(formatValue('remarks', null), '(empty)');
  assert.equal(deviceOf('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'), 'Chrome on Windows');
  assert.equal(deviceOf('Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36'), 'Chrome on Android');
});

test('an edit: who created it, who edited it, previous and new values, reason and approver', async () => {
  const before = {
    row: { id: 12, invoice_no: 'INV-1024', supplier_id: 5, total_with_vat: '1000.0000', prepared_by: 10, created_at: '2026-10-08 10:00:00', updated_at: 'x' },
    purchase_items: [{ id: 1, purchase_id: 12, item_id: 4, quantity: '2.0000', unit_price: '500.0000' }]
  };
  const after = {
    row: { ...before.row, supplier_id: 6, total_with_vat: '1200.0000', updated_at: 'y' },
    purchase_items: [{ id: 1, purchase_id: 12, item_id: 4, quantity: '3.0000', unit_price: '400.0000' }]
  };
  const plain = await presentAuditRow({
    occurred_at: '2026-10-16 09:15:02', user_id: 2, user_name: 'Admin', user_role: 'Admin', event_type: 'CHANGE',
    action: 'UPDATE', module: 'Purchasing', outcome: 'SUCCESS', record_label: 'Purchase invoice INV-1024',
    request_body: { remarks: 'Supplier sent a corrected bill', approved_by: 'Mr. Hashan' }, response_body: {},
    old_values: before, new_values: after, changes: diffSnapshots(before, after), ip_address: '10.0.0.4',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36'
  }, fakeDb);

  assert.equal(plain.headline, 'Admin edited Purchase invoice INV-1024.');
  assert.equal(plain.when, '16 Oct 2026, 09:15');
  assert.deepEqual(plain.who, { name: 'Admin', role: 'Admin' });
  assert.equal(plain.createdBy, 'Accountant 1');
  assert.equal(plain.createdAt, '8 Oct 2026, 10:00');
  assert.equal(plain.approver, 'Mr. Hashan');
  assert.equal(plain.reason, 'Supplier sent a corrected bill');
  assert.equal(plain.device, 'Chrome on Windows');
  assert.deepEqual(plain.changes.map((c) => [c.label, c.before, c.after]), [
    ['Supplier', 'ABC Traders', 'Lanka Foods'],
    ['Total (with VAT)', '1,000.00', '1,200.00']
  ]);
  assert.deepEqual(plain.lineItems, [
    { kind: 'changed', text: 'Invoice item changed: Flour - quantity 2 -> 3, unit price 500.00 -> 400.00' }
  ]);
});

test('a delete lists the last values; a failed sign-in is one clear sentence', async () => {
  const before = { row: { id: 4, name: 'Old Supplier', created_by: 2 } };
  const deleted = await presentAuditRow({
    occurred_at: '2026-10-16 10:00:00', user_id: 2, user_name: 'Admin', event_type: 'CHANGE', action: 'DELETE',
    outcome: 'SUCCESS', record_label: 'Supplier Old Supplier', old_values: before, new_values: { deleted: true },
    changes: diffSnapshots(before, null), request_body: {}, response_body: {}
  }, fakeDb);
  assert.equal(deleted.headline, 'Admin deleted Supplier Old Supplier.');
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.createdBy, 'Admin');
  assert.deepEqual(deleted.deletedValues.map((v) => [v.label, v.before]), [['Name', 'Old Supplier'], ['Created by', 'Admin']]);

  const failed = await presentAuditRow({
    occurred_at: '2026-10-16 08:00:00', user_id: null, username: 'stores2', event_type: 'AUTH', action: 'LOGIN_FAILED',
    outcome: 'FAILED', status_code: 401, message: 'Unknown username', request_body: { username: 'stores2', password: '[REDACTED]' }
  }, fakeDb);
  assert.equal(failed.headline, 'Someone tried to sign in with the username "stores2" and failed.');
  assert.equal(failed.result, 'Failed');
  assert.equal(failed.resultMessage, 'Unknown username');
});
