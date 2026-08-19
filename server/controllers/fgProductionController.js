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
// Tables used (see config/db.js -> ensureFgProductionSchema):
//   fg_production          -> the FG item defined in this new module
//   fg_production_recipes  -> RM recipe lines (RM item, quantity, last price)
//
// Soft delete convention: status = 1 (Active) / status = 0 (Deleted)
// ----------------------------------------------------------------------

const pool = require('../config/db');

// =============================================
// Helpers
// =============================================

const toNumber = (val, fallback = 0) => {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : fallback;
};

const validateFgProductionInput = ({ fg_item_name, department_id, recipe_output_quantity }) => {
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

const validateRecipeInput = ({ rm_item_id, quantity, last_price }) => {
  if (!rm_item_id) {
    return 'RM Item is required';
  }
  const qty = toNumber(quantity, NaN);
  if (!Number.isFinite(qty) || qty <= 0) {
    return 'Quantity must be greater than 0';
  }
  const price = toNumber(last_price, NaN);
  if (!Number.isFinite(price) || price < 0) {
    return 'Last Price must not be negative';
  }
  return null;
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
      `SELECT fp.id, fp.fg_item_name, fp.department_id, d.name AS department_name,
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
  const { fg_item_name, department_id, recipe_output_quantity } = req.body;

  const validationError = validateFgProductionInput({ fg_item_name, department_id, recipe_output_quantity });
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO fg_production (fg_item_name, department_id, recipe_output_quantity, status)
       VALUES (?, ?, ?, 1)`,
      [String(fg_item_name).trim(), department_id, toNumber(recipe_output_quantity)]
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
  const { fg_item_name, department_id, recipe_output_quantity } = req.body;

  const validationError = validateFgProductionInput({ fg_item_name, department_id, recipe_output_quantity });
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const [result] = await pool.query(
      `UPDATE fg_production
       SET fg_item_name = ?, department_id = ?, recipe_output_quantity = ?
       WHERE id = ? AND status = 1`,
      [String(fg_item_name).trim(), department_id, toNumber(recipe_output_quantity), id]
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
  const { rm_item_id, quantity, last_price } = req.body;

  const validationError = validateRecipeInput({ rm_item_id, quantity, last_price });
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

    const [result] = await pool.query(
      `INSERT INTO fg_production_recipes
        (fg_production_id, rm_item_id, quantity, last_price, status)
       VALUES (?, ?, ?, ?, 1)`,
      [id, rm_item_id, toNumber(quantity), toNumber(last_price)]
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
  const { rm_item_id, quantity, last_price } = req.body;

  const validationError = validateRecipeInput({ rm_item_id, quantity, last_price });
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

    const [result] = await pool.query(
      `UPDATE fg_production_recipes
       SET rm_item_id = ?, quantity = ?, last_price = ?
       WHERE id = ? AND status = 1`,
      [rm_item_id, toNumber(quantity), toNumber(last_price), recipeId]
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

    const [rows] = await pool.query(
      `SELECT
         fp.id,
         fp.fg_item_name,
         fp.department_id,
         d.name AS department_name,
         fp.recipe_output_quantity,
         COUNT(r.id) AS rm_recipes_count,
         COALESCE(SUM(r.quantity * r.last_price), 0) AS rm_cost
       FROM fg_production fp
       LEFT JOIN departments d ON d.id = fp.department_id
       LEFT JOIN fg_production_recipes r
         ON r.fg_production_id = fp.id AND r.status = 1
       ${whereSql}
       GROUP BY fp.id, fp.fg_item_name, fp.department_id, d.name, fp.recipe_output_quantity
       ORDER BY fp.fg_item_name ASC`,
      params
    );

    const formatted = rows.map(row => ({
      ...row,
      recipe_output_quantity: Number(row.recipe_output_quantity) || 0,
      rm_recipes_count: Number(row.rm_recipes_count) || 0,
      rm_cost: Number(row.rm_cost) || 0
    }));

    res.json(formatted);
  } catch (error) {
    console.error('[FG Production] Error building recipes report:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
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
