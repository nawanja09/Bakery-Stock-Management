// server/services/ravonPosService.js
//
// Ravon Bakers POS Integration Service
// ----------------------------------------------------------------------
// The Ravon Bakers POS system (pos.ravonbakers.lk) is the external
// source of truth for Finished Goods (FG) Items. BSMS no longer stores
// or manages an FG Item master of its own - it reads the live item list
// from the POS `/api/items-list` endpoint through this service.
//
// Only the POS services (this file, posAuthService.js for the login/token and
// collectionSyncService.js for the Collection endpoints) know about the POS
// API URL/credentials.
// Controllers must always go through the functions exported here -
// the BSMS frontend must never call the POS API directly.
//
// IMPORTANT - FIELD MAPPING ASSUMPTION:
// The exact JSON shape returned by `/api/items-list` was not available
// while building this integration (no access to the live/staging POS
// API or its documentation from this environment). `mapPosItem()` below
// therefore accepts several common field name variants (id/item_id/...,
// name/item_name/..., status/is_active/..., selling_price/price/...) so
// it has the best chance of working out of the box, but this MUST be
// verified against a real response before going live - see the "Manual
// verification required" note in the project summary. If the real field
// names differ, only `mapPosItem()` needs to change.
// ----------------------------------------------------------------------

// Authentication (background /api/login + Bearer token) lives in posAuthService.
const { posGet, PosConfigError, PosResponseError } = require('./posAuthService');

const RAVON_POS_API_URL = process.env.RAVON_POS_API_URL || '';
// One endpoint. If several are listed ("a,b,c"), the first is the items list -
// the Collection endpoints have their own settings (collectionSyncService.js).
const RAVON_POS_ITEMS_ENDPOINT = (process.env.RAVON_POS_ITEMS_ENDPOINT || '').split(',')[0].trim() || '/api/items-list';

class RavonPosConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RavonPosConfigError';
  }
}

class RavonPosUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RavonPosUnavailableError';
  }
}

class RavonPosResponseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RavonPosResponseError';
  }
}

const buildItemsUrl = () => {
  if (!RAVON_POS_API_URL) {
    throw new RavonPosConfigError('RAVON_POS_API_URL is not configured');
  }
  const base = RAVON_POS_API_URL.replace(/\/+$/, '');
  const path = RAVON_POS_ITEMS_ENDPOINT.startsWith('/')
    ? RAVON_POS_ITEMS_ENDPOINT
    : `/${RAVON_POS_ITEMS_ENDPOINT}`;
  return `${base}${path}`;
};

// Pulls the actual array of items out of whatever envelope the POS API
// wraps them in (raw array, { data: [...] }, { items: [...] }, { result: [...] }).
const extractItemsArray = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && Array.isArray(payload.result)) return payload.result;
  if (payload && Array.isArray(payload.results)) return payload.results;
  return null;
};

const firstDefined = (...values) => values.find(v => v !== undefined && v !== null);

// Coerces a POS price value (which may arrive as a number or a numeric
// string, e.g. "180.00") into a plain number, or null if not parseable.
const toPriceNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

// Normalizes a single POS item record into the shape BSMS needs.
// See the field-mapping note at the top of this file - field names are
// guessed defensively and should be confirmed against the real API.
const mapPosItem = (raw) => {
  const externalId = firstDefined(raw.id, raw.item_id, raw.itemId, raw.ItemID, raw.itemID, raw.code, raw.item_code);
  const name = firstDefined(raw.name, raw.item_name, raw.itemName, raw.ItemName, raw.title, raw.description);
  const sellingPriceRaw = firstDefined(
    raw.selling_price, raw.sellingPrice, raw.SellingPrice,
    raw.price, raw.unit_price, raw.unitPrice, raw.sale_price, raw.salePrice
  );

  const rawStatus = firstDefined(raw.status, raw.is_active, raw.isActive, raw.active, raw.Active);
  let isActive = true;
  if (rawStatus !== undefined) {
    if (typeof rawStatus === 'boolean') {
      isActive = rawStatus;
    } else if (typeof rawStatus === 'number') {
      isActive = rawStatus === 1;
    } else if (typeof rawStatus === 'string') {
      isActive = ['1', 'true', 'active', 'yes'].includes(rawStatus.trim().toLowerCase());
    }
  }

  if (externalId === undefined || name === undefined || String(name).trim() === '') {
    return null;
  }

  return {
    external_item_id: String(externalId),
    fg_item_name: String(name).trim(),
    selling_price: toPriceNumber(sellingPriceRaw),
    is_active: isActive
  };
};

/**
 * Fetches and normalizes the FG item list from the Ravon Bakers POS API.
 *
 * @param {Object} options
 * @param {boolean} options.includeInactive - if true, inactive/deleted POS items are also returned
 * @returns {Promise<Array<{external_item_id: string, fg_item_name: string, selling_price: number|null, is_active: boolean}>>}
 */
const fetchRavonPosItems = async ({ includeInactive = false } = {}) => {
  const url = buildItemsUrl();

  // Authenticated through the shared background POS login (posAuthService);
  // its errors are mapped onto this module's existing error classes.
  let payload;
  try {
    payload = await posGet(url);
  } catch (err) {
    if (err instanceof PosConfigError) throw new RavonPosConfigError(err.message);
    if (err instanceof PosResponseError && err.status) {
      throw new RavonPosUnavailableError(`Ravon POS API responded with status ${err.status}`);
    }
    if (err instanceof PosResponseError) throw new RavonPosResponseError('Ravon POS API returned an invalid response');
    throw new RavonPosUnavailableError(err.message);
  }

  const rawItems = extractItemsArray(payload);
  if (rawItems === null) {
    throw new RavonPosResponseError('Ravon POS API response did not contain a recognizable item list');
  }

  const mapped = rawItems
    .map(mapPosItem)
    .filter(Boolean);

  return includeInactive ? mapped : mapped.filter(item => item.is_active);
};

/**
 * Convenience helper - fetches the current POS item list and checks
 * whether a given external_item_id is present and active.
 */
const findRavonPosItem = async (externalItemId) => {
  if (externalItemId === undefined || externalItemId === null || String(externalItemId).trim() === '') {
    return null;
  }
  const items = await fetchRavonPosItems({ includeInactive: true });
  return items.find(item => String(item.external_item_id) === String(externalItemId)) || null;
};

module.exports = {
  fetchRavonPosItems,
  findRavonPosItem,
  RavonPosConfigError,
  RavonPosUnavailableError,
  RavonPosResponseError
};
