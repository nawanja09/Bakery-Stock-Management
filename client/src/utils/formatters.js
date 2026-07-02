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

export const formatNumber = (value, minimumFractionDigits = 0, maximumFractionDigits = minimumFractionDigits) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return minimumFractionDigits > 0
      ? getNumberFormatter(minimumFractionDigits, maximumFractionDigits).format(0)
      : '0';
  }

  return getNumberFormatter(minimumFractionDigits, maximumFractionDigits).format(number);
};

export const formatQuantity = (value, digits = 3) => formatNumber(value, digits, digits);

export const formatCurrency = (value, currencyPrefix = 'Rs.') => (
  `${currencyPrefix} ${formatNumber(value, 2, 2)}`
);

export const formatIssueTime = (issuance) => (
  issuance?.issue_time || issuance?.Time || issuance?.time || issuance?.remarks || 'N/A'
);
