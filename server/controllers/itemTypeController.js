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

    const [existing] = await pool.query(
      'SELECT id FROM item_types WHERE LOWER(type_name) = LOWER(?)',
      [trimmedName]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'RM Type already exists' });
    }

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

const updateItemType = async (req, res) => {
  try {
    const { id } = req.params;
    const { type_name } = req.body;

    if (!type_name || !type_name.trim()) {
      return res.status(400).json({ error: 'RM type name is required' });
    }

    const trimmedName = type_name.trim();

    const [existing] = await pool.query(
      'SELECT id FROM item_types WHERE LOWER(type_name) = LOWER(?) AND id != ?',
      [trimmedName, id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'RM Type already exists' });
    }

    const [result] = await pool.query(
      'UPDATE item_types SET type_name = ? WHERE id = ?',
      [trimmedName, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'RM Type not found' });
    }

    res.json({ message: 'RM Type updated successfully' });
  } catch (error) {
    console.error('Error updating item type:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'RM Type already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteItemType = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM item_types WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'RM Type not found' });
    }

    res.json({ message: 'RM Type deleted successfully' });
  } catch (error) {
    console.error('Error deleting item type:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getAllItemTypes,
  createItemType,
  updateItemType,
  deleteItemType
};
