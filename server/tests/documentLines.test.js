const test = require('node:test');
const assert = require('node:assert/strict');
const { DocumentError, requireDate, requireDepartment, prepareStockLines } = require('../utils/documentLines');

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
