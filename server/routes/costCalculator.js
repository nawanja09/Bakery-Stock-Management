const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Save cost calculation
router.post('/', async (req, res) => {
  const {
    finished_good_id,
    finished_good_name,
    output_quantity,
    total_cost,
    per_unit_cost,
    ingredients
  } = req.body;

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Insert main cost calculation
    const [result] = await connection.query(
      `INSERT INTO cost_calculations 
      (finished_good_id, finished_good_name, output_quantity, total_cost, per_unit_cost) 
      VALUES (?, ?, ?, ?, ?)`,
      [finished_good_id, finished_good_name, output_quantity, total_cost, per_unit_cost]
    );
    
    const calculationId = result.insertId;

    // Insert ingredients
    for (const ingredient of ingredients) {
      await connection.query(
        `INSERT INTO cost_calculation_ingredients 
        (calculation_id, item_id, item_name, quantity, unit, unit_price, cost) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          calculationId,
          ingredient.item_id,
          ingredient.item_name,
          ingredient.quantity,
          ingredient.unit,
          ingredient.unit_price,
          ingredient.cost
        ]
      );
    }

    await connection.commit();
    res.status(201).json({ 
      message: 'Cost calculation saved successfully!',
      id: calculationId
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error saving cost calculation:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
});

// Get all saved cost calculations
router.get('/', async (req, res) => {
  try {
    const [calculations] = await pool.query(`
      SELECT cc.*, 
        COUNT(cci.id) as ingredient_count
      FROM cost_calculations cc
      LEFT JOIN cost_calculation_ingredients cci ON cc.id = cci.calculation_id
      GROUP BY cc.id
      ORDER BY cc.created_at DESC
    `);

    res.json(calculations);
  } catch (error) {
    console.error('Error fetching cost calculations:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get cost calculation by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const [calculation] = await pool.query(
      'SELECT * FROM cost_calculations WHERE id = ?',
      [id]
    );
    
    if (calculation.length === 0) {
      return res.status(404).json({ error: 'Cost calculation not found' });
    }
    
    const [ingredients] = await pool.query(
      `SELECT * FROM cost_calculation_ingredients WHERE calculation_id = ?`,
      [id]
    );
    
    res.json({
      ...calculation[0],
      ingredients
    });
    
  } catch (error) {
    console.error('Error fetching cost calculation:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete cost calculation
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query('DELETE FROM cost_calculations WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Cost calculation not found' });
    }
    
    res.json({ message: 'Cost calculation deleted successfully' });
  } catch (error) {
    console.error('Error deleting cost calculation:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;