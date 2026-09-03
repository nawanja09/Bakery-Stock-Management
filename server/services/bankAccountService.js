const pool = require('../config/db');

const getActiveBankAccounts = async (companyId = null) => {
  const clauses = [
    "bd.status = 'Active'",
    'COALESCE(bd.record_status, 1) = 1'
  ];
  const params = [];

  let query = `
    SELECT
      bd.id,
      bd.bank_name,
      bd.account_number,
      bd.branch_name,
      bd.company,
      c.id AS company_id,
      bd.current_balance
    FROM bank_details bd
    INNER JOIN company c ON LOWER(TRIM(c.name)) = LOWER(TRIM(bd.company))
    WHERE ${clauses.join(' AND ')}`;

  if (companyId) {
    query += ' AND c.id = ?';
    params.push(companyId);
  }

  query += ' ORDER BY c.name ASC, bd.bank_name ASC, bd.account_number ASC';
  const [rows] = await pool.query(query, params);
  return rows;
};

module.exports = { getActiveBankAccounts };
