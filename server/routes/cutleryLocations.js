const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Get all locations
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT * FROM cutlery_locations 
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching locations:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add new location
router.post('/', async (req, res) => {
  try {
    const { location_name } = req.body;

    if (!location_name) {
      return res.status(400).json({ error: 'Location name is required' });
    }

    // Get the next location ID (L001, L002, etc.)
    const [maxId] = await pool.query(`
      SELECT location_id FROM cutlery_locations 
      ORDER BY id DESC LIMIT 1
    `);

    let nextId = 'L001';
    if (maxId.length > 0) {
      const lastId = maxId[0].location_id;
      const lastNumber = parseInt(lastId.substring(1));
      nextId = 'L' + String(lastNumber + 1).padStart(3, '0');
    }

    // Insert new location
    const [result] = await pool.query(
      'INSERT INTO cutlery_locations (location_id, location_name) VALUES (?, ?)',
      [nextId, location_name]
    );

    res.status(201).json({ 
      message: 'Location added successfully',
      location: {
        id: result.insertId,
        location_id: nextId,
        location_name: location_name
      }
    });
  } catch (err) {
    console.error('Error adding location:', err);
    
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Location name already exists' });
    }
    
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete location
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query(
      'DELETE FROM cutlery_locations WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json({ message: 'Location deleted successfully' });
  } catch (err) {
    console.error('Error deleting location:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;