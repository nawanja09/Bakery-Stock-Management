// server/services/lineHistory.js
//
// Nothing is thrown away (audit finding H5). Editing an invoice, issue note, wastage
// note or cutlery document rewrites its item lines: the old lines are deleted and the
// new ones inserted. Those lines are summed by stock and cost reports, so they cannot
// be "soft deleted" in place without every report double counting them - instead the
// old lines are copied, as they were, into record_line_history before they go, with
// who replaced them and when. The edited record itself keeps its history in the Audit
// Trail (old and new values).
//
//   await archiveLines(connection, 'issuance_items', issuanceId, { userId });
//
// Only the tables listed in SOURCES can be archived (names are never taken from a request).

const SOURCES = Object.freeze({
  purchase_items: 'purchase_id',
  issuance_items: 'issuance_id',
  wastage_items: 'wastage_id',
  cutlery_purchase_items: 'purchase_id',
  cutlery_damage_items: 'damage_id',
  other_ledger_company_map: 'other_ledger_id'
});

/**
 * Copies the rows about to be removed into record_line_history; returns how many.
 * `extraWhere` narrows the rows (e.g. 'company_id IN (?)') with `extraParams`.
 * Needs an open transaction: the copy commits or rolls back together with the edit.
 */
const archiveLines = async (connection, table, recordId, { userId = null, extraWhere = '', extraParams = [] } = {}) => {
  const keyColumn = SOURCES[table];
  if (!keyColumn) throw new Error(`archiveLines: ${table} is not an archived table`);

  const [rows] = await connection.query(
    `SELECT * FROM \`${table}\` WHERE \`${keyColumn}\` = ?${extraWhere ? ` AND (${extraWhere})` : ''}`,
    [recordId, ...extraParams]
  );
  if (rows.length === 0) return 0;

  await connection.query(
    `INSERT INTO record_line_history (source_table, record_id, line_count, lines_json, archived_by)
     VALUES (?, ?, ?, ?, ?)`,
    [table, recordId, rows.length, JSON.stringify(rows), userId]
  );
  return rows.length;
};

module.exports = { SOURCES, archiveLines };
