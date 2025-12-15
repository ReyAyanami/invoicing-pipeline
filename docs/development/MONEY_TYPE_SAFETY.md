# Money Type Safety

## Problem

TypeScript can't prevent you from accidentally using native `Number` arithmetic on monetary values:

```typescript
// ❌ BAD: Floating point errors!
const total = Number(invoice.subtotal) + Number(invoice.tax);  // 0.1 + 0.2 = 0.30000000000000004
```

## Solution: Branded Money Type

We use TypeScript's **branded types** to make monetary values incompatible with regular strings, forcing developers to use our Decimal-based utilities.

### 1. Define Branded Types

```typescript
// src/common/types/money.type.ts
export type Money = string & { readonly __brand: 'Money' };
export type Quantity = string & { readonly __brand: 'Quantity' };
```

### 2. Use Type-Safe Money Utilities

```typescript
import { Money, Quantity } from '@/common/types/money.type';

// ✅ GOOD: Type-safe Decimal operations
const subtotal: Money = '100.50' as Money;
const tax: Money = '10.05' as Money;
const total = Money.add(subtotal, tax);  // Returns Money type

// ❌ BAD: TypeScript error!
const wrong = subtotal + tax;  // Error: Can't add Money types directly
const wrong2 = Number(subtotal) + Number(tax);  // Still compiles (limitation)
```

## Complete API

### Money Operations

```typescript
// Create Money
Money.from('10.50')           // → '10.50' as Money
Money.from(10.5)              // → '10.50' as Money
Money.fromPrecision(10.5, 6)  // → '10.500000' as Money (for unit prices)
Money.zero()                  // → '0.00' as Money

// Arithmetic
Money.add('10.50', '5.25')              // → '15.75' as Money
Money.subtract('10.50', '5.25')         // → '5.25' as Money
Money.multiply('10.50', 2)              // → '21.00' as Money
Money.divide('10.50', 2)                // → '5.25' as Money
Money.sum(['10.00', '20.00', '30.00']) // → '60.00' as Money

// Comparisons
Money.compare('10.50', '10.00')     // → 1 (greater)
Money.greaterThan('10.50', '10.00') // → true
Money.equals('10.50', '10.50')      // → true

// Conversion
Money.toDecimal('10.50')  // → Decimal('10.50') for advanced operations
```

### Quantity Operations

```typescript
// Create Quantity (6 decimal places by default)
Quantity.from('1000.123456')     // → '1000.123456' as Quantity
Quantity.from(1000, 3)           // → '1000.000' as Quantity
Quantity.zero()                  // → '0.000000' as Quantity

// Arithmetic
Quantity.add('100.5', '200.3')   // → '300.800000' as Quantity
Quantity.multiply('100.5', 2)    // → '201.000000' as Quantity
```

## Migration Guide

### Before (Unsafe)

```typescript
// ❌ Using native Number arithmetic
async generateInvoice() {
  const subtotal = charges.reduce(
    (sum, charge) => sum + Number(charge.subtotal),
    0,
  );
  const total = subtotal + taxAmount;
  
  return this.invoiceRepository.create({
    subtotal: String(subtotal),
    total: String(total),
  });
}
```

### After (Type-Safe)

```typescript
// ✅ Using Money utilities
import { Money } from '@/common/types/money.type';

async generateInvoice() {
  const chargeAmounts = charges.map(c => c.subtotal);
  const subtotal = Money.sum(chargeAmounts);
  const total = Money.add(subtotal, taxAmount);
  
  return this.invoiceRepository.create({
    subtotal,  // Already Money type
    total,     // Already Money type
  });
}
```

## Type Safety in Entities

Update entity types to use branded types:

```typescript
@Entity('invoices')
export class Invoice {
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: Money;  // ✅ Type-safe

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  tax: Money;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: Money;
}
```

## Benefits

1. **Compile-Time Safety**: Can't accidentally use `+` or `-` on Money
2. **IDE Autocomplete**: Money.add() suggests valid operations
3. **Decimal.js Everywhere**: All operations guaranteed to use Decimal
4. **Self-Documenting**: `Money` type makes intent clear
5. **Minimal Runtime Cost**: Type erasure means no performance impact

## Limitations

TypeScript can't prevent:
```typescript
const wrong = Number(moneyValue) + 5;  // Still compiles (casts away brand)
```

**Mitigation**: Use ESLint rules (see below) or code reviews.

## ESLint Rule (Optional)

Add custom rule to prevent `Number()` on Money fields:

```javascript
// .eslintrc.js
rules: {
  'no-restricted-syntax': [
    'error',
    {
      selector: 'CallExpression[callee.name="Number"][arguments.0.type="MemberExpression"]',
      message: 'Use Money utilities instead of Number() for monetary calculations',
    },
  ],
}
```

## Testing

```typescript
describe('Money utilities', () => {
  it('should add money values precisely', () => {
    const result = Money.add('0.1', '0.2');
    expect(result).toBe('0.30');  // Not 0.30000000000000004!
  });

  it('should prevent precision loss', () => {
    const price = Money.from(10.5);
    const quantity = 3;
    const total = Money.multiply(price, quantity);
    expect(total).toBe('31.50');
  });
});
```

## Summary

- ✅ Use `Money` and `Quantity` branded types in entities
- ✅ Use `Money.*` utilities for all monetary operations  
- ✅ Use `Quantity.*` utilities for usage metrics
- ❌ Never use `Number()` arithmetic on monetary values
- ❌ Never use `+`, `-`, `*`, `/` directly on Money types

