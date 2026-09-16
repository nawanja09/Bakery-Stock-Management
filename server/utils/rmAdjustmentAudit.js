const isRmAdjustmentRequest = (req) => req.get('X-RM-Adjustment') === 'true';

const recordRmAdjustment = async (connection, { category, sourceRecordId, referenceId = null, updatedBy = null }) => {
  await connection.query(
    `INSERT INTO rm_adjustment_records (category, source_record_id, reference_id, updated_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE reference_id = VALUES(reference_id), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
    [category, sourceRecordId, referenceId, updatedBy]
  );
};

const dateText = (value) => {
  if (!(value instanceof Date)) return null;
  const pad = (part) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
};

const sameValue = (left, right) => {
  const leftDate = dateText(left);
  const rightDate = dateText(right);
  if (leftDate || rightDate) {
    const normalizedLeft = (leftDate || String(left ?? '')).replace('T', ' ').slice(0, 19);
    const normalizedRight = (rightDate || String(right ?? '')).replace('T', ' ').slice(0, 19);
    // A date-only editor value represents midnight for comparison purposes.
    return normalizedLeft === normalizedRight || `${normalizedLeft.slice(0, 10)} 00:00:00` === normalizedRight || normalizedLeft === `${normalizedRight.slice(0, 10)} 00:00:00`;
  }
  const normalizedLeft = String(left ?? '');
  const normalizedRight = String(right ?? '');
  if (/^-?\d+(\.\d+)?$/.test(normalizedLeft) && /^-?\d+(\.\d+)?$/.test(normalizedRight) &&
      (normalizedLeft.includes('.') || normalizedRight.includes('.'))) {
    return Number(normalizedLeft) === Number(normalizedRight);
  }
  return normalizedLeft === normalizedRight;
};

const sameItems = (existing = [], submitted = [], fields) => {
  const numericFields = new Set(['quantity', 'unit_price', 'estimated_loss']);
  const normalizeField = (item, field) => numericFields.has(field)
    ? String(Number(item[field] ?? 0))
    : String(item[field] ?? '');
  const normalize = (items) => items
    .map((item) => fields.map((field) => normalizeField(item, field)).join('|'))
    .sort()
    .join('||');
  return normalize(existing) === normalize(submitted);
};

module.exports = { isRmAdjustmentRequest, recordRmAdjustment, sameValue, sameItems };
