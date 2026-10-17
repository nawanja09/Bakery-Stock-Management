//server/controllers/departmentController.js

const pool = require('../config/db');
const { softDelete, restoreByName, findUse, inUseMessage } = require('../services/softDelete');

// Get all departments
const getAllDepartments = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, created_at FROM departments  WHERE is_deleted = 0 ORDER BY name ASC');
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
      'SELECT id FROM departments WHERE is_deleted = 0 AND LOWER(name) = LOWER(?)',
      [trimmedName]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Department name already exists' });
    }

    // A deleted department with this name (names are UNIQUE) is brought back, history intact.
    const result = { insertId: await restoreByName(pool, 'departments', 'name', trimmedName) };
    if (!result.insertId) {
      const [inserted] = await pool.query('INSERT INTO departments (name) VALUES (?)', [trimmedName]);
      result.insertId = inserted.insertId;
    }

    const [rows] = await pool.query(
      'SELECT id, name, created_at FROM departments WHERE is_deleted = 0 AND id = ?',
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
      'SELECT id FROM departments WHERE is_deleted = 0 AND LOWER(name) = LOWER(?) AND id != ?',
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
    // Same protection the foreign keys gave the old hard delete: a department still in use stays.
    const use = await findUse(pool, 'departments', id, { extra: [
      { table: 'collections', column: 'department_id' },
      { table: 'card_transactions', column: 'department_id' },
      { table: 'employees', column: 'department_id' }
    ] });
    if (use) return res.status(409).json({ error: inUseMessage('department', use) });

    const deleted = await softDelete(pool, 'departments', { id, userId: req.user?.userId });

    if (deleted === 0) {
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
