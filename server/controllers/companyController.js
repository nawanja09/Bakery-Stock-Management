//server/controllers/companyController.js

const pool = require('../config/db');

// Get all companies
const getAllCompanies = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, created_at FROM company ORDER BY name ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Create a new company
const createCompany = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const trimmedName = name.trim();

    // The `company` table has no unique constraint on name, so check manually
    const [existing] = await pool.query(
      'SELECT id FROM company WHERE LOWER(name) = LOWER(?)',
      [trimmedName]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Company already exists' });
    }

    const [result] = await pool.query(
      'INSERT INTO company (name) VALUES (?)',
      [trimmedName]
    );

    const [rows] = await pool.query(
      'SELECT id, name, created_at FROM company WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      message: 'Company added successfully',
      company: rows[0]
    });
  } catch (error) {
    console.error('Error adding company:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Company already exists' });
    }

    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getAllCompanies,
  createCompany
};
