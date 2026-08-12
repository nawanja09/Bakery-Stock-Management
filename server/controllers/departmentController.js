//server/controllers/departmentController.js

const pool = require('../config/db');

// Get all departments
const getAllDepartments = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, created_at FROM departments ORDER BY name ASC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Create a new department
const createDepartment = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Department name is required' });
    }

    const trimmedName = name.trim();

    const [existing] = await pool.query(
      'SELECT id FROM departments WHERE LOWER(name) = LOWER(?)',
      [trimmedName]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Department name already exists' });
    }

    const [result] = await pool.query(
      'INSERT INTO departments (name) VALUES (?)',
      [trimmedName]
    );

    const [rows] = await pool.query(
      'SELECT id, name, created_at FROM departments WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      message: 'Department added successfully',
      department: rows[0]
    });
  } catch (error) {
    console.error('Error adding department:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Department name already exists' });
    }

    res.status(500).json({ error: 'Server error' });
  }
};

const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Department name is required' });
    }

    const trimmedName = name.trim();
    const [existing] = await pool.query(
      'SELECT id FROM departments WHERE LOWER(name) = LOWER(?) AND id != ?',
      [trimmedName, id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Department name already exists' });
    }

    const [result] = await pool.query(
      'UPDATE departments SET name = ? WHERE id = ?',
      [trimmedName, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    res.json({ message: 'Department updated successfully' });
  } catch (error) {
    console.error('Error updating department:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Department name already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM departments WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    res.json({ message: 'Department deleted successfully' });
  } catch (error) {
    console.error('Error deleting department:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getAllDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment
};
