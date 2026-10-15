import { formatNumber, formatPaymentMethodLabel } from './formatters';

describe('formatPaymentMethodLabel', () => {
  it('names the settlements that move no money', () => {
    expect(formatPaymentMethodLabel('ADVANCE_PAYMENT')).toBe('Advance Payment');
    expect(formatPaymentMethodLabel('PURCHASE_RETURN')).toBe('Purchase Return');
    expect(formatPaymentMethodLabel('SUPPLIER_CREDIT')).toBe('Supplier Credit');
  });

  it('names the money methods', () => {
    expect(formatPaymentMethodLabel('CASH')).toBe('Cash');
    expect(formatPaymentMethodLabel('BANK_TRANSFER')).toBe('Bank Transfer');
    expect(formatPaymentMethodLabel('CHEQUE')).toBe('Cheque');
    expect(formatPaymentMethodLabel('CREDIT_CARD')).toBe('Credit Card');
  });

  it('shows a dash, not an empty badge, when the method is missing', () => {
    expect(formatPaymentMethodLabel('')).toBe('-');
    expect(formatPaymentMethodLabel(null)).toBe('-');
    expect(formatPaymentMethodLabel(undefined)).toBe('-');
  });
});

describe('formatNumber', () => {
  it('formats integers with thousand separators', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(25000)).toBe('25,000');
    expect(formatNumber(123456789)).toBe('123,456,789');
  });

  it('preserves decimal values while formatting the integer part', () => {
    expect(formatNumber(1000000.50)).toBe('1,000,000.50');
  });
});
