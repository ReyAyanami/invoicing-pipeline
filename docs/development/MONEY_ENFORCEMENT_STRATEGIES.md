# Strategies to Enforce Decimal.js for All Money Calculations

## The Problem

Even with decimal.js imported, developers can still accidentally use native JavaScript numbers:

```typescript
// ❌ Silent precision bug - compiles fine!
const total = Number(invoice.subtotal) + Number(invoice.tax);
// 0.1 + 0.2 = 0.30000000000000004
```

## 4 Strategies (Ordered by Effectiveness)

### ✅ 1. Branded Money Type (IMPLEMENTED)

**Effectiveness:** 🟢 High  
**Complexity:** 🟢 Low  
**Runtime Cost:** 🟢 None (type erasure)

Create a TypeScript branded type that can't be used with native arithmetic operators:

```typescript
// src/common/types/money.type.ts
export type Money = string & { readonly __brand: 'Money' };

export const Money = {
  add(a: Money, b: Money): Money {
    return new Decimal(a).plus(new Decimal(b)).toFixed(2) as Money;
  },
  // ... other operations
};
```

**Usage:**
```typescript
// ✅ GOOD: Type-safe
const total = Money.add(subtotal, tax);

// ❌ BAD: TypeScript error!
const wrong = subtotal + tax;  // Error: Operator '+' cannot be applied to types 'Money' and 'Money'
```

**Pros:**
- Compile-time enforcement
- Zero runtime cost
- IDE autocomplete for valid operations
- Self-documenting code (`Money` type makes intent clear)

**Cons:**
- Can still cast away: `Number(money) + 5` (but ESLint can catch this)
- Requires refactoring existing code

**Status:** ✅ **IMPLEMENTED** - See `src/common/types/money.type.ts`

---

### ✅ 2. ESLint Custom Rules

**Effectiveness:** 🟡 Medium-High  
**Complexity:** 🟡 Medium  
**Runtime Cost:** 🟢 None (lint time only)

Add ESLint rules to prevent Number() on money fields:

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    // Prevent Number() on object properties that might be money
    'no-restricted-syntax': [
      'error',
      {
        selector: 'CallExpression[callee.name="Number"][arguments.0.type="MemberExpression"]',
        message: 'Use Money utilities instead of Number() for monetary calculations. Import from @/common/types',
      },
      {
        selector: 'BinaryExpression[operator=/^[+\\-*/]$/]:has(MemberExpression[property.name=/subtotal|total|amount|price/])',
        message: 'Use Money utilities for arithmetic on monetary values',
      },
    ],
    
    // Warn on parseFloat/parseInt with money-like variables
    'no-restricted-properties': [
      'error',
      {
        object: 'Number',
        property: 'parseFloat',
        message: 'Use Money utilities instead of parseFloat for monetary values',
      },
    ],
  },
};
```

**Pros:**
- Catches mistakes at lint time
- Can be enforced in CI/CD
- Catches patterns like `Number(entity.price)`

**Cons:**
- Can have false positives
- Requires careful pattern matching
- Can be bypassed if linter disabled

**Status:** 🟡 **OPTIONAL** - Can be added to `.eslintrc.js`

---

### ⚠️ 3. TypeORM Value Transformers

**Effectiveness:** 🟡 Medium  
**Complexity:** 🔴 High  
**Runtime Cost:** 🟡 Medium (every DB operation)

Automatically convert string ↔ Decimal at the ORM level:

```typescript
import { ValueTransformer } from 'typeorm';
import Decimal from 'decimal.js';

export const MoneyTransformer: ValueTransformer = {
  to(value: Decimal | string | number): string {
    return new Decimal(value).toFixed(2);
  },
  from(value: string): Decimal {
    return new Decimal(value);
  },
};

// In entity:
@Column({
  type: 'decimal',
  precision: 12,
  scale: 2,
  transformer: MoneyTransformer,
})
subtotal: Decimal; // Now Decimal, not string!
```

**Pros:**
- Entities work with Decimal objects directly
- No manual conversion needed

**Cons:**
- ⚠️ Performance overhead on every query
- ⚠️ Breaks type compatibility with DB (string vs Decimal)
- ⚠️ Harder to debug (conversion happens invisibly)
- ⚠️ Can still do `subtotal.toNumber() + tax.toNumber()`

**Status:** ❌ **NOT RECOMMENDED** - Complexity outweighs benefits

---

### ⚠️ 4. Value Object Pattern

**Effectiveness:** 🟢 High  
**Complexity:** 🔴 Very High  
**Runtime Cost:** 🔴 High (object creation overhead)

Create a Money class:

```typescript
export class Money {
  private readonly amount: Decimal;

  private constructor(amount: Decimal) {
    this.amount = amount;
  }

  static fromString(value: string): Money {
    return new Money(new Decimal(value));
  }

  add(other: Money): Money {
    return new Money(this.amount.plus(other.amount));
  }

  toString(): string {
    return this.amount.toFixed(2);
  }

  // Prevent Number conversion
  toNumber(): never {
    throw new Error('Use toString() or toDecimal() instead');
  }
}
```

**Pros:**
- Complete encapsulation
- Can't accidentally convert to Number
- Rich domain model

**Cons:**
- ⚠️ High complexity (serialization, TypeORM integration)
- ⚠️ Performance overhead (object creation)
- ⚠️ Hard to integrate with existing TypeORM entities
- ⚠️ Requires custom serialization for JSON/DB

**Status:** ❌ **NOT RECOMMENDED** - Too complex for study project

---

## Recommended Approach

### 🎯 **Use Strategy #1 (Branded Types) + Optional #2 (ESLint)**

**Implementation Plan:**

1. ✅ **DONE**: Define `Money` and `Quantity` branded types
2. ✅ **DONE**: Create utility functions (`Money.add()`, `Money.sum()`, etc.)
3. ✅ **DONE**: Add comprehensive unit tests
4. 🔄 **TODO**: Refactor entities to use `Money` type
5. 🔄 **TODO**: Refactor services to use `Money` utilities
6. 🔄 **TODO**: (Optional) Add ESLint rules

**Migration Example:**

```typescript
// BEFORE
@Entity('invoices')
export class Invoice {
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: string;  // Just a string, no type safety
  
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: string;
}

// Service code
const total = charges.reduce(
  (sum, charge) => sum.plus(new Decimal(charge.subtotal)),
  new Decimal(0),
);

// AFTER
import { Money } from '@/common/types';

@Entity('invoices')
export class Invoice {
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: Money;  // ✅ Type-safe, can't use + operator
  
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: Money;
}

// Service code
const chargeAmounts = charges.map(c => c.subtotal);
const total = Money.sum(chargeAmounts);  // ✅ Clean and safe
```

---

## Testing Money Type Safety

Add tests to verify type safety:

```typescript
describe('Money type safety', () => {
  it('should prevent direct arithmetic', () => {
    const a: Money = '10.00' as Money;
    const b: Money = '5.00' as Money;
    
    // This should be a TypeScript error:
    // const wrong = a + b;
    
    // ✅ Correct way:
    const correct = Money.add(a, b);
    expect(correct).toBe('15.00');
  });
});
```

---

## Comparison Matrix

| Strategy | Type Safety | Runtime Cost | Complexity | Recommended |
|----------|-------------|--------------|------------|-------------|
| Branded Types | ✅ High | ✅ None | ✅ Low | ✅ **YES** |
| ESLint Rules | 🟡 Medium | ✅ None | 🟡 Medium | 🟡 Optional |
| Transformers | 🟡 Medium | 🔴 High | 🔴 High | ❌ No |
| Value Objects | ✅ High | 🔴 High | 🔴 Very High | ❌ No |

---

## Summary

✅ **Best Solution:** Branded `Money` type + utility functions
- Provides compile-time type safety
- Zero runtime cost
- Simple to implement and use
- Already implemented in `src/common/types/money.type.ts`

🟡 **Optional Enhancement:** Add ESLint rules to catch `Number()` usage

❌ **Avoid:** TypeORM transformers and Value Objects (too complex for this project)

**Next Steps:**
1. Refactor entity types to use `Money` instead of `string`
2. Refactor services to use `Money` utilities
3. Update DTOs to return `Money` types
4. (Optional) Add ESLint rules for additional safety

