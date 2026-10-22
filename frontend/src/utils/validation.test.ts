import { stockReceiptError, validateProduct, validateQuantities, wholeNumberError } from './validation';

describe('wholeNumberError', () => {
  it.each([
    ['', 'Required'],
    ['  ', 'Required'],
    ['1.5', 'Enter a whole number'],
    ['-1', 'Enter a whole number'],
    ['abc', 'Enter a whole number'],
    ['0', 'Must be between 1 and 10'],
    ['11', 'Must be between 1 and 10'],
  ])('rejects %p', (text, message) => {
    expect(wholeNumberError(text, 1, 10)).toBe(message);
  });

  it('accepts numbers within the bounds', () => {
    expect(wholeNumberError(' 10 ', 1, 10)).toBeUndefined();
  });
});

describe('validateProduct', () => {
  const valid = { sku: 'LAMP-1', name: 'Lamp', unitPrice: '19.99', lowStockThreshold: '0' };

  it('accepts a valid product', () => {
    expect(validateProduct(valid)).toEqual({});
  });

  it('mirrors the backend constraints', () => {
    expect(
      validateProduct({ sku: 'x'.repeat(65), name: ' ', unitPrice: '1.234', lowStockThreshold: '-1' })
    ).toEqual({
      sku: 'At most 64 characters',
      name: 'Required',
      unitPrice: 'Enter an amount with at most 2 decimals, e.g. 19.99',
      lowStockThreshold: 'Enter a whole number',
    });
    expect(validateProduct({ ...valid, unitPrice: '0.00' }).unitPrice).toBe('Must be at least 0.01');
  });
});

describe('stockReceiptError', () => {
  it('allows 1 to 1,000,000 units', () => {
    expect(stockReceiptError('1000000')).toBeUndefined();
    expect(stockReceiptError('1000001')).toBe('Must be between 1 and 1000000');
  });
});

describe('validateQuantities', () => {
  it('ignores blank lines and returns the filled ones', () => {
    expect(validateQuantities({ 1: '2', 2: '', 3: '1' }, 10)).toEqual({
      lines: [
        { id: 1, quantity: 2 },
        { id: 3, quantity: 1 },
      ],
      errors: {},
      formError: undefined,
    });
  });

  it('requires at least one line', () => {
    expect(validateQuantities({ 1: '' }, 10).formError).toBe('Enter a quantity for at least one line');
  });

  it('reports invalid lines by id', () => {
    expect(validateQuantities({ 7: '0' }, 10).errors).toEqual({ 7: 'Must be between 1 and 10' });
  });
});
