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

const KINDS = Object.freeze({ REJECTED: 'REJECTED', CHANGED_AFTER_APPROVAL: 'CHANGED_AFTER_APPROVAL', BURST: 'BURST' });
const MAX_PAYLOAD_CHARS = 60000;

const hashOf = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const payloadText = (payload) => (typeof payload === 'string' ? payload : JSON.stringify(payload ?? null));

// Domain 1 M3 fix: the dedupe key already includes the payload hash, so a
// compromised/buggy upstream sending a slightly different malformed payload
// every time would create a brand NEW row forever (never deduped by the
// UNIQUE key above). This caps how many DISTINCT new issues a single
// (system, source) pair may create per rolling hour; once the cap is hit,
// every further distinct variant in that hour collapses into one shared
// "burst" row instead of its own row, so a flood produces one growing row
// with a sample payload, not thousands of rows.
const BURST_WINDOW_MS = 60 * 60 * 1000;
const burstLimit = () => {
  const n = Number(process.env.RAVON_QUARANTINE_BURST_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 50;
};
// (system, source) -> { windowStart, keys: Set<issue_key> } seen so far this window.
const newIssueTracking = new Map();

/** Whether `key` is this (system, source) pair's Nth+1 DISTINCT new issue this hour (N = burstLimit()). */
const isOverBurstLimit = (system, source, key) => {
  const trackKey = `${system}|${source}`;
  const now = Date.now();
  let tracked = newIssueTracking.get(trackKey);
  if (!tracked || now - tracked.windowStart >= BURST_WINDOW_MS) {
    tracked = { windowStart: now, keys: new Set() };
    newIssueTracking.set(trackKey, tracked);
  }
  if (tracked.keys.has(key)) return false; // already-seen issue, not a new distinct variant
  if (tracked.keys.size >= burstLimit()) return true;
  tracked.keys.add(key);
  return false;
};

/** One shared row per (system, source, hour) that further burst variants collapse into. */
const recordBurst = async (queryable, { system, source, kind, reason, payload, sourceId }) => {
  const hourBucket = Math.floor(Date.now() / BURST_WINDOW_MS);
  const key = hashOf(`${system}|${source}|BURST|${hourBucket}`);
  const text = payloadText(payload);
  await queryable.query(
    `INSERT INTO collection_data_issues
       (issue_key, source_system, source_type, source_id, kind, reason, fields, raw_payload, collection_id)
     VALUES (?, ?, ?, ?, 'BURST', ?, ?, ?, NULL)
     ON DUPLICATE KEY UPDATE seen_count = seen_count + 1, last_seen_at = NOW(),
       status = IF(status = 'RESOLVED', status, 'OPEN')`,
    [key, system, source, sourceId ? String(sourceId).slice(0, 100) : null,
      `More than ${burstLimit()} distinct ${kind} payloads from ${system}/${source} in one hour - collapsed into this row (sample reason: ${String(reason).slice(0, 200)})`.slice(0, 1000),
      JSON.stringify(['burst']), text.slice(0, MAX_PAYLOAD_CHARS)]
  );
};

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

    if (isOverBurstLimit(system, source, key)) {
      await recordBurst(queryable, { system, source, kind, reason, payload, sourceId });
      return true;
    }

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

// Test helper: clears the in-memory burst-tracking state between test runs.
const resetBurstTracking = () => newIssueTracking.clear();

module.exports = { KINDS, recordIssue, listIssues, getIssue, resolveIssue, hashOf, resetBurstTracking };
