require('./helpers/noDatabase'); // unit test: never the real database
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { snapshotTargetOf, diffSnapshots } = require('../services/auditSnapshots');
const { toStoredJson } = require('../services/auditLog');
const { trustProxySetting, applyHttpSecurity } = require('../middleware/httpSecurity');
const { parseArgs, planSql } = require('../scripts/createAppDbUser');

test('finds the record an edit / pay / settle / delete request changes', () => {
  assert.deepEqual(snapshotTargetOf('/api/purchases/12'), { table: 'purchases', id: 12, children: [['purchase_items', 'purchase_id']] });
  assert.deepEqual(snapshotTargetOf('/api/purchases/12/pay?x=1'), { table: 'purchases', id: 12, children: [] });
  assert.equal(snapshotTargetOf('/api/purchases/payments/91-12/adjust').table, 'payment_history');
  assert.equal(snapshotTargetOf('/api/purchases/payments/91-12/adjust').id, 91);
  assert.deepEqual(snapshotTargetOf('/api/expenses/cheque/realise/5'), { table: 'cheque_expenses', id: 5, children: [] });
  assert.equal(snapshotTargetOf('/api/finance/cash/issued/7').table, 'finance_transactions');
  assert.equal(snapshotTargetOf('/api/departments/3').table, 'departments');
  assert.equal(snapshotTargetOf('/api/inhand/4/approve').table, 'inhand_adjustments');
  assert.equal(snapshotTargetOf('/api/purchases'), null, 'a create names no existing record');
  assert.equal(snapshotTargetOf('/api/purchases/pay-multiple'), null);
});

test('lists the fields and line items that changed, ignoring updated_at', () => {
  const before = {
    row: { id: 5, invoice_no: 'A-1', total: '100.00', updated_at: '2026-10-01 10:00:00' },
    purchase_items: [{ id: 1, quantity: 2 }, { id: 2, quantity: 5 }]
  };
  const after = {
    row: { id: 5, invoice_no: 'A-1', total: '120.00', updated_at: '2026-10-16 09:00:00' },
    purchase_items: [{ id: 1, quantity: 3 }, { id: 3, quantity: 1 }]
  };
  assert.deepEqual(diffSnapshots(before, after), {
    deleted: false,
    fields: [{ field: 'total', before: '100.00', after: '120.00' }],
    children: {
      purchase_items: {
        added: [{ id: 3, quantity: 1 }],
        removed: [{ id: 2, quantity: 5 }],
        changed: [{ before: { id: 1, quantity: 2 }, after: { id: 1, quantity: 3 } }]
      }
    }
  });
  assert.equal(diffSnapshots(before, null).deleted, true);
});

test('dates in stored data keep their value', () => {
  const stored = JSON.parse(toStoredJson({ when: new Date('2026-10-16T03:30:00.000Z'), password: 'x' }));
  assert.equal(stored.when, '2026-10-16T03:30:00.000Z');
  assert.equal(stored.password, '[REDACTED]');
});

test('TRUST_PROXY: the real client address only when the proxy is trusted', async () => {
  assert.equal(trustProxySetting(undefined), false);
  assert.equal(trustProxySetting('false'), false);
  assert.deepEqual(trustProxySetting('loopback'), ['loopback']);
  assert.equal(trustProxySetting('2'), 2);
  assert.deepEqual(trustProxySetting('10.0.0.5, 10.0.0.0/24'), ['10.0.0.5', '10.0.0.0/24']);

  const ipSeen = async (trustProxy) => {
    const app = express();
    applyHttpSecurity(app, { origins: [], trustProxy });
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/ip`, { headers: { 'X-Forwarded-For': '203.0.113.7' } });
      return (await response.json()).ip;
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  };
  assert.equal(await ipSeen(['loopback']), '203.0.113.7', 'behind a trusted proxy: the client address');
  assert.notEqual(await ipSeen(false), '203.0.113.7', 'no proxy configured: the header is not believed');
});

test('createAppDbUser: safe defaults, refuses odd names, dry run hides the password', () => {
  const options = parseArgs([], { DB_NAME: 'ravonbakers_stock' });
  assert.deepEqual(options, {
    apply: false, allowDrop: false, appUser: 'bsms_app', appHost: 'localhost',
    database: 'ravonbakers_stock', auditDatabase: 'ravonbakers_stock_audit'
  });
  assert.throws(() => parseArgs(['--audit-db', 'x; DROP'], { DB_NAME: 'db' }), /letters, digits/);
  assert.throws(() => parseArgs(['--audit-db', 'db'], { DB_NAME: 'db' }), /different schema/);
  assert.throws(() => parseArgs(['--password', 'x'], { DB_NAME: 'db' }), /Never pass a password/);

  const sql = planSql(options).join('\n');
  assert.match(sql, /GRANT SELECT, INSERT ON `ravonbakers_stock_audit`\.audit_log/);
  assert.doesNotMatch(sql, /TRIGGER|DROP|GRANT OPTION ON|SUPER|FILE/);
  assert.match(planSql({ ...options, allowDrop: true }).join('\n'), /LOCK TABLES, DROP ON `ravonbakers_stock`/);
});
