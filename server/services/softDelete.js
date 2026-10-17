const softDelete = async (connection, table, { id, where, params = [], userId } = {}) => {
  const conditions = where || 'id = ?';
  const conditionParams = where ? params : [id];
  const [result] = await connection.query(
    `UPDATE ?? SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE ${conditions} AND is_deleted = 0`,
    [table, userId ?? null, ...conditionParams]
  );
  return result.affectedRows;
};

const restoreByName = async (connection, table, column, value, restoreSet = '') => {
  const additionalSet = restoreSet ? `, ${restoreSet}` : '';
  const [result] = await connection.query(
    `UPDATE ?? SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL${additionalSet} WHERE ?? = ? AND is_deleted = 1`,
    [table, column, value]
  );
  return result.affectedRows > 0 ? result.insertId || (await findRestoredId(connection, table, column, value)) : null;
};

const findRestoredId = async (connection, table, column, value) => {
  const [[row]] = await connection.query(
    'SELECT id FROM ?? WHERE ?? = ? AND is_deleted = 0 LIMIT 1',
    [table, column, value]
  );
  return row?.id ?? null;
};

const findUse = async (connection, table, id, { extra = [] } = {}) => {
  const [references] = await connection.query(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME = ?
        AND REFERENCED_COLUMN_NAME = 'id'`,
    [table]
  );

  const checks = [
    ...references
      .filter(reference => reference.tableName !== table)
      .map(reference => ({
        table: reference.tableName,
        column: reference.columnName,
        where: ''
      })),
    ...extra
  ];

  for (const reference of checks) {
    const [rows] = await connection.query(
      `SELECT 1 FROM ?? WHERE ?? = ?${reference.where ? ` AND (${reference.where})` : ''} LIMIT 1`,
      [reference.table, reference.column, id]
    );
    if (rows.length > 0) return reference;
  }

  return null;
};

const inUseMessage = (label, use) => {
  const tableName = use?.table?.replace(/_/g, ' ');
  return `Cannot delete ${label} because it is in use${tableName ? ` by ${tableName}` : ''}.`;
};

module.exports = {
  softDelete,
  restoreByName,
  findUse,
  inUseMessage
};
