const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticate = require('../middleware/authenticate');

// =============================================
// GET Petty Cash Balance
// =============================================
router.get('/petty-cash/balance', async (req, res) => {
  try {
    // Calculate total reimbursements
    const [reimbursementRows] = await pool.query(
      'SELECT SUM(amount) as total FROM petty_cash_reimbursements'
    );
    const totalReimbursements = parseFloat(reimbursementRows[0].total) || 0;

    // Calculate total vouchers
    const [voucherRows] = await pool.query(
      'SELECT SUM(amount) as total FROM petty_cash_vouchers'
    );
    const totalVouchers = parseFloat(voucherRows[0].total) || 0;

    // Petty Cash balance = Total Reimbursement - Total Petty Cash Voucher
    const balance = totalReimbursements - totalVouchers;
    
    res.json({ 
      balance,
      totalReimbursements,
      totalVouchers
    });
  } catch (error) {
    console.error('Error fetching petty cash balance:', error);
    res.status(500).json({ error: 'Failed to fetch petty cash balance' });
  }
});

// =============================================
// GET Next Voucher Number
// =============================================
router.get('/petty-cash/next-voucher-number', async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT voucher_number FROM petty_cash_vouchers ORDER BY id DESC LIMIT 1"
    );
    
    let nextNumber = 'PC-001';
    
    if (rows.length > 0 && rows[0].voucher_number) {
      const lastNumber = rows[0].voucher_number;
      const match = lastNumber.match(/\d+$/);
      if (match) {
        const num = parseInt(match[0]) + 1;
        nextNumber = `PC-${String(num).padStart(3, '0')}`;
      }
    }
    
    res.json({ voucher_number: nextNumber });
  } catch (error) {
    console.error('Error generating voucher number:', error);
    // Return a fallback voucher number
    res.json({ voucher_number: `PC-${Date.now()}` });
  }
});

// =============================================
// GET Next Reference Number for Reimbursement
// =============================================
router.get('/petty-cash/next-reference-number', async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT reference_number FROM petty_cash_reimbursements ORDER BY id DESC LIMIT 1"
    );
    
    let nextNumber = 'REF-001';
    
    if (rows.length > 0 && rows[0].reference_number) {
      const lastNumber = rows[0].reference_number;
      const match = lastNumber.match(/\d+$/);
      if (match) {
        const num = parseInt(match[0]) + 1;
        nextNumber = `REF-${String(num).padStart(3, '0')}`;
      }
    }
    
    res.json({ reference_number: nextNumber });
  } catch (error) {
    console.error('Error generating reference number:', error);
    res.json({ reference_number: `REF-${Date.now()}` });
  }
});

// =============================================
// GET All Vouchers
// =============================================
router.get('/petty-cash/vouchers', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
        id, 
        voucher_number, 
        DATE_FORMAT(voucher_date, '%Y-%m-%d') as date,
        employee_name, 
        payee_name as payee, 
        expense_type, 
        description, 
        vehicle_number, 
        amount,
        status,
        DATE_FORMAT(created_at, '%Y-%m-%d') as created_date
       FROM petty_cash_vouchers 
       ORDER BY created_at DESC 
       LIMIT 100`
    );
    
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching vouchers:', error);
    // Return empty array instead of error
    res.json([]);
  }
});

// =============================================
// GET All Reimbursements
// =============================================
router.get('/petty-cash/reimbursements', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
        id, 
        reference_number, 
        DATE_FORMAT(reimbursement_date, '%Y-%m-%d') as date,
        amount,
        status,
        DATE_FORMAT(created_at, '%Y-%m-%d') as created_date
       FROM petty_cash_reimbursements 
       ORDER BY created_at DESC 
       LIMIT 100`
    );
    
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching reimbursements:', error);
    res.json([]);
  }
});

// =============================================
// POST Create Voucher
// =============================================
router.post('/petty-cash/voucher', authenticate, async (req, res) => {
  const { 
    voucher_number, 
    voucher_date, 
    employee_name, 
    payee_name, 
    expense_type, 
    description, 
    vehicle_number, 
    amount,
    receipt_no
  } = req.body;
  
  const userId = req.user.userId;

  // Validation
  if (!voucher_number || !voucher_date || !payee_name || !expense_type || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO petty_cash_vouchers 
       (voucher_number, voucher_date, employee_name, payee_name, 
        expense_type, description, vehicle_number, amount, receipt_no, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [
        voucher_number, 
        voucher_date, 
        employee_name || null, 
        payee_name, 
        expense_type, 
        description || null, 
        vehicle_number || null, 
        amount,
        receipt_no || null,
        userId
      ]
    );
    
    // Update balance after voucher creation
    await updatePettyCashBalance();
    
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Voucher created successfully' 
    });
  } catch (error) {
    console.error('Error creating voucher:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Voucher number already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create voucher' });
    }
  }
});

// =============================================
// PUT Update Voucher
// =============================================
router.put('/petty-cash/voucher/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { 
    voucher_date, 
    employee_name, 
    payee_name, 
    expense_type, 
    description, 
    vehicle_number, 
    amount,
    receipt_no
  } = req.body;
  
  const userId = req.user.userId;

  // Validation
  if (!voucher_date || !payee_name || !expense_type || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const [result] = await pool.query(
      `UPDATE petty_cash_vouchers 
       SET voucher_date = ?, employee_name = ?, payee_name = ?, 
           expense_type = ?, description = ?, vehicle_number = ?, 
           amount = ?, receipt_no = ?, updated_by = ?
       WHERE id = ?`,
      [
        voucher_date, 
        employee_name || null, 
        payee_name, 
        expense_type, 
        description || null, 
        vehicle_number || null, 
        amount, 
        receipt_no || null,
        userId,
        id
      ]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Voucher not found' });
    }
    
    // Update balance after voucher update
    await updatePettyCashBalance();
    
    res.json({ message: 'Voucher updated successfully' });
  } catch (error) {
    console.error('Error updating voucher:', error);
    res.status(500).json({ error: 'Failed to update voucher' });
  }
});

// =============================================
// POST Create Reimbursement
// =============================================
router.post('/petty-cash/reimbursement', authenticate, async (req, res) => {
  const { reference_number, reimbursement_date, amount } = req.body;
  const userId = req.user.userId;

  // Validation
  if (!reference_number || !reimbursement_date || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO petty_cash_reimbursements 
       (reference_number, reimbursement_date, amount, created_by, status)
       VALUES (?, ?, ?, ?, 'Completed')`,
      [reference_number, reimbursement_date, amount, userId]
    );
    
    // Update balance after reimbursement
    await updatePettyCashBalance();
    
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Reimbursement recorded successfully' 
    });
  } catch (error) {
    console.error('Error creating reimbursement:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Reference number already exists' });
    } else {
      res.status(500).json({ error: 'Failed to record reimbursement' });
    }
  }
});

// =============================================
// Helper function to update petty cash balance
// =============================================
async function updatePettyCashBalance() {
  try {
    // Get overall total vouchers
    const [voucherTotal] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM petty_cash_vouchers`
    );
    
    // Get overall total reimbursements
    const [reimbursementTotal] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM petty_cash_reimbursements`
    );
    
    // Get today's vouchers
    const [todayVoucherTotal] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM petty_cash_vouchers 
       WHERE DATE(voucher_date) = CURDATE()`
    );

    // Get today's reimbursements
    const [todayReimbursementTotal] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM petty_cash_reimbursements 
       WHERE DATE(reimbursement_date) = CURDATE()`
    );

    const totalVouchers = parseFloat(voucherTotal[0].total);
    const totalReimbursements = parseFloat(reimbursementTotal[0].total);
    const currentBalance = totalReimbursements - totalVouchers;
    
    const todayVouchers = parseFloat(todayVoucherTotal[0].total);
    const todayReimbursements = parseFloat(todayReimbursementTotal[0].total);
    const openingBalance = currentBalance - todayReimbursements + todayVouchers;

    // Update today's record in petty_cash_balance table
    await pool.query(
      `INSERT INTO petty_cash_balance 
       (balance_date, opening_balance, total_vouchers, total_reimbursements, closing_balance)
       VALUES (CURDATE(), ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       opening_balance = VALUES(opening_balance),
       total_vouchers = VALUES(total_vouchers),
       total_reimbursements = VALUES(total_reimbursements),
       closing_balance = VALUES(closing_balance)`,
      [openingBalance, todayVouchers, todayReimbursements, currentBalance]
    );
    
  } catch (error) {
    console.error('Error updating petty cash balance table:', error);
  }
}

// GET all cheque vouchers
router.get('/cheque/vouchers', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(bill_date, '%Y-%m-%d') as date, 
              voucher_number, cheque_number, payee_name, 
              total_bill_amount as amount, is_realised
       FROM cheque_expenses 
       ORDER BY created_at DESC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching cheque vouchers:', error);
    res.json([]);
  }
});

// GET unrealised cheques
router.get('/cheque/unrealised', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(bill_date, '%Y-%m-%d') as date, 
              voucher_number, cheque_number, payee_name, 
              total_bill_amount as amount, is_realised, realise_date
       FROM cheque_expenses 
       WHERE is_realised = 0
       ORDER BY bill_date DESC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching unrealised cheques:', error);
    res.json([]);
  }
});

// POST create cheque voucher
router.post('/cheque/voucher', authenticate, async (req, res) => {
  const { 
    bill_date, bill_number, payee_name, vat_reg_number, 
    expense_type, without_vat_amount, vat_amount, 
    total_bill_amount, description 
  } = req.body;
  const userId = req.user.userId;

  // Generate voucher number and cheque number
  const voucher_number = `CHQ-${Date.now()}`;
  const cheque_number = `CHQ-${Math.floor(Math.random() * 1000000)}`;

  try {
    const [result] = await pool.query(
      `INSERT INTO cheque_expenses 
       (bill_date, bill_number, payee_name, vat_reg_number, expense_type, 
        without_vat_amount, vat_amount, total_bill_amount, description, 
        voucher_number, cheque_number, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bill_date, bill_number, payee_name, vat_reg_number, expense_type,
       without_vat_amount, vat_amount, total_bill_amount, description,
       voucher_number, cheque_number, userId]
    );
    
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Cheque expense voucher created successfully',
      voucher_number,
      cheque_number
    });
  } catch (error) {
    console.error('Error creating cheque voucher:', error);
    res.status(500).json({ error: 'Failed to create cheque voucher' });
  }
});

// PUT realise cheque
router.put('/cheque/realise/:id', async (req, res) => {
  const { id } = req.params;
  const { realise_date } = req.body;

  try {
    await pool.query(
      `UPDATE cheque_expenses 
       SET is_realised = 1, realise_date = ?
       WHERE id = ?`,
      [realise_date, id]
    );
    
    res.json({ message: 'Cheque realised successfully' });
  } catch (error) {
    console.error('Error realising cheque:', error);
    res.status(500).json({ error: 'Failed to realise cheque' });
  }
});

// GET all bank charges
router.get('/bank-charges', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(charge_date, '%Y-%m-%d') as date, 
              bank_name, reference_number, charges_type, description, amount
       FROM bank_charges 
       ORDER BY charge_date DESC, created_at DESC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching bank charges:', error);
    res.json([]);
  }
});

// POST create bank charge
router.post('/bank-charges', authenticate, async (req, res) => {
  const { date, bank_name, reference_number, charges_type, description, amount } = req.body;
  const userId = req.user.userId;

  // Validation
  if (!date || !bank_name || !charges_type || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO bank_charges 
       (charge_date, bank_name, reference_number, charges_type, description, amount, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [date, bank_name, reference_number || null, charges_type, description || null, amount, userId]
    );
    
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Bank charge recorded successfully' 
    });
  } catch (error) {
    console.error('Error creating bank charge:', error);
    res.status(500).json({ error: 'Failed to record bank charge' });
  }
});

// PUT update bank charge
router.put('/bank-charges/:id', async (req, res) => {
  const { id } = req.params;
  const { date, bank_name, reference_number, charges_type, description, amount } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE bank_charges 
       SET charge_date = ?, bank_name = ?, reference_number = ?, 
           charges_type = ?, description = ?, amount = ?
       WHERE id = ?`,
      [date, bank_name, reference_number || null, charges_type, description || null, amount, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Bank charge not found' });
    }
    
    res.json({ message: 'Bank charge updated successfully' });
  } catch (error) {
    console.error('Error updating bank charge:', error);
    res.status(500).json({ error: 'Failed to update bank charge' });
  }
});

// DELETE bank charge
router.delete('/bank-charges/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      'DELETE FROM bank_charges WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Bank charge not found' });
    }
    
    res.json({ message: 'Bank charge deleted successfully' });
  } catch (error) {
    console.error('Error deleting bank charge:', error);
    res.status(500).json({ error: 'Failed to delete bank charge' });
  }
});

// Add these to your existing expenseRoutes.js

// GET all online expenses
router.get('/online', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(bill_date, '%Y-%m-%d') as bill_date, 
              bill_number, payee_name, vat_reg_number, expense_type,
              without_vat_amount, vat_amount, total_bill_amount, 
              balance, description
       FROM online_expenses 
       ORDER BY bill_date DESC, created_at DESC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching online expenses:', error);
    res.json([]);
  }
});

// POST create online expense
router.post('/online', authenticate, async (req, res) => {
  const { 
    bill_date, bill_number, payee_name, vat_reg_number, 
    expense_type, without_vat_amount, vat_amount, 
    total_bill_amount, description 
  } = req.body;
  const userId = req.user.userId;

  // Validation
  if (!bill_date || !payee_name || !expense_type || !without_vat_amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO online_expenses 
       (bill_date, bill_number, payee_name, vat_reg_number, expense_type, 
        without_vat_amount, vat_amount, total_bill_amount, balance, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [bill_date, bill_number || null, payee_name, vat_reg_number || null, expense_type,
       without_vat_amount, vat_amount || 0, total_bill_amount, description || null, userId]
    );
    
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Online expense recorded successfully' 
    });
  } catch (error) {
    console.error('Error creating online expense:', error);
    res.status(500).json({ error: 'Failed to record online expense' });
  }
});

// PUT update online expense
router.put('/online/:id', async (req, res) => {
  const { id } = req.params;
  const { 
    bill_date, bill_number, payee_name, vat_reg_number, 
    expense_type, without_vat_amount, vat_amount, 
    total_bill_amount, description 
  } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE online_expenses 
       SET bill_date = ?, bill_number = ?, payee_name = ?, 
           vat_reg_number = ?, expense_type = ?, without_vat_amount = ?,
           vat_amount = ?, total_bill_amount = ?, description = ?
       WHERE id = ?`,
      [bill_date, bill_number || null, payee_name, vat_reg_number || null, 
       expense_type, without_vat_amount, vat_amount || 0, total_bill_amount, 
       description || null, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Online expense not found' });
    }
    
    res.json({ message: 'Online expense updated successfully' });
  } catch (error) {
    console.error('Error updating online expense:', error);
    res.status(500).json({ error: 'Failed to update online expense' });
  }
});

// DELETE online expense
router.delete('/online/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      'DELETE FROM online_expenses WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Online expense not found' });
    }
    
    res.json({ message: 'Online expense deleted successfully' });
  } catch (error) {
    console.error('Error deleting online expense:', error);
    res.status(500).json({ error: 'Failed to delete online expense' });
  }
});

// =============================================
// BANK DETAILS API ENDPOINTS
// =============================================

// GET all banks (for dropdown) - active only
router.get('/banks', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, bank_name 
       FROM bank_details 
       ORDER BY bank_name ASC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching banks:', error);
    res.status(500).json({ error: 'Failed to fetch banks' });
  }
});

// GET all banks including inactive (for Bank Details management page)
router.get('/banks/all', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, bank_name, account_number, branch_name, account_type,
              currency, opening_balance, current_balance,
              contact_person, contact_phone, contact_email,
              notes, status
       FROM bank_details 
       ORDER BY bank_name ASC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching all banks:', error);
    res.status(500).json({ error: 'Failed to fetch banks' });
  }
});

// GET single bank by ID
router.get('/banks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT * FROM bank_details WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Bank not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching bank:', error);
    res.status(500).json({ error: 'Failed to fetch bank' });
  }
});

// POST create new bank
router.post('/banks', authenticate, async (req, res) => {
  const {
    bank_name,
    account_number,
    branch_name,
    account_type,
    currency,
    opening_balance,
    current_balance,
    contact_person,
    contact_phone,
    contact_email,
    notes
  } = req.body;
  
  const userId = req.user.userId;

  // Validation
  if (!bank_name) {
    return res.status(400).json({ error: 'Bank name is required' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO bank_details 
       (bank_name, account_number, branch_name, account_type, currency, 
        opening_balance, current_balance, contact_person, contact_phone, 
        contact_email, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bank_name,
        account_number || null,
        branch_name || null,
        account_type || 'Current',
        currency || 'LKR',
        opening_balance || 0,
        current_balance || opening_balance || 0,
        contact_person || null,
        contact_phone || null,
        contact_email || null,
        notes || null,
        userId
      ]
    );
    
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Bank added successfully' 
    });
  } catch (error) {
    console.error('Error creating bank:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Bank name already exists' });
    }
    res.status(500).json({ error: 'Failed to add bank' });
  }
});

// PUT update bank
router.put('/banks/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const {
    bank_name,
    account_number,
    branch_name,
    account_type,
    currency,
    opening_balance,
    current_balance,
    contact_person,
    contact_phone,
    contact_email,
    notes,
    status
  } = req.body;

  if (!bank_name) {
    return res.status(400).json({ error: 'Bank name is required' });
  }

  try {
    const [result] = await pool.query(
      `UPDATE bank_details 
       SET bank_name = ?, account_number = ?, branch_name = ?, 
           account_type = ?, currency = ?, opening_balance = ?, 
           current_balance = ?, contact_person = ?, contact_phone = ?, 
           contact_email = ?, notes = ?, status = ?
       WHERE id = ?`,
      [
        bank_name,
        account_number || null,
        branch_name || null,
        account_type || 'Current',
        currency || 'LKR',
        opening_balance || 0,
        current_balance || 0,
        contact_person || null,
        contact_phone || null,
        contact_email || null,
        notes || null,
        status || 'Active',
        id
      ]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Bank not found' });
    }
    
    res.json({ message: 'Bank updated successfully' });
  } catch (error) {
    console.error('Error updating bank:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Bank name already exists' });
    }
    res.status(500).json({ error: 'Failed to update bank' });
  }
});

// DELETE bank (soft delete by setting status to Inactive)
router.delete('/banks/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      'UPDATE bank_details SET status = "Inactive" WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Bank not found' });
    }
    
    res.json({ message: 'Bank deleted successfully' });
  } catch (error) {
    console.error('Error deleting bank:', error);
    res.status(500).json({ error: 'Failed to delete bank' });
  }
});

module.exports = router;