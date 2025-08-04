//server/controllers/departmentController.js

const pool = require('../config/db');

// Get all departments
const getAllDepartments = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name FROM departments');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getAllDepartments
};