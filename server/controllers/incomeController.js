const pool = require('../config/db');

const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const number = (value) => Number.parseFloat(value || 0) || 0;

// GET /api/incomes
// Returns all income records entered through the New Income form, newest first.
const getIncomes = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT i.id,
             DATE_FORMAT(i.income_date, '%Y-%m-%d') AS income_date,
             i.company_id, c.name AS company_name,
             i.department_id, d.name AS department_name,
             i.amount,
             i.created_at
      FROM incomes i
      JOIN company c ON c.id = i.company_id
      JOIN departments d ON d.id = i.department_id
      WHERE i.status = 1
      ORDER BY i.income_date DESC, i.id DESC
    `);
    const records = rows.map(row => ({ ...row, amount: number(row.amount) }));
    res.json({ records, totalAmount: records.reduce((sum, row) => sum + row.amount, 0), count: records.length });
  } catch (error) {
    console.error('Income list error:', error);
    res.status(500).json({ error: 'Failed to load income records' });
  }
};

// POST /api/incomes
// Creates a new income record: Date, Company, Department, Amount.
const createIncome = async (req, res) => {
  try {
    const { income_date, company_id, department_id, amount } = req.body;

    if (!isValidDate(income_date)) return res.status(400).json({ error: 'A valid date is required' });
    if (!company_id) return res.status(400).json({ error: 'Company is required' });
    if (!department_id) return res.status(400).json({ error: 'Department is required' });
    const parsedAmount = number(amount);
    if (!parsedAmount || parsedAmount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

    const [companyRows] = await pool.query('SELECT id, name FROM company WHERE is_deleted = 0 AND id = ?', [company_id]);
    if (!companyRows.length) return res.status(400).json({ error: 'Selected company was not found' });

    const [deptRows] = await pool.query('SELECT id, name FROM departments WHERE is_deleted = 0 AND id = ?', [department_id]);
    if (!deptRows.length) return res.status(400).json({ error: 'Selected department was not found' });

    const [result] = await pool.query(
      `INSERT INTO incomes (income_date, company_id, department_id, amount, created_by, status)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [income_date, company_id, department_id, parsedAmount, req.user?.userId || null]
    );

    res.status(201).json({
      message: 'Income recorded successfully',
      record: {
        id: result.insertId,
        income_date,
        company_id: companyRows[0].id,
        company_name: companyRows[0].name,
        department_id: deptRows[0].id,
        department_name: deptRows[0].name,
        amount: parsedAmount
      }
    });
  } catch (error) {
    console.error('Create income error:', error);
    res.status(500).json({ error: 'Failed to save income record' });
  }
};

const validateIncomeReferences = async (companyId, departmentId) => {
  const [companyRows] = await pool.query('SELECT id, name FROM company WHERE is_deleted = 0 AND id = ?', [companyId]);
  if (!companyRows.length) throw new Error('Selected company was not found');
  const [deptRows] = await pool.query('SELECT id, name FROM departments WHERE is_deleted = 0 AND id = ?', [departmentId]);
  if (!deptRows.length) throw new Error('Selected department was not found');
  return { company: companyRows[0], department: deptRows[0] };
};

const validateIncomePayload = async (payload) => {
  const { income_date, company_id, department_id, amount } = payload;
  if (!isValidDate(income_date)) throw new Error('A valid date is required');
  if (!company_id) throw new Error('Company is required');
  if (!department_id) throw new Error('Department is required');
  const parsedAmount = number(amount);
  if (!parsedAmount || parsedAmount <= 0) throw new Error('Amount must be greater than 0');
  const references = await validateIncomeReferences(company_id, department_id);
  return { parsedAmount, ...references };
};

const updateIncome = async (req, res) => {
  try {
    const { parsedAmount, company, department } = await validateIncomePayload(req.body);
    const [result] = await pool.query(
      `UPDATE incomes SET income_date = ?, company_id = ?, department_id = ?, amount = ?
       WHERE id = ? AND status = 1`,
      [req.body.income_date, company.id, department.id, parsedAmount, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Income record was not found' });
    res.json({
      message: 'Income updated successfully',
      record: { id: Number(req.params.id), income_date: req.body.income_date, company_id: company.id, company_name: company.name, department_id: department.id, department_name: department.name, amount: parsedAmount }
    });
  } catch (error) {
    const status = error.message.startsWith('A valid') || error.message.includes('required') || error.message.includes('greater') || error.message.includes('not found') ? 400 : 500;
    console.error('Update income error:', error);
    res.status(status).json({ error: status === 400 ? error.message : 'Failed to update income record' });
  }
};

const deleteIncome = async (req, res) => {
  try {
    const [result] = await pool.query('UPDATE incomes SET status = 0 WHERE id = ? AND status = 1', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Income record was not found' });
    res.json({ message: 'Income deleted successfully' });
  } catch (error) {
    console.error('Delete income error:', error);
    res.status(500).json({ error: 'Failed to delete income record' });
  }
};

module.exports = { getIncomes, createIncome, updateIncome, deleteIncome };