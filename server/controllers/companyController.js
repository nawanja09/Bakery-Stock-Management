//server/controllers/companyController.js

const pool = require('../config/db');
const { softDelete, findUse, inUseMessage } = require('../services/softDelete');

// Get all companies
const getAllCompanies = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, created_at FROM company  WHERE is_deleted = 0 ORDER BY name ASC'
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
      'SELECT id FROM company WHERE is_deleted = 0 AND LOWER(name) = LOWER(?)',
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
      'SELECT id, name, created_at FROM company WHERE is_deleted = 0 AND id = ?',
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
      'SELECT id FROM company WHERE is_deleted = 0 AND LOWER(name) = LOWER(?) AND id != ?',
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
    // A company with cash / bank books, invoices or other records stays: the foreign keys used to refuse it.
    const use = await findUse(pool, 'company', id, { extra: [
      { table: 'purchases', column: 'company_id', where: 'COALESCE(deleted, 0) = 0' },
      { table: 'expenses', column: 'company_id', where: 'is_deleted = 0' },
      { table: 'finance_transactions', column: 'company_id', where: 'status = 1' },
      { table: 'petty_cash_vouchers', column: 'company_id', where: 'is_deleted = 0' },
      { table: 'cash_expenses', column: 'company_id', where: 'status = 1' },
      { table: 'bank_charges', column: 'company_id', where: 'is_deleted = 0' },
      { table: 'cheque_expenses', column: 'company_id', where: 'is_deleted = 0' },
      { table: 'collections', column: 'company_id' }
    ] });
    if (use) return res.status(409).json({ error: inUseMessage('company', use) });

    const deleted = await softDelete(pool, 'company', { id, userId: req.user?.userId });

    if (deleted === 0) {
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
