import Decimal from 'decimal.js';

/**
 * Branded type for monetary values stored as strings in the database.
 * This prevents accidentally using Number arithmetic on money values.
 *
 * Usage:
 *   const price: Money = '10.50' as Money;
 *   const total = Money.add(price, otherPrice); // ✅ Type-safe
 *   const wrong = price + otherPrice;            // ❌ TypeScript error
 */
export type Money = string & { readonly __brand: 'Money' };

/**
 * Branded type for quantities with high precision.
 */
export type Quantity = string & { readonly __brand: 'Quantity' };

/**
 * Money utilities - all operations use Decimal.js for precision
 */
export const Money = {
  /**
   * Create a Money value from various input types
   */
  from(value: string | number | Decimal): Money {
    return new Decimal(value).toFixed(2) as Money;
  },

  /**
   * Create Money with custom precision (for unit prices)
   */
  fromPrecision(value: string | number | Decimal, decimals: number): Money {
    return new Decimal(value).toFixed(decimals) as Money;
  },

  /**
   * Parse Money to Decimal for calculations
   */
  toDecimal(value: Money | string): Decimal {
    return new Decimal(value);
  },

  /**
   * Add two or more Money values
   */
  add(...values: Array<Money | string>): Money {
    const result = values.reduce(
      (sum, value) => sum.plus(new Decimal(value)),
      new Decimal(0),
    );
    return result.toFixed(2) as Money;
  },

  /**
   * Subtract money values
   */
  subtract(a: Money | string, b: Money | string): Money {
    return new Decimal(a).minus(new Decimal(b)).toFixed(2) as Money;
  },

  /**
   * Multiply money by a quantity
   */
  multiply(
    money: Money | string,
    multiplier: number | string | Decimal,
  ): Money {
    return new Decimal(money)
      .times(new Decimal(multiplier))
      .toFixed(2) as Money;
  },

  /**
   * Divide money by a divisor
   */
  divide(money: Money | string, divisor: number | string | Decimal): Money {
    return new Decimal(money)
      .dividedBy(new Decimal(divisor))
      .toFixed(2) as Money;
  },

  /**
   * Compare two money values
   */
  compare(a: Money | string, b: Money | string): number {
    return new Decimal(a).comparedTo(new Decimal(b));
  },

  /**
   * Check if money value is greater than another
   */
  greaterThan(a: Money | string, b: Money | string): boolean {
    return new Decimal(a).greaterThan(new Decimal(b));
  },

  /**
   * Check if money value equals another
   */
  equals(a: Money | string, b: Money | string): boolean {
    return new Decimal(a).equals(new Decimal(b));
  },

  /**
   * Sum an array of money values
   */
  sum(values: Array<Money | string>): Money {
    const result = values.reduce(
      (sum, value) => sum.plus(new Decimal(value)),
      new Decimal(0),
    );
    return result.toFixed(2) as Money;
  },

  /**
   * Zero money value
   */
  zero(): Money {
    return '0.00' as Money;
  },
};

/**
 * Quantity utilities - high precision for usage metrics
 */
export const Quantity = {
  from(value: string | number | Decimal, precision = 6): Quantity {
    return new Decimal(value).toFixed(precision) as Quantity;
  },

  toDecimal(value: Quantity | string): Decimal {
    return new Decimal(value);
  },

  add(...values: Array<Quantity | string>): Quantity {
    const result = values.reduce(
      (sum, value) => sum.plus(new Decimal(value)),
      new Decimal(0),
    );
    return result.toFixed(6) as Quantity;
  },

  multiply(
    qty: Quantity | string,
    multiplier: number | string | Decimal,
  ): Quantity {
    return new Decimal(qty)
      .times(new Decimal(multiplier))
      .toFixed(6) as Quantity;
  },

  zero(): Quantity {
    return '0.000000' as Quantity;
  },

  max(a: Quantity | string, b: Quantity | string): Quantity {
    const decA = new Decimal(a);
    const decB = new Decimal(b);
    return Decimal.max(decA, decB).toFixed(6) as Quantity;
  },
};
