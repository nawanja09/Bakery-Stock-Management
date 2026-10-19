const test = require('node:test');
const assert = require('node:assert/strict');
const { DocumentError, requireDate, requireDepartment, prepareStockLines, preparePricedLines, totalPricedLines } = require('../utils/documentLines');

test('requireDate accepts a real YYYY-MM-DD date', () => {
  assert.doesNotThrow(() => requireDate('2024-02-29', 'Return date'));
});

test('requireDate rejects invalid and non-canonical dates', () => {
  for (const date of ['2023-02-29', '2024-2-09', '2024-01-01T00:00:00']) {
    assert.throws(() => requireDate(date, 'Return date'), DocumentError);
  }
});

test('requireDepartment verifies that the department is active', async () => {
  const queries = [];
  const connection = {
    query: async (...args) => {
      queries.push(args);
      return [[{ id: 7 }]];
    }
  };

  await requireDepartment(connection, '7');
  assert.deepEqual(queries[0][1], [7]);
});

test('requireDepartment rejects unknown departments', async () => {
  const connection = { query: async () => [[]] };
  await assert.rejects(requireDepartment(connection, 7), { name: 'DocumentError', status: 404 });
});

test('prepareStockLines validates and preserves source line data', async () => {
  const source = { item_id: '12', quantity: '1.25', reason: 'Returned' };
  const connection = {
    query: async (sql, params) => {
      assert.match(sql, /deleted = FALSE/);
      assert.deepEqual(params, [[12]]);
      return [[{ id: 12 }]];
    }
  };

  const lines = await prepareStockLines(connection, [source]);
  assert.deepEqual(lines, [{ itemId: 12, quantity: 1.25, source }]);
});

test('prepareStockLines rejects invalid quantities before querying items', async () => {
  const connection = { query: async () => { throw new Error('unexpected query'); } };
  for (const quantity of [0, -1, 'nope', 1.0001, 1e6 + 1]) {
    await assert.rejects(
      prepareStockLines(connection, [{ item_id: 12, quantity }]),
      DocumentError
    );
  }
});

test('prepareStockLines rejects missing active items', async () => {
  const connection = { query: async () => [[]] };
  await assert.rejects(
    prepareStockLines(connection, [{ item_id: 12, quantity: 1 }]),
    { name: 'DocumentError', status: 404 }
  );
});

test('preparePricedLines validates item, quantity and unit price, and attaches vat_applicable', async () => {
  const connection = {
    query: async (sql, params) => {
      assert.match(sql, /vat_applicable/);
      assert.deepEqual(params, [[12]]);
      return [[{ id: 12, vat_applicable: 1 }]];
    }
  };
  const lines = await preparePricedLines(connection, [{ item_id: '12', quantity: '2', unit_price: '50', item_name: 'Flour' }]);
  assert.deepEqual(lines, [{
    itemId: 12, quantity: 2, unitPrice: 50, itemName: 'Flour',
    source: { item_id: '12', quantity: '2', unit_price: '50', item_name: 'Flour' },
    vatApplicable: true
  }]);
});

test('preparePricedLines rejects a non-positive/over-precise quantity before querying items', async () => {
  const connection = { query: async () => { throw new Error('unexpected query'); } };
  for (const quantity of [0, -1, 'nope', 1.0001, 1e6 + 1]) {
    await assert.rejects(
      preparePricedLines(connection, [{ item_id: 12, quantity, unit_price: 10 }]),
      DocumentError
    );
  }
});

test('preparePricedLines rejects a negative or non-numeric unit price', async () => {
  const connection = { query: async () => { throw new Error('unexpected query'); } };
  for (const unit_price of [-1, 'nope', undefined]) {
    await assert.rejects(
      preparePricedLines(connection, [{ item_id: 12, quantity: 1, unit_price }]),
      DocumentError
    );
  }
});

test('preparePricedLines rejects missing active items', async () => {
  const connection = { query: async () => [[]] };
  await assert.rejects(
    preparePricedLines(connection, [{ item_id: 12, quantity: 1, unit_price: 10 }]),
    { name: 'DocumentError', status: 404 }
  );
});

test('totalPricedLines sums quantity x unit_price, and applies VAT only when both the supplier is registered and the line is vat_applicable', () => {
  const lines = [
    { quantity: 10, unitPrice: 100, vatApplicable: true },
    { quantity: 5, unitPrice: 20, vatApplicable: false }
  ];
  assert.deepEqual(
    totalPricedLines(lines, { vatRate: 18, supplierVatRegistered: true }),
    { subtotal: 1100, vatAmount: 180, totalWithVat: 1280 }
  );
  assert.deepEqual(
    totalPricedLines(lines, { vatRate: 18, supplierVatRegistered: false }),
    { subtotal: 1100, vatAmount: 0, totalWithVat: 1100 }
  );
});
