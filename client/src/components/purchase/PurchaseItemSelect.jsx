import React from 'react';
import { components } from 'react-select';

const getStockValue = (item) => (
  item.current_stock ?? item.stock_quantity ?? item.stock ?? item.available_stock
);

const highlightMatch = (value, query) => {
  const text = String(value || '');
  const search = String(query || '').trim();

  if (!search) return text;

  const parts = text.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')})`, 'ig'));
  return parts.map((part, index) => (
    part.toLowerCase() === search.toLowerCase()
      ? <mark key={`${part}-${index}`}>{part}</mark>
      : part
  ));
};

export const PurchaseItemOption = (props) => {
  const { data, selectProps } = props;
  const stock = getStockValue(data);

  return (
    <components.Option {...props}>
      <div className="purchase-item-option">
        <div className="purchase-item-option-name">
          {highlightMatch(data.name || data.label, selectProps.inputValue)}
        </div>
        <div className="purchase-item-option-meta">
          {data.item_code && <span>{highlightMatch(data.item_code, selectProps.inputValue)}</span>}
          {data.unit && <span>{data.unit}</span>}
          {stock !== undefined && stock !== null && <span>Stock: {stock}</span>}
        </div>
      </div>
    </components.Option>
  );
};

export const purchaseItemSelectComponents = {
  Option: PurchaseItemOption
};

export const purchaseItemSelectStyles = {
  control: (base) => ({
    ...base,
    width: '100%',
    minHeight: '36px',
    borderColor: '#cbd5e1',
    borderRadius: '8px',
    boxShadow: 'none'
  }),
  menu: (base) => ({
    ...base,
    marginTop: '4px',
    border: '1px solid #dbe3ec',
    borderRadius: '8px',
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.14)',
    overflow: 'hidden',
    backgroundColor: '#fff',
    zIndex: 'var(--z-popover)'
  }),
  menuList: (base) => ({
    ...base,
    maxHeight: '240px',
    padding: '4px 0'
  }),
  option: (base, state) => ({
    ...base,
    padding: '9px 12px',
    backgroundColor: state.isFocused ? '#eff6ff' : '#fff',
    color: '#1e293b',
    cursor: 'pointer'
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 'var(--z-popover)'
  })
};