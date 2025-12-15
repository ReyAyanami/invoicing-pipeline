# Rating Engine

The rating engine transforms **usage quantities** into **monetary charges** using **effective-dated price books**.

## Core Responsibility

> Given: 1,234 API calls on 2024-01-15  
> Apply: Price of $0.02/call (effective on that date)  
> Result: $24.68 charge with complete explainability

---

## Key Requirements

### 1. Determinism

**Same inputs → same outputs, always.**

```typescript
// ✅ Deterministic
function calculateCharge(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100; // Round to cents
}

// ❌ Non-deterministic
function calculateCharge(quantity: number, unitPrice: number): number {
  return quantity * unitPrice * (1 + Math.random() * 0.01); // Random variance
}
```

**Why**: Re-rating must produce verifiable results.

---

### 2. Effective-Dating

Prices change over time. Always use the price effective **on the event-time**.

```typescript
interface PriceBook {
  price_book_id: string;
  version: string;
  effective_from: Date;     // When this price becomes active
  effective_until: Date | null;  // null = current version
  prices: PriceRule[];
}

interface PriceRule {
  rule_id: string;
  metric_type: string;      // 'api_calls', 'storage_gb_hours'
  pricing_model: 'flat' | 'tiered' | 'volume';
  tiers: PriceTier[];
  currency: string;
}
```

**Example Timeline**:

```
2024-01-01: v1 launches ($0.10/call)
2024-01-15: v2 launches ($0.08/call)  
2024-02-01: v3 launches ($0.12/call)

Query: What's the price on 2024-01-20?
Answer: $0.08/call (v2)

Query: What's the price on 2024-01-05?
Answer: $0.10/call (v1)
```

---

### 3. Explainability

Every charge must trace back to:
1. Source usage aggregation
2. Price book version applied
3. Calculation formula
4. Individual raw events (via aggregation)

```typescript
interface RatedCharge {
  charge_id: string;
  customer_id: string;
  aggregation_id: string;        // Links to AggregatedUsage
  
  // Pricing context
  price_book_id: string;
  price_version: string;
  rule_id: string;
  
  // Calculation
  quantity: number;
  unit_price: number;
  subtotal: number;
  currency: string;
  
  // Explainability
  calculation_metadata: {
    formula: string;             // "quantity × unit_price"
    tiers_applied: TierBreakdown[];
    source_events: string[];     // Event IDs
    effective_date: Date;        // Price effective date
  };
  
  calculated_at: Date;           // Processing-time (for debugging)
}
```

---

## Pricing Models

### 1. Flat Rate (Simplest)

**Formula**: `quantity × unit_price`

```typescript
{
  metric_type: 'api_calls',
  pricing_model: 'flat',
  tiers: [{
    up_to: null,        // No limit
    unit_price: 0.02,   // $0.02 per call
    flat_fee: 0
  }]
}
```

**Example**:
- 1,234 API calls × $0.02 = **$24.68**

---

### 2. Tiered Pricing (Volume Discounts)

**Formula**: Apply different prices to different ranges.

```typescript
{
  metric_type: 'api_calls',
  pricing_model: 'tiered',
  tiers: [
    { up_to: 1000,   unit_price: 0.02 },  // First 1K
    { up_to: 10000,  unit_price: 0.015 }, // Next 9K
    { up_to: null,   unit_price: 0.01 }   // Beyond 10K
  ]
}
```

**Example**: 12,500 API calls

```
Tier 1:  1,000 calls × $0.020 = $20.00
Tier 2:  9,000 calls × $0.015 = $135.00
Tier 3:  2,500 calls × $0.010 = $25.00
                        Total = $180.00
```

**Implementation**:

```typescript
import { Decimal } from 'decimal.js';

function calculateTieredCharge(
  quantity: number,
  tiers: PriceTier[]
): { total: number; breakdown: TierBreakdown[] } {
  let remaining = new Decimal(quantity);
  let total = new Decimal(0);
  const breakdown: TierBreakdown[] = [];
  
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const tierLimit = tier.up_to || Infinity;
    const previousLimit = i > 0 ? tiers[i - 1].up_to || 0 : 0;
    
    const tierCapacity = tierLimit - previousLimit;
    const unitsInTier = Decimal.min(remaining, tierCapacity);
    
    if (unitsInTier.lte(0)) break;
    
    const tierCharge = unitsInTier.times(tier.unit_price);
    total = total.plus(tierCharge);
    
    breakdown.push({
      tier: i + 1,
      units: unitsInTier.toNumber(),
      unit_price: tier.unit_price,
      charge: tierCharge.toDecimalPlaces(2).toNumber()
    });
    
    remaining = remaining.minus(unitsInTier);
    if (remaining.lte(0)) break;
  }
  
  return { 
    total: total.toDecimalPlaces(2).toNumber(), 
    breakdown 
  };
}
```

---

### 3. Volume Pricing (All-or-Nothing)

**Formula**: Unit price depends on total quantity.

```typescript
{
  metric_type: 'storage_gb_hours',
  pricing_model: 'volume',
  tiers: [
    { up_to: 1000,  unit_price: 0.10 },  // 0-1K: $0.10/GB-hr
    { up_to: 10000, unit_price: 0.08 },  // 1K-10K: $0.08/GB-hr (all units)
    { up_to: null,  unit_price: 0.05 }   // 10K+: $0.05/GB-hr (all units)
  ]
}
```

**Example**: 5,000 GB-hours

```
Total quantity: 5,000
Falls in tier: 1K-10K
Unit price: $0.08 (applied to ALL units)
Charge: 5,000 × $0.08 = $400.00
```

**Difference from Tiered**:
- Tiered: Different prices for different ranges
- Volume: One price for all, based on total

---

### 4. Committed Use Discounts (Advanced)

**Customer commits to X units/month, gets discount.**

```typescript
{
  metric_type: 'compute_hours',
  pricing_model: 'committed',
  commitment: {
    units: 1000,              // Committed hours
    unit_price: 0.50,         // Discounted rate
    overage_price: 0.75       // Rate above commitment
  }
}
```

**Example**: 1,200 compute hours, committed to 1,000

```
Committed: 1,000 hrs × $0.50 = $500.00
Overage:     200 hrs × $0.75 = $150.00
                        Total = $650.00
```

*Out of scope for v1, but documented for future.*

---

## Price Book Management

### Versioning Strategy

**Never modify a price book. Always create a new version.**

```typescript
// ❌ WRONG: Modifying in place
UPDATE price_books 
SET unit_price = 0.08 
WHERE id = 'pb_123';

// ✅ RIGHT: Creating new version
INSERT INTO price_books (
  parent_id,
  version,
  effective_from,
  prices
) VALUES (
  'pb_123',
  'v2',
  '2024-01-15T00:00:00Z',
  jsonb_build_object(...)
);
```

### Effective Date Rules

1. **Inclusive start**: `effective_from` is included
2. **Exclusive end**: `effective_until` is excluded (if present)
3. **Null end**: Currently active version
4. **No gaps**: Every date must have a price

```typescript
function getPriceBookForDate(
  metricType: string,
  effectiveDate: Date
): PriceBook | null {
  return db.query(`
    SELECT * FROM price_books
    WHERE metric_type = $1
      AND effective_from <= $2
      AND (effective_until IS NULL OR effective_until > $2)
    ORDER BY effective_from DESC
    LIMIT 1
  `, [metricType, effectiveDate]);
}
```

---

## Rating Process

### Input: Aggregated Usage

```typescript
{
  aggregation_id: 'agg_123',
  customer_id: 'cust_456',
  metric_type: 'api_calls',
  window_start: '2024-01-15T14:00:00Z',
  window_end: '2024-01-15T15:00:00Z',
  value: 1234,
  unit: 'count',
  event_ids: ['evt_1', 'evt_2', ...]
}
```

### Step 1: Fetch Price Book

```typescript
const effectiveDate = aggregation.window_start;
const priceBook = await getPriceBookForDate(
  aggregation.metric_type,
  effectiveDate
);

if (!priceBook) {
  throw new Error(`No price book for ${aggregation.metric_type} on ${effectiveDate}`);
}
```

### Step 2: Apply Pricing Logic

```typescript
const rule = priceBook.prices.find(
  p => p.metric_type === aggregation.metric_type
);

let result;
switch (rule.pricing_model) {
  case 'flat':
    result = calculateFlatCharge(aggregation.value, rule.tiers[0]);
    break;
  case 'tiered':
    result = calculateTieredCharge(aggregation.value, rule.tiers);
    break;
  case 'volume':
    result = calculateVolumeCharge(aggregation.value, rule.tiers);
    break;
}
```

### Step 3: Create Rated Charge

```typescript
const charge: RatedCharge = {
  charge_id: generateUUID(),
  customer_id: aggregation.customer_id,
  aggregation_id: aggregation.aggregation_id,
  
  price_book_id: priceBook.price_book_id,
  price_version: priceBook.version,
  rule_id: rule.rule_id,
  
  quantity: aggregation.value,
  unit_price: result.effective_unit_price,
  subtotal: result.total,
  currency: rule.currency,
  
  calculation_metadata: {
    formula: buildFormula(rule.pricing_model),
    tiers_applied: result.breakdown,
    source_events: aggregation.event_ids,
    effective_date: effectiveDate
  },
  
  calculated_at: new Date()
};

await saveRatedCharge(charge);
```

---

## Rounding & Precision

### Problem: Floating Point Math

```typescript
// ❌ JavaScript floating point issues
0.1 + 0.2 === 0.3  // false (actually 0.30000000000000004)
```

### Solution: Use Decimal.js

**Recommended approach** for production systems:

```typescript
import { Decimal } from 'decimal.js';

// Configure for currency (2 decimal places)
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

function calculateCharge(unitPrice: number, quantity: number): number {
  const price = new Decimal(unitPrice);
  const qty = new Decimal(quantity);
  
  return price.times(qty).toDecimalPlaces(2).toNumber();
}

// Example
calculateCharge(0.02, 1234);  // $24.68 (exact)

// Complex calculations
const total = new Decimal('10.5')
  .times('3.33')
  .plus('5.00')
  .toDecimalPlaces(2);  // 39.97
```

**Why Decimal.js?**
- ✅ Arbitrary precision arithmetic
- ✅ No floating point errors
- ✅ Industry standard for financial calculations
- ✅ Explicit rounding control
- ✅ Chainable operations

**Installation**:
```bash
npm install decimal.js
npm install --save-dev @types/decimal.js
```

---

### Alternative: Cents-Based Math (Educational)

If you can't use external libraries, manual cents-based math works:

```typescript
function multiply(amount: number, quantity: number): number {
  // Convert to cents
  const amountCents = Math.round(amount * 100);
  const total = amountCents * quantity;
  
  // Round and convert back to dollars
  return Math.round(total) / 100;
}

// Example
multiply(0.02, 1234);  // $24.68 (exact)
```

**Limitations**: Only works for simple operations, gets complex quickly.

### Rounding Rules

**Standard**: Round to nearest cent (half up)

```typescript
Math.round(24.675 * 100) / 100;  // $24.68
```

**Customer-favorable**: Always round down (floor)

```typescript
Math.floor(24.678 * 100) / 100;  // $24.67
```

Document your choice in code:

```typescript
/**
 * Round monetary amount to cents using half-up rounding.
 * 
 * Examples:
 *   24.674 → $24.67
 *   24.675 → $24.68
 *   24.676 → $24.68
 */
function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}
```

---

## Caching Price Books

Price books are **read-heavy**. Cache aggressively.

```typescript
class PriceBookCache {
  private cache: Map<string, PriceBook> = new Map();
  
  async getForDate(
    metricType: string,
    date: Date
  ): Promise<PriceBook> {
    const key = `${metricType}:${date.toISOString()}`;
    
    let cached = this.cache.get(key);
    if (cached) return cached;
    
    const priceBook = await db.fetchPriceBook(metricType, date);
    this.cache.set(key, priceBook);
    
    return priceBook;
  }
  
  invalidate(metricType: string) {
    // Remove all entries for this metric
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${metricType}:`)) {
        this.cache.delete(key);
      }
    }
  }
}
```

**TTL**: Price books are immutable. Cache forever (until deployment).

---

## Testing Rating Logic

### Test Cases

1. **Flat rate**: Simple multiplication
2. **Tiered pricing**: Multiple tier boundaries
3. **Volume pricing**: Tier transitions
4. **Edge cases**:
   - Zero quantity
   - Quantity exactly on tier boundary
   - Very large quantities
5. **Rounding**: Verify cent precision
6. **Price changes**: Different dates use different versions
7. **Missing price book**: Error handling

### Example Test

```typescript
describe('TieredPricing', () => {
  it('calculates charge across multiple tiers', () => {
    const tiers = [
      { up_to: 1000, unit_price: 0.02 },
      { up_to: 10000, unit_price: 0.015 },
      { up_to: null, unit_price: 0.01 }
    ];
    
    const result = calculateTieredCharge(12500, tiers);
    
    expect(result.breakdown).toEqual([
      { tier: 1, units: 1000, unit_price: 0.02, charge: 20.00 },
      { tier: 2, units: 9000, unit_price: 0.015, charge: 135.00 },
      { tier: 3, units: 2500, unit_price: 0.01, charge: 25.00 }
    ]);
    
    expect(result.total).toBe(180.00);
  });
});
```

---

## Performance Considerations

### Batch Processing

Don't rate one-by-one. Process in batches.

```typescript
async function rateAggregations(
  aggregations: AggregatedUsage[]
): Promise<RatedCharge[]> {
  // Group by metric type and date for cache efficiency
  const grouped = groupBy(
    aggregations,
    agg => `${agg.metric_type}:${agg.window_start.toDateString()}`
  );
  
  const charges: RatedCharge[] = [];
  
  for (const [key, batch] of grouped.entries()) {
    const [metricType, date] = key.split(':');
    const priceBook = await priceBookCache.getForDate(
      metricType,
      new Date(date)
    );
    
    for (const agg of batch) {
      charges.push(await rateAggregation(agg, priceBook));
    }
  }
  
  return charges;
}
```

### Database Indexing

```sql
CREATE INDEX idx_price_books_lookup 
ON price_books(metric_type, effective_from, effective_until);

CREATE INDEX idx_aggregated_usage_rating
ON aggregated_usage(customer_id, window_start)
WHERE is_final = true;  -- Only rate finalized aggregations
```

---

## Explainability API

Customers should be able to ask: "Why was I charged this?"

### Example Response

```json
{
  "charge_id": "chrg_789",
  "amount": "$24.68",
  "line_item": "API Calls - Standard Tier",
  "period": "2024-01-15 14:00 - 15:00 UTC",
  
  "breakdown": {
    "quantity": 1234,
    "unit": "calls",
    "unit_price": "$0.02",
    "calculation": "1,234 calls × $0.02/call = $24.68"
  },
  
  "pricing_details": {
    "price_book": "Standard API Pricing v2",
    "effective_date": "2024-01-15",
    "model": "flat",
    "tiers": [
      { "tier": 1, "up_to": "unlimited", "price": "$0.02" }
    ]
  },
  
  "source_events": {
    "count": 1234,
    "sample": [
      {
        "event_id": "evt_abc123",
        "timestamp": "2024-01-15T14:03:45Z",
        "type": "api_call",
        "endpoint": "/api/v1/users"
      }
    ],
    "download_url": "/api/events?charge_id=chrg_789"
  }
}
```

---

## Future Enhancements

### 1. Custom Pricing (Enterprise)

Per-customer price books. Requires hierarchical lookup:
1. Check customer-specific price book
2. Fall back to default price book

### 2. Promotional Credits

"First 1,000 calls free this month."

Requires credit tracking and application before charging.

### 3. Bundled Pricing

"$50/month includes 5,000 calls + 100 GB storage."

Requires package definitions and cross-metric logic.

### 4. Dynamic Pricing

Prices vary by time-of-day, region, or demand.

Requires more complex effective-dating (not just date, but hour/zone).

---

## Key Insights

1. **Determinism is non-negotiable** - Use fixed-point math, no randomness
2. **Effective-dating enables time travel** - Historical accuracy and re-rating
3. **Explainability builds trust** - Link every charge to source events
4. **Caching is essential** - Price books are immutable and read-heavy
5. **Rounding matters** - Document your rules, test edge cases

---

**Next**: [Re-rating & Corrections](RERATING.md) - Handling backfills and adjustments

