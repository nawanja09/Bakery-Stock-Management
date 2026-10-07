// server/scripts/posCollectionProbe.js
//
// Prints the REAL structure of the three POS Collection endpoints so the field
// mapping in services/collectionMapper.js can be confirmed. Read-only: it logs
// in to the POS (RAVON_POS_USERNAME / RAVON_POS_PASSWORD from server/.env),
// GETs each endpoint once, and shows what the mapper makes of every record.
// The POS token and password are never printed.
//
//   cd server
//   node scripts/posCollectionProbe.js            # summary + first record of each endpoint
//   node scripts/posCollectionProbe.js --all      # every record's mapping result
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { posGet, getAuthStatus } = require('../services/posAuthService');
const { SOURCES, mapPosRecord, extractRecords } = require('../services/collectionMapper');

// Same endpoint resolution as collectionSyncService, without loading the DB pool.
const baseUrl = (process.env.RAVON_POS_API_URL || '').replace(/\/+$/, '');
const ENDPOINTS = {
  [SOURCES.SHIFT]: process.env.RAVON_POS_SHIFT_COLLECTION_URL || `${baseUrl}/api/completed-shifts/collection`,
  [SOURCES.CREDIT_PAYMENT]: process.env.RAVON_POS_CREDIT_PAYMENTS_URL || `${baseUrl}/api/credit-payments/collection`,
  [SOURCES.EMPLOYEE_DEDUCTION]: process.env.RAVON_POS_EMPLOYEE_DEDUCTIONS_URL || `${baseUrl}/api/employee-deductions`
};

const showAll = process.argv.includes('--all');

const shape = (value, depth = 0) => {
  if (Array.isArray(value)) return depth > 1 ? `array(${value.length})` : [value.length ? shape(value[0], depth + 1) : 'empty array'];
  if (value && typeof value === 'object') {
    if (depth > 2) return 'object';
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, depth + 1)]));
  }
  return value === null ? 'null' : typeof value;
};

(async () => {
  for (const [source, url] of Object.entries(ENDPOINTS)) {
    console.log(`\n=== ${source}  GET ${url}`);
    try {
      const payload = await posGet(url);
      const records = extractRecords(payload);
      console.log('Envelope shape:', JSON.stringify(shape(payload), null, 2));
      if (!records) { console.log('!! No record list found in the response'); continue; }
      console.log(`Records: ${records.length}`);
      if (records[0]) console.log('First record (raw):', JSON.stringify(records[0], null, 2));
      const results = records.map((r) => mapPosRecord(source, r));
      const ok = results.filter((r) => r.ok).length;
      console.log(`Mapped OK: ${ok} / ${records.length}`);
      results.forEach((r, i) => {
        if (!showAll && i > 0 && r.ok) return;
        if (r.ok) {
          const { raw_payload: _omit, ...rest } = r.record;
          console.log(`#${i} ->`, JSON.stringify(rest));
        } else {
          console.log(`#${i} !! ${r.reason}  fields: ${r.fields.join(', ')}`);
        }
      });
    } catch (error) {
      console.log(`!! ${error.name}: ${error.message}`);
    }
  }
  console.log('\nPOS auth status:', getAuthStatus());
})();
