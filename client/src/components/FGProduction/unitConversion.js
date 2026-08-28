// src/components/FGProduction/unitConversion.js
//
// Client-side mirror of server/utils/unitConversion.js.
// Used to show a live "converts to X (base unit)" preview while a recipe
// line is being entered. The server re-validates and re-converts
// independently and is the source of truth - this is UX only.

export const UNIT_GROUPS = {
  kg: 'weight',
  g: 'weight',
  L: 'volume',
  ml: 'volume',
  quantity: 'count'
};

const TO_CANONICAL = {
  kg: 1000,
  g: 1,
  L: 1000,
  ml: 1,
  quantity: 1
};

export const VALID_UNITS = Object.keys(UNIT_GROUPS);

export function isValidUnit(unit) {
  return VALID_UNITS.includes(unit);
}

export function areCompatibleUnits(unitA, unitB) {
  if (!isValidUnit(unitA) || !isValidUnit(unitB)) return false;
  return UNIT_GROUPS[unitA] === UNIT_GROUPS[unitB];
}

/**
 * Returns the list of units the person may pick from for a recipe line,
 * given the RM item's own base unit. Always includes the base unit itself.
 */
export function getCompatibleUnits(baseUnit) {
  if (!isValidUnit(baseUnit)) return [];
  const group = UNIT_GROUPS[baseUnit];
  return VALID_UNITS.filter(u => UNIT_GROUPS[u] === group);
}

/**
 * Converts a quantity from one unit to another within the same group.
 * Returns null if the units are incompatible or invalid, rather than
 * throwing, so it's safe to call directly from render/preview code.
 */
export function convertQuantity(quantity, fromUnit, toUnit) {
  if (!Number.isFinite(quantity)) return null;
  if (fromUnit === toUnit) return quantity;
  if (!areCompatibleUnits(fromUnit, toUnit)) return null;
  const inCanonical = quantity * TO_CANONICAL[fromUnit];
  return inCanonical / TO_CANONICAL[toUnit];
}