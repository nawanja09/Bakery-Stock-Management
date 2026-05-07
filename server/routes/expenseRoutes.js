const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// =============================================
// GET Petty Cash Balance
// =============================================
router.get('/petty-cash/balance', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT closing_balance as balance 
       FROM petty_cash_balance 
       ORDER BY balance_date DESC 
       LIMIT 1`
    );
    
    let balance = 112546.00; // Default balance
    
    if (rows.length > 0 && rows[0].balance !== null) {
      balance = parseFloat(rows[0].balance);
    } else {
      // If no records exist, create initial balance
      await pool.query(
        `INSERT INTO petty_cash_balance (balance_date, opening_balance, closing_balance) 
         VALUES (CURDATE(), ?, ?)`,
        [balance, balance]
      );
    }
    
    res.json({ balance: balance });
  } catch (error) {
    console.error('Error fetching petty cash balance:', error);
    // Return default balance instead of error
    res.json({ balance: 112546.00 });
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
router.post('/petty-cash/voucher', async (req, res) => {
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
  
  const userId = req.user.id;

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
router.put('/petty-cash/voucher/:id', async (req, res) => {
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
  
  const userId = req.user.id;

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
router.post('/petty-cash/reimbursement', async (req, res) => {
  const { reference_number, reimbursement_date, amount } = req.body;
  const userId = req.user.id;

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
    // Get total vouchers for today
    const [voucherTotal] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM petty_cash_vouchers 
       WHERE DATE(voucher_date) = CURDATE()`
    );
    
    // Get total reimbursements for today
    const [reimbursementTotal] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM petty_cash_reimbursements 
       WHERE DATE(reimbursement_date) = CURDATE()`
    );
    
    // Get previous closing balance
    const [prevBalance] = await pool.query(
      `SELECT closing_balance 
       FROM petty_cash_balance 
       WHERE balance_date < CURDATE() 
       ORDER BY balance_date DESC 
       LIMIT 1`
    );
    
    const openingBalance = prevBalance.length > 0 ? parseFloat(prevBalance[0].closing_balance) : 112546.00;
    const totalVouchers = parseFloat(voucherTotal[0].total);
    const totalReimbursements = parseFloat(reimbursementTotal[0].total);
    const closingBalance = openingBalance - totalVouchers + totalReimbursements;
    
    // Insert or update today's balance
    await pool.query(
      `INSERT INTO petty_cash_balance 
       (balance_date, opening_balance, total_vouchers, total_reimbursements, closing_balance)
       VALUES (CURDATE(), ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       total_vouchers = VALUES(total_vouchers),
       total_reimbursements = VALUES(total_reimbursements),
       closing_balance = VALUES(closing_balance)`,
      [openingBalance, totalVouchers, totalReimbursements, closingBalance]
    );
    
  } catch (error) {
    console.error('Error updating petty cash balance:', error);
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
router.post('/cheque/voucher', async (req, res) => {
  const { 
    bill_date, bill_number, payee_name, vat_reg_number, 
    expense_type, without_vat_amount, vat_amount, 
    total_bill_amount, description 
  } = req.body;
  const userId = req.user.id;

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
router.post('/bank-charges', async (req, res) => {
  const { date, bank_name, reference_number, charges_type, description, amount } = req.body;
  const userId = req.user.id;

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
router.post('/online', async (req, res) => {
  const { 
    bill_date, bill_number, payee_name, vat_reg_number, 
    expense_type, without_vat_amount, vat_amount, 
    total_bill_amount, description 
  } = req.body;
  const userId = req.user.id;

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

module.exports = router;