// server/controllers/staffLoanController.js
//
// Finance -> Staff Loans.
//
// * Employees come from the EXISTING Employee Management `employees` table
//   (read-only here). Nothing in Employee Management is created or changed.
// * A loan's balance is never stored: it is always
//       loan_amount - SUM(staff_loan_repayments.amount)
// * Ledger convention (see the Finance schema in config/db.js):
//       DEBIT  = money IN  to the Cash Book (increases the balance)
//       CREDIT = money OUT of the Cash Book (decreases the balance)
//   The controller never touches cash_accounts.current_balance or any
//   displayed balance; every Cash Book change goes through the shared
//   recordCashTransaction() helper, which owns the balance calculation.
// * "Create Staff Loan" saves the loan row AND posts a CREDIT (money out - the
//   company is paying the employee) to the company's Cash Book, dated on the
//   Loan Issued Date, inside ONE database transaction.
// * "Receive Cash" saves a repayment row AND posts a DEBIT (money in) to the
//   same Cash Book inside ONE database transaction.
//   In both cases the loan/repayment, its balance/status and the Cash Book can
//   never disagree: any failure rolls all of it back.

const pool = require('../config/db');
const { recordCashTransaction } = require('../utils/financeLedger');
const {
  parsePositiveMoney,
  dbToCents,
  centsToNumber,
  formatCents,
  parseDateOnly,
  parseId,
  HttpError
} = require('../utils/staffLoanUtils');

const CHEQUE_DETAILS_MAX = 500;

// Ledger labels for the Cash Book row created by a repayment (money in).
const LEDGER_TRANSACTION_TYPE = 'Staff Loan Repayment';
const LEDGER_REFERENCE_TYPE = 'STAFF_LOAN_REPAYMENT';

// Ledger labels for the Cash Book row created when a loan is issued (money out).
const ISSUE_LEDGER_TRANSACTION_TYPE = 'Staff Loan Issued';
const ISSUE_LEDGER_REFERENCE_TYPE = 'STAFF_LOAN_ISSUE';

// One loan with its computed totals. The balance is calculated here, in SQL,
// from the repayment rows - there is no stored balance column.
const LOAN_SELECT = `
  SELECT
    sl.id,
    sl.employee_id,
    e.employee_code,
    e.employee_name,
    sl.company_id,
    c.name AS company_name,
    sl.loan_amount,
    DATE_FORMAT(sl.issued_date, '%Y-%m-%d') AS issued_date,
    sl.cheque_details,
    sl.issue_finance_transaction_id,
    sl.status AS stored_status,
    COALESCE(r.total_received, 0) AS total_received,
    sl.created_at
  FROM staff_loans sl
  JOIN employees e ON e.id = sl.employee_id
  LEFT JOIN company c ON c.id = sl.company_id
  LEFT JOIN (
    SELECT staff_loan_id, ROUND(SUM(amount), 2) AS total_received
    FROM staff_loan_repayments
    GROUP BY staff_loan_id
  ) r ON r.staff_loan_id = sl.id
`;

// Shapes a LOAN_SELECT row for the API. Status is derived from the computed
// balance so it can never contradict the repayment history.
const shapeLoan = (row) => {
  const loanCents = dbToCents(row.loan_amount);
  const receivedCents = dbToCents(row.total_received);
  const balanceCents = loanCents - receivedCents;

  return {
    id: row.id,
    employee_id: row.employee_id,
    employee_code: row.employee_code,
    employee_name: row.employee_name,
    company_id: row.company_id,
    company_name: row.company_name,
    loan_amount: centsToNumber(loanCents),
    issued_date: row.issued_date,
    cheque_details: row.cheque_details,
    issue_finance_transaction_id: row.issue_finance_transaction_id ?? null,
    total_received: centsToNumber(receivedCents),
    balance: centsToNumber(balanceCents),
    status: balanceCents <= 0 ? 'Settled' : 'Active',
    created_at: row.created_at
  };
};

const fetchLoan = async (db, id) => {
  const [rows] = await db.query(`${LOAN_SELECT} WHERE sl.id = ?`, [id]);
  return rows.length ? shapeLoan(rows[0]) : null;
};

const sendError = (res, error, fallbackMessage, logLabel) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(`${logLabel}:`, error);
  return res.status(500).json({ error: fallbackMessage });
};

// =============================================
// GET /api/staff-loans/form-options
// Active employees (from Employee Management) + companies that have a Cash
// Book, for the Create Staff Loan form. Kept inside this module because the
// /api/employees routes are Admin/Super Admin only, while Accountants also
// create staff loans. Read-only; returns only what the form needs.
// =============================================
const getFormOptions = async (req, res) => {
  try {
    const [employees] = await pool.query(
      `SELECT id, employee_code, employee_name
       FROM employees
       WHERE status = 'Active'
       ORDER BY employee_name ASC`
    );

    const [companies] = await pool.query(
      `SELECT c.id, c.name
       FROM company c
       WHERE EXISTS (SELECT 1 FROM cash_accounts ca WHERE ca.company_id = c.id)
       ORDER BY c.name ASC`
    );

    res.json({ employees, companies });
  } catch (error) {
    sendError(res, error, 'Failed to load form options', 'Error fetching staff loan form options');
  }
};

// =============================================
// POST /api/staff-loans  - Create Staff Loan
//
// Saves the loan AND records the payout in the company's Cash Book as a
// Cash Out (CREDIT) on the Loan Issued Date, in ONE database transaction.
// =============================================
const createStaffLoan = async (req, res) => {
  let connection;
  try {
    // ---- Validation (nothing touches the database until all of it passes) ----
    const body = req.body || {};

    const employeeId = parseId(body.employee_id);
    if (!employeeId) throw new HttpError(400, 'Please select an employee');

    const companyId = parseId(body.company_id);
    if (!companyId) throw new HttpError(400, 'Please select a company');

    const amount = parsePositiveMoney(body.loan_amount, 'Loan amount');
    if (amount.error) throw new HttpError(400, amount.error);

    const issuedDate = parseDateOnly(body.issued_date);
    if (!issuedDate) throw new HttpError(400, 'Please enter a valid issued date');

    let chequeDetails = null;
    if (body.cheque_details !== undefined && body.cheque_details !== null) {
      if (typeof body.cheque_details !== 'string') {
        throw new HttpError(400, 'Cheque details must be text');
      }
      chequeDetails = body.cheque_details.trim() || null;
      if (chequeDetails && chequeDetails.length > CHEQUE_DETAILS_MAX) {
        throw new HttpError(400, `Cheque details must be ${CHEQUE_DETAILS_MAX} characters or fewer`);
      }
    }

    const userId = req.user?.userId ?? null;

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Employee must exist in Employee Management AND be active.
    const [employees] = await connection.query(
      'SELECT id, employee_name, status FROM employees WHERE id = ?',
      [employeeId]
    );
    if (employees.length === 0) throw new HttpError(400, 'Selected employee was not found');
    if (employees[0].status !== 'Active') {
      throw new HttpError(400, 'Only active employees can be given a staff loan');
    }
    const employeeName = employees[0].employee_name;

    // The company must have a Cash Book: the loan payout is recorded in it now,
    // and repayments are received into it later.
    const [cashAccounts] = await connection.query(
      'SELECT company_id FROM cash_accounts WHERE company_id = ?',
      [companyId]
    );
    if (cashAccounts.length === 0) {
      throw new HttpError(400, 'Selected company has no valid Cash Book');
    }

    const amountDecimal = centsToNumber(amount.cents);

    // 1) The loan itself.
    const [result] = await connection.query(
      `INSERT INTO staff_loans
         (employee_id, company_id, loan_amount, issued_date, cheque_details, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'Active', ?)`,
      [employeeId, companyId, amountDecimal, issuedDate, chequeDetails, userId]
    );
    const loanId = result.insertId;

    // 2) Cash Book: CREDIT = money out (the company pays the employee), dated on
    //    the Loan Issued Date, through the existing ledger helper. The helper
    //    applies New Balance = Previous Balance + Debit - Credit; the balance is
    //    never edited here.
    const cashBalance = await recordCashTransaction(connection, {
      companyId,
      date: issuedDate,
      remark: `Staff Loan Issued - ${employeeName}`,
      credit: amountDecimal,
      transactionType: ISSUE_LEDGER_TRANSACTION_TYPE,
      partyName: employeeName,
      referenceType: ISSUE_LEDGER_REFERENCE_TYPE,
      referenceId: loanId,
      createdBy: userId
    });

    // 3) Link the loan to the Cash Book row it created, and confirm that row is
    //    really a Cash Out for exactly the loan amount (rolls back if not).
    const [ledgerRows] = await connection.query(
      `SELECT id, debit, credit FROM finance_transactions
       WHERE account_type = 'CASH' AND reference_type = ? AND reference_id = ?
       ORDER BY id DESC LIMIT 1`,
      [ISSUE_LEDGER_REFERENCE_TYPE, loanId]
    );
    if (ledgerRows.length === 0) {
      throw new Error('Cash Book entry was not created for the staff loan');
    }
    if (dbToCents(ledgerRows[0].credit) !== amount.cents || dbToCents(ledgerRows[0].debit) !== 0) {
      throw new Error('Cash Book entry for the staff loan was not recorded as a Cash Out of the loan amount');
    }
    await connection.query(
      'UPDATE staff_loans SET issue_finance_transaction_id = ? WHERE id = ?',
      [ledgerRows[0].id, loanId]
    );

    const loan = await fetchLoan(connection, loanId);

    await connection.commit();

    res.status(201).json({
      message: 'Staff loan created successfully',
      loan,
      cash_balance: cashBalance
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Rollback failed while creating staff loan:', rollbackError);
      }
    }
    sendError(res, error, 'Failed to create staff loan', 'Error creating staff loan');
  } finally {
    if (connection) connection.release();
  }
};

// =============================================
// GET /api/staff-loans?status=Active|Settled
// All loans (settled ones stay visible - nothing is deleted on settlement).
// =============================================
const getStaffLoans = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `${LOAN_SELECT} ORDER BY sl.issued_date DESC, sl.id DESC`
    );

    let loans = rows.map(shapeLoan);
    const { status } = req.query;
    if (status === 'Active' || status === 'Settled') {
      loans = loans.filter((loan) => loan.status === status);
    }

    res.json(loans);
  } catch (error) {
    sendError(res, error, 'Failed to fetch staff loans', 'Error fetching staff loans');
  }
};

// =============================================
// GET /api/staff-loans/:id
// =============================================
const getStaffLoanById = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) throw new HttpError(400, 'Invalid staff loan ID');

    const loan = await fetchLoan(pool, id);
    if (!loan) throw new HttpError(404, 'Staff loan not found');

    res.json(loan);
  } catch (error) {
    sendError(res, error, 'Failed to fetch staff loan', 'Error fetching staff loan');
  }
};

// =============================================
// GET /api/staff-loans/:id/repayments  - Repayment history
// =============================================
const getRepaymentHistory = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) throw new HttpError(400, 'Invalid staff loan ID');

    const loan = await fetchLoan(pool, id);
    if (!loan) throw new HttpError(404, 'Staff loan not found');

    const [rows] = await pool.query(
      `SELECT
         r.id,
         r.amount,
         DATE_FORMAT(r.received_date, '%Y-%m-%d') AS received_date,
         r.finance_transaction_id,
         u.name AS received_by,
         r.created_at
       FROM staff_loan_repayments r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.staff_loan_id = ?
       ORDER BY r.received_date ASC, r.id ASC`,
      [id]
    );

    // Balance remaining after each repayment, in the order they were received.
    let runningCents = dbToCents(loan.loan_amount);
    const repayments = rows.map((row) => {
      const amountCents = dbToCents(row.amount);
      runningCents -= amountCents;
      return {
        id: row.id,
        amount: centsToNumber(amountCents),
        received_date: row.received_date,
        balance_after: centsToNumber(runningCents),
        finance_transaction_id: row.finance_transaction_id,
        received_by: row.received_by,
        created_at: row.created_at
      };
    });

    res.json({ loan, repayments });
  } catch (error) {
    sendError(res, error, 'Failed to fetch repayment history', 'Error fetching staff loan repayments');
  }
};

// =============================================
// POST /api/staff-loans/:id/repayments  - Receive Cash
// =============================================
const receiveCash = async (req, res) => {
  let connection;
  try {
    // ---- Validation (nothing touches the database until all of it passes) ----
    const loanId = parseId(req.params.id);
    if (!loanId) throw new HttpError(400, 'Invalid staff loan ID');

    const body = req.body || {};

    const amount = parsePositiveMoney(body.amount, 'Amount');
    if (amount.error) throw new HttpError(400, amount.error);

    if (body.received_date === undefined || body.received_date === null || String(body.received_date).trim() === '') {
      throw new HttpError(400, 'Date is required');
    }
    const receivedDate = parseDateOnly(body.received_date);
    if (!receivedDate) throw new HttpError(400, 'Please enter a valid date');

    const userId = req.user?.userId ?? null;

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Lock the loan row so two simultaneous repayments cannot both pass the
    // balance check below.
    const [loanRows] = await connection.query(
      `SELECT id, employee_id, company_id, loan_amount, status,
              DATE_FORMAT(issued_date, '%Y-%m-%d') AS issued_date
       FROM staff_loans
       WHERE id = ?
       FOR UPDATE`,
      [loanId]
    );
    if (loanRows.length === 0) throw new HttpError(404, 'Staff loan not found');
    const loan = loanRows[0];

    const [employeeRows] = await connection.query(
      'SELECT employee_name FROM employees WHERE id = ?',
      [loan.employee_id]
    );
    if (employeeRows.length === 0) throw new HttpError(400, 'Employee record for this loan was not found');
    const employeeName = employeeRows[0].employee_name;

    const [sumRows] = await connection.query(
      'SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS total_received FROM staff_loan_repayments WHERE staff_loan_id = ?',
      [loanId]
    );
    const loanCents = dbToCents(loan.loan_amount);
    const balanceCents = loanCents - dbToCents(sumRows[0]?.total_received);

    if (balanceCents <= 0) {
      throw new HttpError(400, 'This loan is already fully settled. No further cash can be received.');
    }
    if (amount.cents > balanceCents) {
      throw new HttpError(
        400,
        `Amount cannot exceed the outstanding balance of Rs. ${formatCents(balanceCents)}`
      );
    }
    if (receivedDate < loan.issued_date) {
      throw new HttpError(400, 'Date cannot be earlier than the date the loan was issued');
    }

    // The company's Cash Book must exist, otherwise the Cash Book could not be updated.
    const [cashAccounts] = await connection.query(
      'SELECT company_id FROM cash_accounts WHERE company_id = ?',
      [loan.company_id]
    );
    if (cashAccounts.length === 0) {
      throw new HttpError(400, 'The company for this loan has no valid Cash Book');
    }

    const amountDecimal = centsToNumber(amount.cents);

    // 1) Repayment transaction (kept separately; the loan amount is never overwritten).
    const [repaymentResult] = await connection.query(
      `INSERT INTO staff_loan_repayments (staff_loan_id, amount, received_date, created_by)
       VALUES (?, ?, ?, ?)`,
      [loanId, amountDecimal, receivedDate, userId]
    );
    const repaymentId = repaymentResult.insertId;

    // 2) Cash Book: DEBIT = money in, using the existing ledger helper and conventions.
    const cashBalance = await recordCashTransaction(connection, {
      companyId: loan.company_id,
      date: receivedDate,
      remark: `Staff Loan Repayment - ${employeeName}`,
      debit: amountDecimal,
      transactionType: LEDGER_TRANSACTION_TYPE,
      partyName: employeeName,
      referenceType: LEDGER_REFERENCE_TYPE,
      referenceId: repaymentId,
      createdBy: userId
    });

    // 3) Link the repayment to the Cash Book row it created.
    const [ledgerRows] = await connection.query(
      `SELECT id FROM finance_transactions
       WHERE account_type = 'CASH' AND reference_type = ? AND reference_id = ?
       ORDER BY id DESC LIMIT 1`,
      [LEDGER_REFERENCE_TYPE, repaymentId]
    );
    if (ledgerRows.length === 0) {
      throw new Error('Cash Book entry was not created for the repayment');
    }
    await connection.query(
      'UPDATE staff_loan_repayments SET finance_transaction_id = ? WHERE id = ?',
      [ledgerRows[0].id, repaymentId]
    );

    // 4) Mark the loan settled once nothing is owed.
    if (balanceCents - amount.cents === 0) {
      await connection.query("UPDATE staff_loans SET status = 'Settled' WHERE id = ?", [loanId]);
    }

    const updatedLoan = await fetchLoan(connection, loanId);

    await connection.commit();

    res.status(201).json({
      message: 'Cash received successfully',
      repayment: { id: repaymentId, amount: amountDecimal, received_date: receivedDate },
      loan: updatedLoan,
      cash_balance: cashBalance
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Rollback failed while receiving staff loan cash:', rollbackError);
      }
    }
    sendError(res, error, 'Failed to receive cash', 'Error receiving staff loan cash');
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  getFormOptions,
  createStaffLoan,
  getStaffLoans,
  getStaffLoanById,
  getRepaymentHistory,
  receiveCash
};
