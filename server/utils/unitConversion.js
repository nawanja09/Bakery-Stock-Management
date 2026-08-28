// server/utils/unitConversion.js
//
// Unit conversion for FG Production recipe lines.
//
// Raw material items are priced (items.unit / last_price) in a single
// "base" unit - e.g. Rs. 187 per kg. When a recipe line is entered, the
// person may naturally want to type the quantity in a different but
// compatible unit (e.g. 380 g instead of 0.380 kg). This module converts
// whatever unit was entered into the item's base unit BEFORE it is
// multiplied by last_price, so costing is never silently off by an order
// of magnitude due to a unit mismatch.
//
// Only units within the same physical quantity group can convert into
// each other. "quantity" (countable/piece items) cannot convert to or
// from a weight or volume unit - there is no valid factor for that.

const UNIT_GROUPS = {
  kg: 'weight',
  g: 'weight',
  L: 'volume',
  ml: 'volume',
  quantity: 'count'
};

// Canonical smallest unit per group, used purely as an intermediate step.
// (grams for weight, ml for volume; group is never crossed so having both
// share the same numeric table is safe.)
const TO_CANONICAL = {
  kg: 1000,
  g: 1,
  L: 1000,
  ml: 1,
  quantity: 1
};

const VALID_UNITS = Object.keys(UNIT_GROUPS);

function isValidUnit(unit) {
  return VALID_UNITS.includes(unit);
}

function areCompatibleUnits(unitA, unitB) {
  if (!isValidUnit(unitA) || !isValidUnit(unitB)) return false;
  return UNIT_GROUPS[unitA] === UNIT_GROUPS[unitB];
}

/**
 * Converts a quantity from one unit to another within the same group.
 * Throws if the units are not compatible (different groups) or unknown.
 */
function convertQuantity(quantity, fromUnit, toUnit) {
  if (fromUnit === toUnit) return quantity;
  if (!areCompatibleUnits(fromUnit, toUnit)) {
    throw new Error(`Cannot convert "${fromUnit}" to "${toUnit}" - incompatible units`);
  }
  const inCanonical = quantity * TO_CANONICAL[fromUnit];
  return inCanonical / TO_CANONICAL[toUnit];
}

module.exports = {
  UNIT_GROUPS,
  VALID_UNITS,
  isValidUnit,
  areCompatibleUnits,
  convertQuantity
};