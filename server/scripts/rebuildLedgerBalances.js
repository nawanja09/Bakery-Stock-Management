// server/scripts/rebuildLedgerBalances.js
//
// Repairs finance_transactions.balance_after (the stored running balance of every
// Cash / Bank ledger row) and the cached account balances. Rows posted with an
// EARLIER date than rows already in the ledger used to get the account total
// instead of the balance at their own date, and every row after them was left
// stale (audit finding H7). New postings are correct since the period-close change;
// this fixes the rows written before it.
//
//   node scripts/rebuildLedgerBalances.js            dry run: counts the wrong rows, changes nothing
//   node scripts/rebuildLedgerBalances.js --apply    repairs them (one transaction per account)
//
// Uses the database in server/.env (DB_NAME). Back it up first when using --apply.
// Ledger order is the one the ledger screens show: transaction_date, created_at, id.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../config/db');
const { rebuildBalanceAfter } = require('../utils/financeLedger');

const apply = process.argv.includes('--apply');

const WRONG_ROWS_SQL = (keyColumn) => `
  SELECT COUNT(*) AS wrong FROM (
    SELECT ft.id
      FROM finance_transactions ft
      JOIN (
        SELECT id,
               SUM(CAST(debit AS DECIMAL(14,2)) - CAST(credit AS DECIMAL(14,2)))
                 OVER (ORDER BY transaction_date, created_at, id ROWS UNBOUNDED PRECEDING) AS running
          FROM finance_transactions
         WHERE account_type = ? AND ${keyColumn} = ? AND status = 1
      ) r ON r.id = ft.id
     WHERE ft.balance_after <> r.running
  ) w`;

(async () => {
  let accounts = [];
  try {
    const [cash] = await pool.query("SELECT DISTINCT company_id AS id FROM finance_transactions WHERE account_type = 'CASH' AND company_id IS NOT NULL");
    const [bank] = await pool.query("SELECT DISTINCT bank_id AS id FROM finance_transactions WHERE account_type = 'BANK' AND bank_id IS NOT NULL");
    accounts = [...cash.map((r) => ['CASH', r.id]), ...bank.map((r) => ['BANK', r.id])];

    let totalWrong = 0;
    for (const [type, id] of accounts) {
      const keyColumn = type === 'BANK' ? 'bank_id' : 'company_id';
      const [[{ wrong }]] = await pool.query(WRONG_ROWS_SQL(keyColumn), [type, id]);
      totalWrong += Number(wrong);
      if (!Number(wrong)) continue;
      if (!apply) {
        console.log(`${type} account ${id}: ${wrong} row(s) with a wrong stored balance`);
        continue;
      }
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const balance = await rebuildBalanceAfter(connection, type, id);
        await connection.commit();
        console.log(`${type} account ${id}: ${wrong} row(s) repaired, balance ${balance.toFixed(2)}`);
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }
    console.log(apply
      ? `Done: ${totalWrong} row(s) repaired in ${accounts.length} account(s).`
      : `Dry run: ${totalWrong} row(s) with a wrong stored balance in ${accounts.length} account(s). Run with --apply to repair them.`);
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error('rebuildLedgerBalances failed:', error.message);
  process.exit(1);
});
