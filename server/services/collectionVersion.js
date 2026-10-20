// server/services/collectionVersion.js
//
// A fingerprint of everything an approval posts (audit finding M3). The list and detail
// endpoints return it as `version`; POST /collections/approve must send it back per item,
// and the service compares it with the row it locks. If the POS sync rewrote the record
// between the accountant looking at it and clicking Approve, the fingerprint differs and
// that record is NOT posted - the accountant refreshes and reviews the new figures.
//
// One SQL expression, used for both the lists and the locked row, so they can never
// disagree. NULLs are written as a marker so "empty" and "missing" differ; last_synced_at
// is deliberately NOT part of it (a sync that changes nothing must not invalidate a view).
const FIELDS = [
  'source_system', 'source_type', 'source_id', 'reference_no', 'collection_date', 'shift_id',
  'company_id', 'department_id', 'pos_bank_account', 'linked_collection_id',
  'cash_amount', 'card_amount', 'bank_amount', 'ar_amount', 'short_excess_amount',
  'deduction_amount', 'total_amount', 'pos_total_amount', 'raw_payload'
];

const versionSql = (alias) => `SHA2(CONCAT_WS('|', ${FIELDS.map((f) => `COALESCE(${alias}.${f}, '~')`).join(', ')}), 256)`;

module.exports = { versionSql, VERSION_FIELDS: FIELDS };
