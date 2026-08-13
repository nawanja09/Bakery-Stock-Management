// routes/newExpenseRoutes.js
//
// Backs the New Expenses module (replaces the old Online Expenses /
// Cheque Expenses screens with a single bill-entry -> Pay workflow).
//
// Flow:
//   POST /             create an expense bill
//   GET  /             list expense bills (Expenses Details table)
//   PUT  /:id          edit a bill (only while nothing has been paid on it)
//   DELETE /:id        remove a bill (only while nothing has been paid on it)
//   POST /pay          Payment Details form submit - settles one or more
//                       bills for the same payee in a single payment
//   GET  /:id/payments payment history for one bill
//
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticate = require('../middleware/authenticate');
const restrictRoles = require('../middleware/restrictRoles');
const { recordCashTransaction, recordBankTransaction } = require('../utils/financeLedger');
const { checkDuplicateReference, DuplicateReferenceError } = require('../services/referenceValidationService');

router.use(authenticate, restrictRoles('Store Keeper', 'Stores'));

// =============================================
// GET all expense bills
// =============================================
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(bill_date, '%Y-%m-%d') as bill_date, bill_number,
              payee_id, payee_name, vat_reg_number, expense_type_id, expense_type,
              without_vat_amount, vat_amount, total_bill_amount, paid_amount,
              balance, description, payment_status,
              DATE_FORMAT(created_at, '%Y-%m-%d') as created_date
       FROM expenses
       WHERE is_deleted = 0
       ORDER BY bill_date DESC, created_at DESC`
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching expense bills:', error);
    res.status(500).json({ error: 'Failed to fetch expense bills' });
  }
});

// =============================================
// POST create an expense bill
// =============================================
router.post('/', async (req, res) => {
  const {
    bill_date, bill_number, payee_id, payee_name, vat_reg_number,
    expense_type_id, expense_type, without_vat_amount, vat_amount,
    total_bill_amount, description
  } = req.body;

  const userId = req.user.userId;

  if (!bill_date || !payee_name || !expense_type) {
    return res.status(400).json({ error: 'Bill date, payee and expense type are required' });
  }

  const withoutVat = parseFloat(without_vat_amount) || 0;
  const vat = parseFloat(vat_amount) || 0;
  const totalBill = total_bill_amount !== undefined && total_bill_amount !== null && total_bill_amount !== ''
    ? parseFloat(total_bill_amount)
    : withoutVat + vat;

  if (!totalBill || totalBill <= 0) {
    return res.status(400).json({ error: 'A valid bill amount is required' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO expenses
       (bill_date, bill_number, payee_id, payee_name, vat_reg_number,
        expense_type_id, expense_type, without_vat_amount, vat_amount,
        total_bill_amount, paid_amount, balance, description, created_by, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'Pending')`,
      [
        bill_date, bill_number || null, payee_id || null, payee_name,
        vat_reg_number || null, expense_type_id || null, expense_type,
        withoutVat, vat, totalBill, totalBill, description || null, userId
      ]
    );

    res.status(201).json({ id: result.insertId, message: 'Expense bill recorded successfully' });
  } catch (error) {
    console.error('Error creating expense bill:', error);
    res.status(500).json({ error: 'Failed to record expense bill' });
  }
});

// =============================================
// PUT update an expense bill (only if untouched by any payment)
// =============================================
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    bill_date, bill_number, payee_id, payee_name, vat_reg_number,
    expense_type_id, expense_type, without_vat_amount, vat_amount,
    total_bill_amount, description
  } = req.body;

  if (!bill_date || !payee_name || !expense_type) {
    return res.status(400).json({ error: 'Bill date, payee and expense type are required' });
  }

  try {
    const [existingRows] = await pool.query(
      'SELECT paid_amount FROM expenses WHERE id = ? AND is_deleted = 0',
      [id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Expense bill not found' });
    }
    if (parseFloat(existingRows[0].paid_amount) > 0) {
      return res.status(400).json({ error: 'This bill already has payments recorded against it and cannot be edited' });
    }

    const withoutVat = parseFloat(without_vat_amount) || 0;
    const vat = parseFloat(vat_amount) || 0;
    const totalBill = total_bill_amount !== undefined && total_bill_amount !== null && total_bill_amount !== ''
      ? parseFloat(total_bill_amount)
      : withoutVat + vat;

    const [result] = await pool.query(
      `UPDATE expenses
       SET bill_date = ?, bill_number = ?, payee_id = ?, payee_name = ?, vat_reg_number = ?,
           expense_type_id = ?, expense_type = ?, without_vat_amount = ?, vat_amount = ?,
           total_bill_amount = ?, balance = ?, description = ?
       WHERE id = ?`,
      [
        bill_date, bill_number || null, payee_id || null, payee_name, vat_reg_number || null,
        expense_type_id || null, expense_type, withoutVat, vat, totalBill, totalBill,
        description || null, id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Expense bill not found' });
    }

    res.json({ message: 'Expense bill updated successfully' });
  } catch (error) {
    console.error('Error updating expense bill:', error);
    res.status(500).json({ error: 'Failed to update expense bill' });
  }
});

// =============================================
// DELETE an expense bill (only if untouched by any payment)
// =============================================
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [existingRows] = await pool.query(
      'SELECT paid_amount FROM expenses WHERE id = ? AND is_deleted = 0',
      [id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Expense bill not found' });
    }
    if (parseFloat(existingRows[0].paid_amount) > 0) {
      return res.status(400).json({ error: 'This bill already has payments recorded against it and cannot be deleted' });
    }

    await pool.query('UPDATE expenses SET is_deleted = 1 WHERE id = ?', [id]);
    res.json({ message: 'Expense bill deleted successfully' });
  } catch (error) {
    console.error('Error deleting expense bill:', error);
    res.status(500).json({ error: 'Failed to delete expense bill' });
  }
});

// =============================================
// GET payment history for a bill
// =============================================
router.get('/:id/payments', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT epa.amount, ep.id as payment_id, DATE_FORMAT(ep.payment_date, '%Y-%m-%d') as payment_date,
              ep.payment_type, ep.cheque_number, ep.voucher_number, ep.reference_number,
              ep.transfer_amount, ep.overpayment_amount
       FROM expense_payment_allocations epa
       JOIN expense_payments ep ON ep.id = epa.payment_id
       WHERE epa.expense_id = ?
       ORDER BY ep.payment_date DESC, ep.id DESC`,
      [id]
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching bill payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// =============================================
// POST Pay selected bills (Payment Details form submit)
// =============================================
router.post('/pay', async (req, res) => {
  const {
    expense_ids,
    payment_date,
    payee_id,
    payee_name,
    payment_type_id,
    payment_type,
    bank_id,
    cheque_number,
    voucher_number,
    reference_number,
    transfer_amount,
    description
  } = req.body;

  const userId = req.user.userId;

  if (!expense_ids || expense_ids.length === 0) {
    return res.status(400).json({ error: 'No bills selected for payment' });
  }
  if (!payment_date) {
    return res.status(400).json({ error: 'Payment date is required' });
  }
  if (!payment_type || !payment_type.trim()) {
    return res.status(400).json({ error: 'Payment type is required' });
  }

  const normalizedType = payment_type.trim().toLowerCase();
  const isCheque = normalizedType === 'cheque';
  const isBank = normalizedType === 'bank' || normalizedType === 'online';

  if (isCheque && (!cheque_number || !cheque_number.trim())) {
    return res.status(400).json({ error: 'Cheque number is required for cheque payments' });
  }
  if (isBank && (!voucher_number || !voucher_number.trim())) {
    return res.status(400).json({ error: 'Voucher number is required for online/bank payments' });
  }
  if ((isCheque || isBank) && !bank_id) {
    return res.status(400).json({ error: 'Please select a bank account' });
  }

  const transferAmount = parseFloat(transfer_amount) || 0;
  if (transferAmount <= 0) {
    return res.status(400).json({ error: 'A valid transfer amount is required' });
  }

  const referenceToCheck = isCheque ? cheque_number : voucher_number;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    if (referenceToCheck) {
      await checkDuplicateReference(connection, referenceToCheck);
    }
    if (reference_number && String(reference_number).trim() !== String(referenceToCheck || '').trim()) {
      await checkDuplicateReference(connection, reference_number);
    }

    const placeholders = expense_ids.map(() => '?').join(',');
    const [bills] = await connection.query(
      `SELECT id, balance, total_bill_amount, paid_amount, payee_id, payee_name, bill_number
       FROM expenses
       WHERE id IN (${placeholders}) AND is_deleted = 0 FOR UPDATE`,
      expense_ids
    );

    if (bills.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'No valid bills found' });
    }

    const distinctPayees = [...new Set(bills.map(b => b.payee_name))];
    if (distinctPayees.length > 1) {
      await connection.rollback();
      return res.status(400).json({ error: 'All selected bills must belong to the same payee' });
    }

    const totalBillAmount = bills.reduce((sum, b) => sum + parseFloat(b.balance || 0), 0);

    if (transferAmount < totalBillAmount) {
      await connection.rollback();
      return res.status(400).json({
        error: `Transfer amount (${transferAmount}) is less than the total bill amount (${totalBillAmount})`
      });
    }

    const overpayment = parseFloat((transferAmount - totalBillAmount).toFixed(2));

    // Record the payment header
    const [paymentResult] = await connection.query(
      `INSERT INTO expense_payments
       (payment_date, payee_id, payee_name, payment_type_id, payment_type, bank_id,
        cheque_number, voucher_number, reference_number, total_bill_amount,
        transfer_amount, overpayment_amount, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payment_date, payee_id || bills[0].payee_id || null, payee_name || bills[0].payee_name,
        payment_type_id || null, payment_type.trim(), (isCheque || isBank) ? bank_id : null,
        isCheque ? cheque_number.trim() : null, isBank ? voucher_number.trim() : null,
        reference_number || null, totalBillAmount, transferAmount, overpayment,
        description || null, userId
      ]
    );
    const paymentId = paymentResult.insertId;

    // Settle each bill in full (Transfer Amount must cover the whole
    // selected balance - see Section 7 of the spec) and record the
    // allocation for traceability.
    for (const bill of bills) {
      const payAmount = parseFloat(bill.balance);
      const newPaidAmount = parseFloat(bill.paid_amount || 0) + payAmount;

      await connection.query(
        `UPDATE expenses SET balance = 0, paid_amount = ?, payment_status = 'Paid' WHERE id = ?`,
        [newPaidAmount, bill.id]
      );

      await connection.query(
        `INSERT INTO expense_payment_allocations (payment_id, expense_id, amount) VALUES (?, ?, ?)`,
        [paymentId, bill.id, payAmount]
      );
    }

    // Ledger posting - the actual amount transferred leaves the
    // selected Cash or Bank account.
    const billNumbers = bills.map(b => b.bill_number).filter(Boolean).join(', ');
    const remark = `New Expenses payment - ${payee_name || bills[0].payee_name}${billNumbers ? ` (Bill ${billNumbers})` : ''}`;

    if (isCheque || isBank) {
      await recordBankTransaction(connection, {
        bankId: bank_id,
        date: payment_date,
        remark,
        credit: transferAmount,
        transactionType: isCheque ? 'Cheque Expense Payment' : 'Online Expense Payment',
        referenceNumber: referenceToCheck,
        invoiceNumber: billNumbers || null,
        partyName: payee_name || bills[0].payee_name,
        referenceType: 'EXPENSE_PAYMENT',
        referenceId: paymentId,
        createdBy: userId
      });
    } else {
      // Cash payment - fall back to the first configured cash account,
      // same convention used by the Petty Cash module.
      const [cashAcc] = await connection.query('SELECT company_id FROM cash_accounts LIMIT 1');
      const companyId = cashAcc.length > 0 ? cashAcc[0].company_id : 1;
      await recordCashTransaction(connection, {
        companyId,
        date: payment_date,
        remark,
        credit: transferAmount,
        transactionType: 'Cash Expense Payment',
        referenceNumber: reference_number || null,
        invoiceNumber: billNumbers || null,
        partyName: payee_name || bills[0].payee_name,
        referenceType: 'EXPENSE_PAYMENT',
        referenceId: paymentId,
        createdBy: userId
      });
    }

    // Overpayment - recorded against the payee as spendable credit.
    if (overpayment > 0) {
      await connection.query(
        `INSERT INTO payee_overpayments (payee_id, payee_name, payment_id, amount, remaining_credit, status)
         VALUES (?, ?, ?, ?, ?, 'Active')`,
        [payee_id || bills[0].payee_id || null, payee_name || bills[0].payee_name, paymentId, overpayment, overpayment]
      );
    }

    await connection.commit();

    res.status(201).json({
      message: 'Payment submitted successfully',
      payment_id: paymentId,
      total_bill_amount: totalBillAmount,
      transfer_amount: transferAmount,
      overpayment
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error submitting expense payment:', error);
    if (error.code === 'ER_DUP_ENTRY' || error.name === 'DuplicateReferenceError') {
      return res.status(400).json({ error: error.name === 'DuplicateReferenceError' ? error.message : 'This reference number already exists' });
    }
    if (error.name === 'InsufficientBalanceError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Payment failed: ' + error.message });
  } finally {
    connection.release();
  }
});

module.exports = router;
