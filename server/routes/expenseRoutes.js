const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticate = require('../middleware/authenticate');
const restrictRoles = require('../middleware/restrictRoles');
const { recordCashTransaction, recordBankTransaction } = require('../utils/financeLedger');
const { checkDuplicateReference, DuplicateReferenceError } = require('../services/referenceValidationService');

router.use(authenticate, restrictRoles('Store Keeper', 'Stores'));

// =============================================
// GET Petty Cash Balance
// =============================================
router.get('/petty-cash/balance', async (req, res) => {
  try {
    const [reimbursementRows] = await pool.query(
      'SELECT SUM(amount) as total FROM petty_cash_reimbursements'
    );
    const totalReimbursements = parseFloat(reimbursementRows[0].total) || 0;

    const [voucherRows] = await pool.query(
      'SELECT SUM(amount) as total FROM petty_cash_vouchers'
    );
    const totalVouchers = parseFloat(voucherRows[0].total) || 0;

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
        receipt_no,
        status,
        DATE_FORMAT(created_at, '%Y-%m-%d') as created_date
       FROM petty_cash_vouchers 
       ORDER BY created_at DESC 
       LIMIT 100`
    );
    
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching vouchers:', error);
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
        r.id, 
        r.reference_number, 
        DATE_FORMAT(r.reimbursement_date, '%Y-%m-%d') as date,
        r.amount,
        r.funding_source,
        r.company_id,
        r.bank_id,
        r.status,
        u.name as created_by_name,
        DATE_FORMAT(r.created_at, '%Y-%m-%d') as created_date
       FROM petty_cash_reimbursements r
       LEFT JOIN users u ON r.created_by = u.id
       ORDER BY r.created_at DESC 
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

  if (!voucher_number || !voucher_date || !payee_name || !expense_type || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await checkDuplicateReference(connection, voucher_number);

    const [result] = await connection.query(
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

    // Identify the relevant petty cash/cash account
    const [cashAcc] = await connection.query('SELECT company_id FROM cash_accounts LIMIT 1');
    const companyId = cashAcc.length > 0 ? cashAcc[0].company_id : 1;

    // Automatically create a Credit Ledger Entry in that Cash Ledger (Expense = Credit to Cash)
    await recordCashTransaction(connection, {
      companyId: companyId,
      date: voucher_date,
      remark: `Petty Cash Payment - ${expense_type}`,
      credit: parseFloat(amount),
      transactionType: 'Petty Cash Payment',
      referenceNumber: voucher_number,
      partyName: payee_name,
      referenceType: 'PETTY_CASH_VOUCHER',
      referenceId: result.insertId,
      createdBy: userId
    });
    
    await connection.commit();
    await updatePettyCashBalance();
    
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Voucher created successfully' 
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating voucher:', error);
    if (error.code === 'ER_DUP_ENTRY' || error.name === 'DuplicateReferenceError') {
      res.status(400).json({ error: error.name === 'DuplicateReferenceError' ? error.message : 'Voucher number already exists' });
    } else if (error.name === 'InsufficientBalanceError') {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to create voucher' });
    }
  } finally {
    connection.release();
  }
});

// =============================================
// PUT Update Voucher
// =============================================
router.put('/petty-cash/voucher/:id', authenticate, async (req, res) => {
  const { id } = req.params;
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

  if (!voucher_number || !voucher_date || !payee_name || !expense_type || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await checkDuplicateReference(connection, voucher_number, { table: 'petty_cash_vouchers', id });

    const [oldRows] = await connection.query('SELECT amount FROM petty_cash_vouchers WHERE id = ? FOR UPDATE', [id]);
    if (oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Voucher not found' });
    }

    const [result] = await connection.query(
      `UPDATE petty_cash_vouchers 
       SET voucher_number = ?, voucher_date = ?, employee_name = ?, payee_name = ?, 
           expense_type = ?, description = ?, vehicle_number = ?, 
           amount = ?, receipt_no = ?, updated_by = ?
       WHERE id = ?`,
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
        userId,
        id
      ]
    );
    
    // Sync ledger entry
    const [finRows] = await connection.query(
      'SELECT id, credit, company_id FROM finance_transactions WHERE reference_type = "PETTY_CASH_VOUCHER" AND reference_id = ?',
      [id]
    );
    
    if (finRows.length > 0) {
      const finId = finRows[0].id;
      const oldCredit = parseFloat(finRows[0].credit) || 0;
      const newCredit = parseFloat(amount) || 0;
      const difference = newCredit - oldCredit;
      
      if (difference !== 0) {
        await connection.query(
          'UPDATE cash_accounts SET current_balance = current_balance - ? WHERE company_id = ?',
          [difference, finRows[0].company_id]
        );
        await connection.query(
          'UPDATE finance_transactions SET credit = ?, transaction_date = ?, remark = ? WHERE id = ?',
          [newCredit, voucher_date, `Petty Cash Payment - ${expense_type}`, finId]
        );
      } else {
        await connection.query(
          'UPDATE finance_transactions SET transaction_date = ?, remark = ? WHERE id = ?',
          [voucher_date, `Petty Cash Payment - ${expense_type}`, finId]
        );
      }
    }

    await connection.commit();
    await updatePettyCashBalance();
    
    res.json({ message: 'Voucher updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating voucher:', error);
    if (error.code === 'ER_DUP_ENTRY' || error.name === 'DuplicateReferenceError') {
      res.status(400).json({ error: error.name === 'DuplicateReferenceError' ? error.message : 'Voucher number already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update voucher' });
    }
  } finally {
    connection.release();
  }
});

// =============================================
// DELETE Voucher
// =============================================
router.delete('/petty-cash/voucher/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [oldRows] = await connection.query('SELECT amount FROM petty_cash_vouchers WHERE id = ? FOR UPDATE', [id]);
    if (oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Voucher not found' });
    }

    await connection.query(
      'DELETE FROM petty_cash_vouchers WHERE id = ?',
      [id]
    );

    // Revert ledger entry
    const [finRows] = await connection.query(
      'SELECT id, credit, company_id FROM finance_transactions WHERE reference_type = "PETTY_CASH_VOUCHER" AND reference_id = ?',
      [id]
    );
    if (finRows.length > 0) {
      const oldCredit = parseFloat(finRows[0].credit) || 0;
      await connection.query(
        'UPDATE cash_accounts SET current_balance = current_balance + ? WHERE company_id = ?',
        [oldCredit, finRows[0].company_id]
      );
      await connection.query('DELETE FROM finance_transactions WHERE id = ?', [finRows[0].id]);
    }

    await connection.commit();
    await updatePettyCashBalance();

    res.json({ message: 'Voucher deleted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting voucher:', error);
    res.status(500).json({ error: 'Failed to delete voucher' });
  } finally {
    connection.release();
  }
});

// =============================================
// POST Create Reimbursement
// =============================================
router.post('/petty-cash/reimbursement', authenticate, async (req, res) => {
  const { reference_number, reimbursement_date, amount, company_id, funding_source, bank_id } = req.body;
  const userId = req.user.userId;

  if (!reference_number || !reimbursement_date || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (funding_source && !['CASH', 'BANK'].includes(funding_source)) {
    return res.status(400).json({ error: 'Funding source must be Cash or Bank' });
  }
  if (funding_source === 'CASH' && !company_id) {
    return res.status(400).json({ error: 'Company is required when funding from Cash' });
  }
  if (funding_source === 'BANK' && !bank_id) {
    return res.status(400).json({ error: 'Bank account is required when funding from Bank' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await checkDuplicateReference(connection, reference_number);

    const [result] = await connection.query(
      `INSERT INTO petty_cash_reimbursements 
       (reference_number, reimbursement_date, amount, company_id, funding_source, bank_id, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Completed')`,
      [reference_number, reimbursement_date, amount, company_id || null, funding_source || null, bank_id || null, userId]
    );

    // A reimbursement tops up the petty cash float from the company's real
    // Cash or Bank account - that's the point where money actually leaves
    // Finance's books. Spending the float later (Vouchers) doesn't touch
    // Finance again, since this is where that money already left.
    if (funding_source === 'CASH') {
      await recordCashTransaction(connection, {
        companyId: company_id,
        date: reimbursement_date,
        remark: `Petty cash reimbursement - ${reference_number}`,
        credit: parseFloat(amount),
        transactionType: 'Petty Cash Reimbursement',
        referenceNumber: reference_number,
        referenceType: 'PETTY_CASH_REIMBURSEMENT',
        referenceId: result.insertId,
        createdBy: userId
      });
    } else if (funding_source === 'BANK') {
      await recordBankTransaction(connection, {
        bankId: bank_id,
        date: reimbursement_date,
        remark: `Petty cash reimbursement - ${reference_number}`,
        credit: parseFloat(amount),
        transactionType: 'Petty Cash Reimbursement',
        referenceNumber: reference_number,
        referenceType: 'PETTY_CASH_REIMBURSEMENT',
        referenceId: result.insertId,
        createdBy: userId
      });
    }

    await connection.commit();
    await updatePettyCashBalance();

    res.status(201).json({ 
      id: result.insertId, 
      message: 'Reimbursement recorded successfully' 
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating reimbursement:', error);
    if (error.name === 'DuplicateReferenceError' || error.name === 'InsufficientBalanceError') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Reference number already exists' });
    } else {
      res.status(500).json({ error: 'Failed to record reimbursement: ' + error.message });
    }
  } finally {
    connection.release();
  }
});

// =============================================
// PUT Update Reimbursement
// =============================================
router.put('/petty-cash/reimbursement/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { reference_number, reimbursement_date, amount } = req.body;
  const userId = req.user.userId;

  if (!reference_number || !reimbursement_date || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await checkDuplicateReference(connection, reference_number, { table: 'petty_cash_reimbursements', id });
    const [result] = await connection.query(
      `UPDATE petty_cash_reimbursements 
       SET reference_number = ?, reimbursement_date = ?, amount = ?, updated_by = ?
       WHERE id = ?`,
      [reference_number, reimbursement_date, amount, userId, id]
    );
    
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Reimbursement not found' });
    }
    await connection.commit();
    await updatePettyCashBalance();
    
    res.json({ message: 'Reimbursement updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating reimbursement:', error);
    if (error.code === 'ER_DUP_ENTRY' || error.name === 'DuplicateReferenceError') {
      res.status(400).json({ error: error.name === 'DuplicateReferenceError' ? error.message : 'Duplicate reference number. This number already exists and cannot be used again.' });
    } else {
      res.status(500).json({ error: 'Failed to update reimbursement' });
    }
  } finally {
    connection.release();
  }
});

// =============================================
// Helper function to update petty cash balance
// =============================================
async function updatePettyCashBalance() {
  try {
    const [voucherTotal] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM petty_cash_vouchers`
    );
    
    const [reimbursementTotal] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM petty_cash_reimbursements`
    );
    
    const [todayVoucherTotal] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM petty_cash_vouchers 
       WHERE DATE(voucher_date) = CURDATE()`
    );

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

// =============================================
// CHEQUE EXPENSES ROUTES
// =============================================

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
      `SELECT ce.id, DATE_FORMAT(ce.bill_date, '%Y-%m-%d') as date, 
              ce.bill_number, ce.payee_name, ce.vat_reg_number, ce.expense_type,
              ce.without_vat_amount, ce.vat_amount, ce.total_bill_amount as amount,
              ce.description, ce.voucher_number, ce.cheque_number, ce.is_realised,
              DATE_FORMAT(ce.realise_date, '%Y-%m-%d') as realise_date,
              ce.company_id, c.name as company_name
       FROM cheque_expenses ce
       LEFT JOIN company c ON ce.company_id = c.id
       WHERE ce.is_realised = 0
       ORDER BY ce.bill_date DESC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching unrealised cheques:', error);
    res.json([]);
  }
});

// GET realised cheques
router.get('/cheque/realised', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ce.id, DATE_FORMAT(ce.bill_date, '%Y-%m-%d') as date, 
              ce.bill_number, ce.payee_name, ce.vat_reg_number, ce.expense_type,
              ce.without_vat_amount, ce.vat_amount, ce.total_bill_amount as amount,
              ce.description, ce.voucher_number, ce.cheque_number, ce.is_realised, 
              DATE_FORMAT(ce.realise_date, '%Y-%m-%d') as realise_date,
              ce.company_id, c.name as company_name, ce.bank_id, bd.bank_name
       FROM cheque_expenses ce
       LEFT JOIN company c ON ce.company_id = c.id
       LEFT JOIN bank_details bd ON ce.bank_id = bd.id
       WHERE ce.is_realised = 1
       ORDER BY ce.realise_date DESC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching realised cheques:', error);
    res.json([]);
  }
});

// GET single cheque voucher by id
router.get('/cheque/voucher/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(bill_date, '%Y-%m-%d') as bill_date, bill_number,
              payee_name, vat_reg_number, expense_type, without_vat_amount,
              vat_amount, total_bill_amount, description, voucher_number,
              cheque_number, is_realised, DATE_FORMAT(realise_date, '%Y-%m-%d') as realise_date,
              company_id, bank_id
       FROM cheque_expenses
       WHERE id = ?`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Cheque voucher not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching cheque voucher:', error);
    res.status(500).json({ error: 'Failed to fetch cheque voucher' });
  }
});

// PUT update cheque voucher
router.put('/cheque/voucher/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const {
    bill_date, bill_number, payee_name, vat_reg_number,
    expense_type, without_vat_amount, vat_amount,
    total_bill_amount, description, company_id
  } = req.body;

  if (!bill_date || !payee_name || !expense_type || !without_vat_amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const [result] = await pool.query(
      `UPDATE cheque_expenses
       SET bill_date = ?, company_id = ?, bill_number = ?, payee_name = ?, vat_reg_number = ?,
           expense_type = ?, without_vat_amount = ?, vat_amount = ?,
           total_bill_amount = ?, description = ?
       WHERE id = ?`,
      [
        bill_date,
        company_id || null,
        bill_number || null,
        payee_name,
        vat_reg_number || null,
        expense_type,
        without_vat_amount,
        vat_amount || 0,
        total_bill_amount,
        description || null,
        id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Cheque voucher not found' });
    }

    res.json({ message: 'Cheque voucher updated successfully' });
  } catch (error) {
    console.error('Error updating cheque voucher:', error);
    res.status(500).json({ error: 'Failed to update cheque voucher' });
  }
});

// DELETE cheque voucher
router.delete('/cheque/voucher/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      'DELETE FROM cheque_expenses WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Cheque voucher not found' });
    }

    res.json({ message: 'Cheque voucher deleted successfully' });
  } catch (error) {
    console.error('Error deleting cheque voucher:', error);
    res.status(500).json({ error: 'Failed to delete cheque voucher' });
  }
});

// POST create cheque voucher
router.post('/cheque/voucher', authenticate, async (req, res) => {
  const { 
    bill_date, bill_number, payee_name, vat_reg_number, 
    expense_type, without_vat_amount, vat_amount, 
    total_bill_amount, description, company_id
  } = req.body;
  const userId = req.user.userId;

  const voucher_number = `CHQ-${Date.now()}`;
  const cheque_number = `CHQ-${Math.floor(Math.random() * 1000000)}`;

  try {
    const [result] = await pool.query(
      `INSERT INTO cheque_expenses 
       (bill_date, company_id, bill_number, payee_name, vat_reg_number, expense_type, 
        without_vat_amount, vat_amount, total_bill_amount, description, 
        voucher_number, cheque_number, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bill_date, company_id || null, bill_number, payee_name, vat_reg_number, expense_type,
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
router.put('/cheque/realise/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { realise_date, bank_id } = req.body;
  const userId = req.user.userId;

  if (!realise_date) {
    return res.status(400).json({ error: 'Realise date is required' });
  }
  if (!bank_id) {
    return res.status(400).json({ error: 'Bank account is required to realise a cheque' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [chequeRows] = await connection.query(
      'SELECT id, payee_name, total_bill_amount, cheque_number, is_realised FROM cheque_expenses WHERE id = ? FOR UPDATE',
      [id]
    );
    if (chequeRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Cheque not found' });
    }
    if (chequeRows[0].is_realised) {
      await connection.rollback();
      return res.status(400).json({ error: 'This cheque has already been realised' });
    }
    const cheque = chequeRows[0];

    const [result] = await connection.query(
      `UPDATE cheque_expenses 
       SET is_realised = 1, realise_date = ?, bank_id = ?
       WHERE id = ?`,
      [realise_date, bank_id, id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Cheque not found' });
    }

    // Money leaves the bank account the moment the cheque clears, not when
    // it was written - so the ledger entry is posted here, at realise time.
    await recordBankTransaction(connection, {
      bankId: bank_id,
      date: realise_date,
      remark: `Cheque expense - ${cheque.cheque_number}`,
      credit: parseFloat(cheque.total_bill_amount),
      transactionType: 'Cheque Expense',
      referenceNumber: cheque.cheque_number,
      partyName: cheque.payee_name,
      referenceType: 'CHEQUE_EXPENSE',
      referenceId: cheque.id,
      createdBy: userId
    });

    await connection.commit();
    res.json({ message: 'Cheque realised successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error realising cheque:', error);
    if (error.name === 'InsufficientBalanceError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to realise cheque: ' + error.message });
  } finally {
    connection.release();
  }
});

// =============================================
// BANK CHARGES ROUTES
// =============================================

// GET all bank charges
router.get('/bank-charges', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(charge_date, '%Y-%m-%d') as date, 
              bank_name, bank_id, reference_number, charges_type, bank_charge_type_id, description, amount
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
  const { date, bank_name, bank_id, reference_number, charges_type, bank_charge_type_id, description, amount } = req.body;
  const userId = req.user.userId;

  if (!date || !bank_name || !charges_type || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await checkDuplicateReference(connection, reference_number);

    const [result] = await connection.query(
      `INSERT INTO bank_charges 
       (charge_date, bank_name, bank_id, reference_number, charges_type, bank_charge_type_id, description, amount, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, bank_name, bank_id || null, reference_number || null, charges_type, bank_charge_type_id || null, description || null, amount, userId]
    );

    // Bank charges leave the account immediately - post the ledger entry now,
    // but only if a real bank account was selected (older/free-text-only
    // entries without a bank_id are saved without a ledger post).
    if (bank_id) {
      await recordBankTransaction(connection, {
        bankId: bank_id,
        date,
        remark: `Bank charge - ${charges_type}`,
        credit: parseFloat(amount),
        transactionType: 'Bank Charges',
        referenceNumber: reference_number || null,
        referenceType: 'BANK_CHARGE',
        referenceId: result.insertId,
        createdBy: userId
      });
    }

    await connection.commit();
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Bank charge recorded successfully' 
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating bank charge:', error);
    if (error.name === 'DuplicateReferenceError' || error.name === 'InsufficientBalanceError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to record bank charge: ' + error.message });
  } finally {
    connection.release();
  }
});

// PUT update bank charge
router.put('/bank-charges/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { date, bank_name, bank_id, reference_number, charges_type, bank_charge_type_id, description, amount } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await checkDuplicateReference(connection, reference_number, { table: 'bank_charges', id });

    const [oldRows] = await connection.query('SELECT amount, bank_id FROM bank_charges WHERE id = ? FOR UPDATE', [id]);
    if (oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Bank charge not found' });
    }
    
    // The previous bank_id (if not explicitly passed in update, though we should expect it)
    const oldBankId = oldRows[0].bank_id;
    const newBankId = bank_id !== undefined ? bank_id : oldBankId;

    const [result] = await connection.query(
      `UPDATE bank_charges 
       SET charge_date = ?, bank_name = ?, bank_id = ?, reference_number = ?, 
           charges_type = ?, bank_charge_type_id = ?, description = ?, amount = ?
       WHERE id = ?`,
      [date, bank_name, newBankId || null, reference_number || null, charges_type, bank_charge_type_id || null, description || null, amount, id]
    );
    
    if (oldBankId) {
      // Find the finance transaction
      const [finRows] = await connection.query(
        'SELECT id, credit FROM finance_transactions WHERE reference_type = "BANK_CHARGE" AND reference_id = ?',
        [id]
      );
      if (finRows.length > 0) {
        const finId = finRows[0].id;
        const oldCredit = parseFloat(finRows[0].credit) || 0;
        const newCredit = parseFloat(amount) || 0;
        
        if (oldBankId === newBankId) {
          const difference = newCredit - oldCredit;
          if (difference !== 0) {
            await connection.query('UPDATE bank_details SET current_balance = current_balance - ? WHERE id = ?', [difference, oldBankId]);
          }
          await connection.query(
            'UPDATE finance_transactions SET credit = ?, transaction_date = ?, remark = ?, reference_number = ? WHERE id = ?',
            [newCredit, date, `Bank charge - ${charges_type}`, reference_number || null, finId]
          );
        } else {
          // Bank changed - revert old, apply new
          await connection.query('UPDATE bank_details SET current_balance = current_balance + ? WHERE id = ?', [oldCredit, oldBankId]);
          await connection.query('UPDATE bank_details SET current_balance = current_balance - ? WHERE id = ?', [newCredit, newBankId]);
          await connection.query(
            'UPDATE finance_transactions SET bank_id = ?, credit = ?, transaction_date = ?, remark = ?, reference_number = ? WHERE id = ?',
            [newBankId, newCredit, date, `Bank charge - ${charges_type}`, reference_number || null, finId]
          );
        }
      }
    } else if (newBankId) {
      // Edge case: previously no bank_id, but now one is provided.
      await recordBankTransaction(connection, {
        bankId: newBankId,
        date,
        remark: `Bank charge - ${charges_type}`,
        credit: parseFloat(amount),
        transactionType: 'Bank Charges',
        referenceNumber: reference_number || null,
        referenceType: 'BANK_CHARGE',
        referenceId: id,
        createdBy: req.user.userId
      });
    }

    await connection.commit();
    res.json({ message: 'Bank charge updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating bank charge:', error);
    res.status(error.name === 'DuplicateReferenceError' ? 400 : 500).json({ error: error.name === 'DuplicateReferenceError' ? error.message : 'Failed to update bank charge' });
  } finally {
    connection.release();
  }
});

// DELETE bank charge
router.delete('/bank-charges/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [oldRows] = await connection.query('SELECT amount, bank_id FROM bank_charges WHERE id = ? FOR UPDATE', [id]);
    if (oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Bank charge not found' });
    }

    await connection.query('DELETE FROM bank_charges WHERE id = ?', [id]);
    
    if (oldRows[0].bank_id) {
      const [finRows] = await connection.query(
        'SELECT id, credit FROM finance_transactions WHERE reference_type = "BANK_CHARGE" AND reference_id = ?', [id]
      );
      if (finRows.length > 0) {
        const oldCredit = parseFloat(finRows[0].credit) || 0;
        await connection.query('UPDATE bank_details SET current_balance = current_balance + ? WHERE id = ?', [oldCredit, oldRows[0].bank_id]);
        await connection.query('DELETE FROM finance_transactions WHERE id = ?', [finRows[0].id]);
      }
    }
    
    await connection.commit();
    res.json({ message: 'Bank charge deleted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting bank charge:', error);
    res.status(500).json({ error: 'Failed to delete bank charge' });
  } finally {
    connection.release();
  }
});

// =============================================
// ONLINE EXPENSES ROUTES - ✅ FIXED
// =============================================

// GET all online expenses
router.get('/online', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(bill_date, '%Y-%m-%d') as bill_date, 
              bill_number, payee_name, vat_reg_number, expense_type,
              without_vat_amount, vat_amount, total_bill_amount, 
              balance, description, payment_status, paid_amount,
              DATE_FORMAT(payment_date, '%Y-%m-%d') as payment_date
       FROM online_expenses 
       ORDER BY bill_date DESC, created_at DESC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching online expenses:', error);
    res.json([]);
  }
});

// POST create online expense - ✅ FIXED: balance = total_bill_amount
router.post('/online', authenticate, async (req, res) => {
  const { 
    bill_date, 
    bill_number, 
    payee_name, 
    vat_reg_number, 
    expense_type, 
    without_vat_amount, 
    vat_amount, 
    total_bill_amount, 
    description 
  } = req.body;
  
  const userId = req.user.userId;

  if (!bill_date || !payee_name || !expense_type || !without_vat_amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO online_expenses 
       (bill_date, bill_number, payee_name, vat_reg_number, expense_type, 
        without_vat_amount, vat_amount, total_bill_amount, balance, 
        description, created_by, payment_status, paid_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0)`,
      [
        bill_date, 
        bill_number || null, 
        payee_name, 
        vat_reg_number || null, 
        expense_type,
        without_vat_amount, 
        vat_amount || 0, 
        total_bill_amount, 
        total_bill_amount,  // ✅ FIXED: balance = total_bill_amount
        description || null, 
        userId
      ]
    );
    
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Online expense recorded successfully',
      balance: total_bill_amount
    });
  } catch (error) {
    console.error('Error creating online expense:', error);
    res.status(500).json({ error: 'Failed to record online expense' });
  }
});

// PUT update online expense - ✅ FIXED: update balance properly
router.put('/online/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { 
    bill_date, 
    bill_number, 
    payee_name, 
    vat_reg_number, 
    expense_type, 
    without_vat_amount, 
    vat_amount, 
    total_bill_amount, 
    description 
  } = req.body;

  if (!bill_date || !payee_name || !expense_type || !without_vat_amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // ✅ Get current expense data
    const [currentExpense] = await pool.query(
      'SELECT total_bill_amount, paid_amount, balance FROM online_expenses WHERE id = ?',
      [id]
    );

    if (currentExpense.length === 0) {
      return res.status(404).json({ error: 'Online expense not found' });
    }

    const oldTotalBill = parseFloat(currentExpense[0].total_bill_amount) || 0;
    const paidAmount = parseFloat(currentExpense[0].paid_amount) || 0;
    const newTotalBill = parseFloat(total_bill_amount) || 0;

    // ✅ Recalculate balance: total_bill_amount - paid_amount
    let newBalance = newTotalBill - paidAmount;
    if (newBalance < 0) newBalance = 0;

    const [result] = await pool.query(
      `UPDATE online_expenses 
       SET bill_date = ?, 
           bill_number = ?, 
           payee_name = ?, 
           vat_reg_number = ?, 
           expense_type = ?, 
           without_vat_amount = ?,
           vat_amount = ?, 
           total_bill_amount = ?, 
           balance = ?,
           payment_status = ?,
           description = ?
       WHERE id = ?`,
      [
        bill_date, 
        bill_number || null, 
        payee_name, 
        vat_reg_number || null, 
        expense_type, 
        without_vat_amount, 
        vat_amount || 0, 
        total_bill_amount, 
        newBalance,
        newBalance <= 0 ? 'Paid' : (paidAmount > 0 ? 'Partially Paid' : 'Pending'),
        description || null, 
        id
      ]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Online expense not found' });
    }
    
    res.json({ 
      message: 'Online expense updated successfully',
      balance: newBalance
    });
  } catch (error) {
    console.error('Error updating online expense:', error);
    res.status(500).json({ error: 'Failed to update online expense' });
  }
});

// DELETE online expense
router.delete('/online/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    // ✅ First delete all associated payments
    await pool.query(
      'DELETE FROM online_expense_payments WHERE expense_id = ?',
      [id]
    );

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
// POST Pay Online Expenses - ✅ FIXED
// =============================================
router.post('/online/pay', authenticate, async (req, res) => {
  const { 
    expense_ids, 
    payment_date, 
    bank_name, 
    bank_id,
    voucher_number, 
    reference_number, 
    transfer_amount 
  } = req.body;
  
  const userId = req.user.userId;

  // ✅ Validate required fields
  if (!expense_ids || expense_ids.length === 0) {
    return res.status(400).json({ error: 'No expenses selected for payment' });
  }

  if (!payment_date) {
    return res.status(400).json({ error: 'Payment date is required' });
  }

  // ✅ Bank name is required
  if (!bank_name || bank_name.trim() === '') {
    return res.status(400).json({ error: 'Bank name is required' });
  }

  if (!bank_id) {
    return res.status(400).json({ error: 'Please select a bank account' });
  }

  // ✅ Voucher number is required
  if (!voucher_number || voucher_number.trim() === '') {
    return res.status(400).json({ error: 'Voucher number is required' });
  }

  const amountToPay = parseFloat(transfer_amount) || 0;
  if (amountToPay <= 0) {
    return res.status(400).json({ error: 'Valid transfer amount is required' });
  }

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    await checkDuplicateReference(connection, voucher_number);
    if (reference_number && String(reference_number).trim() !== String(voucher_number).trim()) {
      await checkDuplicateReference(connection, reference_number);
    }

    const placeholders = expense_ids.map(() => '?').join(',');
    
    // ✅ Get expenses with their current balance and total amount
    const [expenses] = await connection.query(
      `SELECT id, balance, total_bill_amount, paid_amount, payee_name, bill_number
       FROM online_expenses 
       WHERE id IN (${placeholders})`,
      expense_ids
    );

    if (expenses.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'No valid expenses found' });
    }

    // ✅ Calculate total balance of ALL selected expenses
    const totalBalance = expenses.reduce((sum, exp) => sum + parseFloat(exp.balance || 0), 0);
    
    // ✅ Check if transfer amount exceeds total balance
    if (amountToPay > totalBalance) {
      await connection.rollback();
      return res.status(400).json({ 
        error: `Transfer amount (${amountToPay}) exceeds total balance (${totalBalance})` 
      });
    }

    let remainingAmount = amountToPay;
    const results = [];

    for (const expense of expenses) {
      if (remainingAmount <= 0) break;

      const payAmount = Math.min(remainingAmount, parseFloat(expense.balance));
      const newBalance = parseFloat(expense.balance) - payAmount;
      const newPaidAmount = parseFloat(expense.paid_amount || 0) + payAmount;
      const totalBill = parseFloat(expense.total_bill_amount || 0);

      // ✅ Determine payment status based on new balance
      let paymentStatus = 'Pending';
      if (newBalance <= 0) {
        paymentStatus = 'Paid';
      } else if (newPaidAmount > 0) {
        paymentStatus = 'Partially Paid';
      }

      // ✅ Update expense balance
      await connection.query(
        `UPDATE online_expenses 
         SET balance = ?,
             paid_amount = ?,
             payment_date = ?,
             payment_status = ?
         WHERE id = ?`,
        [newBalance, newPaidAmount, payment_date, paymentStatus, expense.id]
      );

      // ✅ Insert payment history
      await connection.query(
        `INSERT INTO online_expense_payments 
         (expense_id, payment_date, bank_id, amount, bank_name, voucher_number,
          reference_number, created_by, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Completed')`,
        [
          expense.id,
          payment_date,
          bank_id,
          payAmount,
          bank_name,
          voucher_number,
          reference_number || null,
          userId
        ]
      );

      remainingAmount -= payAmount;

      results.push({
        expense_id: expense.id,
        amount_paid: payAmount,
        remaining_balance: newBalance,
        status: paymentStatus
      });
    }

    // One combined ledger entry for the whole payment - it's a single bank
    // transfer that happens to settle several bills at once.
    const payeeNames = [...new Set(expenses.map(e => e.payee_name).filter(Boolean))];
    const billNumbers = expenses.map(e => e.bill_number).filter(Boolean).join(', ');
    await recordBankTransaction(connection, {
      bankId: bank_id,
      date: payment_date,
      remark: `Online expense payment${billNumbers ? ` - Bill ${billNumbers}` : ''}`,
      credit: amountToPay,
      transactionType: 'Online Expense Payment',
      referenceNumber: voucher_number,
      invoiceNumber: billNumbers || null,
      partyName: payeeNames.length === 1 ? payeeNames[0] : (payeeNames.length > 1 ? 'Multiple Payees' : null),
      referenceType: 'ONLINE_EXPENSE_PAYMENT',
      createdBy: userId
    });

    await connection.commit();

    res.json({
      message: `Payment of ${amountToPay} completed successfully`,
      total_paid: amountToPay,
      remaining_amount: remainingAmount,
      results
    });

  } catch (error) {
    await connection.rollback();
    console.error('Payment error:', error);
    if (error.code === 'ER_DUP_ENTRY' || error.name === 'DuplicateReferenceError') {
      return res.status(400).json({ error: error.name === 'DuplicateReferenceError' ? error.message : 'Voucher number already exists' });
    }
    if (error.name === 'InsufficientBalanceError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Payment failed: ' + error.message });
  } finally {
    connection.release();
  }
});

// GET Payment History for an Expense
router.get('/online/:id/payments', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(payment_date, '%Y-%m-%d') as payment_date, 
              amount, bank_name, voucher_number, reference_number, status,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at
       FROM online_expense_payments 
       WHERE expense_id = ?
       ORDER BY payment_date DESC, created_at DESC`,
      [id]
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
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
       WHERE status = 'Active'
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
              company, notes, status
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
    company,
    notes
  } = req.body;
  
  const userId = req.user.userId;

  if (!bank_name) {
    return res.status(400).json({ error: 'Bank name is required' });
  }

  try {
    const resolvedOpeningBalance = parseFloat(opening_balance) || 0;
    const resolvedCurrentBalance = current_balance !== undefined && current_balance !== null
      ? parseFloat(current_balance)
      : resolvedOpeningBalance;

    const [result] = await pool.query(
      `INSERT INTO bank_details 
       (bank_name, account_number, branch_name, account_type, currency, 
        opening_balance, current_balance, company, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bank_name,
        account_number || null,
        branch_name || null,
        account_type || 'Current',
        currency || 'LKR',
        resolvedOpeningBalance,
        resolvedCurrentBalance,
        company || 'JH',
        notes || null,
        userId
      ]
    );

    // Record the opening balance as the first Finance ledger entry for this
    // account. bank_details.current_balance is already set above, so this
    // writes the ledger row directly rather than going through
    // recordBankTransaction (which would add the opening balance a second
    // time on top of what was just inserted).
    if (resolvedOpeningBalance > 0) {
      const [companyRows] = await pool.query('SELECT id FROM company WHERE name = ? LIMIT 1', [company || 'JH']);
      await pool.query(
        `INSERT INTO finance_transactions
           (account_type, company_id, bank_id, transaction_date, transaction_type, transaction_direction, remark, debit, credit, balance_after, reference_type, created_by)
         VALUES ('BANK', ?, ?, CURDATE(), 'Opening Balance', 'IN', 'Opening Balance', ?, 0, ?, 'OPENING_BALANCE', ?)`,
        [companyRows[0]?.id || null, result.insertId, resolvedOpeningBalance, resolvedCurrentBalance, userId]
      );
    }
    
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
    company,
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
           current_balance = ?, company = ?, notes = ?, status = ?
       WHERE id = ?`,
      [
        bank_name,
        account_number || null,
        branch_name || null,
        account_type || 'Current',
        currency || 'LKR',
        opening_balance || 0,
        current_balance || 0,
        company || 'JH',
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
