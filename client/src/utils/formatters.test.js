import { formatNumber } from './formatters';

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
