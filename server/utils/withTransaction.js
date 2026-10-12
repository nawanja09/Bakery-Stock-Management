// server/utils/withTransaction.js
//
// Runs `work(connection)` inside ONE database transaction on ONE dedicated
// connection: commit when it resolves, rollback when it throws, and always
// release the connection back to the pool.
//
// Never call pool.query('START TRANSACTION' / 'COMMIT' / 'ROLLBACK'): each
// pool.query may run on a different pooled connection, so the statements are
// not atomic and a connection can be returned to the pool with a transaction
// still open - silently swallowing later, unrelated writes made on it.
//
// Usage:
//   const id = await withTransaction(async (conn) => {
//     const [r] = await conn.query('INSERT ...', [...]);
//     await conn.query('INSERT ...', [...]);
//     return r.insertId;
//   });
const pool = require('../config/db');

const withTransaction = async (work, { db = pool } = {}) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Transaction rollback failed:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = withTransaction;
