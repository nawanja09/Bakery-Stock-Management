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
    amount 
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
        expense_type, description, vehicle_number, amount, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [
        voucher_number, 
        voucher_date, 
        employee_name || null, 
        payee_name, 
        expense_type, 
        description || null, 
        vehicle_number || null, 
        amount, 
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

module.exports = router;