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
      `SELECT e.id, DATE_FORMAT(e.bill_date, '%Y-%m-%d') as bill_date, e.bill_number,
              payee_id, payee_name, vat_reg_number, expense_type_id, expense_type,
              sub_expense_type_id, sub_expense_type,
              without_vat_amount, vat_amount, total_bill_amount, paid_amount,
              balance, description, payment_status, e.company_id, c.name AS company_name,
              DATE_FORMAT(e.created_at, '%Y-%m-%d') as created_date
       FROM expenses e
       LEFT JOIN company c ON c.id = e.company_id
       WHERE e.is_deleted = 0
       ORDER BY e.bill_date DESC, e.created_at DESC`
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
    expense_type_id, expense_type, sub_expense_type_id, sub_expense_type, without_vat_amount, vat_amount,
    total_bill_amount, description, company_id
  } = req.body;

  const userId = req.user.userId;

  if (!bill_date || !payee_name || !expense_type || !expense_type_id || !sub_expense_type_id || !company_id) {
    return res.status(400).json({ error: 'Bill date, payee, expense type, sub expense type and company are required' });
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
    const [companies] = await pool.query('SELECT id FROM company WHERE id = ?', [company_id]);
    if (companies.length === 0) {
      return res.status(400).json({ error: 'Selected company was not found' });
    }
    const [subTypes] = await pool.query(
      `SELECT st.id, st.name, et.name AS expense_type_name
       FROM sub_expense_types st
       JOIN expense_types et ON et.id = st.expense_type_id
       WHERE st.id = ? AND st.expense_type_id = ? AND st.status = 1`,
      [sub_expense_type_id, expense_type_id]
    );
    if (!subTypes.length) {
      return res.status(400).json({ error: 'Selected sub expense type does not belong to the selected active expense type' });
    }

    const [result] = await pool.query(
      `INSERT INTO expenses
       (bill_date, bill_number, payee_id, payee_name, vat_reg_number,
        expense_type_id, expense_type, sub_expense_type_id, sub_expense_type, without_vat_amount, vat_amount,
        total_bill_amount, paid_amount, balance, description, company_id, created_by, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'Pending')`,
      [
        bill_date, bill_number || null, payee_id || null, payee_name,
        vat_reg_number || null, expense_type_id, subTypes[0].expense_type_name, sub_expense_type_id, subTypes[0].name,
        withoutVat, vat, totalBill, totalBill, description || null, company_id, userId
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
    expense_type_id, expense_type, sub_expense_type_id, sub_expense_type, without_vat_amount, vat_amount,
    total_bill_amount, description, company_id
  } = req.body;

  if (!bill_date || !payee_name || !expense_type || !expense_type_id || !sub_expense_type_id || !company_id) {
    return res.status(400).json({ error: 'Bill date, payee, expense type, sub expense type and company are required' });
  }

  try {
    const [companies] = await pool.query('SELECT id FROM company WHERE id = ?', [company_id]);
    if (companies.length === 0) {
      return res.status(400).json({ error: 'Selected company was not found' });
    }
    const [subTypes] = await pool.query(
      `SELECT st.id, st.name, et.name AS expense_type_name
       FROM sub_expense_types st
       JOIN expense_types et ON et.id = st.expense_type_id
       WHERE st.id = ? AND st.expense_type_id = ? AND st.status = 1`,
      [sub_expense_type_id, expense_type_id]
    );
    if (!subTypes.length) {
      return res.status(400).json({ error: 'Selected sub expense type does not belong to the selected active expense type' });
    }

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
           expense_type_id = ?, expense_type = ?, sub_expense_type_id = ?, sub_expense_type = ?, without_vat_amount = ?, vat_amount = ?,
           total_bill_amount = ?, balance = ?, description = ?, company_id = ?
       WHERE id = ?`,
      [
        bill_date, bill_number || null, payee_id || null, payee_name, vat_reg_number || null,
        expense_type_id, subTypes[0].expense_type_name, sub_expense_type_id, subTypes[0].name, withoutVat, vat, totalBill, totalBill,
        description || null, company_id, id
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
            `SELECT id, balance, total_bill_amount, paid_amount, payee_id, payee_name, bill_number,
              company_id, expense_type
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

    const distinctCompanies = [...new Set(bills.map(b => b.company_id).filter(Boolean))];
    if (distinctCompanies.length > 1 || (distinctCompanies.length === 1 && bills.some(b => !b.company_id))) {
      await connection.rollback();
      return res.status(400).json({ error: 'All selected bills must belong to the same company' });
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

    // Ledger posting - Only online/bank transfers and cash payments deduct immediately.
    // Cheque payments are NOT deducted before the cheque is released (deducted on release date via Cheque Registry).
    if (isBank) {
      await recordBankTransaction(connection, {
        bankId: bank_id,
        date: payment_date,
        remark,
        credit: transferAmount,
        transactionType: 'Online Expense Payment',
        referenceNumber: referenceToCheck,
        invoiceNumber: billNumbers || null,
        partyName: payee_name || bills[0].payee_name,
        referenceType: 'EXPENSE_PAYMENT',
        referenceId: paymentId,
        createdBy: userId
      });
    } else if (!isCheque) {
      // Use the selected bill company. Historical bills without a company retain
      // the previous behaviour of using the first configured cash account.
      let companyId = distinctCompanies[0];
      if (!companyId) {
        const [cashAcc] = await connection.query('SELECT company_id FROM cash_accounts LIMIT 1');
        companyId = cashAcc[0]?.company_id;
      }
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

    // ── Auto-register in Expenses Cheque Registry (New Expenses Payment + Cheque) ──
    // Recorded with release_status = 'Pending'. Ledger deduction occurs on release date.
    if (isCheque && cheque_number && String(cheque_number).trim()) {
      try {
        let bankName = null;
        if (bank_id) {
          const [bankRows] = await pool.query(
            'SELECT bank_name, account_number FROM bank_details WHERE id = ? LIMIT 1',
            [bank_id]
          );
          if (bankRows.length) {
            bankName = `${bankRows[0].bank_name}${bankRows[0].account_number ? ` (${bankRows[0].account_number})` : ''}`;
          }
        }
        await pool.query(
          `INSERT INTO expenses_cheque_registry
             (source_type, type, source_id, date, name, cheque_number, amount, bank, bank_id, status)
           VALUES ('EXPENSE_PAYMENT', 'Expense', ?, ?, ?, ?, ?, ?, ?, 'Pending')
           ON DUPLICATE KEY UPDATE
             date             = VALUES(date),
             name             = VALUES(name),
             cheque_number    = VALUES(cheque_number),
             amount           = VALUES(amount),
             bank             = VALUES(bank),
             bank_id          = VALUES(bank_id),
             status           = 'Pending',
             type             = 'Expense'`,
          [
            paymentId,
            payment_date,
            payee_name || bills[0]?.payee_name || 'Payee',
            String(cheque_number).trim(),
            transferAmount,
            bankName,
            bank_id || null
          ]
        );
      } catch (registryErr) {
        console.error('Expenses cheque registry upsert error (New Expenses):', registryErr.message);
      }
    }

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

// =============================================
// Credit Note module (New Expenses)
//
// A Credit Note is a payee-scoped credit raised from an expense bill,
// recorded using the same "Advance Payment" logic already used for
// overpayments on this module (see payee_overpayments / POST /pay
// above), and it can later be set off ("applied") against any pending
// bill for the SAME payee + SAME company. Applying a Credit Note never
// touches Cash/Bank - see payee_credit_note_allocations.
// =============================================
const formatAmt = (v) => parseFloat(v) || 0;

const computeCreditStatus = (remaining, original) => {
  if (remaining <= 0.001) return 'Fully Used';
  if (remaining < formatAmt(original) - 0.001) return 'Partially Used';
  return 'Active';
};

const computeExpenseStatus = (balance, paid) => {
  if (balance <= 0.001) return 'Paid';
  if (paid > 0.001) return 'Partially Paid';
  return 'Pending';
};

// -------------------------------------------------------
// GET Credit Notes (optionally filter by payee/company/status)
// -------------------------------------------------------
router.get('/credit-notes', async (req, res) => {
  const { payee_id, company_id, status, expense_id } = req.query;
  try {
    const clauses = [];
    const params = [];
    if (payee_id) { clauses.push('cn.payee_id = ?'); params.push(payee_id); }
    if (company_id) { clauses.push('cn.company_id = ?'); params.push(company_id); }
    if (status) { clauses.push('cn.status = ?'); params.push(status); }
    if (expense_id) { clauses.push('cn.expense_id = ?'); params.push(expense_id); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT cn.id, cn.credit_note_number, cn.expense_id, cn.payee_id, cn.payee_name,
              cn.company_id, c.name AS company_name,
              DATE_FORMAT(cn.credit_note_date, '%Y-%m-%d') AS credit_note_date,
              cn.without_vat_amount, cn.vat_amount, cn.total_amount, cn.remaining_credit,
              cn.status, cn.notes, e.bill_number AS source_bill_number
       FROM payee_credit_notes cn
       LEFT JOIN company c ON c.id = cn.company_id
       LEFT JOIN expenses e ON e.id = cn.expense_id
       ${where}
       ORDER BY cn.credit_note_date DESC, cn.id DESC`,
      params
    );
    res.json(rows || []);
  } catch (error) {
    console.error('Error fetching credit notes:', error);
    res.status(500).json({ error: 'Failed to fetch credit notes' });
  }
});

// -------------------------------------------------------
// GET Available Credit Notes for a supplier(payee) + company
// (used by the "Apply Credit Note" screen on a pending bill)
// -------------------------------------------------------
router.get('/credit-notes/available', async (req, res) => {
  const { payee_id, payee_name, company_id } = req.query;
  if ((!payee_id && !payee_name) || !company_id) {
    return res.status(400).json({ error: 'payee and company are required' });
  }
  try {
    const clauses = ['cn.company_id = ?', "cn.status NOT IN ('Fully Used','Cancelled')", 'cn.remaining_credit > 0'];
    const params = [company_id];
    if (payee_id) {
      clauses.push('cn.payee_id = ?');
      params.push(payee_id);
    } else {
      clauses.push('cn.payee_name = ?');
      params.push(payee_name);
    }

    const [rows] = await pool.query(
      `SELECT cn.id, cn.credit_note_number, cn.payee_id, cn.payee_name, cn.company_id,
              DATE_FORMAT(cn.credit_note_date, '%Y-%m-%d') AS credit_note_date,
              cn.total_amount, cn.remaining_credit, cn.status
       FROM payee_credit_notes cn
       WHERE ${clauses.join(' AND ')}
       ORDER BY cn.credit_note_date ASC, cn.id ASC`,
      params
    );
    res.json(rows.map(r => ({ ...r, total_amount: formatAmt(r.total_amount), remaining_credit: formatAmt(r.remaining_credit) })));
  } catch (error) {
    console.error('Error fetching available credit notes:', error);
    res.status(500).json({ error: 'Failed to fetch available credit notes' });
  }
});

// -------------------------------------------------------
// GET single Credit Note details (with its usage history)
// -------------------------------------------------------
router.get('/credit-notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [[cn]] = await pool.query(
      `SELECT cn.*, c.name AS company_name
       FROM payee_credit_notes cn
       LEFT JOIN company c ON c.id = cn.company_id
       WHERE cn.id = ?`,
      [id]
    );
    if (!cn) return res.status(404).json({ error: 'Credit note not found' });

    const [allocations] = await pool.query(
      `SELECT pcna.id, pcna.expense_id, e.bill_number, pcna.allocated_amount,
              DATE_FORMAT(pcna.applied_date, '%Y-%m-%d') AS applied_date, pcna.notes
       FROM payee_credit_note_allocations pcna
       LEFT JOIN expenses e ON e.id = pcna.expense_id
       WHERE pcna.credit_note_id = ?
       ORDER BY pcna.applied_date DESC, pcna.id DESC`,
      [id]
    );

    res.json({
      ...cn,
      without_vat_amount: formatAmt(cn.without_vat_amount),
      vat_amount: formatAmt(cn.vat_amount),
      total_amount: formatAmt(cn.total_amount),
      remaining_credit: formatAmt(cn.remaining_credit),
      allocations
    });
  } catch (error) {
    console.error('Error fetching credit note details:', error);
    res.status(500).json({ error: 'Failed to fetch credit note details' });
  }
});

// -------------------------------------------------------
// POST Create a Credit Note from an expense bill
// -------------------------------------------------------
router.post('/credit-notes', async (req, res) => {
  const {
    expense_id, credit_note_date, payee_id, payee_name, company_id,
    without_vat_amount, vat_amount, total_amount, notes
  } = req.body;

  const userId = req.user.userId;

  if (!credit_note_date) return res.status(400).json({ error: 'Date is required' });
  if (!payee_name) return res.status(400).json({ error: 'Supplier (payee) is required' });
  if (!company_id) return res.status(400).json({ error: 'Company is required' });

  const withoutVat = formatAmt(without_vat_amount);
  const vat = formatAmt(vat_amount);
  const total = total_amount !== undefined && total_amount !== null && total_amount !== ''
    ? formatAmt(total_amount)
    : withoutVat + vat;

  if (!total || total <= 0) {
    return res.status(400).json({ error: 'A valid Credit Note amount is required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [companies] = await connection.query('SELECT id FROM company WHERE id = ?', [company_id]);
    if (companies.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Selected company was not found' });
    }

    if (expense_id) {
      const [expenseRows] = await connection.query('SELECT id FROM expenses WHERE id = ? AND is_deleted = 0', [expense_id]);
      if (expenseRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Source expense bill not found' });
      }

      // Duplicate prevention: a Credit Note is a transaction that belongs
      // to one specific Expense Detail. Only one (non-cancelled) Credit
      // Note may exist per Expense Detail.
      const [[existing]] = await connection.query(
        `SELECT id, credit_note_number, status, total_amount, remaining_credit
         FROM payee_credit_notes WHERE expense_id = ? AND status != 'Cancelled'
         LIMIT 1`,
        [expense_id]
      );
      if (existing) {
        await connection.rollback();
        return res.status(409).json({
          error: `This expense detail already has a Credit Note (${existing.credit_note_number})`,
          existing_credit_note: existing
        });
      }
    }

    const datePart = String(credit_note_date).replace(/-/g, '');
    const rand = Math.floor(Math.random() * 9000) + 1000;
    const creditNoteNumber = `CN-${datePart}-${rand}`;

    const [result] = await connection.query(
      `INSERT INTO payee_credit_notes
        (credit_note_number, expense_id, payee_id, payee_name, company_id, credit_note_date,
         without_vat_amount, vat_amount, total_amount, remaining_credit, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)`,
      [
        creditNoteNumber, expense_id || null, payee_id || null, payee_name, company_id, credit_note_date,
        withoutVat, vat, total, total, notes || null, userId
      ]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Credit Note created successfully',
      credit_note: {
        id: result.insertId,
        credit_note_number: creditNoteNumber,
        expense_id: expense_id || null,
        payee_id: payee_id || null,
        payee_name,
        company_id,
        credit_note_date,
        without_vat_amount: withoutVat,
        vat_amount: vat,
        total_amount: total,
        remaining_credit: total,
        status: 'Active'
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating credit note:', error);
    res.status(500).json({ error: 'Failed to create credit note: ' + error.message });
  } finally {
    connection.release();
  }
});

// -------------------------------------------------------
// POST Apply Credit Note(s) to a pending expense bill (set-off)
// Body: { expense_id, credit_notes: [{ credit_note_id, amount }], applied_date, notes }
// -------------------------------------------------------
router.post('/credit-notes/apply', async (req, res) => {
  const { expense_id, credit_notes, applied_date, notes } = req.body;
  const userId = req.user.userId;

  if (!expense_id) return res.status(400).json({ error: 'Expense bill is required' });
  if (!Array.isArray(credit_notes) || credit_notes.length === 0) {
    return res.status(400).json({ error: 'At least one credit note must be selected' });
  }
  if (!applied_date) return res.status(400).json({ error: 'Applied date is required' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[expense]] = await connection.query(
      'SELECT * FROM expenses WHERE id = ? AND is_deleted = 0 FOR UPDATE',
      [expense_id]
    );
    if (!expense) {
      await connection.rollback();
      return res.status(404).json({ error: 'Expense bill not found' });
    }

    let totalApplied = 0;
    let remainingBalance = formatAmt(expense.balance);

    for (const entry of credit_notes) {
      const amount = formatAmt(entry.amount);
      if (amount <= 0) continue;

      const [[cn]] = await connection.query(
        'SELECT * FROM payee_credit_notes WHERE id = ? FOR UPDATE',
        [entry.credit_note_id]
      );
      if (!cn) {
        await connection.rollback();
        return res.status(404).json({ error: `Credit note ${entry.credit_note_id} not found` });
      }

      // Business rules: same payee, same company, not fully used/cancelled,
      // cannot exceed remaining credit or the invoice's remaining balance.
      const samePayee = cn.payee_id && expense.payee_id
        ? Number(cn.payee_id) === Number(expense.payee_id)
        : cn.payee_name === expense.payee_name;
      if (!samePayee) {
        await connection.rollback();
        return res.status(400).json({ error: `Credit note ${cn.credit_note_number} belongs to a different supplier and cannot be applied to this invoice` });
      }
      if (Number(cn.company_id) !== Number(expense.company_id)) {
        await connection.rollback();
        return res.status(400).json({ error: `Credit note ${cn.credit_note_number} belongs to a different company and cannot be applied to this invoice` });
      }
      if (cn.status === 'Fully Used' || cn.status === 'Cancelled') {
        await connection.rollback();
        return res.status(400).json({ error: `Credit note ${cn.credit_note_number} is ${cn.status.toLowerCase()} and cannot be applied` });
      }
      if (formatAmt(cn.remaining_credit) < amount - 0.001) {
        await connection.rollback();
        return res.status(400).json({ error: `Amount exceeds remaining balance of credit note ${cn.credit_note_number}` });
      }
      if (amount > remainingBalance + 0.001) {
        await connection.rollback();
        return res.status(400).json({ error: 'Credit note amount exceeds the remaining invoice balance' });
      }

      const newRemaining = formatAmt(cn.remaining_credit) - amount;
      const newStatus = computeCreditStatus(newRemaining, cn.total_amount);

      await connection.query(
        'UPDATE payee_credit_notes SET remaining_credit = ?, status = ?, updated_at = NOW() WHERE id = ?',
        [Math.max(0, newRemaining), newStatus, cn.id]
      );

      await connection.query(
        `INSERT INTO payee_credit_note_allocations
          (credit_note_id, expense_id, allocated_amount, applied_date, applied_by, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [cn.id, expense_id, amount, applied_date, userId, notes || null]
      );

      totalApplied += amount;
      remainingBalance -= amount;
    }

    if (totalApplied <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'No valid credit note amount to apply' });
    }

    // Reflect the set-off on the bill exactly like a settled amount (no
    // Cash/Bank ledger entry - the money never left an account here).
    const newPaidAmount = formatAmt(expense.paid_amount) + totalApplied;
    const newBalance = Math.max(0, formatAmt(expense.total_bill_amount) - newPaidAmount);
    const newStatus = computeExpenseStatus(newBalance, newPaidAmount);

    await connection.query(
      'UPDATE expenses SET paid_amount = ?, balance = ?, payment_status = ? WHERE id = ?',
      [newPaidAmount, newBalance, newStatus, expense_id]
    );

    await connection.commit();

    res.json({
      message: 'Credit note applied successfully',
      total_applied: totalApplied,
      new_balance: newBalance,
      payment_status: newStatus
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error applying credit note:', error);
    res.status(500).json({ error: 'Failed to apply credit note: ' + error.message });
  } finally {
    connection.release();
  }
});

// =============================================
// Cheque Registry routes (Expenses sub-menu)
// =============================================
const chequeRegistryController = require('../controllers/chequeRegistryController');
router.get('/cheque-registry', chequeRegistryController.getChequeRegistry);
router.patch('/cheque-registry/:id', chequeRegistryController.updateChequeRegistryRecord);

module.exports = router;
