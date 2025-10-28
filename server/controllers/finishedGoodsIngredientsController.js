const pool = require('../config/db');

const getRawMaterials = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, item_code, name, unit FROM items ORDER BY name');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching raw materials:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const createFinishedGoodsIngredients = async (req, res) => {
  const { finished_good_id, ingredients } = req.body;

  console.log('Creating ingredients for finished_good_id:', finished_good_id, 'ingredients:', ingredients);

  // Validate input
  if (!finished_good_id) {
    return res.status(400).json({ error: 'Finished good ID is required' });
  }

  try {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Delete existing ingredients for this finished good
      await connection.query('DELETE FROM finished_goods_ingredients WHERE finished_good_id = ?', [finished_good_id]);

      // Insert new ingredients if any
      if (ingredients && ingredients.length > 0) {
        const validIngredients = ingredients.filter(ing => 
          ing.raw_material_id && ing.quantity && parseFloat(ing.quantity) > 0
        );

        console.log('Valid ingredients to insert:', validIngredients);

        if (validIngredients.length > 0) {
          const values = validIngredients.map(ingredient => [
            finished_good_id,
            parseInt(ingredient.raw_material_id),
            parseFloat(ingredient.quantity)
          ]);

          await connection.query(
            'INSERT INTO finished_goods_ingredients (finished_good_id, raw_material_id, quantity) VALUES ?',
            [values]
          );
        }
      }

      await connection.commit();
      res.status(201).json({ message: 'Ingredients saved successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error saving ingredients:', error);
    
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ error: 'Database table missing. Please contact administrator.' });
    }
    
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

const getIngredientsByFinishedGood = async (req, res) => {
  const { finishedGoodId } = req.params;

  console.log('Fetching ingredients for finishedGoodId:', finishedGoodId);

  try {
    // First, check if the table exists and has data
    const [tableCheck] = await pool.query(`
      SELECT COUNT(*) as table_exists 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = 'finished_goods_ingredients'
    `);

    if (tableCheck[0].table_exists === 0) {
      console.log('Table finished_goods_ingredients does not exist');
      return res.json([]); // Return empty array if table doesn't exist
    }

    // Modified query to handle cases where items table might not have unit_price
    const [rows] = await pool.query(`
      SELECT 
        fgi.id,
        fgi.raw_material_id,
        i.name as item_name,
        i.unit,
        fgi.quantity,
        COALESCE(
          (SELECT unit_price FROM purchase_items 
           WHERE item_id = i.id 
           ORDER BY id DESC 
           LIMIT 1),
          0
        ) as unit_price
      FROM finished_goods_ingredients fgi
      JOIN items i ON fgi.raw_material_id = i.id
      WHERE fgi.finished_good_id = ?
      ORDER BY i.name
    `, [finishedGoodId]);

    console.log('Found ingredients:', rows);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching ingredients:', error);
    
    // If table doesn't exist or other SQL errors, return empty array
    if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR') {
      console.log('Table or column error, returning empty array');
      return res.json([]);
    }
    
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

const deleteIngredient = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query('DELETE FROM finished_goods_ingredients WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Ingredient not found' });
    }
    
    res.json({ message: 'Ingredient deleted successfully' });
  } catch (error) {
    console.error('Error deleting ingredient:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateFinishedGoodsIngredients = async (req, res) => {
  const { finished_good_id, ingredients } = req.body;

  // Validate input
  if (!finished_good_id) {
    return res.status(400).json({ error: 'Finished good ID is required' });
  }

  try {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Delete existing ingredients for this finished good
      await connection.query('DELETE FROM finished_goods_ingredients WHERE finished_good_id = ?', [finished_good_id]);

      // Insert new ingredients if any
      if (ingredients && ingredients.length > 0) {
        const validIngredients = ingredients.filter(ing => 
          ing.raw_material_id && ing.quantity && parseFloat(ing.quantity) > 0
        );

        if (validIngredients.length > 0) {
          const values = validIngredients.map(ingredient => [
            finished_good_id,
            parseInt(ingredient.raw_material_id),
            parseFloat(ingredient.quantity)
          ]);

          await connection.query(
            'INSERT INTO finished_goods_ingredients (finished_good_id, raw_material_id, quantity) VALUES ?',
            [values]
          );
        }
      }

      await connection.commit();
      res.json({ message: 'Ingredients updated successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error updating ingredients:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

module.exports = {
  getRawMaterials,
  createFinishedGoodsIngredients,
  getIngredientsByFinishedGood,
  deleteIngredient,
  updateFinishedGoodsIngredients
};