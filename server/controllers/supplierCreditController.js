// controllers/supplierCreditController.js
const pool = require('../config/db');
const { normalizePaymentMethodValue } = require('../utils/paymentMethodUtils');
const { recordCashTransaction, recordBankTransaction } = require('../utils/financeLedger');
const { checkDuplicateReference, DuplicateReferenceError } = require('../services/referenceValidationService');

const formatNum = (v) => parseFloat(v) || 0;
const VALID_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT'];

const isValidPaymentMethod = (method) => VALID_PAYMENT_METHODS.includes(method);

const ensureUnsettledReturnCredits = async () => {
  try {
    const [returnsWithoutCredits] = await pool.query(`
      SELECT pr.id, pr.supplier_id, pr.return_date, pr.balance_amount
      FROM purchase_returns pr
      LEFT JOIN purchase_return_credits prc ON prc.purchase_return_id = pr.id
      WHERE pr.balance_amount > 0
        AND prc.id IS NULL
    `);

    for (const returnRow of returnsWithoutCredits) {
      const remainingCredit = formatNum(returnRow.balance_amount);
      if (remainingCredit <= 0) continue;

      const datePart = (returnRow.return_date || new Date()).toISOString().slice(0, 10).replace(/-/g, '');
      const rand = Math.floor(Math.random() * 9000) + 1000;
      const creditNumber = `CRD-${datePart}-${rand}`;

      await pool.query(`
        INSERT INTO purchase_return_credits
          (credit_number, purchase_return_id, supplier_id, original_amount, remaining_credit, status, credit_date)
        VALUES (?, ?, ?, ?, ?, 'Active', ?)
      `, [creditNumber, returnRow.id, returnRow.supplier_id, remainingCredit, remainingCredit, returnRow.return_date]);
    }
  } catch (error) {
    console.warn('Unable to ensure unsettled return credits:', error.message);
  }
};

// GET /api/suppliers/:id/credits
const getSupplierCredits = async (req, res) => {
  const { id: supplierId } = req.params;
  try {
    await ensureUnsettledReturnCredits();

    const [overpayments] = await pool.query(`
      SELECT
        so.id,
        'overpayment'        AS credit_type,
        'Advance Payment'    AS source,
        so.overpayment_number AS credit_number,
        so.company_id        AS company_id,
        c.name                AS company_name,
        so.payment_date      AS credit_date,
        so.original_amount,
        so.remaining_credit,
        so.status,
        so.voucher_number,
        so.reference_number,
        so.notes,
        u.name               AS created_by_name,
        so.supplier_id
      FROM supplier_overpayments so
      LEFT JOIN users u ON so.created_by = u.id
      LEFT JOIN company c ON so.company_id = c.id
      WHERE so.supplier_id = ?
        AND so.status != 'Fully Used'
        AND so.remaining_credit > 0
        AND (so.is_deleted = 0 OR so.is_deleted IS NULL)
      ORDER BY so.payment_date DESC
    `, [supplierId]);

    const [returnCredits] = await pool.query(`
      SELECT
        prc.id,
        'return_credit'      AS credit_type,
        'Purchase Return'    AS source,
        prc.credit_number,
        prc.credit_date,
        prc.original_amount,
        prc.remaining_credit,
        prc.status,
        pr.return_number     AS reference_number,
        NULL                 AS voucher_number,
        NULL                 AS notes,
        NULL                 AS created_by_name,
        prc.supplier_id
      FROM purchase_return_credits prc
      JOIN purchase_returns pr ON prc.purchase_return_id = pr.id
      WHERE prc.supplier_id = ?
        AND prc.status != 'Fully Used'
        AND prc.remaining_credit > 0
      ORDER BY prc.credit_date DESC
    `, [supplierId]);

    res.json({
      overpayments: overpayments.map(r => ({
        ...r,
        original_amount: formatNum(r.original_amount),
        remaining_credit: formatNum(r.remaining_credit)
      })),
      return_credits: returnCredits.map(r => ({
        ...r,
        original_amount: formatNum(r.original_amount),
        remaining_credit: formatNum(r.remaining_credit)
      }))
    });
  } catch (error) {
    console.error('Error fetching supplier credits:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// GET /api/suppliers/:id/outstanding
const getSupplierOutstanding = async (req, res) => {
  const { id: supplierId } = req.params;
  try {
    await ensureUnsettledReturnCredits();

    const [[invoiceSummary]] = await pool.query(`
      SELECT
        COUNT(*)                       AS total_invoices,
        COALESCE(SUM(total_with_vat),0) AS total_billed,
        COALESCE(SUM(paid_amount),0)    AS total_paid,
        COALESCE(SUM(balance_amount),0) AS total_outstanding
      FROM purchases
      WHERE supplier_id = ?
        AND balance_amount > 0
        AND (deleted = FALSE OR deleted IS NULL)
    `, [supplierId]);

    const [[creditSummary]] = await pool.query(`
      SELECT
        COALESCE(SUM(remaining_credit),0) AS overpayment_credit
      FROM supplier_overpayments
      WHERE supplier_id = ? AND status != 'Fully Used' AND remaining_credit > 0
        AND (is_deleted = 0 OR is_deleted IS NULL)
    `, [supplierId]);

    const [[returnCreditSummary]] = await pool.query(`
      SELECT
        COALESCE(SUM(remaining_credit),0) AS return_credit
      FROM purchase_return_credits
      WHERE supplier_id = ? AND status != 'Fully Used' AND remaining_credit > 0
    `, [supplierId]);

    res.json({
      total_invoices: invoiceSummary.total_invoices || 0,
      total_billed: formatNum(invoiceSummary.total_billed),
      total_paid: formatNum(invoiceSummary.total_paid),
      total_outstanding: formatNum(invoiceSummary.total_outstanding),
      overpayment_credit: formatNum(creditSummary.overpayment_credit),
      return_credit: formatNum(returnCreditSummary.return_credit),
      total_credit: formatNum(creditSummary.overpayment_credit) + formatNum(returnCreditSummary.return_credit)
    });
  } catch (error) {
    console.error('Error fetching supplier outstanding:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// POST /api/suppliers/pay-now
const createOverpayment = async (req, res) => {
  const {
    supplier_id,
    company_id,
    payment_date,
    payment_method,
    voucher_number,
    reference_number,
    amount,
    notes,
    created_by,
    purchase_id,
    bank_id
  } = req.body;

  const normalizedPaymentMethod = normalizePaymentMethodValue(payment_method);

  if (!supplier_id) return res.status(400).json({ error: 'Supplier is required' });
  if (!company_id) return res.status(400).json({ error: 'Company is required' });
  if (!payment_date) return res.status(400).json({ error: 'Payment date is required' });
  if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
  if (!created_by) return res.status(400).json({ error: 'Created by is required' });
  if (!normalizedPaymentMethod || !isValidPaymentMethod(normalizedPaymentMethod)) {
    return res.status(400).json({ error: 'Payment method is invalid' });
  }
  if (normalizedPaymentMethod === 'BANK_TRANSFER' && !bank_id) {
    return res.status(400).json({ error: 'Bank account is required for bank payments' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await checkDuplicateReference(connection, voucher_number);
    await checkDuplicateReference(connection, reference_number);

    const [supplierRows] = await connection.query('SELECT id, name FROM supplier WHERE id = ? LIMIT 1', [supplier_id]);
    if (supplierRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const [companyRows] = await connection.query('SELECT id, name FROM company WHERE id = ? LIMIT 1', [company_id]);
    if (companyRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Company not found' });
    }

    const datePart = payment_date.replace(/-/g, '');
    const rand = Math.floor(Math.random() * 9000) + 1000;
    const overpayment_number = `ADV-${datePart}-${rand}`;

    const [result] = await connection.query(`
      INSERT INTO supplier_overpayments
        (overpayment_number, supplier_id, company_id, payment_date, payment_method,
         voucher_number, reference_number, original_amount, remaining_credit,
         status, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)
    `, [
      overpayment_number, supplier_id, company_id, payment_date, normalizedPaymentMethod,
      voucher_number || null, reference_number || null,
      parseFloat(amount), parseFloat(amount),
      notes || null, created_by
    ]);

    let ledgerBalance = null;
    const ledgerRemark = `Advance payment to supplier "${supplierRows[0].name}" (${overpayment_number})`;
    if (normalizedPaymentMethod === 'CASH') {
      ledgerBalance = await recordCashTransaction(connection, {
        companyId: company_id,
        date: payment_date,
        remark: ledgerRemark,
        credit: parseFloat(amount),
        transactionType: 'Supplier Advance Payment',
        referenceNumber: voucher_number || reference_number || null,
        partyName: supplierRows[0].name,
        referenceType: 'SUPPLIER_ADVANCE',
        referenceId: result.insertId,
        createdBy: created_by
      });
    } else if (normalizedPaymentMethod === 'BANK_TRANSFER' && bank_id) {
      ledgerBalance = await recordBankTransaction(connection, {
        bankId: bank_id,
        date: payment_date,
        remark: ledgerRemark,
        credit: parseFloat(amount),
        transactionType: 'Supplier Advance Payment',
        referenceNumber: voucher_number || reference_number || null,
        partyName: supplierRows[0].name,
        referenceType: 'SUPPLIER_ADVANCE',
        referenceId: result.insertId,
        createdBy: created_by
      });
    }

    await connection.commit();

    const [[inserted]] = await connection.query(
      `SELECT so.id, so.overpayment_number, so.supplier_id, s.name AS supplier_name,
              so.company_id, so.payment_date, so.original_amount, so.remaining_credit,
              so.status, so.payment_method, so.voucher_number, so.reference_number, so.notes
       FROM supplier_overpayments so
       JOIN supplier s ON so.supplier_id = s.id
       WHERE so.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      message: 'Advance payment recorded successfully!',
      overpayment: {
        ...inserted,
        original_amount: formatNum(inserted.original_amount),
        remaining_credit: formatNum(inserted.remaining_credit)
      },
      overpayment_number,
      ledger_balance: ledgerBalance
    });
  } catch (error) {
    await connection.rollback();
    if (error instanceof DuplicateReferenceError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error creating overpayment:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  } finally {
    connection.release();
  }
};

// POST /api/suppliers/settle-credit
const settleCreditToInvoice = async (req, res) => {
  const { purchase_id, credits, settlement_date, settled_by, notes } = req.body;

  if (!purchase_id) return res.status(400).json({ error: 'Purchase ID is required' });
  if (!Array.isArray(credits) || credits.length === 0) {
    return res.status(400).json({ error: 'At least one credit must be selected' });
  }
  if (!settlement_date) return res.status(400).json({ error: 'Settlement date is required' });
  if (!settled_by) return res.status(400).json({ error: 'Settled by is required' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[invoice]] = await connection.query(
      'SELECT * FROM purchases WHERE id = ? FOR UPDATE',
      [purchase_id]
    );
    if (!invoice) {
      await connection.rollback();
      return res.status(404).json({ error: 'Purchase invoice not found' });
    }

    let totalSettled = 0;
    let remainingInvoiceBalance = formatNum(invoice.balance_amount);

    for (const credit of credits) {
      const amount = formatNum(credit.amount);
      if (amount <= 0) continue;
      if (amount > remainingInvoiceBalance + 0.001) {
        await connection.rollback();
        return res.status(400).json({ error: `Credit amount exceeds remaining invoice balance` });
      }

      if (credit.credit_type === 'overpayment') {
        const [[op]] = await connection.query(
          'SELECT * FROM supplier_overpayments WHERE id = ? AND (is_deleted = 0 OR is_deleted IS NULL) FOR UPDATE',
          [credit.credit_id]
        );
        if (!op) {
          await connection.rollback();
          return res.status(404).json({ error: `Overpayment ${credit.credit_id} not found` });
        }
        if (formatNum(op.remaining_credit) < amount - 0.001) {
          await connection.rollback();
          return res.status(400).json({ error: `Insufficient credit in overpayment ${op.overpayment_number}` });
        }

        const newRemaining = formatNum(op.remaining_credit) - amount;
        const newStatus = newRemaining <= 0.001 ? 'Fully Used' :
          newRemaining < formatNum(op.original_amount) ? 'Partially Used' : 'Active';

        await connection.query(
          'UPDATE supplier_overpayments SET remaining_credit = ?, status = ?, updated_at = NOW() WHERE id = ?',
          [Math.max(0, newRemaining), newStatus, op.id]
        );

        await connection.query(`
          INSERT INTO credit_allocations
            (credit_type, overpayment_id, return_credit_id, purchase_id,
             allocated_amount, settlement_date, settled_by, notes)
          VALUES ('overpayment', ?, NULL, ?, ?, ?, ?, ?)
        `, [op.id, purchase_id, amount, settlement_date, settled_by, notes || null]);
      } else if (credit.credit_type === 'return_credit') {
        const [[rc]] = await connection.query(
          'SELECT * FROM purchase_return_credits WHERE id = ? FOR UPDATE',
          [credit.credit_id]
        );
        if (!rc) {
          await connection.rollback();
          return res.status(404).json({ error: `Return credit ${credit.credit_id} not found` });
        }
        if (formatNum(rc.remaining_credit) < amount - 0.001) {
          await connection.rollback();
          return res.status(400).json({ error: `Insufficient credit in return credit ${rc.credit_number}` });
        }

        const newRemaining = formatNum(rc.remaining_credit) - amount;
        const newStatus = newRemaining <= 0.001 ? 'Fully Used' :
          newRemaining < formatNum(rc.original_amount) ? 'Partially Used' : 'Active';

        await connection.query(
          'UPDATE purchase_return_credits SET remaining_credit = ?, status = ?, updated_at = NOW() WHERE id = ?',
          [Math.max(0, newRemaining), newStatus, rc.id]
        );

        await connection.query(`
          INSERT INTO credit_allocations
            (credit_type, overpayment_id, return_credit_id, purchase_id,
             allocated_amount, settlement_date, settled_by, notes)
          VALUES ('return_credit', NULL, ?, ?, ?, ?, ?)
        `, [rc.id, purchase_id, amount, settlement_date, settled_by, notes || null]);
      } else {
        await connection.rollback();
        return res.status(400).json({ error: `Unknown credit_type: ${credit.credit_type}` });
      }

      totalSettled += amount;
      remainingInvoiceBalance -= amount;
    }

    const newPaidAmount = formatNum(invoice.paid_amount) + totalSettled;
    const newBalance = Math.max(0, formatNum(invoice.total_with_vat) - newPaidAmount);
    const newBalanceStatus = newBalance > 0 ? 1 : 0;
    let newPaymentStatus = 'Non-Paid';
    if (newBalance <= 0) newPaymentStatus = 'Paid';
    else if (newPaidAmount > 0) newPaymentStatus = 'Partially Paid';

    await connection.query(
      `UPDATE purchases SET paid_amount = ?, balance_amount = ?, balance_status = ?, payment_status = ? WHERE id = ?`,
      [newPaidAmount, newBalance, newBalanceStatus, newPaymentStatus, purchase_id]
    );

    await connection.query(`
      INSERT INTO payment_history
        (purchase_id, payment_date, amount, payment_method, notes, created_by)
      VALUES (?, ?, ?, 'CREDIT', ?, ?)
    `, [purchase_id, settlement_date, totalSettled, `Credit settlement: ${notes || 'Applied supplier credit'}`, settled_by]);

    await connection.commit();
    res.json({
      message: 'Credit settled successfully!',
      total_settled: totalSettled,
      new_balance: newBalance,
      payment_status: newPaymentStatus
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error settling credit:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  } finally {
    connection.release();
  }
};

// GET /api/suppliers/:id/credit-history
const getSupplierCreditHistory = async (req, res) => {
  const { id: supplierId } = req.params;
  try {
    const [history] = await pool.query(`
      SELECT
        ca.id,
        ca.credit_type,
        ca.allocated_amount,
        ca.settlement_date,
        ca.notes,
        p.invoice_no,
        p.purchase_date,
        CASE ca.credit_type
          WHEN 'overpayment'   THEN so.overpayment_number
          WHEN 'return_credit' THEN prc.credit_number
        END AS credit_number,
        u.name AS settled_by_name
      FROM credit_allocations ca
      JOIN purchases p ON ca.purchase_id = p.id
      LEFT JOIN supplier_overpayments so ON ca.overpayment_id = so.id
      LEFT JOIN purchase_return_credits prc ON ca.return_credit_id = prc.id
      LEFT JOIN users u ON ca.settled_by = u.id
      WHERE p.supplier_id = ?
      ORDER BY ca.settlement_date DESC, ca.id DESC
    `, [supplierId]);

    res.json(history);
  } catch (error) {
    console.error('Error fetching credit history:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// GET /api/suppliers/outstanding/all
// GET /api/suppliers/outstanding/all
const getAllOutstandingRecords = async (req, res) => {
  try {
    await ensureUnsettledReturnCredits();

    const [invoices] = await pool.query(`
      SELECT
        p.id,
        s.id            AS supplier_id,
        s.name          AS supplier_name,
        p.company_id    AS company_id,
        c.name          AS company_name,
        'Invoice'       AS document_type,
        p.invoice_no    AS document_number,
        p.purchase_date AS transaction_date,
        p.balance_amount AS outstanding_amount,
        p.balance_amount AS balance_amount,
        p.payment_status AS status
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      LEFT JOIN company c ON p.company_id = c.id
      WHERE p.balance_amount > 0.001
        AND p.payment_status != 'Paid'
        AND (p.deleted = FALSE OR p.deleted IS NULL)
      ORDER BY s.name ASC, p.purchase_date DESC
    `);

    // Real, explicit advance payments (Pay Now -> ADV-... rows)
    const [realAdvances] = await pool.query(`
      SELECT
        so.id,
        s.id                    AS supplier_id,
        s.name                  AS supplier_name,
        so.company_id           AS company_id,
        c.name                   AS company_name,
        'Advance Payment'       AS document_type,
        so.overpayment_number   AS document_number,
        so.payment_date         AS transaction_date,
        so.remaining_credit     AS outstanding_amount,
        so.status
      FROM supplier_overpayments so
      JOIN supplier s ON so.supplier_id = s.id
      LEFT JOIN company c ON so.company_id = c.id
      WHERE so.status != 'Fully Used'
        AND so.remaining_credit > 0
        AND (so.is_deleted = 0 OR so.is_deleted IS NULL)
    `);

    // Genuinely unallocated payments: only payments that actually went through
    // the split-allocation path (pay-multiple-invoices) and still have leftover
    // amount. INNER JOIN is required here - a single-invoice payment has NO row
    // in purchase_payment_allocations by design (it's implicitly fully allocated
    // via payment_history.purchase_id), so a LEFT JOIN + COALESCE(...,0) wrongly
    // flags every ordinary payment as "unallocated". This is what was producing
    // the UNALLOC-* rows for legitimate, already-settled invoice payments.
    const [unallocatedPayments] = await pool.query(`
      SELECT
        ph.id                                       AS id,
        p.supplier_id                                AS supplier_id,
        s.name                                        AS supplier_name,
        p.company_id                                  AS company_id,
        c.name                                          AS company_name,
        'Advance Payment'                             AS document_type,
        CONCAT('UNALLOC-', ph.id)                     AS document_number,
        ph.payment_date                               AS transaction_date,
        (ph.amount - alloc.total_allocated)           AS outstanding_amount,
        'Active'                                       AS status
      FROM payment_history ph
      JOIN purchases p ON p.id = ph.purchase_id
      JOIN supplier s ON s.id = p.supplier_id
      LEFT JOIN company c ON c.id = p.company_id
      JOIN (
        SELECT payment_history_id, SUM(allocated_amount) AS total_allocated
        FROM purchase_payment_allocations
        GROUP BY payment_history_id
      ) alloc ON alloc.payment_history_id = ph.id
      WHERE COALESCE(p.deleted, 0) = 0
        AND (ph.amount - alloc.total_allocated) > 0.001
    `);

    const advances = [...realAdvances, ...unallocatedPayments].sort(
      (a, b) =>
        (a.supplier_name || '').localeCompare(b.supplier_name || '') ||
        new Date(b.transaction_date) - new Date(a.transaction_date)
    );

    const [returnCredits] = await pool.query(`
      SELECT
        prc.id,
        s.id                        AS supplier_id,
        s.name                      AS supplier_name,
        p2.company_id               AS company_id,
        c.name                       AS company_name,
        'Purchase Return Credit'    AS document_type,
        prc.credit_number           AS document_number,
        prc.credit_date             AS transaction_date,
        prc.remaining_credit        AS outstanding_amount,
        prc.status
      FROM purchase_return_credits prc
      JOIN supplier s ON prc.supplier_id = s.id
      JOIN purchase_returns pr ON prc.purchase_return_id = pr.id
      LEFT JOIN purchases p2 ON pr.purchase_id = p2.id
      LEFT JOIN company c ON p2.company_id = c.id
      WHERE prc.status != 'Fully Used'
        AND prc.remaining_credit > 0
      ORDER BY s.name ASC, prc.credit_date DESC
    `);

    const normalize = (records) =>
      records.map((r) => ({
        ...r,
        outstanding_amount: formatNum(r.outstanding_amount),
        balance_amount: formatNum(r.balance_amount || r.outstanding_amount)
      }));

    const normalizedInvoices = normalize(invoices);
    const normalizedAdvances = normalize(advances);
    const normalizedReturnCredits = normalize(returnCredits);

    res.json({
      OutstandingInvoices: normalizedInvoices,
      AdvancePayments: normalizedAdvances,
      PurchaseReturnCredits: normalizedReturnCredits,
      invoices: normalizedInvoices,
      advances: normalizedAdvances,
      return_credits: normalizedReturnCredits
    });
  } catch (error) {
    console.error('Error fetching all outstanding records:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

module.exports = {
  getSupplierCredits,
  getSupplierOutstanding,
  createOverpayment,
  settleCreditToInvoice,
  getSupplierCreditHistory,
  getAllOutstandingRecords
};