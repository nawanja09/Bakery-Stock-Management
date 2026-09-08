import { filterItemByName } from './reportItemSelectHelper';

describe('filterItemByName', () => {
  const item1 = {
    value: 10,
    label: 'A6 - Flour (Auto-Add)',
    name: 'Flour (Auto-Add)',
    item_code: 'A6',
    data: { id: 10, name: 'Flour (Auto-Add)', item_code: 'A6' }
  };

  const item2 = {
    value: 20,
    label: 'RM-042 - Chicken Skinless Breast',
    name: 'Chicken Skinless Breast',
    item_code: 'RM-042',
    data: { id: 20, name: 'Chicken Skinless Breast', item_code: 'RM-042' }
  };

  const allItems = {
    value: 'all',
    label: 'All Items',
    name: 'All Items',
    item_code: '',
    data: null
  };

  test('Full Item Name matches', () => {
    expect(filterItemByName(item2, 'Chicken Skinless Breast')).toBe(true);
    expect(filterItemByName(item1, 'Flour (Auto-Add)')).toBe(true);
  });

  test('First part of Item Name matches', () => {
    expect(filterItemByName(item2, 'Chicken')).toBe(true);
  });

  test('Middle part of Item Name matches', () => {
    expect(filterItemByName(item2, 'Skinless')).toBe(true);
  });

  test('Last part of Item Name matches', () => {
    expect(filterItemByName(item2, 'Breast')).toBe(true);
  });

  test('Multiple-word Item Names match', () => {
    expect(filterItemByName(item2, 'Chicken Skinless')).toBe(true);
    expect(filterItemByName(item2, 'Skinless Breast')).toBe(true);
    expect(filterItemByName(item2, 'Chicken Breast')).toBe(true);
  });

  test('Case-insensitive search matches', () => {
    expect(filterItemByName(item2, 'chicken')).toBe(true);
    expect(filterItemByName(item2, 'SKINLESS')).toBe(true);
    expect(filterItemByName(item2, 'bReAsT')).toBe(true);
  });

  test('Item Code does NOT match', () => {
    expect(filterItemByName(item1, 'A6')).toBe(false);
    expect(filterItemByName(item2, 'RM-042')).toBe(false);
    expect(filterItemByName(item2, 'RM')).toBe(false);
  });

  test('All Items behavior', () => {
    expect(filterItemByName(allItems, '')).toBe(true);
    expect(filterItemByName(allItems, 'all')).toBe(true);
    expect(filterItemByName(allItems, 'Chicken')).toBe(false);
  });
});
