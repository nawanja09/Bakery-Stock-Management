const normalizePaymentMethodValue = (value) => {
  if (!value) return '';

  const normalized = String(value).trim().toUpperCase();

  switch (normalized) {
    case 'CASH':
    case 'BANK_TRANSFER':
    case 'CHEQUE':
    case 'CREDIT':
      return normalized;
    case 'CREDIT_CARD':
    case 'CREDIT CARD':
      return 'CREDIT';
    case 'BANK':
    case 'BANK TRANSFER':
      return 'BANK_TRANSFER';
    case 'CARD':
      return 'CREDIT';
    case 'PAYMENT METHOD':
      return 'CASH';
    default:
      return normalized;
  }
};

module.exports = {
  normalizePaymentMethodValue
};
