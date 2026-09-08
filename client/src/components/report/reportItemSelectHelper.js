// client/src/components/report/reportItemSelectHelper.js

/**
 * Custom filter function for react-select that strictly searches against
 * the actual Item Name and NOT the Item Code.
 *
 * Supports:
 * - Full Item Name
 * - Partial Item Name
 * - First part of Item Name
 * - Middle part of Item Name
 * - Last part of Item Name
 * - Case-insensitive search
 * - Multiple-word Item Names (including words in any order)
 *
 * Example:
 * Item Name: "Chicken Skinless Breast"
 * Searching "Chicken", "Skinless", "Breast", "Chicken Skinless", "Breast Chicken"
 * all match.
 * Searching "RM001" (Item Code) does NOT match.
 */
export const filterItemByName = (option, inputValue) => {
  if (!inputValue || !inputValue.trim()) return true;

  const query = inputValue.trim().toLowerCase();

  // If user explicitly types "all", match "All Items" option
  if (option.value === 'all' || option.value === '') {
    return 'all items'.includes(query);
  }

  // Get the actual item name, not the display label (which starts with item_code)
  const itemName = String(
    option.name ||
    option.data?.name ||
    option.data?.item_name ||
    ''
  ).trim();

  if (!itemName) return false;

  const nameLower = itemName.toLowerCase();

  // 1. Direct substring match (covers full name, contiguous words, prefix, middle, suffix)
  if (nameLower.includes(query)) {
    return true;
  }

  // 2. Multi-word search (matches all query words in any position/order)
  const queryWords = query.split(/\s+/).filter(Boolean);
  if (queryWords.length > 1 && queryWords.every(word => nameLower.includes(word))) {
    return true;
  }

  return false;
};

/**
 * Clean styles matching the ERP design system (.report-filter-select / .report-filter-input)
 * Height: 38px, Border: var(--color-border), Radius: 6px, Colors: var(--color-surface), etc.
 */
export const reportItemSelectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: '38px',
    height: '38px',
    borderRadius: '6px',
    borderColor: state.isFocused ? 'var(--color-primary)' : 'var(--color-border)',
    boxShadow: state.isFocused ? '0 0 0 3px var(--color-focus-ring)' : 'none',
    backgroundColor: 'var(--color-surface, #ffffff)',
    fontSize: 'var(--font-size-sm, 14px)',
    cursor: 'pointer',
    '&:hover': {
      borderColor: 'var(--color-primary)'
    }
  }),
  valueContainer: (base) => ({
    ...base,
    height: '38px',
    padding: '0 10px',
    display: 'flex',
    alignItems: 'center'
  }),
  input: (base) => ({
    ...base,
    margin: '0',
    padding: '0',
    color: 'var(--color-text-primary, #1e293b)',
    fontSize: 'var(--font-size-sm, 14px)'
  }),
  singleValue: (base) => ({
    ...base,
    color: 'var(--color-text-primary, #1e293b)',
    fontSize: 'var(--font-size-sm, 14px)'
  }),
  placeholder: (base) => ({
    ...base,
    color: 'var(--color-text-placeholder, #94a3b8)',
    fontSize: 'var(--font-size-sm, 14px)'
  }),
  indicatorsContainer: (base) => ({
    ...base,
    height: '38px'
  }),
  dropdownIndicator: (base) => ({
    ...base,
    padding: '0 8px',
    color: 'var(--color-text-secondary, #64748b)'
  }),
  indicatorSeparator: () => ({
    display: 'none'
  }),
  menu: (base) => ({
    ...base,
    zIndex: 9999,
    backgroundColor: 'var(--color-surface, #ffffff)',
    border: '1px solid var(--color-border, #e2e8f0)',
    borderRadius: '6px',
    boxShadow: 'var(--shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.1))',
    marginTop: '4px'
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999
  }),
  option: (base, state) => ({
    ...base,
    fontSize: 'var(--font-size-sm, 14px)',
    padding: '8px 12px',
    backgroundColor: state.isSelected 
      ? 'var(--color-primary, #2563eb)' 
      : state.isFocused 
        ? 'var(--color-primary-light, #eff6ff)' 
        : 'transparent',
    color: state.isSelected 
      ? '#ffffff' 
      : state.isFocused 
        ? 'var(--color-primary-dark, #1d4ed8)' 
        : 'var(--color-text-primary, #1e293b)',
    cursor: 'pointer'
  })
};
