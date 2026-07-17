//server/controllers/itemTypeController.js

const pool = require('../config/db');

// Get all RM item types
const getAllItemTypes = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, type_name, created_at FROM item_types ORDER BY type_name ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching item types:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Create a new RM item type
const createItemType = async (req, res) => {
  try {
    const { type_name } = req.body;

    if (!type_name || !type_name.trim()) {
      return res.status(400).json({ error: 'RM type name is required' });
    }

    const trimmedName = type_name.trim();

    const [result] = await pool.query(
      'INSERT INTO item_types (type_name) VALUES (?)',
      [trimmedName]
    );

    const [rows] = await pool.query(
      'SELECT id, type_name, created_at FROM item_types WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      message: 'RM Type added successfully',
      itemType: rows[0]
    });
  } catch (error) {
    console.error('Error adding item type:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'RM Type already exists' });
    }

    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getAllItemTypes,
  createItemType
};
