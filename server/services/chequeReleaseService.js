const pool = require('../config/db');
const { recordCashTransaction, recordBankTransaction } = require('../utils/financeLedger');

const ensureChequeReleaseSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS finance_cheque_transfers (
      id INT NOT NULL AUTO_INCREMENT,
      company_id INT NOT NULL,
      bank_id INT NOT NULL,
      amount DECIMAL(14,2) NOT NULL,
      transfer_date DATE NOT NULL,
      cheque_number VARCHAR(100) NOT NULL,
      remark VARCHAR(255) NULL,
      created_by INT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_finance_cheque_transfer (bank_id, cheque_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  try {
    await pool.query(`
      ALTER TABLE expenses_cheque_registry
      MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'Pending'
    `);
  } catch (_) {}

  // Migrate legacy unreleased cheques from 'Active' to 'Pending'
  try {
    await pool.query(`
      UPDATE expenses_cheque_registry
      SET status = 'Pending'
      WHERE status = 'Active' AND release_date IS NULL
    `);
  } catch (_) {}

  try {
    await pool.query(`
      ALTER TABLE payment_history
      ADD COLUMN IF NOT EXISTS bank_id INT NULL AFTER check_number
    `);
  } catch (_) {
    try {
      await pool.query('ALTER TABLE payment_history ADD COLUMN bank_id INT NULL AFTER check_number');
    } catch (_) {}
  }

  try {
    await pool.query(`
      ALTER TABLE expenses_cheque_registry
      ADD COLUMN IF NOT EXISTS bank_id INT NULL AFTER bank
    `);
  } catch (_) {
    try {
      await pool.query('ALTER TABLE expenses_cheque_registry ADD COLUMN bank_id INT NULL AFTER bank');
    } catch (_) {}
  }

  // ── Type field: Expense vs Transfer ────────────────────────────────────
  // 'Expense'  - a real business expense (RM Purchasing / New Expenses cheque
  //              payments) - included in the Expense Report.
  // 'Transfer' - an internal Bank<->Cash movement of funds (BANK_TO_CASH
  //              cheque transfers) - NOT an expense, excluded from the
  //              Expense Report. Ledger posting for these is already
  //              dual-leg (Bank credit + Cash debit) via getChequeSource's
  //              dualLeg branch above, so no release-logic change is needed
  //              - this column only makes that classification explicit and
  //              queryable instead of implicit in source_type.
  try {
    await pool.query(`
      ALTER TABLE expenses_cheque_registry
      ADD COLUMN IF NOT EXISTS type ENUM('Expense','Transfer') NOT NULL DEFAULT 'Expense' AFTER source_id
    `);
  } catch (_) {
    try {
      await pool.query(
        "ALTER TABLE expenses_cheque_registry ADD COLUMN type ENUM('Expense','Transfer') NOT NULL DEFAULT 'Expense' AFTER source_id"
      );
    } catch (_) {}
  }

  // Backfill: any existing BANK_TO_CASH rows were inserted before this
  // column existed and defaulted to 'Expense' - correct them to 'Transfer'.
  // PURCHASING_PAYMENT / EXPENSE_PAYMENT rows are already correct as
  // 'Expense' via the column default.
  try {
    await pool.query(
      "UPDATE expenses_cheque_registry SET type = 'Transfer' WHERE source_type = 'BANK_TO_CASH' AND type != 'Transfer'"
    );
  } catch (_) {}
};

const rebuildAccountBalance = async (connection, accountType, accountId) => {
  const accountColumn = accountType === 'BANK' ? 'bank_id' : 'company_id';
  const [rows] = await connection.query(
    `SELECT COALESCE(SUM(debit - credit), 0) AS balance
     FROM finance_transactions
     WHERE status = 1 AND account_type = ? AND ${accountColumn} = ?`,
    [accountType, accountId]
  );
  const balance = Number.parseFloat(rows[0]?.balance || 0);

  if (accountType === 'BANK') {
    await connection.query('UPDATE bank_details SET current_balance = ? WHERE id = ?', [balance, accountId]);
  } else {
    await connection.query('UPDATE cash_accounts SET current_balance = ? WHERE company_id = ?', [balance, accountId]);
  }
};

const getLedgerReferenceTypes = (sourceType) => {
  if (sourceType === 'PURCHASING_PAYMENT') return ['PURCHASE_PAYMENT', 'PURCHASING_PAYMENT'];
  if (sourceType === 'BANK_TO_CASH') return ['CASH_BANK_TRANSFER', 'BANK_TO_CASH'];
  if (sourceType === 'EXPENSE_PAYMENT') return ['EXPENSE_PAYMENT'];
  return [sourceType];
};

const getCanonicalReferenceType = (sourceType) => {
  if (sourceType === 'PURCHASING_PAYMENT') return 'PURCHASE_PAYMENT';
  if (sourceType === 'BANK_TO_CASH') return 'CASH_BANK_TRANSFER';
  if (sourceType === 'EXPENSE_PAYMENT') return 'EXPENSE_PAYMENT';
  return sourceType;
};

const hasActiveLedgerEntry = async (connection, sourceType, sourceId, accountType, accountId) => {
  const accountClause = accountType === 'BANK' ? 'bank_id = ?' : 'company_id = ?';
  const refTypes = getLedgerReferenceTypes(sourceType);
  const [rows] = await connection.query(
    `SELECT id FROM finance_transactions
     WHERE status = 1 AND account_type = ? AND ${accountClause}
       AND reference_type IN (?) AND reference_id = ?
     LIMIT 1`,
    [accountType, accountId, refTypes, sourceId]
  );
  return rows.length > 0;
};

const resolveBankIdFromBankString = async (connection, bankString) => {
  if (!bankString || typeof bankString !== 'string') return null;
  const trimmed = bankString.trim();
  if (!trimmed) return null;

  // Check for account number in parentheses, e.g. "Peoples Bank (002110004837)"
  const accMatch = trimmed.match(/\(([^)]+)\)/);
  if (accMatch) {
    const accNum = accMatch[1].trim();
    const [rows] = await connection.query(
      'SELECT id FROM bank_details WHERE account_number = ? LIMIT 1',
      [accNum]
    );
    if (rows.length) return rows[0].id;
  }

  // Try matching by exact account number
  const [byAcc] = await connection.query(
    'SELECT id FROM bank_details WHERE account_number = ? LIMIT 1',
    [trimmed]
  );
  if (byAcc.length) return byAcc[0].id;

  // Try matching by bank name
  const [byName] = await connection.query(
    'SELECT id FROM bank_details WHERE bank_name = ? LIMIT 1',
    [trimmed]
  );
  if (byName.length) return byName[0].id;

  // Try match where bankString contains bank_name
  const [likeRows] = await connection.query(
    'SELECT id FROM bank_details WHERE ? LIKE CONCAT("%", bank_name, "%") ORDER BY CHAR_LENGTH(bank_name) DESC LIMIT 1',
    [trimmed]
  );
  if (likeRows.length) return likeRows[0].id;

  return null;
};

const getChequeSource = async (connection, cheque) => {
  if (cheque.source_type === 'BANK_TO_CASH') {
    const [rows] = await connection.query(
      `SELECT company_id, bank_id, amount, transfer_date, remark, created_by
       FROM finance_cheque_transfers WHERE id = ? FOR UPDATE`,
      [cheque.source_id]
    );
    if (!rows.length) throw new Error('Finance cheque transfer source was not found');
    return { ...rows[0], cashCompanyId: rows[0].company_id, dualLeg: true };
  }

  if (cheque.source_type === 'PURCHASING_PAYMENT') {
    let rows;
    try {
      [rows] = await connection.query(
        `SELECT ph.amount, ph.payment_date AS transfer_date, ph.bank_id, ph.created_by,
                p.company_id, s.name AS party_name,
                CASE WHEN UPPER(ph.payment_method) = 'CHEQUE' THEN 'CHEQUE' ELSE ph.payment_method END AS payment_method
         FROM payment_history ph
         LEFT JOIN purchases p ON p.id = ph.purchase_id
         LEFT JOIN supplier s ON s.id = p.supplier_id
         WHERE ph.id = ? FOR UPDATE`,
        [cheque.source_id]
      );
    } catch (err) {
      if (err.code === 'ER_BAD_FIELD_ERROR' || String(err.message).includes('bank_id') || String(err.sqlMessage).includes('bank_id')) {
        [rows] = await connection.query(
          `SELECT ph.amount, ph.payment_date AS transfer_date, NULL AS bank_id, ph.created_by,
                  p.company_id, s.name AS party_name,
                  CASE WHEN UPPER(ph.payment_method) = 'CHEQUE' THEN 'CHEQUE' ELSE ph.payment_method END AS payment_method
           FROM payment_history ph
           LEFT JOIN purchases p ON p.id = ph.purchase_id
           LEFT JOIN supplier s ON s.id = p.supplier_id
           WHERE ph.id = ? FOR UPDATE`,
          [cheque.source_id]
        );
      } else {
        throw err;
      }
    }
    if (!rows.length) throw new Error('Purchasing cheque source was not found');
    const source = rows[0];

    if (!source.bank_id && cheque.bank_id) {
      source.bank_id = cheque.bank_id;
    }
    if (!source.bank_id && cheque.bank) {
      source.bank_id = await resolveBankIdFromBankString(connection, cheque.bank);
    }

    if (source.bank_id) {
      if (!cheque.bank_id) {
        await connection.query(
          'UPDATE expenses_cheque_registry SET bank_id = ? WHERE id = ?',
          [source.bank_id, cheque.id]
        ).catch(() => {});
      }
      await connection.query(
        'UPDATE payment_history SET bank_id = ? WHERE id = ? AND bank_id IS NULL',
        [source.bank_id, cheque.source_id]
      ).catch(() => {});
    }

    return source;
  }

  const [rows] = await connection.query(
    `SELECT ep.transfer_amount AS amount, ep.payment_date AS transfer_date, ep.bank_id,
            ep.created_by, e.company_id, ep.payee_name AS party_name
     FROM expense_payments ep
     LEFT JOIN expense_payment_allocations epa ON epa.payment_id = ep.id
     LEFT JOIN expenses e ON e.id = epa.expense_id
     WHERE ep.id = ?
     ORDER BY epa.id ASC LIMIT 1 FOR UPDATE`,
    [cheque.source_id]
  );
  if (!rows.length) throw new Error('Expense cheque source was not found');
  const source = rows[0];
  if (!source.bank_id && cheque.bank_id) {
    source.bank_id = cheque.bank_id;
  }
  if (!source.bank_id && cheque.bank) {
    source.bank_id = await resolveBankIdFromBankString(connection, cheque.bank);
  }
  if (source.bank_id && !cheque.bank_id) {
    await connection.query(
      'UPDATE expenses_cheque_registry SET bank_id = ? WHERE id = ?',
      [source.bank_id, cheque.id]
    ).catch(() => {});
  }
  return source;
};

const resolveCashCompany = async (connection, source) => {
  if (source.company_id) return source.company_id;
  const [rows] = await connection.query('SELECT company_id FROM cash_accounts ORDER BY id LIMIT 1');
  return rows[0]?.company_id || null;
};

const postChequeRelease = async (connection, chequeOrId, releaseDate) => {
  let cheque = chequeOrId;
  if (typeof chequeOrId === 'number' || typeof chequeOrId === 'string') {
    const [rows] = await connection.query(
      'SELECT * FROM expenses_cheque_registry WHERE id = ? FOR UPDATE',
      [chequeOrId]
    );
    if (!rows.length) throw new Error(`Cheque ${chequeOrId} not found`);
    cheque = rows[0];
  }

  const source = await getChequeSource(connection, cheque);
  const amount = Number.parseFloat(source.amount ?? cheque.amount) || 0;
  if (amount <= 0) throw new Error(`Cheque ${cheque.id} has an invalid amount`);

  const effectiveReleaseDate = releaseDate
    ? String(releaseDate).slice(0, 10)
    : (cheque.release_date ? String(cheque.release_date).slice(0, 10) : new Date().toISOString().slice(0, 10));

  const canonicalRef = getCanonicalReferenceType(cheque.source_type);
  const refTypes = getLedgerReferenceTypes(cheque.source_type);
  const referenceId = cheque.source_id;
  const referenceNumber = cheque.cheque_number;
  const remark = `Cheque payment - ${cheque.cheque_number}${cheque.name ? ` (${cheque.name})` : ''}`;

  if (!source.dualLeg && !source.bank_id && (cheque.account_type === 'BANK' || cheque.bank_id || cheque.bank)) {
    if (cheque.bank_id) {
      source.bank_id = cheque.bank_id;
    } else if (cheque.bank) {
      source.bank_id = await resolveBankIdFromBankString(connection, cheque.bank);
    }
    if (!source.bank_id) {
      const [firstBank] = await connection.query('SELECT id FROM bank_details WHERE status = 1 ORDER BY id LIMIT 1').catch(() => [[]]);
      if (firstBank?.length) {
        source.bank_id = firstBank[0].id;
      }
    }
    if (source.bank_id && !cheque.bank_id) {
      await connection.query('UPDATE expenses_cheque_registry SET bank_id = ? WHERE id = ?', [source.bank_id, cheque.id]).catch(() => {});
    }
  }

  if (source.dualLeg) {
    // Bank->Cash cheque transfers: the Bank Ledger leg is posted immediately
    // when the transfer is created (see financeController.js transferFunds),
    // dated the Transfer Date, and must stay untouched from here on -
    // Release only ever posts the Cash Ledger leg, dated the Released Date.
    // This is what keeps "Bank decreases on Transfer Date" and "Cash
    // increases on Released Date" independent of each other.
    const companyId = await resolveCashCompany(connection, source);
    const bankPosted = await hasActiveLedgerEntry(connection, cheque.source_type, referenceId, 'BANK', source.bank_id);
    const cashPosted = await hasActiveLedgerEntry(connection, cheque.source_type, referenceId, 'CASH', companyId);

    if (!bankPosted) {
      // Legacy safety net only: a Bank leg should already exist from
      // creation time. If it's somehow missing (e.g. a cheque created
      // before this Transfer-Date-deduction behavior existed), post it now
      // dated the original Transfer Date - never the Release Date - so
      // historical Bank Ledger timing is still correct.
      await recordBankTransaction(connection, {
        bankId: source.bank_id,
        date: source.transfer_date ? String(source.transfer_date).slice(0, 10) : effectiveReleaseDate,
        remark: source.remark || `Transfer to Cash (Cheque ${referenceNumber})`,
        credit: amount,
        transactionType: 'Bank Withdrawal',
        referenceNumber,
        partyName: cheque.name,
        referenceType: canonicalRef,
        referenceId,
        createdBy: source.created_by
      });
      await rebuildAccountBalance(connection, 'BANK', source.bank_id);
    }

    if (cashPosted) {
      await connection.query(
        `UPDATE finance_transactions
         SET transaction_date = ?
         WHERE status = 1 AND account_type = 'CASH' AND company_id = ?
           AND reference_type IN (?) AND reference_id = ?`,
        [effectiveReleaseDate, companyId, refTypes, referenceId]
      );
    } else {
      await recordCashTransaction(connection, {
        companyId,
        date: effectiveReleaseDate,
        remark: source.remark || `Transfer from Bank (Cheque ${referenceNumber})`,
        debit: amount,
        transactionType: 'Bank Withdrawal',
        referenceNumber,
        partyName: cheque.name,
        referenceType: canonicalRef,
        referenceId,
        createdBy: source.created_by
      });
    }

    if (companyId) {
      await rebuildAccountBalance(connection, 'CASH', companyId);
    }
  } else if (source.bank_id) {
    const bankPosted = await hasActiveLedgerEntry(connection, cheque.source_type, referenceId, 'BANK', source.bank_id);
    if (bankPosted) {
      await connection.query(
        `UPDATE finance_transactions
         SET transaction_date = ?
         WHERE status = 1 AND account_type = 'BANK' AND bank_id = ?
           AND reference_type IN (?) AND reference_id = ?`,
        [effectiveReleaseDate, source.bank_id, refTypes, referenceId]
      );
    } else {
      await recordBankTransaction(connection, {
        bankId: source.bank_id,
        date: effectiveReleaseDate,
        remark,
        credit: amount,
        transactionType: cheque.source_type === 'PURCHASING_PAYMENT' ? 'RM Purchase Payment' : 'Cheque Expense Payment',
        referenceNumber,
        partyName: cheque.name || source.party_name,
        referenceType: canonicalRef,
        referenceId,
        createdBy: source.created_by
      });
    }
    await rebuildAccountBalance(connection, 'BANK', source.bank_id);
  } else {
    const companyId = await resolveCashCompany(connection, source);
    const cashPosted = await hasActiveLedgerEntry(connection, cheque.source_type, referenceId, 'CASH', companyId);
    if (cashPosted) {
      await connection.query(
        `UPDATE finance_transactions
         SET transaction_date = ?
         WHERE status = 1 AND account_type = 'CASH' AND company_id = ?
           AND reference_type IN (?) AND reference_id = ?`,
        [effectiveReleaseDate, companyId, refTypes, referenceId]
      );
    } else {
      await recordCashTransaction(connection, {
        companyId,
        date: effectiveReleaseDate,
        remark,
        credit: amount,
        transactionType: cheque.source_type === 'PURCHASING_PAYMENT' ? 'RM Purchase Payment' : 'Cheque Expense Payment',
        referenceNumber,
        partyName: cheque.name || source.party_name,
        referenceType: canonicalRef,
        referenceId,
        createdBy: source.created_by
      });
    }
    if (companyId) {
      await rebuildAccountBalance(connection, 'CASH', companyId);
    }
  }

  await connection.query(
    `UPDATE expenses_cheque_registry
     SET status = 'Released', release_date = ?, returned = 0
     WHERE id = ?`,
    [effectiveReleaseDate, cheque.id]
  );

  return true;
};

const unreleaseCheque = async (connection, chequeOrId, newStatus = 'Pending') => {
  let cheque = chequeOrId;
  if (typeof chequeOrId === 'number' || typeof chequeOrId === 'string') {
    const [rows] = await connection.query(
      'SELECT * FROM expenses_cheque_registry WHERE id = ? FOR UPDATE',
      [chequeOrId]
    );
    if (!rows.length) return false;
    cheque = rows[0];
  }

  const refTypes = getLedgerReferenceTypes(cheque.source_type);
  // Bank->Cash cheque transfers post their Bank leg once, at creation
  // (Transfer Date), and it must never be reversed by a later status
  // change (Released -> Pending, or -> Returned) - per the fixed Transfer-
  // Date-deduction behavior, only the Cash leg (posted at Release) is
  // ever reversible here. Other cheque types (single-leg) are unaffected.
  const accountTypeFilter = cheque.source_type === 'BANK_TO_CASH' ? "AND account_type = 'CASH'" : '';

  const [ledgerRows] = await connection.query(
    `SELECT id, account_type, bank_id, company_id
     FROM finance_transactions
     WHERE status = 1 AND reference_type IN (?) AND reference_id = ? ${accountTypeFilter} FOR UPDATE`,
    [refTypes, cheque.source_id]
  );

  if (ledgerRows.length > 0) {
    await connection.query(
      `UPDATE finance_transactions
       SET status = 0
       WHERE status = 1 AND reference_type IN (?) AND reference_id = ? ${accountTypeFilter}`,
      [refTypes, cheque.source_id]
    );

    for (const row of ledgerRows) {
      await rebuildAccountBalance(
        connection,
        row.account_type,
        row.account_type === 'BANK' ? row.bank_id : row.company_id
      );
    }
  }

  await connection.query(
    `UPDATE expenses_cheque_registry
     SET status = ?
     WHERE id = ?`,
    [newStatus, cheque.id]
  );

  return true;
};

const postChequeIfDue = async (connection, cheque, today) => {
  if (!cheque.release_date || String(cheque.release_date).slice(0, 10) > today) return false;
  return postChequeRelease(connection, cheque, cheque.release_date);
};

const processDueCheques = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const today = new Date().toISOString().slice(0, 10);
    const [cheques] = await connection.query(
      `SELECT * FROM expenses_cheque_registry
       WHERE status NOT IN ('Deleted', 'Released', 'Returned')
         AND release_date IS NOT NULL
         AND release_date <= ?
       ORDER BY id FOR UPDATE`,
      [today]
    );

    for (const cheque of cheques) {
      await postChequeRelease(connection, cheque, cheque.release_date);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const startChequeReleaseProcessor = () => {
  const run = () => processDueCheques().catch((error) => {
    console.error('Cheque release processing failed:', error.message);
  });
  run();
  return setInterval(run, 60 * 1000);
};

module.exports = {
  ensureChequeReleaseSchema,
  rebuildAccountBalance,
  getLedgerReferenceTypes,
  getCanonicalReferenceType,
  hasActiveLedgerEntry,
  postChequeRelease,
  unreleaseCheque,
  postChequeIfDue,
  processDueCheques,
  startChequeReleaseProcessor
};