// Audit R9a - two requests saving the same voucher / reference number at the same moment.
//
// Run on the TEST database (npm run test:db). Uses petty_cash_reimbursements.reference_number,
// one of the 11 columns checkDuplicateReference() guards; that column has no UNIQUE key, so only the
// reference lock stands between two concurrent saves.
require('./useTestDatabase');
const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../../config/db');
const { checkDuplicateReference, DuplicateReferenceError } = require('../../services/referenceValidationService');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PREFIX = 'R9-TEST-';

const countRows = async (ref) => {
  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM petty_cash_reimbursements WHERE reference_number = ?', [ref]);
  return Number(rows[0].n);
};

// One "request": check the number, think for a moment (the race window), save it.
const saveWith = async (check, ref, pauseMs) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await check(connection, ref);
    await sleep(pauseMs);
    await connection.query(
      "INSERT INTO petty_cash_reimbursements (reference_number, reimbursement_date, amount) VALUES (?, '2026-10-01', 1)",
      [ref]
    );
    await connection.commit();
    return 'saved';
  } catch (error) {
    await connection.rollback();
    if (error instanceof DuplicateReferenceError) return 'duplicate';
    throw error;
  } finally {
    connection.release();
  }
};

test.before(async () => {
  await pool.referenceLocksSchemaReady;
  await pool.query('DELETE FROM petty_cash_reimbursements WHERE reference_number LIKE ?', [`${PREFIX}%`]);
});

test.after(async () => {
  await pool.query('DELETE FROM petty_cash_reimbursements WHERE reference_number LIKE ?', [`${PREFIX}%`]);
  await pool.end();
});

test('control: a plain SELECT check lets two concurrent saves both through (the bug)', async () => {
  const ref = `${PREFIX}CONTROL`;
  const plainCheck = async (connection, number) => {
    const [rows] = await connection.query('SELECT id FROM petty_cash_reimbursements WHERE reference_number = ? LIMIT 1', [number]);
    if (rows.length) throw new DuplicateReferenceError('dup');
  };
  const results = await Promise.all([saveWith(plainCheck, ref, 400), saveWith(plainCheck, ref, 400)]);
  assert.deepEqual(results, ['saved', 'saved']);
  assert.equal(await countRows(ref), 2);
});

test('checkDuplicateReference: two concurrent saves of one number - exactly one is saved', async () => {
  const ref = `${PREFIX}RACE`;
  const results = await Promise.all([
    saveWith(checkDuplicateReference, ref, 400),
    saveWith(checkDuplicateReference, ref, 400)
  ]);
  assert.deepEqual([...results].sort(), ['duplicate', 'saved']);
  assert.equal(await countRows(ref), 1);
});

test('upper / lower case and spaces do not get around the lock', async () => {
  const ref = `${PREFIX}Case`;
  const results = await Promise.all([
    saveWith(checkDuplicateReference, ref, 400),
    saveWith(checkDuplicateReference, `  ${ref.toUpperCase()} `, 400)
  ]);
  assert.deepEqual([...results].sort(), ['duplicate', 'saved']);
});

test('different numbers do not wait for each other', async () => {
  const started = Date.now();
  const results = await Promise.all([
    saveWith(checkDuplicateReference, `${PREFIX}A`, 500),
    saveWith(checkDuplicateReference, `${PREFIX}B`, 500)
  ]);
  assert.deepEqual(results, ['saved', 'saved']);
  assert.ok(Date.now() - started < 950, 'two different numbers should be saved in parallel');
});

test('a rolled-back save releases the number', async () => {
  const ref = `${PREFIX}ROLLBACK`;
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  await checkDuplicateReference(connection, ref);
  await connection.rollback();
  connection.release();
  assert.equal(await saveWith(checkDuplicateReference, ref, 0), 'saved');
});

test('editing a record keeps its own number (excluded from the check)', async () => {
  const ref = `${PREFIX}EDIT`;
  await saveWith(checkDuplicateReference, ref, 0);
  const [rows] = await pool.query('SELECT id FROM petty_cash_reimbursements WHERE reference_number = ?', [ref]);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await checkDuplicateReference(connection, ref, { table: 'petty_cash_reimbursements', id: rows[0].id });
    await connection.commit();
  } finally {
    connection.release();
  }
});
