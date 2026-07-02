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
