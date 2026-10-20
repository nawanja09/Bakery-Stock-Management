// server/services/collectionQuarantine.js
//
// Where POS / Restaurant records that BSMS did not accept are kept, so that nothing is lost
// and nothing is guessed (audit M4):
//   REJECTED               the record does not match the RAVON contract (services/collectionSchema.js)
//                          or the mapper could not read it. It is NOT staged as a collection.
//   CHANGED_AFTER_APPROVAL a collection that was already approved (money posted to the ledgers)
//                          now arrives from the POS with different data - a later void, refund or
//                          correction upstream. The ledgers are NOT touched; an accountant decides.
//
// One row per distinct (system, source, kind, payload): seeing it again only raises seen_count and
// last_seen_at. Table: collection_data_issues (created in config/db.js).

const crypto = require('crypto');

const KINDS = Object.freeze({ REJECTED: 'REJECTED', CHANGED_AFTER_APPROVAL: 'CHANGED_AFTER_APPROVAL' });
const MAX_PAYLOAD_CHARS = 60000;

const hashOf = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const payloadText = (payload) => (typeof payload === 'string' ? payload : JSON.stringify(payload ?? null));

/**
 * Records (or re-confirms) one issue. Never throws: a failure to write the quarantine must not
 * stop a sync - it is reported on the server console instead.
 * @returns {Promise<boolean>} true when written
 */
const recordIssue = async (queryable, {
  system, source, kind, reason, fields = [], payload, collectionId = null, sourceId = null
}) => {
  try {
    const text = payloadText(payload);
    const key = hashOf(`${system}|${source}|${kind}|${collectionId ?? ''}|${text}`);
    await queryable.query(
      `INSERT INTO collection_data_issues
         (issue_key, source_system, source_type, source_id, kind, reason, fields, raw_payload, collection_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE seen_count = seen_count + 1, last_seen_at = NOW(),
         status = IF(status = 'RESOLVED', status, 'OPEN')`,
      [key, system, source, sourceId ? String(sourceId).slice(0, 100) : null, kind, String(reason).slice(0, 1000),
        JSON.stringify(fields).slice(0, 2000), text.slice(0, MAX_PAYLOAD_CHARS), collectionId]
    );
    return true;
  } catch (error) {
    console.warn(`Collection quarantine - could not record an issue: ${error.message}`);
    return false;
  }
};

const listIssues = async (queryable, { status = 'OPEN', limit = 200 } = {}) => {
  const where = status === 'ALL' ? '' : 'WHERE status = ?';
  const [rows] = await queryable.query(
    `SELECT id, source_system, source_type, source_id, kind, reason, fields, collection_id, seen_count,
            DATE_FORMAT(first_seen_at, '%Y-%m-%d %H:%i') AS first_seen_at,
            DATE_FORMAT(last_seen_at, '%Y-%m-%d %H:%i') AS last_seen_at,
            status, resolved_by, DATE_FORMAT(resolved_at, '%Y-%m-%d %H:%i') AS resolved_at, resolution_note
       FROM collection_data_issues ${where} ORDER BY last_seen_at DESC, id DESC LIMIT ?`,
    status === 'ALL' ? [Math.min(Number(limit) || 200, 500)] : [status, Math.min(Number(limit) || 200, 500)]
  );
  return rows;
};

const getIssue = async (queryable, id) => {
  const [rows] = await queryable.query('SELECT * FROM collection_data_issues WHERE id = ?', [id]);
  return rows[0] || null;
};

/** Marks an issue as reviewed. A new, different payload creates a new issue; the same one stays resolved. */
const resolveIssue = async (queryable, id, { userId, note = null }) => {
  const [result] = await queryable.query(
    `UPDATE collection_data_issues SET status = 'RESOLVED', resolved_by = ?, resolved_at = NOW(), resolution_note = ?
      WHERE id = ? AND status = 'OPEN'`,
    [userId || null, note ? String(note).slice(0, 500) : null, id]
  );
  return result.affectedRows === 1;
};

module.exports = { KINDS, recordIssue, listIssues, getIssue, resolveIssue, hashOf };
