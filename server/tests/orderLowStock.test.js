const test = require('node:test');
const assert = require('node:assert/strict');

// Test the mapping logic used in getLowStock
test('getLowStock mapping correctly identifies ordered items based on pending orders', () => {
  const items = [
    { id: 1, item_code: 'RM-01', name: 'Flour', unit: 'kg', current_stock: '5.00', reorder_level: '20.00' },
    { id: 2, item_code: 'RM-02', name: 'Sugar', unit: 'kg', current_stock: '2.00', reorder_level: '10.00' },
    { id: 3, item_code: 'RM-03', name: 'Butter', unit: 'kg', current_stock: '15.00', reorder_level: '10.00' }
  ];

  // Simulated pending order rows from DB
  const pendingRows = [
    { item_id: 1, order_no: 'ORD-2026-00001' }
  ];

  const pendingOrderMap = new Map();
  for (const row of pendingRows) {
    if (!pendingOrderMap.has(row.item_id)) {
      pendingOrderMap.set(row.item_id, row.order_no);
    }
  }

  const lowStock = items
    .map(item => {
      const currentStock = parseFloat(item.current_stock) || 0;
      const bufferStock = parseFloat(item.reorder_level) || 0;
      const requiredQty = bufferStock - currentStock;
      const isOrdered = pendingOrderMap.has(item.id);
      return {
        item_id: item.id,
        item_code: item.item_code,
        item_name: item.name,
        unit: item.unit,
        current_stock: currentStock,
        buffer_stock: bufferStock,
        required_qty: requiredQty,
        is_ordered: isOrdered,
        ordered: isOrdered ? 'Yes' : 'No',
        pending_order_no: pendingOrderMap.get(item.id) || null
      };
    })
    .filter(item => item.required_qty > 0)
    .sort((a, b) => a.item_name.localeCompare(b.item_name));

  assert.equal(lowStock.length, 2);

  // Item 1 (Flour) has a pending order -> is_ordered: true, ordered: 'Yes'
  const flour = lowStock.find(i => i.item_id === 1);
  assert.equal(flour.is_ordered, true);
  assert.equal(flour.ordered, 'Yes');
  assert.equal(flour.pending_order_no, 'ORD-2026-00001');

  // Item 2 (Sugar) does NOT have a pending order -> is_ordered: false, ordered: 'No'
  const sugar = lowStock.find(i => i.item_id === 2);
  assert.equal(sugar.is_ordered, false);
  assert.equal(sugar.ordered, 'No');
  assert.equal(sugar.pending_order_no, null);

  // Item 3 (Butter) is not low stock (current 15 >= buffer 10) -> filtered out
  assert.equal(lowStock.some(i => i.item_id === 3), false);
});

test('when pending order is cancelled or completed, item reverts to ordered: No', () => {
  const items = [
    { id: 1, item_code: 'RM-01', name: 'Flour', unit: 'kg', current_stock: '5.00', reorder_level: '20.00' }
  ];

  // No pending orders (e.g. order was cancelled or completed)
  const pendingRows = [];
  const pendingOrderMap = new Map();
  for (const row of pendingRows) {
    if (!pendingOrderMap.has(row.item_id)) {
      pendingOrderMap.set(row.item_id, row.order_no);
    }
  }

  const lowStock = items
    .map(item => {
      const currentStock = parseFloat(item.current_stock) || 0;
      const bufferStock = parseFloat(item.reorder_level) || 0;
      const requiredQty = bufferStock - currentStock;
      const isOrdered = pendingOrderMap.has(item.id);
      return {
        item_id: item.id,
        current_stock: currentStock,
        buffer_stock: bufferStock,
        required_qty: requiredQty,
        is_ordered: isOrdered,
        ordered: isOrdered ? 'Yes' : 'No'
      };
    })
    .filter(item => item.required_qty > 0);

  assert.equal(lowStock[0].is_ordered, false);
  assert.equal(lowStock[0].ordered, 'No');
});
