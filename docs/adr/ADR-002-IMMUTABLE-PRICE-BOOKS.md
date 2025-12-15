# ADR-002: Immutable Price Books with Effective Dating

## Status

**Accepted**

## Context

Prices change over time. A system that launched at $0.10/call might drop to $0.08/call after gaining scale.

When prices change, we need to:
1. Apply the correct price to historical usage
2. Support re-rating with accurate pricing
3. Explain to customers why they were charged a specific amount
4. Maintain audit trail for compliance

The question: **How do we manage price changes?**

## Decision

**Use immutable, effective-dated price books.**

- Never modify existing price books
- Create new versions with `effective_from` dates
- Look up correct price based on event-time
- Keep complete version history

## Rationale

### Why Immutability?

1. **Re-rating Accuracy**: Re-running January with same price book produces same results

2. **Auditability**: "On Jan 15, the price was $0.08" is verifiable

3. **Legal Protection**: Can't be accused of retroactive price changes

4. **Explainability**: Show customers exact price in effect when they used service

### Why Effective-Dating?

Event-time billing requires time-traveling through prices:

```
Price v1: $0.10/call (effective 2024-01-01)
Price v2: $0.08/call (effective 2024-01-15)

Event on Jan 10 → Use v1 ($0.10)
Event on Jan 20 → Use v2 ($0.08)

Even if we process both on Feb 1!
```

### Why Not Single Current Price?

Single price can't handle:
- Historical accuracy
- Mid-month price changes
- Re-rating past periods
- Dispute resolution

## Schema Design

```typescript
interface PriceBook {
  price_book_id: string;
  version: string;
  
  effective_from: Date;     // When this price becomes active
  effective_until: Date | null;  // null = currently active
  
  prices: PriceRule[];
  
  parent_id?: string;  // Link to previous version
}
```

### Example Timeline

```sql
-- v1: Launch pricing
INSERT INTO price_books (
  price_book_id: 'pb_api_calls',
  version: 'v1',
  effective_from: '2024-01-01T00:00:00Z',
  effective_until: null,  -- Currently active
  prices: [...]
);

-- v2: Price drop on Jan 15
-- Step 1: Close v1
UPDATE price_books 
SET effective_until = '2024-01-15T00:00:00Z'
WHERE price_book_id = 'pb_api_calls' AND version = 'v1';

-- Step 2: Create v2
INSERT INTO price_books (
  price_book_id: 'pb_api_calls',
  version: 'v2',
  parent_id: 'pb_api_calls',
  effective_from: '2024-01-15T00:00:00Z',
  effective_until: null,  -- Now current
  prices: [...]  -- New pricing
);
```

## Consequences

### Positive

- ✅ Accurate historical pricing
- ✅ Deterministic re-rating
- ✅ Complete audit trail
- ✅ Customer explainability
- ✅ Compliance-friendly

### Negative

- ❌ More complex than single price
- ❌ Storage grows with versions
- ❌ Queries need time-based lookup
- ❌ Must manage version transitions

### Mitigations

1. **Caching**: Price books rarely change, cache aggressively

2. **Indexes**: Optimize time-range lookups
   ```sql
   CREATE INDEX idx_price_books_effective 
   ON price_books(effective_from, effective_until);
   ```

3. **Validation**: Prevent gaps in effective dates
   ```typescript
   // Ensure no gaps between versions
   assert(v2.effective_from === v1.effective_until);
   ```

4. **Archival**: Old versions can move to cold storage after statute of limitations

## Implementation

### Price Lookup Function

```typescript
async function getPriceForDate(
  metricType: string,
  effectiveDate: Date
): Promise<PriceBook> {
  const priceBook = await db.query(`
    SELECT * FROM price_books pb
    JOIN price_rules pr ON pr.price_book_id = pb.price_book_id
    WHERE pr.metric_type = $1
      AND pb.effective_from <= $2
      AND (pb.effective_until IS NULL OR pb.effective_until > $2)
    ORDER BY pb.effective_from DESC
    LIMIT 1
  `, [metricType, effectiveDate]);
  
  if (!priceBook) {
    throw new Error(`No price book found for ${metricType} on ${effectiveDate}`);
  }
  
  return priceBook;
}
```

### Creating New Version

```typescript
async function createPriceBookVersion(
  newPriceBook: PriceBook
): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Close current version
    await tx.query(`
      UPDATE price_books
      SET effective_until = $1
      WHERE price_book_id = $2
        AND effective_until IS NULL
    `, [newPriceBook.effective_from, newPriceBook.price_book_id]);
    
    // 2. Insert new version
    await tx.query(`
      INSERT INTO price_books (...)
      VALUES (...)
    `, [...]);
  });
}
```

### Validation Rules

1. **No Gaps**: Every date must have a price
2. **No Overlaps**: Only one price per date
3. **Monotonic Time**: `effective_from` < `effective_until`
4. **No Retroactive Changes**: Can't create version in the past

```typescript
function validatePriceBook(newVersion: PriceBook, current: PriceBook) {
  // Can't make effective date in the past
  if (newVersion.effective_from < new Date()) {
    throw new Error('Cannot create price book in the past');
  }
  
  // Must be after current version
  if (newVersion.effective_from <= current.effective_from) {
    throw new Error('New version must be after current');
  }
  
  // Should align with current version end
  if (current.effective_until && 
      newVersion.effective_from !== current.effective_until) {
    throw new Error('Gap or overlap in effective dates');
  }
}
```

## Alternatives Considered

### Alternative 1: Single Current Price

**Rejected**: Can't support historical accuracy or re-rating

### Alternative 2: Version Control Without Effective Dating

Store versions, but always use latest.

**Rejected**: Can't apply correct price to past events

### Alternative 3: Store Price on Each Charge

Record price at time of calculation, don't link to price book.

**Rejected**: Can't verify if correct price was used, no single source of truth

### Alternative 4: Separate Table for Price History

Keep `current_prices` and `price_history` tables.

**Considered**: Simpler queries for current price, but adds complexity managing two tables. Our approach with `effective_until IS NULL` is cleaner.

## Customer Communication

When introducing price changes:

```
Subject: Price Update for API Calls - Effective Jan 15

Hi [Customer],

Starting January 15, 2024, our API call pricing will change:
- Previous: $0.10 per call
- New: $0.08 per call (20% reduction)

Your January invoice will reflect:
- Jan 1-14: $0.10/call
- Jan 15-31: $0.08/call

This is an automatic change - no action required.

Questions? Contact support@example.com
```

## Testing Strategy

```typescript
describe('Price Book Versioning', () => {
  it('applies correct price based on event-time', async () => {
    // Setup: v1 effective Jan 1-14, v2 effective Jan 15+
    const v1 = createPriceBook({ 
      effective_from: '2024-01-01',
      unit_price: 0.10 
    });
    const v2 = createPriceBook({ 
      effective_from: '2024-01-15',
      unit_price: 0.08 
    });
    
    // Event on Jan 10 should use v1
    const price1 = await getPriceForDate('api_calls', new Date('2024-01-10'));
    expect(price1.version).toBe('v1');
    expect(price1.unit_price).toBe(0.10);
    
    // Event on Jan 20 should use v2
    const price2 = await getPriceForDate('api_calls', new Date('2024-01-20'));
    expect(price2.version).toBe('v2');
    expect(price2.unit_price).toBe(0.08);
  });
  
  it('prevents retroactive price changes', async () => {
    await expect(
      createPriceBook({ effective_from: '2024-01-01' })  // Past date
    ).rejects.toThrow('Cannot create price book in the past');
  });
});
```

## Performance Considerations

### Caching Strategy

Price books are immutable. Cache forever (until deployment).

```typescript
class PriceBookCache {
  private cache = new Map<string, PriceBook>();
  
  async get(metricType: string, date: Date): Promise<PriceBook> {
    const key = `${metricType}:${date.toISOString()}`;
    
    if (!this.cache.has(key)) {
      const pb = await fetchPriceBook(metricType, date);
      this.cache.set(key, pb);
    }
    
    return this.cache.get(key)!;
  }
  
  invalidate() {
    // Only on deployment or price book creation
    this.cache.clear();
  }
}
```

### Query Performance

With proper indexing, price lookup is O(log n) where n = version count (typically < 100).

## References

- [SaaS Pricing Models](https://www.priceintelligently.com/blog/saas-pricing-models)
- [Stripe Price Versioning](https://stripe.com/docs/products-prices/pricing-models)
- [Effective-Dated Tables](https://www.martinfowler.com/eaaDev/TemporalProperty.html)

## Future Enhancements

1. **Customer-Specific Pricing**: Per-customer price books (enterprise deals)
2. **Promotional Pricing**: Temporary discounts with auto-expiry
3. **Geographic Pricing**: Different prices per region
4. **Currency Support**: Price books in multiple currencies

---

**Date**: 2024-12-15  
**Author**: Study Project  
**Reviewers**: N/A (learning exercise)

