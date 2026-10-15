const numberFormatterCache = new Map();

const getNumberFormatter = (minimumFractionDigits = 0, maximumFractionDigits = minimumFractionDigits) => {
  const key = `${minimumFractionDigits}-${maximumFractionDigits}`;

  if (!numberFormatterCache.has(key)) {
    numberFormatterCache.set(
      key,
      new Intl.NumberFormat('en-US', {
        minimumFractionDigits,
        maximumFractionDigits
      })
    );
  }

  return numberFormatterCache.get(key);
};

export const formatNumber = (value, minimumFractionDigits, maximumFractionDigits) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '0';
  }

  const shouldPreserveDecimals = minimumFractionDigits === undefined && maximumFractionDigits === undefined;

  if (shouldPreserveDecimals) {
    if (Number.isInteger(number)) {
      return getNumberFormatter(0, 0).format(number);
    }

    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(number);
  }

  const resolvedMinimum = minimumFractionDigits ?? 0;
  const resolvedMaximum = maximumFractionDigits ?? minimumFractionDigits ?? resolvedMinimum;

  return getNumberFormatter(resolvedMinimum, resolvedMaximum).format(number);
};

export const formatQuantity = (value, digits = 3) => formatNumber(value, digits, digits);

export const formatCurrency = (value, currencyPrefix = 'Rs.') => (
  `${currencyPrefix} ${formatNumber(value, 2, 2)}`
);

export const formatIssueTime = (issuance) => (
  issuance?.issue_time || issuance?.Time || issuance?.time || issuance?.remarks || 'N/A'
);

/**
 * Rounds a value to a fixed number of decimal places and returns it as a
 * genuine JS number (never a string). This is the ONLY helper that should be
 * used to place numeric values into report/export cells (XLSX, CSV, etc.) so
 * that spreadsheet consumers see real numbers usable for formulas, sorting,
 * filtering and aggregation, rather than text.
 *
 * If `decimals` is omitted, the value is returned as-is (still a number),
 * with no rounding applied.
 */
export const toExportNumber = (value, decimals) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  if (decimals === undefined || decimals === null) {
    return number;
  }

  const factor = 10 ** decimals;
  return Math.round((number + Number.EPSILON) * factor) / factor;
};

// ---------------------------------------------------------------------------
// Purchasing module: every applicable numeric value across the Purchasing
// module (Purchase Orders, Purchase Requests, GRN, supplier purchasing pages,
// RM Purchasing, purchasing transactions, tables, forms, details, summaries,
// reports and exports) must use exactly 4 decimal places, while remaining a
// real number for calculation/export purposes.
// ---------------------------------------------------------------------------
export const PURCHASING_DECIMALS = 4;

// Display string with exactly 4 decimal places, e.g. 10 -> "10.0000".
export const formatPurchasingNumber = (value) => formatNumber(value, PURCHASING_DECIMALS, PURCHASING_DECIMALS);

// Display string with a currency prefix and exactly 4 decimal places.
export const formatPurchasingCurrency = (value, currencyPrefix = 'Rs.') => (
  `${currencyPrefix} ${formatPurchasingNumber(value)}`
);

// Real number rounded to 4 decimal places, for use in report/export cells
// on Purchasing pages (never a string).
export const toPurchasingExportNumber = (value) => toExportNumber(value, PURCHASING_DECIMALS);

// payment_history.payment_method -> the label shown in invoice payment history.
// The last three are settlements, not money paid now: an advance / overpayment
// or a purchase return applied to the invoice, or an older combined settlement.
const PAYMENT_METHOD_LABELS = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  CHEQUE: 'Cheque',
  CREDIT_CARD: 'Credit Card',
  ADVANCE_PAYMENT: 'Advance Payment',
  PURCHASE_RETURN: 'Purchase Return',
  SUPPLIER_CREDIT: 'Supplier Credit'
};

export const formatPaymentMethodLabel = (method) => {
  const key = String(method || '').trim().toUpperCase();
  if (!key) return '-';
  return PAYMENT_METHOD_LABELS[key] || key.replace(/_/g, ' ');
};
