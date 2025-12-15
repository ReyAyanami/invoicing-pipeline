# Documentation Obsolescence Audit

**Date**: 2024-12-16  
**Purpose**: Identify outdated information after Money type refactoring

## Issues Found

### 1. ❌ DATA_MODEL.md (Lines 10-20)

**Problem**: Still recommends using `decimal.js` directly

```typescript
// ✅ Correct approach
import { Decimal } from 'decimal.js';
const charge = new Decimal('10.99').times('1234').toDecimalPlaces(2);
```

**Should be**:
```typescript
// ✅ Correct approach
import { Money } from '@/common/types';
const charge = Money.multiply('10.99', 1234); // Returns Money type
```

**Status**: Needs update

---

### 2. ❌ GETTING_STARTED.md (Line 62)

**Problem**: References Zookeeper (removed in favor of KRaft mode)

```
- **Zookeeper** on port 2181
```

**Should be**: Remove Zookeeper reference, mention Kafka in KRaft mode

**Status**: Needs update

---

### 3. ❌ RATING_ENGINE.md (Multiple Locations)

**Problems**:

#### Lines 20-28: Non-deterministic example uses native Math
```typescript
function calculateCharge(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100;
}
```

**Should recommend**:
```typescript
import { Money } from '@/common/types';
function calculateCharge(quantity: number, unitPrice: Money): Money {
  return Money.multiply(unitPrice, quantity);
}
```

#### Lines 163-201: Tiered pricing uses Decimal directly
```typescript
import { Decimal } from 'decimal.js';

function calculateTieredCharge(
  quantity: number,
  tiers: PriceTier[]
): { total: number; breakdown: TierBreakdown[] } {
  let remaining = new Decimal(quantity);
  let total = new Decimal(0);
  // ...
}
```

**Should use**: `Money` and `Quantity` utilities

#### Lines 414-433: Shows Decimal.js as recommended approach
**Should also mention**: `Money` utilities as the preferred abstraction

**Status**: Needs significant updates

---

### 4. ❌ GETTING_STARTED.md (Line 48)

**Problem**: Lists Decimal.js but not Money types
```
- Decimal.js for precise financial calculations
```

**Should be**:
```
- Decimal.js for precise financial calculations (via Money/Quantity types)
```

**Status**: Needs minor update

---

## Not Issues (False Positives)

### ✅ SQL Field Names (snake_case)
**Files**: DATA_MODEL.md, migrations, etc.  
**Reason**: SQL/database still uses snake_case. Documentation correctly shows `event_id`, `customer_id`, etc.  
**Status**: Correct as-is

### ✅ TypeScript camelCase in Entity Docs
**Files**: Architecture docs referencing entities  
**Reason**: Our entities now use camelCase in TypeScript  
**Status**: Correct as-is

---

## Recommendations

### Priority 1: Critical Updates

1. **DATA_MODEL.md**: Update precision guidance (lines 6-22)
   - Add reference to Money types
   - Show Money utilities as primary recommendation
   - Keep Decimal.js as implementation detail

2. **RATING_ENGINE.md**: Comprehensive refactor
   - Update all code examples to use Money/Quantity
   - Add new section: "Type-Safe Calculations with Money"
   - Update "Rounding & Precision" section to reference Money utilities
   - Add link to `docs/development/MONEY_TYPE_SAFETY.md`

3. **GETTING_STARTED.md**: Infrastructure updates
   - Remove Zookeeper references
   - Update to mention Kafka KRaft mode
   - Update dependency list to mention Money types

### Priority 2: Enhancement

4. Add cross-references between docs:
   - Link from DATA_MODEL.md → MONEY_TYPE_SAFETY.md
   - Link from RATING_ENGINE.md → MONEY_ENFORCEMENT_STRATEGIES.md
   - Update INDEX.md to include new Money docs

### Priority 3: Verification

5. Grep for these patterns in all remaining docs:
   - `new Decimal(` → Should recommend Money utilities
   - `Zookeeper` → Should be removed
   - `Redis` → Should be removed (if found)
   - Direct arithmetic on money values → Should use Money methods

---

## Action Plan

1. Update DATA_MODEL.md precision section ✅
2. Update GETTING_STARTED.md infrastructure section ✅
3. Update RATING_ENGINE.md comprehensively ✅
4. Update docs/INDEX.md with new Money documentation ✅
5. Final verification pass ✅

