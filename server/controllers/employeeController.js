// server/controllers/employeeController.js
//
// Employee Management module.
// `employees` are company staff records for HR purposes - separate from
// `users` (application login accounts, see userController.js). Department
// is reused from the existing `departments` master (see
// departmentController.js); Designation has no existing master table in
// this project, so it is stored as validated free text (see the note in
// config/db.js ensureEmployeesSchema for how to later promote it to a
// master table without restructuring this module).
// Company follows the bank_details.company convention: the choices come
// from the `company` master (JH/RR/RD - see companyController.js /
// GET /api/companies) but the value itself is stored as plain text on the
// employee row, not as a company_id FK.
//
// NOTE: Staff Loans is a future module and is NOT implemented here.

const pool = require('../config/db');

// Sri Lankan NIC: old format = 9 digits + V/X, new format = 12 digits.
const NIC_REGEX = /^([0-9]{9}[vVxX]|[0-9]{12})$/;

// Matches the phone-number convention already used for suppliers
// (Suppliers.jsx / supplierRoutes.js): exactly 10 digits, numbers only.
const PHONE_REGEX = /^\d{10}$/;

const VALID_STATUSES = new Set(['Active', 'Inactive']);

const validateEmployeeInput = (input) => {
  const employee_code = String(input.employee_code || '').trim();
  const employee_name = String(input.employee_name || '').trim();
  const nic = String(input.nic || '').trim();
  const contact_number = String(input.contact_number || '').trim();
  const designation = String(input.designation || '').trim();
  const company = String(input.company || '').trim();
  const joining_date = String(input.joining_date || '').trim();
  const department_id = input.department_id !== undefined && input.department_id !== null && input.department_id !== ''
    ? Number(input.department_id)
    : null;

  if (!employee_code) return { error: 'Employee Code is required' };
  if (!employee_name) return { error: 'Employee Name is required' };
  if (!nic) return { error: 'NIC is required' };
  if (!NIC_REGEX.test(nic)) {
    return { error: 'Please enter a valid Sri Lankan NIC (9 digits + V/X, or 12 digits)' };
  }
  if (!contact_number) return { error: 'Contact Number is required' };
  if (!PHONE_REGEX.test(contact_number)) {
    return { error: 'Contact Number must be exactly 10 digits' };
  }
  if (department_id !== null && (!Number.isInteger(department_id) || department_id <= 0)) {
    return { error: 'Please select a valid Department' };
  }
  if (!designation) return { error: 'Designation is required' };
  if (!company) return { error: 'Company is required' };
  if (!joining_date || !/^\d{4}-\d{2}-\d{2}$/.test(joining_date)) {
    return { error: 'A valid Joining Date is required' };
  }

  return {
    employee_code,
    employee_name,
    nic: nic.toUpperCase(),
    contact_number,
    department_id,
    designation,
    company,
    joining_date
  };
};

// =============================================
// GET ALL EMPLOYEES (supports search + status filter)
// =============================================
const getAllEmployees = async (req, res) => {
  try {
    const { search, status } = req.query;

    let query = `
      SELECT
        e.id,
        e.employee_code,
        e.employee_name,
        e.nic,
        e.contact_number,
        e.department_id,
        d.name AS department_name,
        e.designation,
        e.company,
        e.joining_date,
        e.status,
        e.created_at,
        e.updated_at
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1 = 1
    `;
    const params = [];

    if (status && VALID_STATUSES.has(status)) {
      query += ' AND e.status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      query += ` AND (
        e.employee_name LIKE ? OR
        e.employee_code LIKE ? OR
        e.nic LIKE ? OR
        e.contact_number LIKE ? OR
        e.company LIKE ?
      )`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term);
    }

    query += ' ORDER BY e.employee_name ASC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
};

// =============================================
// GET EMPLOYEE BY ID
// =============================================
const getEmployeeById = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT
        e.id, e.employee_code, e.employee_name, e.nic, e.contact_number,
        e.department_id, d.name AS department_name, e.designation, e.company,
        e.joining_date, e.status, e.created_at, e.updated_at
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
};

// =============================================
// CREATE EMPLOYEE
// =============================================
const createEmployee = async (req, res) => {
  const validation = validateEmployeeInput(req.body);

  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const { employee_code, employee_name, nic, contact_number, department_id, designation, company, joining_date } = validation;

  try {
    // Explicit pre-checks give a clear, field-specific message; the DB-level
    // UNIQUE constraints (see config/db.js ensureEmployeesSchema) are the
    // real guarantee against a race between two simultaneous requests, and
    // are handled via the ER_DUP_ENTRY catch below.
    const [dupCode] = await pool.query(
      'SELECT id FROM employees WHERE employee_code = ?',
      [employee_code]
    );
    if (dupCode.length > 0) {
      return res.status(400).json({ error: 'Employee Code already exists' });
    }

    const [dupNic] = await pool.query(
      'SELECT id FROM employees WHERE nic = ?',
      [nic]
    );
    if (dupNic.length > 0) {
      return res.status(400).json({ error: 'An employee with this NIC already exists' });
    }

    if (department_id !== null) {
      const [dept] = await pool.query('SELECT id FROM departments WHERE id = ?', [department_id]);
      if (dept.length === 0) {
        return res.status(400).json({ error: 'Selected Department does not exist' });
      }
    }

    // The JWT payload signed at login stores the user id under `userId`
    // (see authController.js), not `id` - req.user is the decoded token.
    const resolvedCreatedBy = Number.isInteger(Number(req.user?.userId)) ? Number(req.user.userId) : null;

    const [result] = await pool.query(
      `INSERT INTO employees
        (employee_code, employee_name, nic, contact_number, department_id, designation, company, joining_date, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)`,
      [employee_code, employee_name, nic, contact_number, department_id, designation, company, joining_date, resolvedCreatedBy]
    );

    const [rows] = await pool.query(
      `SELECT
        e.id, e.employee_code, e.employee_name, e.nic, e.contact_number,
        e.department_id, d.name AS department_name, e.designation, e.company,
        e.joining_date, e.status, e.created_at, e.updated_at
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      message: 'Employee added successfully',
      employee: rows[0]
    });
  } catch (error) {
    console.error('Error adding employee:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      const message = String(error.sqlMessage || '').includes('nic')
        ? 'An employee with this NIC already exists'
        : 'Employee Code already exists';
      return res.status(400).json({ error: message });
    }
    if (error.code === 'ER_NO_REFERENCED_ROW' || error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'Selected Department does not exist' });
    }

    res.status(500).json({ error: 'Server error. Failed to add employee.' });
  }
};

// =============================================
// UPDATE EMPLOYEE
// =============================================
const updateEmployee = async (req, res) => {
  const { id } = req.params;
  const validation = validateEmployeeInput(req.body);

  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const { employee_code, employee_name, nic, contact_number, department_id, designation, company, joining_date } = validation;

  try {
    const [existing] = await pool.query('SELECT id FROM employees WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const [dupCode] = await pool.query(
      'SELECT id FROM employees WHERE employee_code = ? AND id != ?',
      [employee_code, id]
    );
    if (dupCode.length > 0) {
      return res.status(400).json({ error: 'Employee Code already exists' });
    }

    const [dupNic] = await pool.query(
      'SELECT id FROM employees WHERE nic = ? AND id != ?',
      [nic, id]
    );
    if (dupNic.length > 0) {
      return res.status(400).json({ error: 'An employee with this NIC already exists' });
    }

    if (department_id !== null) {
      const [dept] = await pool.query('SELECT id FROM departments WHERE id = ?', [department_id]);
      if (dept.length === 0) {
        return res.status(400).json({ error: 'Selected Department does not exist' });
      }
    }

    await pool.query(
      `UPDATE employees
       SET employee_code = ?, employee_name = ?, nic = ?, contact_number = ?,
           department_id = ?, designation = ?, company = ?, joining_date = ?
       WHERE id = ?`,
      [employee_code, employee_name, nic, contact_number, department_id, designation, company, joining_date, id]
    );

    const [rows] = await pool.query(
      `SELECT
        e.id, e.employee_code, e.employee_name, e.nic, e.contact_number,
        e.department_id, d.name AS department_name, e.designation, e.company,
        e.joining_date, e.status, e.created_at, e.updated_at
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.id = ?`,
      [id]
    );

    res.json({
      message: 'Employee updated successfully',
      employee: rows[0]
    });
  } catch (error) {
    console.error('Error updating employee:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      const message = String(error.sqlMessage || '').includes('nic')
        ? 'An employee with this NIC already exists'
        : 'Employee Code already exists';
      return res.status(400).json({ error: message });
    }
    if (error.code === 'ER_NO_REFERENCED_ROW' || error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'Selected Department does not exist' });
    }

    res.status(500).json({ error: 'Server error. Failed to update employee.' });
  }
};

// =============================================
// ACTIVATE / DEACTIVATE EMPLOYEE (soft status change - see items module for
// the same pattern: no physical delete, just a status flip)
// =============================================
const updateEmployeeStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: "Status must be 'Active' or 'Inactive'" });
  }

  try {
    const [result] = await pool.query(
      'UPDATE employees SET status = ? WHERE id = ?',
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json({
      message: `Employee ${status === 'Active' ? 'activated' : 'deactivated'} successfully`,
      status
    });
  } catch (error) {
    console.error('Error updating employee status:', error);
    res.status(500).json({ error: 'Server error. Failed to update employee status.' });
  }
};

module.exports = {
  getAllEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  updateEmployeeStatus,
  validateEmployeeInput
};