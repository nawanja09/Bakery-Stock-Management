// src/components/FGProduction/fgProductionConstants.js
//
// Shared constants for the FG Production module.
// Single source of truth so Recipes.jsx (recipe builder) and
// FGRecipesReports.jsx (reporting) never fall out of sync.

// Flat markup applied on top of RM Cost to approximate utility
// (gas/electricity/water) cost per production run.
// e.g. 0.7 = 70% of RM Cost is added as utility cost.
export const UTILITY_COST_RATE = 0.7;