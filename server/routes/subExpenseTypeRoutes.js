// routes/subExpenseTypeRoutes.js
// Sub expense types are scoped to one parent expense type.
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticate = require('../middleware/authenticate');

const isValidId = (value) => Number.isInteger(Number(value)) && Number(value) > 0;

const getParent = async (expenseTypeId) => {
  const [rows] = await pool.query('SELECT id FROM expense_types WHERE id = ?', [expenseTypeId]);
  return rows[0] || null;
};

// Management list. `activeOnly=true` is used by expense-entry dropdowns.
router.get('/', async (req, res) => {
  try {
    const activeOnly = String(req.query.activeOnly || '').toLowerCase() === 'true';
    const params = [];
    let where = '';

    if (req.query.expense_type_id) {
      if (!isValidId(req.query.expense_type_id)) {
        return res.status(400).json({ error: 'A valid expense type is required' });
      }
      where = 'WHERE st.expense_type_id = ?';
      params.push(req.query.expense_type_id);
    }
    if (activeOnly) {
      where += `${where ? ' AND' : 'WHERE'} st.status = 1`;
    }

    const [rows] = await pool.query(
      `SELECT st.id, st.expense_type_id, et.name AS expense_type_name,
              st.name, st.status,
              CASE WHEN st.status = 1 THEN 'Active' ELSE 'Inactive' END AS status_label
       FROM sub_expense_types st
       JOIN expense_types et ON et.id = st.expense_type_id
       ${where}
       ORDER BY et.name ASC, st.name ASC`,
      params
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching sub expense types:', error);
    res.status(500).json({ error: 'Failed to fetch sub expense types' });
  }
});

router.post('/', authenticate, async (req, res) => {
  const { expense_type_id, name, status } = req.body;
  if (!isValidId(expense_type_id) || !name || !String(name).trim()) {
    return res.status(400).json({ error: 'Expense type and sub expense type name are required' });
  }
  if (status !== undefined && ![0, 1, '0', '1'].includes(status)) {
    return res.status(400).json({ error: 'Status must be Active or Inactive' });
  }

  try {
    if (!await getParent(expense_type_id)) {
      return res.status(400).json({ error: 'Selected expense type was not found' });
    }
    const activeStatus = status === undefined ? 1 : Number(status);
    const [result] = await pool.query(
      `INSERT INTO sub_expense_types (expense_type_id, name, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [expense_type_id, String(name).trim(), activeStatus, req.user.userId]
    );
    res.status(201).json({
      id: result.insertId,
      expense_type_id: Number(expense_type_id),
      name: String(name).trim(),
      status: activeStatus,
      status_label: activeStatus ? 'Active' : 'Inactive',
      message: 'Sub expense type created successfully'
    });
  } catch (error) {
    console.error('Error creating sub expense type:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'This sub expense type already exists under the selected expense type' });
    }
    res.status(500).json({ error: 'Failed to create sub expense type' });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  const { expense_type_id, name, status } = req.body;
  if (!isValidId(req.params.id) || !isValidId(expense_type_id) || !name || !String(name).trim()) {
    return res.status(400).json({ error: 'Expense type and sub expense type name are required' });
  }
  if (status !== undefined && ![0, 1, '0', '1'].includes(status)) {
    return res.status(400).json({ error: 'Status must be Active or Inactive' });
  }

  try {
    if (!await getParent(expense_type_id)) {
      return res.status(400).json({ error: 'Selected expense type was not found' });
    }
    const activeStatus = status === undefined ? 1 : Number(status);
    const [result] = await pool.query(
      `UPDATE sub_expense_types
       SET expense_type_id = ?, name = ?, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [expense_type_id, String(name).trim(), activeStatus, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Sub expense type not found' });
    res.json({ message: 'Sub expense type updated successfully' });
  } catch (error) {
    console.error('Error updating sub expense type:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'This sub expense type already exists under the selected expense type' });
    }
    res.status(500).json({ error: 'Failed to update sub expense type' });
  }
});

router.patch('/:id/status', authenticate, async (req, res) => {
  const { status } = req.body;
  if (!isValidId(req.params.id) || ![0, 1, '0', '1'].includes(status)) {
    return res.status(400).json({ error: 'A valid status is required' });
  }
  try {
    const [result] = await pool.query(
      'UPDATE sub_expense_types SET status = ?, updated_at = NOW() WHERE id = ?',
      [Number(status), req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Sub expense type not found' });
    res.json({ message: `Sub expense type ${Number(status) ? 'activated' : 'deactivated'} successfully` });
  } catch (error) {
    console.error('Error changing sub expense type status:', error);
    res.status(500).json({ error: 'Failed to update sub expense type status' });
  }
});

module.exports = router;
