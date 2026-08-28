// server/controllers/fgProductionController.js
//
// FG - Finished Goods Production (NEW, INDEPENDENT MODULE)
// ----------------------------------------------------------------------
// This controller belongs to a brand new module that is intentionally
// isolated from the existing Finished Goods functionality
// (finished_goods_items, finished_goods_ingredients, finished_goods_*).
// It only reads existing master data (departments, items) as reference
// data - it never modifies those tables.
//
// Tables used (see config/db.js -> ensureFgProductionSchema /
// ensureFgProductionExternalItemSchema):
//   fg_production          -> the FG production record in this module.
//                             fg_item_name/external_item_id are a cached
//                             reference to the Ravon POS item - see below.
//   fg_production_recipes  -> RM recipe lines (RM item, quantity, last price)
//
// Ravon Bakers POS integration:
//   FG Items are no longer created/managed in BSMS. The Ravon POS system
//   (pos.ravonbakers.lk) is the source of truth for FG Items. Users pick
//   an existing POS item from a dropdown (populated via getPosItems /
//   GET /api/fg-production/items, which proxies the POS `/api/items-list`
//   API through ravonPosService) and BSMS stores the POS item's ID as
//   `external_item_id`, with `fg_item_name` kept only as a display/cache
//   value. See server/services/ravonPosService.js for the integration.
//
// Soft delete convention: status = 1 (Active) / status = 0 (Deleted)
// ----------------------------------------------------------------------

const pool = require('../config/db');

const {
  fetchRavonPosItems,
  findRavonPosItem,
  RavonPosConfigError,
  RavonPosUnavailableError,
  RavonPosResponseError
} = require('../services/ravonPosService');
const { isValidUnit, areCompatibleUnits, convertQuantity } = require('../utils/unitConversion');

// =============================================
// Helpers
// =============================================

const toNumber = (val, fallback = 0) => {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : fallback;
};

const validateFgProductionInput = ({ external_item_id, fg_item_name, department_id, recipe_output_quantity }) => {
  if (!external_item_id || !String(external_item_id).trim()) {
    return 'FG Item is required - please select an item from the Ravon POS list';
  }
  if (!fg_item_name || !String(fg_item_name).trim()) {
    return 'FG Item Name is required';
  }
  if (!department_id) {
    return 'Department is required';
  }
  const outputQty = toNumber(recipe_output_quantity, NaN);
  if (!Number.isFinite(outputQty) || outputQty <= 0) {
    return 'Recipe Output Quantity must be greater than 0';
  }
  return null;
};

// Maps a Ravon POS integration error to an { status, error } pair that is
// safe to send to the frontend (no stack traces / internal config).
const posErrorResponse = (error) => {
  if (error instanceof RavonPosConfigError) {
    console.error('[FG Production] Ravon POS is not configured:', error.message);
    return { status: 503, error: 'Ravon POS integration is not configured. Please contact an administrator.' };
  }
  if (error instanceof RavonPosUnavailableError) {
    console.error('[FG Production] Ravon POS unavailable:', error.message);
    return { status: 503, error: 'Unable to connect to Ravon POS. Please try again shortly.' };
  }
  if (error instanceof RavonPosResponseError) {
    console.error('[FG Production] Ravon POS invalid response:', error.message);
    return { status: 502, error: 'Ravon POS returned an unexpected response. Please try again.' };
  }
  console.error('[FG Production] Unexpected Ravon POS error:', error);
  return { status: 500, error: 'Unable to load FG Items right now. Please try again.' };
};

const validateRecipeInput = ({ rm_item_id, quantity, recipe_unit, last_price }) => {
  if (!rm_item_id) {
    return 'RM Item is required';
  }
  const qty = toNumber(quantity, NaN);
  if (!Number.isFinite(qty) || qty <= 0) {
    return 'Quantity must be greater than 0';
  }
  if (!recipe_unit || !isValidUnit(recipe_unit)) {
    return 'A valid unit must be selected for the recipe quantity';
  }
  const price = toNumber(last_price, NaN);
  if (!Number.isFinite(price) || price < 0) {
    return 'Last Price must not be negative';
  }
  return null;
};

// =============================================
// Ravon POS Integration
// =============================================

// GET /api/fg-production/items
// Proxies the Ravon POS `/api/items-list` API so the frontend never talks
// to the POS system directly. Only the fields the FG Item dropdown needs
// are returned - no POS credentials/internal config are exposed.
const getPosItems = async (req, res) => {
  try {
    const items = await fetchRavonPosItems();
    res.json(items);
  } catch (error) {
    const { status, error: message } = posErrorResponse(error);
    res.status(status).json({ error: message });
  }
};

// =============================================
// FG Production (header) CRUD
// =============================================

// GET /api/fg-production
const getAllFgProduction = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        fp.id,
        fp.fg_item_name,
        fp.external_item_id,
        fp.department_id,
        d.name AS department_name,
        fp.recipe_output_quantity,
        fp.status,
        fp.created_at,
        fp.updated_at,
        (SELECT COUNT(*) FROM fg_production_recipes r
          WHERE r.fg_production_id = fp.id AND r.status = 1) AS rm_recipes_count
      FROM fg_production fp
      LEFT JOIN departments d ON d.id = fp.department_id
      WHERE fp.status = 1
      ORDER BY fp.created_at DESC, fp.id DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('[FG Production] Error fetching list:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /api/fg-production/:id
const getFgProductionById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT fp.id, fp.fg_item_name, fp.external_item_id, fp.department_id, d.name AS department_name,
              fp.recipe_output_quantity, fp.status, fp.created_at, fp.updated_at
       FROM fg_production fp
       LEFT JOIN departments d ON d.id = fp.department_id
       WHERE fp.id = ? AND fp.status = 1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'FG Production item not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('[FG Production] Error fetching item:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/fg-production
const createFgProduction = async (req, res) => {
  const { external_item_id, fg_item_name, department_id, recipe_output_quantity } = req.body;

  const validationError = validateFgProductionInput({ external_item_id, fg_item_name, department_id, recipe_output_quantity });
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  // Validate the selected item against the live Ravon POS list so we never
  // create a production record for an item that doesn't (or no longer)
  // exists in the POS.
  let posItem;
  try {
    posItem = await findRavonPosItem(external_item_id);
  } catch (error) {
    const { status, error: message } = posErrorResponse(error);
    return res.status(status).json({ error: message });
  }
  if (!posItem) {
    return res.status(400).json({ error: 'Selected FG Item does not exist in Ravon POS.' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO fg_production (fg_item_name, external_item_id, department_id, recipe_output_quantity, status)
       VALUES (?, ?, ?, ?, 1)`,
      [posItem.fg_item_name, posItem.external_item_id, department_id, toNumber(recipe_output_quantity)]
    );

    res.status(201).json({
      id: result.insertId,
      message: 'FG Production item created successfully'
    });
  } catch (error) {
    console.error('[FG Production] Error creating item:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// PUT /api/fg-production/:id
const updateFgProduction = async (req, res) => {
  const { id } = req.params;
  const { external_item_id, fg_item_name, department_id, recipe_output_quantity } = req.body;

  const validationError = validateFgProductionInput({ external_item_id, fg_item_name, department_id, recipe_output_quantity });
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const [existingRows] = await pool.query(
      `SELECT external_item_id FROM fg_production WHERE id = ? AND status = 1`,
      [id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'FG Production item not found' });
    }

    // Only re-validate against the live POS list when the selected item is
    // actually changing. This keeps editing an unrelated field (department,
    // output quantity) working even if the originally-selected POS item has
    // since been removed/deactivated on the POS side (see requirement to
    // handle this gracefully rather than blocking every edit).
    const itemIsChanging = String(existingRows[0].external_item_id || '') !== String(external_item_id);

    let resolvedName = fg_item_name ? String(fg_item_name).trim() : null;
    if (itemIsChanging) {
      let posItem;
      try {
        posItem = await findRavonPosItem(external_item_id);
      } catch (error) {
        const { status, error: message } = posErrorResponse(error);
        return res.status(status).json({ error: message });
      }
      if (!posItem) {
        return res.status(400).json({ error: 'Selected FG Item does not exist in Ravon POS.' });
      }
      resolvedName = posItem.fg_item_name;
    }

    const [result] = await pool.query(
      `UPDATE fg_production
       SET fg_item_name = ?, external_item_id = ?, department_id = ?, recipe_output_quantity = ?
       WHERE id = ? AND status = 1`,
      [resolvedName, external_item_id, department_id, toNumber(recipe_output_quantity), id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'FG Production item not found' });
    }

    res.json({ message: 'FG Production item updated successfully' });
  } catch (error) {
    console.error('[FG Production] Error updating item:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// DELETE /api/fg-production/:id  (soft delete - also soft-deletes its recipes)
const deleteFgProduction = async (req, res) => {
  const { id } = req.params;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `UPDATE fg_production SET status = 0 WHERE id = ? AND status = 1`,
      [id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'FG Production item not found' });
    }

    await connection.query(
      `UPDATE fg_production_recipes SET status = 0 WHERE fg_production_id = ? AND status = 1`,
      [id]
    );

    await connection.commit();
    res.json({ message: 'FG Production item deleted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('[FG Production] Error deleting item:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

// =============================================
// Recipes (RM lines belonging to a FG Production item)
// =============================================

// GET /api/fg-production/:id/recipes
const getRecipesForFg = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT
         r.id,
         r.fg_production_id,
         r.rm_item_id,
         i.name AS rm_item_name,
         i.unit AS rm_unit,
         r.quantity,
         r.last_price,
         (r.quantity * r.last_price) AS line_cost,
         r.purchase_quantity,
         r.purchase_unit,
         r.status,
         r.created_at,
         r.updated_at
       FROM fg_production_recipes r
       JOIN items i ON i.id = r.rm_item_id
       WHERE r.fg_production_id = ? AND r.status = 1
       ORDER BY r.id ASC`,
      [id]
    );

    res.json(rows);
  } catch (error) {
    console.error('[FG Production] Error fetching recipes:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/fg-production/:id/recipes
const addRecipe = async (req, res) => {
  const { id } = req.params; // fg_production_id
  const { rm_item_id, quantity, recipe_unit, last_price } = req.body;

  const validationError = validateRecipeInput({ rm_item_id, quantity, recipe_unit, last_price });
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {

    // Make sure the parent FG Production item exists and is active
    const [fgRows] = await pool.query(
      `SELECT id FROM fg_production WHERE id = ? AND status = 1`,
      [id]
    );
    if (fgRows.length === 0) {
      return res.status(404).json({ error: 'FG Production item not found' });
    }

    // Prevent duplicate active RM item for the same FG recipe
    const [dupRows] = await pool.query(
      `SELECT id FROM fg_production_recipes
       WHERE fg_production_id = ? AND rm_item_id = ? AND status = 1`,
      [id, rm_item_id]
    );
    if (dupRows.length > 0) {
      return res.status(409).json({ error: 'This Raw Material is already added to this FG recipe' });
    }

    // Unit conversion validation: last_price is priced against the RM
    // item's own base unit (items.unit). The person may enter the
    // quantity in any compatible unit (e.g. g instead of kg) - it is
    // converted to the base unit here, server-side, before being stored
    // and before it is ever multiplied by last_price for costing. This is
    // the authoritative conversion; the frontend preview is UX only.
    const [itemRows] = await pool.query(
      `SELECT unit FROM items WHERE id = ?`,
      [rm_item_id]
    );
    if (itemRows.length === 0) {
      return res.status(404).json({ error: 'Raw Material item not found' });
    }
    const baseUnit = itemRows[0].unit;

    if (!areCompatibleUnits(recipe_unit, baseUnit)) {
      return res.status(400).json({
        error: `Cannot use unit "${recipe_unit}" for this Raw Material - it is stocked in "${baseUnit}" and only compatible units can be used`
      });
    }

    let normalizedQuantity;
    try {
      normalizedQuantity = convertQuantity(toNumber(quantity), recipe_unit, baseUnit);
    } catch (conversionError) {
      return res.status(400).json({ error: conversionError.message });
    }

    const [result] = await pool.query(
      `INSERT INTO fg_production_recipes
        (fg_production_id, rm_item_id, quantity, recipe_unit, last_price, purchase_quantity, purchase_unit, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [id, rm_item_id, normalizedQuantity, recipe_unit, toNumber(last_price), normalizedQuantity, baseUnit]
    );

    res.status(201).json({
      id: result.insertId,
      message: 'Recipe item added successfully'
    });
  } catch (error) {
    console.error('[FG Production] Error adding recipe:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// PUT /api/fg-production/recipes/:recipeId
const updateRecipe = async (req, res) => {
  const { recipeId } = req.params;
  const { rm_item_id, quantity, recipe_unit, last_price } = req.body;

  const validationError = validateRecipeInput({ rm_item_id, quantity, recipe_unit, last_price });
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {

    const [recipeRows] = await pool.query(
      `SELECT fg_production_id FROM fg_production_recipes WHERE id = ? AND status = 1`,
      [recipeId]
    );
    if (recipeRows.length === 0) {
      return res.status(404).json({ error: 'Recipe item not found' });
    }
    const fgProductionId = recipeRows[0].fg_production_id;

    // Prevent duplicate active RM item for the same FG recipe (excluding self)
    const [dupRows] = await pool.query(
      `SELECT id FROM fg_production_recipes
       WHERE fg_production_id = ? AND rm_item_id = ? AND status = 1 AND id <> ?`,
      [fgProductionId, rm_item_id, recipeId]
    );
    if (dupRows.length > 0) {
      return res.status(409).json({ error: 'This Raw Material is already added to this FG recipe' });
    }

    // Same unit conversion validation as addRecipe - see comment there.
    const [itemRows] = await pool.query(
      `SELECT unit FROM items WHERE id = ?`,
      [rm_item_id]
    );
    if (itemRows.length === 0) {
      return res.status(404).json({ error: 'Raw Material item not found' });
    }
    const baseUnit = itemRows[0].unit;

    if (!areCompatibleUnits(recipe_unit, baseUnit)) {
      return res.status(400).json({
        error: `Cannot use unit "${recipe_unit}" for this Raw Material - it is stocked in "${baseUnit}" and only compatible units can be used`
      });
    }

    let normalizedQuantity;
    try {
      normalizedQuantity = convertQuantity(toNumber(quantity), recipe_unit, baseUnit);
    } catch (conversionError) {
      return res.status(400).json({ error: conversionError.message });
    }

    const [result] = await pool.query(
      `UPDATE fg_production_recipes
        SET rm_item_id = ?, quantity = ?, recipe_unit = ?, last_price = ?, purchase_quantity = ?, purchase_unit = ?
       WHERE id = ? AND status = 1`,
      [rm_item_id, normalizedQuantity, recipe_unit, toNumber(last_price), normalizedQuantity, baseUnit, recipeId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Recipe item not found' });
    }


    res.json({ message: 'Recipe item updated successfully' });
  } catch (error) {
    console.error('[FG Production] Error updating recipe:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// DELETE /api/fg-production/recipes/:recipeId  (soft delete)
const deleteRecipe = async (req, res) => {
  const { recipeId } = req.params;

  try {
    const [result] = await pool.query(
      `UPDATE fg_production_recipes SET status = 0 WHERE id = ? AND status = 1`,
      [recipeId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Recipe item not found' });
    }

    res.json({ message: 'Recipe item deleted successfully' });
  } catch (error) {
    console.error('[FG Production] Error deleting recipe:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// =============================================
// FG Recipes Report
// =============================================

// GET /api/fg-production/reports/recipes
const getRecipesReport = async (req, res) => {
  try {
    const { department_id, search } = req.query;

    const whereClauses = ['fp.status = 1'];
    const params = [];

    if (department_id) {
      whereClauses.push('fp.department_id = ?');
      params.push(department_id);
    }

    if (search) {
      whereClauses.push('fp.fg_item_name LIKE ?');
      params.push(`%${search}%`);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [fgRows] = await pool.query(
      `SELECT
         fp.id,
         fp.fg_item_name,
         fp.external_item_id,
         fp.department_id,
         d.name AS department_name,
         fp.recipe_output_quantity
       FROM fg_production fp
       LEFT JOIN departments d ON d.id = fp.department_id
       ${whereSql}
       ORDER BY fp.fg_item_name ASC`,
      params
    );

    const [recipeTotals] = await pool.query(
      `SELECT fg_production_id,
              COUNT(*) AS rm_recipes_count,
              COALESCE(SUM(quantity * last_price), 0) AS rm_cost
       FROM fg_production_recipes
       WHERE status = 1
       GROUP BY fg_production_id`
    );
    const totalsByFg = new Map(recipeTotals.map(row => [row.fg_production_id, row]));

    // Selling Price comes from Ravon POS, matched via external_item_id.
    // Reuses the same ravonPosService integration used by the FG Item
    // dropdown - no duplicate POS API call is made elsewhere in the app.
    // If the POS call fails entirely, the report still renders with
    // Selling Price = null (formatted as "N/A" below) rather than failing.
    let posItemsByExternalId = new Map();
    try {
      const posItems = await fetchRavonPosItems({ includeInactive: true });
      posItemsByExternalId = new Map(posItems.map(item => [String(item.external_item_id), item]));
    } catch (error) {
      console.warn('[FG Production] Could not load Ravon POS items for Selling Price:', error.message);
    }

    const formatted = fgRows.map(row => {
      const posItem = row.external_item_id ? posItemsByExternalId.get(String(row.external_item_id)) : null;
      const sellingPrice = posItem && posItem.selling_price !== null ? posItem.selling_price : null;
      return {
        ...row,
        recipe_output_quantity: Number(row.recipe_output_quantity) || 0,
        rm_recipes_count: Number(totalsByFg.get(row.id)?.rm_recipes_count) || 0,
        rm_cost: Number(totalsByFg.get(row.id)?.rm_cost) || 0,
        selling_price: sellingPrice
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error('[FG Production] Error building recipes report:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getPosItems,
  getAllFgProduction,
  getFgProductionById,
  createFgProduction,
  updateFgProduction,
  deleteFgProduction,
  getRecipesForFg,
  addRecipe,
  updateRecipe,
  deleteRecipe,
  getRecipesReport
};