# Testing Guide

Comprehensive testing strategy for the usage-based metering and invoicing pipeline.

## Testing Philosophy

**Test everything that can break. Test it before you write it.**

This project uses **Test-Driven Development (TDD)**:
1. Write test based on specification
2. Watch it fail
3. Implement minimal code to pass
4. Refactor
5. Repeat

---

## Test Pyramid

```
            ┌─────────────┐
            │   E2E Tests │  ← 10% (Complete flows)
            └─────────────┘
          ┌─────────────────┐
          │Integration Tests│  ← 30% (Component interactions)
          └─────────────────┘
     ┌──────────────────────────┐
     │      Unit Tests          │  ← 60% (Individual functions)
     └──────────────────────────┘
```

---

## Test Suite Organization

```
test/
├── unit/                           # Fast, isolated tests
│   ├── metering/
│   │   ├── windowing.spec.ts
│   │   ├── watermarks.spec.ts
│   │   └── aggregation.spec.ts
│   ├── rating/
│   │   ├── flat-pricing.spec.ts
│   │   ├── tiered-pricing.spec.ts
│   │   ├── price-lookup.spec.ts
│   │   └── precision.spec.ts
│   └── invoicing/
│       ├── invoice-generation.spec.ts
│       └── line-item-grouping.spec.ts
│
├── integration/                    # Component integration
│   ├── event-to-aggregation.spec.ts
│   ├── aggregation-to-charge.spec.ts
│   ├── charge-to-invoice.spec.ts
│   └── rerating-workflow.spec.ts
│
├── e2e/                           # End-to-end scenarios
│   ├── happy-path.spec.ts
│   ├── late-events.spec.ts
│   ├── month-boundary.spec.ts
│   └── price-changes.spec.ts
│
├── property/                      # Property-based tests
│   ├── determinism.spec.ts
│   ├── reconciliation.spec.ts
│   └── idempotency.spec.ts
│
└── fixtures/                      # Test data
    ├── events.ts
    ├── price-books.ts
    └── customers.ts
```

---

## Unit Tests

### 1. Rating Engine Tests

```typescript
// test/unit/rating/tiered-pricing.spec.ts
import { Decimal } from 'decimal.js';
import { calculateTieredCharge } from '@/rating/pricing-models';

describe('Tiered Pricing', () => {
  const tiers = [
    { up_to: 1000, unit_price: 0.02 },
    { up_to: 10000, unit_price: 0.015 },
    { up_to: null, unit_price: 0.01 }
  ];

  it('calculates charge across multiple tiers', () => {
    const result = calculateTieredCharge(12500, tiers);
    
    expect(result.breakdown).toEqual([
      { tier: 1, units: 1000, unit_price: 0.02, charge: 20.00 },
      { tier: 2, units: 9000, unit_price: 0.015, charge: 135.00 },
      { tier: 3, units: 2500, unit_price: 0.01, charge: 25.00 }
    ]);
    
    expect(result.total).toBe(180.00);
  });

  it('handles quantity exactly on tier boundary', () => {
    const result = calculateTieredCharge(1000, tiers);
    
    expect(result.breakdown).toEqual([
      { tier: 1, units: 1000, unit_price: 0.02, charge: 20.00 }
    ]);
    
    expect(result.total).toBe(20.00);
  });

  it('handles zero quantity', () => {
    const result = calculateTieredCharge(0, tiers);
    
    expect(result.breakdown).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('handles very large quantities', () => {
    const result = calculateTieredCharge(1000000, tiers);
    
    expect(result.breakdown).toHaveLength(3);
    expect(result.total).toBe(9905.00); // Verify manually
  });
});
```

---

### 2. Event-Time Windowing Tests

```typescript
// test/unit/metering/windowing.spec.ts
import { assignToWindow, WindowType } from '@/metering/windowing';

describe('Event-Time Windowing', () => {
  describe('Tumbling Windows (Hourly)', () => {
    it('assigns event to correct hour window', () => {
      const eventTime = new Date('2024-01-15T14:23:45Z');
      const window = assignToWindow(eventTime, WindowType.HOURLY);
      
      expect(window.start).toEqual(new Date('2024-01-15T14:00:00Z'));
      expect(window.end).toEqual(new Date('2024-01-15T15:00:00Z'));
    });

    it('handles month boundary correctly', () => {
      const eventTime = new Date('2024-01-31T23:59:50Z');
      const window = assignToWindow(eventTime, WindowType.HOURLY);
      
      expect(window.start).toEqual(new Date('2024-01-31T23:00:00Z'));
      expect(window.end).toEqual(new Date('2024-02-01T00:00:00Z'));
    });

    it('handles midnight exactly', () => {
      const eventTime = new Date('2024-01-15T00:00:00Z');
      const window = assignToWindow(eventTime, WindowType.HOURLY);
      
      expect(window.start).toEqual(new Date('2024-01-15T00:00:00Z'));
      expect(window.end).toEqual(new Date('2024-01-15T01:00:00Z'));
    });
  });
});
```

---

### 3. Price Book Lookup Tests

```typescript
// test/unit/rating/price-lookup.spec.ts
import { getPriceForDate } from '@/rating/price-books';

describe('Price Book Lookup', () => {
  beforeEach(async () => {
    // Setup price book versions
    await createPriceBook({
      version: 'v1',
      effective_from: '2024-01-01T00:00:00Z',
      effective_until: '2024-01-15T00:00:00Z',
      unit_price: 0.10
    });
    
    await createPriceBook({
      version: 'v2',
      effective_from: '2024-01-15T00:00:00Z',
      effective_until: null, // Current
      unit_price: 0.08
    });
  });

  it('returns correct price for date in v1 range', async () => {
    const price = await getPriceForDate(
      'api_calls',
      new Date('2024-01-10T12:00:00Z')
    );
    
    expect(price.version).toBe('v1');
    expect(price.unit_price).toBe(0.10);
  });

  it('returns correct price for date in v2 range', async () => {
    const price = await getPriceForDate(
      'api_calls',
      new Date('2024-01-20T12:00:00Z')
    );
    
    expect(price.version).toBe('v2');
    expect(price.unit_price).toBe(0.08);
  });

  it('handles effective_from boundary (inclusive)', async () => {
    const price = await getPriceForDate(
      'api_calls',
      new Date('2024-01-15T00:00:00Z')
    );
    
    expect(price.version).toBe('v2'); // New version starts exactly at midnight
  });

  it('throws when no price book exists', async () => {
    await expect(
      getPriceForDate('api_calls', new Date('2023-01-01T00:00:00Z'))
    ).rejects.toThrow('No price book found');
  });
});
```

---

### 4. Decimal Precision Tests

```typescript
// test/unit/rating/precision.spec.ts
import { Decimal } from 'decimal.js';
import { calculateCharge } from '@/rating/calculator';

describe('Decimal Precision', () => {
  it('handles floating point edge cases', () => {
    // JavaScript native: 0.1 + 0.2 = 0.30000000000000004
    const result = calculateCharge(0.1, 2);
    expect(result).toBe(0.20); // Exact
  });

  it('rounds to cents correctly (half-up)', () => {
    expect(calculateCharge(0.674, 1)).toBe(0.67);
    expect(calculateCharge(0.675, 1)).toBe(0.68); // Half-up
    expect(calculateCharge(0.676, 1)).toBe(0.68);
  });

  it('handles large multiplication', () => {
    const result = calculateCharge(0.02, 1234567);
    expect(result).toBe(24691.34);
  });

  it('handles very small amounts', () => {
    const result = calculateCharge(0.0001, 5);
    expect(result).toBe(0.00); // Rounds to zero
  });
});
```

---

## Integration Tests

### Event → Aggregation Flow

```typescript
// test/integration/event-to-aggregation.spec.ts
describe('Event to Aggregation Flow', () => {
  it('aggregates multiple events into window', async () => {
    const customer_id = 'cust_123';
    const windowStart = new Date('2024-01-15T14:00:00Z');
    
    // Send 3 events in same window
    await ingestEvent({
      event_id: 'evt_001',
      customer_id,
      event_time: new Date('2024-01-15T14:05:00Z'),
      event_type: 'api_call'
    });
    
    await ingestEvent({
      event_id: 'evt_002',
      customer_id,
      event_time: new Date('2024-01-15T14:15:00Z'),
      event_type: 'api_call'
    });
    
    await ingestEvent({
      event_id: 'evt_003',
      customer_id,
      event_time: new Date('2024-01-15T14:45:00Z'),
      event_type: 'api_call'
    });
    
    // Wait for aggregation
    await advanceWatermarkPast(new Date('2024-01-15T15:00:00Z'));
    
    // Verify aggregation
    const agg = await getAggregation(customer_id, windowStart);
    expect(agg.value).toBe(3);
    expect(agg.event_count).toBe(3);
    expect(agg.event_ids).toEqual(['evt_001', 'evt_002', 'evt_003']);
    expect(agg.is_final).toBe(true);
  });

  it('handles late event within allowed lateness', async () => {
    const customer_id = 'cust_123';
    const windowStart = new Date('2024-01-15T14:00:00Z');
    
    // Send on-time event
    await ingestEvent({
      event_id: 'evt_001',
      customer_id,
      event_time: new Date('2024-01-15T14:05:00Z'),
      event_type: 'api_call'
    });
    
    // Close window (watermark advances)
    await advanceWatermarkPast(new Date('2024-01-15T15:00:00Z'));
    
    const agg1 = await getAggregation(customer_id, windowStart);
    expect(agg1.value).toBe(1);
    expect(agg1.is_final).toBe(false); // Not final yet
    
    // Send late event (within 3h allowed lateness)
    await ingestEvent({
      event_id: 'evt_002',
      customer_id,
      event_time: new Date('2024-01-15T14:55:00Z'), // In same window
      event_type: 'api_call'
    });
    
    // Verify updated aggregation
    const agg2 = await getAggregation(customer_id, windowStart);
    expect(agg2.value).toBe(2); // Updated
    expect(agg2.event_count).toBe(2);
    expect(agg2.version).toBe(2); // Version incremented
  });
});
```

---

### Aggregation → Charge Flow

```typescript
// test/integration/aggregation-to-charge.spec.ts
describe('Aggregation to Charge Flow', () => {
  it('rates aggregation with correct price', async () => {
    // Setup price book
    await createPriceBook({
      metric_type: 'api_calls',
      effective_from: '2024-01-15T00:00:00Z',
      unit_price: 0.02
    });
    
    // Create aggregation
    const agg = await createAggregation({
      customer_id: 'cust_123',
      metric_type: 'api_calls',
      window_start: '2024-01-15T14:00:00Z',
      window_end: '2024-01-15T15:00:00Z',
      value: 1234,
      is_final: true
    });
    
    // Trigger rating
    await rateAggregation(agg.aggregation_id);
    
    // Verify charge
    const charge = await getChargeByAggregationId(agg.aggregation_id);
    expect(charge.quantity).toBe(1234);
    expect(charge.unit_price).toBe(0.02);
    expect(charge.subtotal).toBe(24.68);
    expect(charge.calculation_metadata.formula).toBe('quantity × unit_price');
    expect(charge.calculation_metadata.source_events).toEqual(agg.event_ids);
  });
});
```

---

## End-to-End Tests

### Complete Happy Path

```typescript
// test/e2e/happy-path.spec.ts
describe('E2E: Complete Billing Pipeline', () => {
  it('processes event through to invoice', async () => {
    const customer_id = 'cust_123';
    
    // 1. Ingest events
    for (let i = 0; i < 100; i++) {
      await ingestEvent({
        event_id: `evt_${i}`,
        customer_id,
        event_time: new Date(`2024-01-15T14:${i % 60}:00Z`),
        event_type: 'api_call'
      });
    }
    
    // 2. Wait for aggregation
    await advanceWatermarkPast(new Date('2024-01-15T16:00:00Z'));
    
    const aggregations = await getAggregations(customer_id);
    expect(aggregations).toHaveLength(2); // 14:00-15:00 and 15:00-16:00
    expect(aggregations[0].value + aggregations[1].value).toBe(100);
    
    // 3. Wait for rating
    await waitForRatingComplete();
    
    const charges = await getCharges(customer_id);
    expect(charges).toHaveLength(2);
    
    const totalCharge = charges.reduce((sum, c) => sum + c.subtotal, 0);
    expect(totalCharge).toBe(2.00); // 100 × $0.02
    
    // 4. Generate invoice
    const invoice = await generateInvoice(customer_id, {
      billing_period_start: '2024-01-01T00:00:00Z',
      billing_period_end: '2024-01-31T23:59:59.999Z'
    });
    
    expect(invoice.status).toBe('draft');
    expect(invoice.subtotal).toBe(2.00);
    expect(invoice.line_items).toHaveLength(1);
    expect(invoice.line_items[0].description).toContain('API Calls');
    
    // 5. Verify explainability trail
    const chargeId = charges[0].charge_id;
    const trail = await getExplainabilityTrail(chargeId);
    
    expect(trail.source_events).toHaveLength(60); // Events in first hour
    expect(trail.aggregation_id).toBe(aggregations[0].aggregation_id);
    expect(trail.price_book_version).toBeDefined();
  });
});
```

---

### Month-End Boundary Test

```typescript
// test/e2e/month-boundary.spec.ts
describe('E2E: Month-End Boundary', () => {
  it('bills events to correct month', async () => {
    const customer_id = 'cust_123';
    
    // Event on Jan 31, 23:59:50
    await ingestEvent({
      event_id: 'evt_jan',
      customer_id,
      event_time: new Date('2024-01-31T23:59:50Z'),
      event_type: 'api_call'
    });
    
    // Event on Feb 1, 00:00:10
    await ingestEvent({
      event_id: 'evt_feb',
      customer_id,
      event_time: new Date('2024-02-01T00:00:10Z'),
      event_type: 'api_call'
    });
    
    await advanceWatermarkPast(new Date('2024-02-01T04:00:00Z'));
    await waitForRatingComplete();
    
    // Generate January invoice
    const janInvoice = await generateInvoice(customer_id, {
      billing_period_start: '2024-01-01T00:00:00Z',
      billing_period_end: '2024-01-31T23:59:59.999Z'
    });
    
    // Generate February invoice
    const febInvoice = await generateInvoice(customer_id, {
      billing_period_start: '2024-02-01T00:00:00Z',
      billing_period_end: '2024-02-29T23:59:59.999Z'
    });
    
    // Verify Jan event is on Jan invoice
    const janCharges = await getChargesForInvoice(janInvoice.invoice_id);
    const janEventIds = janCharges.flatMap(c => c.calculation_metadata.source_events);
    expect(janEventIds).toContain('evt_jan');
    expect(janEventIds).not.toContain('evt_feb');
    
    // Verify Feb event is on Feb invoice
    const febCharges = await getChargesForInvoice(febInvoice.invoice_id);
    const febEventIds = febCharges.flatMap(c => c.calculation_metadata.source_events);
    expect(febEventIds).toContain('evt_feb');
    expect(febEventIds).not.toContain('evt_jan');
  });
});
```

---

## Property-Based Tests

```typescript
// test/property/determinism.spec.ts
import { fc } from 'fast-check';

describe('Property: Determinism', () => {
  it('re-rating produces identical results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          event_id: fc.uuid(),
          event_time: fc.date(),
          customer_id: fc.uuid(),
          event_type: fc.constant('api_call')
        })),
        fc.record({
          unit_price: fc.double({ min: 0.01, max: 1.00 })
        }),
        async (events, priceBook) => {
          const result1 = await rateEvents(events, priceBook);
          const result2 = await rateEvents(events, priceBook);
          
          return JSON.stringify(result1) === JSON.stringify(result2);
        }
      )
    );
  });
});
```

---

## Test Fixtures

```typescript
// test/fixtures/events.ts
export const createTestEvent = (overrides = {}) => ({
  event_id: uuid(),
  customer_id: 'cust_test',
  event_time: new Date(),
  event_type: 'api_call',
  metadata: {},
  ...overrides
});

export const create100Events = (customer_id: string, startTime: Date) => {
  return Array.from({ length: 100 }, (_, i) => createTestEvent({
    event_id: `evt_${i}`,
    customer_id,
    event_time: new Date(startTime.getTime() + i * 1000)
  }));
};
```

---

## Mocking Strategies

### Mock Time Provider

```typescript
// src/common/time-provider.ts
export interface TimeProvider {
  now(): Date;
}

export class SystemTimeProvider implements TimeProvider {
  now(): Date {
    return new Date();
  }
}

export class MockTimeProvider implements TimeProvider {
  private currentTime: Date;
  
  constructor(startTime: Date) {
    this.currentTime = startTime;
  }
  
  now(): Date {
    return this.currentTime;
  }
  
  advance(ms: number) {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
}
```

### Usage in Tests

```typescript
describe('Watermark Advancement', () => {
  let timeProvider: MockTimeProvider;
  
  beforeEach(() => {
    timeProvider = new MockTimeProvider(new Date('2024-01-15T14:00:00Z'));
  });
  
  it('advances watermark as time passes', () => {
    const watermark = new WatermarkManager(timeProvider);
    
    watermark.updateWithEvent(new Date('2024-01-15T14:05:00Z'));
    expect(watermark.getWatermark()).toEqual(new Date('2024-01-15T14:05:00Z'));
    
    timeProvider.advance(3600000); // +1 hour
    expect(timeProvider.now()).toEqual(new Date('2024-01-15T15:00:00Z'));
  });
});
```

---

## CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      kafka:
        image: confluentinc/cp-kafka:7.4.0
        env:
          KAFKA_BROKER_ID: 1
          KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint:check
      
      - name: Run type check
        run: npm run type-check
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Run integration tests
        run: npm run test:integration
      
      - name: Run E2E tests
        run: npm run test:e2e
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## Coverage Targets

```json
{
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      },
      "./src/rating/": {
        "branches": 95,
        "functions": 95,
        "lines": 95,
        "statements": 95
      }
    }
  }
}
```

---

## Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e

# Watch mode
npm run test:watch

# Coverage
npm run test:cov

# Specific test file
npm test -- rating-engine.spec.ts

# Specific test case
npm test -- -t "calculates tiered charge"
```

---

## Key Principles

1. **Test Behavior, Not Implementation** - Test what it does, not how
2. **Isolate Tests** - Each test should be independent
3. **Use Descriptive Names** - Test name = specification
4. **Arrange-Act-Assert** - Clear test structure
5. **Test Edge Cases** - Zero, negative, boundary, overflow
6. **Mock External Dependencies** - Database, Kafka, time
7. **Fast Feedback** - Unit tests < 1s, integration < 10s

---

**Next**: Start implementing with TDD using these test patterns!

