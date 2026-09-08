const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const test = require('node:test');
const pool = require('../config/db');

test('inspect database for existing income tables or transactions', async () => {
  try {
    const [tables] = await pool.query("SHOW TABLES LIKE '%income%'");
    console.log('Tables matching income:', tables);

    const [financeIncomeRows] = await pool.query(`
      SELECT ft.id, ft.transaction_date, ft.company_id, c.name as company_name, ft.debit, ft.transaction_type, ft.remark
      FROM finance_transactions ft
      LEFT JOIN company c ON ft.company_id = c.id
      WHERE ft.status = 1 AND ft.debit > 0
        AND COALESCE(ft.reference_type, '') NOT IN ('PETTY_CASH_VOUCHER', 'BANK_CHARGE', 'EXPENSE_PAYMENT', 'PURCHASE_PAYMENT', 'CASH_BANK_TRANSFER', 'BANK_TRANSFER')
        AND COALESCE(ft.transaction_type, '') NOT IN ('RM Purchase Payment', 'Supplier Advance Payment', 'Bank Deposit', 'Bank Withdrawal', 'Bank Transfer')
      LIMIT 10
    `);
    console.log('Finance transactions matching analyst income count:', financeIncomeRows.length);

    const [companies] = await pool.query('SELECT id, name FROM company');
    console.log('Companies:', companies);

    const [departments] = await pool.query('SELECT id, name FROM departments');
    console.log('Departments:', departments);
  } catch (err) {
    console.log('DB error (DB might not be running locally or password required):', err.message);
  }
});
