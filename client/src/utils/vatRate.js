// client/src/utils/vatRate.js
//
// The system-wide VAT rate (Purchases / Expenses) - management-editable,
// default 18%, instead of a literal 18 scattered across the purchase forms
// and reports (server/services/vatSettings.js, GET/PUT /settings/vat-rate).

import api from '../api';

export const DEFAULT_VAT_RATE = 18;

// Fetched once per page load; a purchase already saved keeps its own
// `vat_rate` regardless of later changes to this setting.
let cachedRate = null;
let inFlight = null;

export const fetchVatRate = async () => {
  if (cachedRate !== null) return cachedRate;
  if (inFlight) return inFlight;

  inFlight = api.get('/settings/vat-rate')
    .then((response) => {
      const rate = parseFloat(response.data?.vat_rate);
      cachedRate = Number.isFinite(rate) ? rate : DEFAULT_VAT_RATE;
      return cachedRate;
    })
    .catch((error) => {
      console.error('Error fetching VAT rate, using default:', error);
      return DEFAULT_VAT_RATE;
    })
    .finally(() => { inFlight = null; });

  return inFlight;
};

// Call after a successful update so the rest of the open session (other tabs
// of this page) picks up the new rate without a full reload.
export const invalidateVatRateCache = () => { cachedRate = null; };
