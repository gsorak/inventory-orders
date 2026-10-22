/**
 * Client-side checks mirroring the backend's request validation, so obvious mistakes are reported before a
 * request is sent. The backend stays authoritative: business rules (stock, remaining quantities, state
 * transitions) are only checked there.
 */

export type FieldErrors = Record<string, string>;

export const LIMITS = {
  skuLength: 64,
  nameLength: 200,
  paymentReferenceLength: 100,
  stockReceiptQuantity: 1_000_000,
  reservationQuantity: 10_000,
  linesPerRequest: 100,
  maxInt: 2_147_483_647,
} as const;

/** `integer`: digits only. `amount`: digits with at most one decimal point and 2 decimals. */
export type InputFormat = 'integer' | 'amount';

const INPUT_PATTERNS: Record<InputFormat, RegExp> = {
  integer: /^\d{0,10}$/,
  amount: /^\d{0,17}(\.\d{0,2})?$/,
};

/**
 * The text a field of `format` keeps after an edit, or undefined when the edit is rejected. Partial input such as
 * "12." is accepted; range checks happen on submit.
 */
export function acceptInput(format: InputFormat, text: string): string | undefined {
  // Keyboards in many locales type a decimal comma.
  const normalized = format === 'amount' ? text.replace(',', '.') : text;
  return INPUT_PATTERNS[format].test(normalized) ? normalized : undefined;
}

/** Returns an error message, or undefined when `text` is a whole number in [min, max]. */
export function wholeNumberError(text: string, min: number, max: number): string | undefined {
  const trimmed = text.trim();
  if (trimmed === '') {
    return 'Required';
  }
  if (!/^\d+$/.test(trimmed)) {
    return 'Enter a whole number';
  }
  const value = Number(trimmed);
  if (value < min || value > max) {
    return max === LIMITS.maxInt ? `Must be at least ${min}` : `Must be between ${min} and ${max}`;
  }
  return undefined;
}

function textError(text: string, maxLength: number): string | undefined {
  if (text.trim() === '') {
    return 'Required';
  }
  return text.length > maxLength ? `At most ${maxLength} characters` : undefined;
}

export interface ProductForm {
  sku: string;
  name: string;
  unitPrice: string;
  lowStockThreshold: string;
}

export function validateProduct(form: ProductForm): FieldErrors {
  const errors: FieldErrors = {};
  const sku = textError(form.sku, LIMITS.skuLength);
  const name = textError(form.name, LIMITS.nameLength);
  if (sku) errors.sku = sku;
  if (name) errors.name = name;

  const price = form.unitPrice.trim();
  if (price === '') {
    errors.unitPrice = 'Required';
  } else if (!/^\d{1,17}(\.\d{1,2})?$/.test(price)) {
    errors.unitPrice = 'Enter an amount with at most 2 decimals, e.g. 19.99';
  } else if (Number(price) < 0.01) {
    errors.unitPrice = 'Must be at least 0.01';
  }

  const threshold = wholeNumberError(form.lowStockThreshold, 0, LIMITS.maxInt);
  if (threshold) errors.lowStockThreshold = threshold;
  return errors;
}

export function stockReceiptError(quantity: string): string | undefined {
  return wholeNumberError(quantity, 1, LIMITS.stockReceiptQuantity);
}

export function paymentReferenceError(reference: string): string | undefined {
  return textError(reference, LIMITS.paymentReferenceLength);
}

/**
 * Validates quantity inputs keyed by line id (product id or order item id). Blank inputs mean "not part of
 * the request"; at least one line must have a quantity.
 */
export function validateQuantities(
  quantities: Record<number, string>,
  max: number
): { lines: { id: number; quantity: number }[]; errors: FieldErrors; formError?: string } {
  const lines: { id: number; quantity: number }[] = [];
  const errors: FieldErrors = {};
  for (const [id, text] of Object.entries(quantities)) {
    if (text.trim() === '') {
      continue;
    }
    const error = wholeNumberError(text, 1, max);
    if (error) {
      errors[id] = error;
    } else {
      lines.push({ id: Number(id), quantity: Number(text.trim()) });
    }
  }
  let formError: string | undefined;
  if (lines.length === 0 && Object.keys(errors).length === 0) {
    formError = 'Enter a quantity for at least one line';
  } else if (lines.length > LIMITS.linesPerRequest) {
    formError = `At most ${LIMITS.linesPerRequest} lines per request`;
  }
  return { lines, errors, formError };
}
