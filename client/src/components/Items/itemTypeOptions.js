export const ITEM_TYPE_OPTIONS = ['Vegetables', 'Meat', 'Packing','Fruits', 'Other'];

export const DEFAULT_ITEM_TYPE = 'Other';

export const getItemTypeLabel = (value) => {
  if (!value) return DEFAULT_ITEM_TYPE;
  return ITEM_TYPE_OPTIONS.includes(value) ? value : DEFAULT_ITEM_TYPE;
};
