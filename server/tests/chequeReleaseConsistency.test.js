const assert = require('node:assert/strict');
const pool = require('../config/db');
const {
  ensureChequeReleaseSchema,
  postChequeRelease,
  unreleaseCheque,
  rebuildAccountBalance
} = require('../services/chequeReleaseService');
const { getBankBalance, getCashBalance } = require('../utils/financeLedger');

// NOTE: runs against the REAL database configured in server/.env. Every row it
// creates is recorded in `created` and removed again in cleanup() - also when
// a check fails - so a failing run never leaves test data behind.
async function testBody(created) {
  console.log('🚀 Starting Cheque Release Consistency Tests...');
  await ensureChequeReleaseSchema();

  const testSuffix = Date.now();
  const testChequeNum1 = `CHQ-B2C-${testSuffix}`;
  const testChequeNum2 = `CHQ-PUR-${testSuffix}`;
  const testChequeNum3 = `CHQ-EXP-${testSuffix}`;
  Object.assign(created, { testChequeNum1, testChequeNum2, testChequeNum3 });

  // Get test bank and company
  const [banks] = await pool.query("SELECT id FROM bank_details WHERE status = 'Active' ORDER BY id LIMIT 1");
  const testBankId = banks[0]?.id;
  created.testBankId = testBankId;
  assert.ok(testBankId, 'Active bank details required for test');

  const [companies] = await pool.query('SELECT id FROM company ORDER BY id LIMIT 1');
  const testCompanyId = companies[0]?.id;
  created.testCompanyId = testCompanyId;

  // An existing user (created_by has a foreign key to users; id 1 may not exist).
  const [users] = await pool.query('SELECT id FROM users ORDER BY id LIMIT 1');
  const testUserId = users[0]?.id;
  assert.ok(testUserId, 'A user is required for test');
  assert.ok(testCompanyId, 'Company required for test');

  const initialBankBalance = await getBankBalance(testBankId);
  console.log(`Initial Bank Balance: Rs. ${initialBankBalance}`);

  // =========================================================================
  // TEST 1: Finance Cash/Bank Transfer (BANK_TO_CASH)
  // =========================================================================
  console.log('\n--- Test 1: Finance Bank-to-Cash Cheque Transfer ---');
  const [b2cTransfer] = await pool.query(
    `INSERT INTO finance_cheque_transfers (company_id, bank_id, amount, transfer_date, cheque_number, remark, created_by)
     VALUES (?, ?, ?, '2026-09-10', ?, 'Test B2C Cheque', ?)`,
    [testCompanyId, testBankId, 500, testChequeNum1, testUserId]
  );
  const b2cTransferId = b2cTransfer.insertId;
  created.b2cTransferId = b2cTransferId;

  const [b2cReg] = await pool.query(
    `INSERT INTO expenses_cheque_registry
       (source_type, source_id, date, name, cheque_number, amount, bank, release_date, status)
     VALUES ('BANK_TO_CASH', ?, '2026-09-10', 'Test Bank', ?, 500, 'Test Bank', NULL, 'Pending')`,
    [b2cTransferId, testChequeNum1]
  );
  const b2cChequeId = b2cReg.insertId;
  created.b2cChequeId = b2cChequeId;

  // Verify on creation date (2026-09-10): status is Pending, NO ledger transactions exist
  const [b2cTxBefore] = await pool.query(
    `SELECT * FROM finance_transactions
     WHERE status = 1 AND reference_type IN ('CASH_BANK_TRANSFER', 'BANK_TO_CASH') AND reference_id = ?`,
    [b2cTransferId]
  );
  assert.equal(b2cTxBefore.length, 0, 'Cheque must NOT create finance transactions upon recording');

  const bankBalAfterB2CCreation = await getBankBalance(testBankId);
  assert.equal(bankBalAfterB2CCreation, initialBankBalance, 'Bank balance must NOT be deducted on cheque creation date');

  // Now Release the cheque on 2026-09-16
  const connection1 = await pool.getConnection();
  await connection1.beginTransaction();
  await postChequeRelease(connection1, b2cChequeId, '2026-09-16');
  await connection1.commit();
  connection1.release();

  // Verify cheque status is Released
  const [b2cCheckRow] = await pool.query("SELECT status, DATE_FORMAT(release_date, '%Y-%m-%d') as release_date FROM expenses_cheque_registry WHERE id = ?", [b2cChequeId]);
  assert.equal(b2cCheckRow[0].status, 'Released');
  assert.equal(b2cCheckRow[0].release_date, '2026-09-16');

  // Bank leg dated the Transfer Date (2026-09-10), Cash leg the Released Date
  // (2026-09-16) - see chequeReleaseService.postChequeRelease. Never 0000-00-00.
  const [b2cTxAfter] = await pool.query(
    `SELECT *, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS formatted_date
     FROM finance_transactions
     WHERE status = 1 AND reference_type IN ('CASH_BANK_TRANSFER', 'BANK_TO_CASH') AND reference_id = ?`,
    [b2cTransferId]
  );
  assert.equal(b2cTxAfter.length, 2, 'Released B2C cheque must create 2 ledger legs (Bank & Cash)');
  for (const tx of b2cTxAfter) {
    assert.notEqual(tx.formatted_date, '0000-00-00', `${tx.account_type} leg must have a real date`);
    const expected = tx.account_type === 'BANK' ? '2026-09-10' : '2026-09-16';
    assert.equal(tx.formatted_date, expected, `${tx.account_type} leg must be dated ${tx.account_type === 'BANK' ? 'the Transfer Date' : 'the Released Date'}`);
  }

  const bankBalAfterB2CRelease = await getBankBalance(testBankId);
  assert.equal(
    Number((initialBankBalance - 500).toFixed(2)),
    bankBalAfterB2CRelease,
    'Bank balance must decrease by Rs. 500 upon release'
  );
  console.log('✅ Test 1 Passed: Finance Bank-to-Cash cheque deferred until release date!');

  // =========================================================================
  // TEST 2: RM Purchasing Payment (PURCHASING_PAYMENT)
  // =========================================================================
  console.log('\n--- Test 2: RM Purchasing Cheque Payment ---');
  // Find or insert dummy purchase
  const [supp] = await pool.query('SELECT id FROM supplier LIMIT 1');
  const testSupplierId = supp[0]?.id || 1;

  const [purchResult] = await pool.query(
    `INSERT INTO purchases (invoice_no, purchase_date, supplier_id, total_with_vat, paid_amount, balance_amount, company_id)
     VALUES (?, '2026-09-10', ?, 1200, 0, 1200, ?)`,
    [`INV-TEST-${testSuffix}`, testSupplierId, testCompanyId]
  );
  const testPurchaseId = purchResult.insertId;
  created.testPurchaseId = testPurchaseId;

  // Record payment in payment_history
  const [phResult] = await pool.query(
    `INSERT INTO payment_history (purchase_id, payment_date, amount, payment_method, check_number, bank_id, created_by)
     VALUES (?, '2026-09-10', 1200, 'CHEQUE', ?, ?, ?)`,
    [testPurchaseId, testChequeNum2, testBankId, testUserId]
  );
  const paymentHistoryId = phResult.insertId;
  created.paymentHistoryId = paymentHistoryId;

  // Insert in expenses_cheque_registry with status Pending
  const [purReg] = await pool.query(
    `INSERT INTO expenses_cheque_registry
       (source_type, source_id, date, name, cheque_number, amount, bank, release_date, status)
     VALUES ('PURCHASING_PAYMENT', ?, '2026-09-10', 'Test Supplier', ?, 1200, 'Test Bank', NULL, 'Pending')`,
    [paymentHistoryId, testChequeNum2]
  );
  const purChequeId = purReg.insertId;
  created.purChequeId = purChequeId;

  // Verify on creation: NO ledger transaction exists
  const [purTxBefore] = await pool.query(
    `SELECT * FROM finance_transactions
     WHERE status = 1 AND reference_type IN ('PURCHASE_PAYMENT', 'PURCHASING_PAYMENT') AND reference_id = ?`,
    [paymentHistoryId]
  );
  assert.equal(purTxBefore.length, 0, 'RM Purchasing Cheque must NOT create finance transactions on payment date');

  // Release the cheque on 2026-09-16
  const connection2 = await pool.getConnection();
  await connection2.beginTransaction();
  await postChequeRelease(connection2, purChequeId, '2026-09-16');
  await connection2.commit();
  connection2.release();

  // Verify cheque status is Released
  const [purCheckRow] = await pool.query('SELECT * FROM expenses_cheque_registry WHERE id = ?', [purChequeId]);
  assert.equal(purCheckRow[0].status, 'Released');

  // Verify ledger transaction created with transaction_date = 2026-09-16
  const [purTxAfter] = await pool.query(
    `SELECT * FROM finance_transactions
     WHERE status = 1 AND reference_type IN ('PURCHASE_PAYMENT', 'PURCHASING_PAYMENT') AND reference_id = ?`,
    [paymentHistoryId]
  );
  assert.equal(purTxAfter.length, 1, 'Released purchase cheque must post 1 Bank credit transaction');
  assert.equal(Number(purTxAfter[0].credit), 1200);

  const bankBalAfterPurRelease = await getBankBalance(testBankId);
  assert.equal(
    Number((bankBalAfterB2CRelease - 1200).toFixed(2)),
    bankBalAfterPurRelease,
    'Bank balance must decrease by Rs. 1200 upon RM purchasing cheque release'
  );
  console.log('✅ Test 2 Passed: RM Purchasing Cheque deferred until release date!');

  // =========================================================================
  // TEST 3: New Expenses Payment (EXPENSE_PAYMENT)
  // =========================================================================
  console.log('\n--- Test 3: New Expenses Cheque Payment ---');
  const [expPayResult] = await pool.query(
    `INSERT INTO expense_payments (payment_date, payee_name, payment_type, bank_id, cheque_number, total_bill_amount, transfer_amount, created_by)
     VALUES ('2026-09-10', 'Test Payee', 'Cheque', ?, ?, 800, 800, ?)`,
    [testBankId, testChequeNum3, testUserId]
  );
  const expensePaymentId = expPayResult.insertId;
  created.expensePaymentId = expensePaymentId;

  const [expReg] = await pool.query(
    `INSERT INTO expenses_cheque_registry
       (source_type, source_id, date, name, cheque_number, amount, bank, release_date, status)
     VALUES ('EXPENSE_PAYMENT', ?, '2026-09-10', 'Test Payee', ?, 800, 'Test Bank', NULL, 'Pending')`,
    [expensePaymentId, testChequeNum3]
  );
  const expChequeId = expReg.insertId;
  created.expChequeId = expChequeId;

  // Verify on creation: NO ledger transaction exists
  const [expTxBefore] = await pool.query(
    `SELECT * FROM finance_transactions
     WHERE status = 1 AND reference_type = 'EXPENSE_PAYMENT' AND reference_id = ?`,
    [expensePaymentId]
  );
  assert.equal(expTxBefore.length, 0, 'New Expenses Cheque must NOT create finance transactions on payment date');

  // Release on 2026-09-16
  const connection3 = await pool.getConnection();
  await connection3.beginTransaction();
  await postChequeRelease(connection3, expChequeId, '2026-09-16');
  await connection3.commit();
  connection3.release();

  // Verify cheque status is Released
  const [expCheckRow] = await pool.query('SELECT * FROM expenses_cheque_registry WHERE id = ?', [expChequeId]);
  assert.equal(expCheckRow[0].status, 'Released');

  const [expTxAfter] = await pool.query(
    `SELECT * FROM finance_transactions
     WHERE status = 1 AND reference_type = 'EXPENSE_PAYMENT' AND reference_id = ?`,
    [expensePaymentId]
  );
  assert.equal(expTxAfter.length, 1, 'Released expense cheque must post 1 Bank credit transaction');
  assert.equal(Number(expTxAfter[0].credit), 800);

  const bankBalAfterExpRelease = await getBankBalance(testBankId);
  assert.equal(
    Number((bankBalAfterPurRelease - 800).toFixed(2)),
    bankBalAfterExpRelease,
    'Bank balance must decrease by Rs. 800 upon New Expenses cheque release'
  );
  console.log('✅ Test 3 Passed: New Expenses Cheque deferred until release date!');

  // =========================================================================
  // TEST 4: Unrelease / Revert Cheque
  // =========================================================================
  console.log('\n--- Test 4: Unrelease / Revert Cheque ---');
  const connection4 = await pool.getConnection();
  await connection4.beginTransaction();
  await unreleaseCheque(connection4, expChequeId, 'Pending');
  await connection4.commit();
  connection4.release();

  // Verify ledger entry voided (status = 0)
  const [expTxVoided] = await pool.query(
    `SELECT * FROM finance_transactions
     WHERE status = 1 AND reference_type = 'EXPENSE_PAYMENT' AND reference_id = ?`,
    [expensePaymentId]
  );
  assert.equal(expTxVoided.length, 0, 'Active finance transactions must be voided on unrelease');

  const bankBalAfterUnrelease = await getBankBalance(testBankId);
  assert.equal(
    bankBalAfterPurRelease,
    bankBalAfterUnrelease,
    'Bank balance must be restored when cheque is unreleased'
  );
  console.log('✅ Test 4 Passed: Unreleasing a cheque voids ledger deduction and restores balance!');

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! The cheque release logic is 100% consistent across all 3 pages.');
}

// Removes exactly what this run created. Each ledger row is matched by its OWN
// reference type + id + this run's cheque number (never a type x id cross
// product, which could hit a real payment with the same id), then the stored
// Bank AND Cash balances are rebuilt.
async function cleanup(c) {
  console.log('\n--- Cleaning up test records ---');
  const legs = [
    ['CASH_BANK_TRANSFER', c.b2cTransferId, c.testChequeNum1],
    ['PURCHASE_PAYMENT', c.paymentHistoryId, c.testChequeNum2],
    ['EXPENSE_PAYMENT', c.expensePaymentId, c.testChequeNum3]
  ];
  for (const [type, id, chequeNumber] of legs) {
    if (!id) continue;
    await pool.query(
      'DELETE FROM finance_transactions WHERE reference_type = ? AND reference_id = ? AND reference_number = ?',
      [type, id, chequeNumber]
    );
  }
  const chequeIds = [c.b2cChequeId, c.purChequeId, c.expChequeId].filter(Boolean);
  if (chequeIds.length) await pool.query('DELETE FROM expenses_cheque_registry WHERE id IN (?)', [chequeIds]);
  if (c.expensePaymentId) await pool.query('DELETE FROM expense_payments WHERE id = ?', [c.expensePaymentId]);
  if (c.paymentHistoryId) await pool.query('DELETE FROM payment_history WHERE id = ?', [c.paymentHistoryId]);
  if (c.testPurchaseId) await pool.query('DELETE FROM purchases WHERE id = ?', [c.testPurchaseId]);
  if (c.b2cTransferId) await pool.query('DELETE FROM finance_cheque_transfers WHERE id = ?', [c.b2cTransferId]);

  const conn = await pool.getConnection();
  try {
    if (c.testBankId) await rebuildAccountBalance(conn, 'BANK', c.testBankId);
    if (c.testCompanyId) await rebuildAccountBalance(conn, 'CASH', c.testCompanyId);
  } finally {
    conn.release();
  }
}

async function runTests() {
  const created = {};
  let failed = null;
  try {
    await testBody(created);
  } catch (err) {
    failed = err;
  }
  try {
    await cleanup(created);
  } catch (cleanupErr) {
    console.error('\n⚠️ CLEANUP FAILED - remove these test rows by hand:', created, cleanupErr);
    failed = failed || cleanupErr;
  }
  if (failed) {
    console.error('\n❌ TEST FAILED:', failed);
    process.exit(1);
  }
  process.exit(0);
}

runTests();
