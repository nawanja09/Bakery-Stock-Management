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

const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const trimmedName = name.trim();
    const [existing] = await pool.query(
      'SELECT id FROM company WHERE LOWER(name) = LOWER(?) AND id != ?',
      [trimmedName, id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Company already exists' });
    }

    const [result] = await pool.query(
      'UPDATE company SET name = ? WHERE id = ?',
      [trimmedName, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json({ message: 'Company updated successfully' });
  } catch (error) {
    console.error('Error updating company:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Company already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM company WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json({ message: 'Company deleted successfully' });
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getAllCompanies,
  createCompany,
  updateCompany,
  deleteCompany
};
