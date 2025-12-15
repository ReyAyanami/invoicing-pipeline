# Performance Requirements & Testing

Performance criteria and testing strategies for the invoicing pipeline.

## ⚠️ Important Note

This is a **study project** focused on learning architectural patterns. Performance targets are **educational guidelines**, not production SLAs.

For production systems, determine requirements based on:
- Actual usage patterns
- Business requirements
- Cost constraints
- User expectations

---

## Performance Targets (Study Project)

### Event Ingestion

| Metric | Target | Rationale |
|--------|--------|-----------|
| Throughput | 10,000 events/sec | Demonstrate scalability patterns |
| Latency (P50) | < 50ms | Acceptable for async ingestion |
| Latency (P99) | < 200ms | Handle occasional slowness |
| Error Rate | < 0.1% | High reliability requirement |

---

### Metering Engine (Aggregation)

| Metric | Target | Rationale |
|--------|--------|-----------|
| Processing Lag | < 1 second | Near real-time aggregation |
| Window Close Time | < 5 seconds | Fast finalization after watermark |
| State Store Size | < 10GB RAM | Manageable with proper windowing |
| Checkpoint Interval | 1 minute | Balance durability vs performance |

---

### Rating Engine

| Metric | Target | Rationale |
|--------|--------|-----------|
| Batch Size | 1,000 aggregations | Efficient batch processing |
| Latency per Batch | < 10 seconds | Fast rating cycles |
| Price Book Lookup | < 10ms (cached) | In-memory cache hit |
| Calculation Time | < 1ms per charge | Simple arithmetic |

---

### Invoice Generation

| Metric | Target | Rationale |
|--------|--------|-----------|
| Time per Invoice | < 100ms | Fast document generation |
| Batch Size | 10,000 customers | Monthly invoice run |
| Total Batch Time | < 5 minutes | Complete run under 5 min |
| Memory per Invoice | < 1MB | Efficient memory usage |

---

### Database Queries

| Query Type | Target | Notes |
|------------|--------|-------|
| Point Lookup (by ID) | < 5ms | Indexed primary keys |
| Range Query (time-based) | < 50ms | Partitioned tables |
| Aggregation Query | < 500ms | Pre-computed where possible |
| Complex Join | < 1 second | Optimize with materialized views |

---

### API Endpoints

| Endpoint | Target Latency (P99) | Throughput |
|----------|---------------------|------------|
| POST /events | < 200ms | 1,000 req/sec |
| GET /aggregations | < 100ms | 500 req/sec |
| GET /charges | < 100ms | 500 req/sec |
| GET /invoices | < 200ms | 200 req/sec |
| POST /rerating-jobs | < 500ms | 10 req/sec |

---

## Performance Test Scenarios

### 1. Load Testing - Sustained Traffic

**Objective**: Verify system handles expected load

**Setup**:
```yaml
scenario: sustained_load
duration: 10 minutes
ramp_up: 1 minute
  
virtual_users: 100
requests_per_second: 1000
  
endpoints:
  - POST /api/v1/events (70%)
  - GET /api/v1/aggregations (20%)
  - GET /api/v1/charges (10%)
```

**Success Criteria**:
- ✅ P99 latency < target
- ✅ Error rate < 0.1%
- ✅ No memory leaks
- ✅ CPU < 80% average

**Implementation**:
```typescript
// test/performance/load-test.spec.ts
import { check } from 'k6';
import http from 'k6/http';

export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Ramp up
    { duration: '10m', target: 100 },  // Sustained
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(99)<200'],  // 99% < 200ms
    http_req_failed: ['rate<0.001'],   // < 0.1% errors
  },
};

export default function() {
  const payload = JSON.stringify({
    event_id: `evt_${__VU}_${__ITER}`,
    customer_id: `cust_${__VU % 100}`,
    event_time: new Date().toISOString(),
    event_type: 'api_call'
  });
  
  const response = http.post(
    'http://localhost:3000/api/v1/events',
    payload,
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  check(response, {
    'status is 201': (r) => r.status === 201,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });
}
```

---

### 2. Stress Testing - Peak Traffic

**Objective**: Find breaking point

**Setup**:
```yaml
scenario: stress_test
duration: 5 minutes
  
ramp_profile:
  - 0-1min: 100 users
  - 1-2min: 500 users
  - 2-3min: 1000 users
  - 3-4min: 2000 users
  - 4-5min: 3000 users
```

**Observations**:
- At what point does latency spike?
- What component fails first?
- Does system recover gracefully?

**Success Criteria**:
- ✅ Graceful degradation (no crashes)
- ✅ Error messages are informative
- ✅ System recovers when load decreases

---

### 3. Spike Testing - Sudden Traffic Burst

**Objective**: Handle sudden traffic spikes

**Setup**:
```yaml
scenario: spike_test
  
profile:
  - 0-1min: 100 users (baseline)
  - 1-2min: 2000 users (spike!)
  - 2-3min: 100 users (return to baseline)
```

**Success Criteria**:
- ✅ System handles spike without crash
- ✅ Latency recovers after spike
- ✅ No data loss during spike

---

### 4. Endurance Testing - Long-Running Stability

**Objective**: Detect memory leaks, resource exhaustion

**Setup**:
```yaml
scenario: endurance_test
duration: 24 hours
virtual_users: 50
steady_rate: 100 req/sec
```

**Monitoring**:
- Memory usage over time
- Connection pool size
- Disk space growth
- CPU usage pattern

**Success Criteria**:
- ✅ Memory usage stable (no leaks)
- ✅ No file descriptor exhaustion
- ✅ Consistent latency over 24 hours

---

### 5. Aggregation Performance

**Objective**: Verify windowing performance

**Setup**:
```typescript
describe('Metering Performance', () => {
  it('aggregates 100K events in under 10 seconds', async () => {
    const startTime = Date.now();
    
    // Generate 100K events
    const events = generateEvents(100_000, {
      customers: 1000,
      timeSpan: Duration.hours(1)
    });
    
    // Ingest all events
    await Promise.all(events.map(e => ingestEvent(e)));
    
    // Wait for aggregation
    await advanceWatermark();
    await waitForAggregationComplete();
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(10_000);
    
    // Verify all events aggregated
    const aggregations = await getAllAggregations();
    const totalEvents = aggregations.reduce(
      (sum, agg) => sum + agg.event_count,
      0
    );
    expect(totalEvents).toBe(100_000);
  });
});
```

---

### 6. Rating Engine Performance

**Objective**: Verify pricing calculation speed

**Setup**:
```typescript
describe('Rating Performance', () => {
  it('rates 10K aggregations in under 5 seconds', async () => {
    const aggregations = await createTestAggregations(10_000);
    
    const startTime = Date.now();
    const charges = await rateAggregations(aggregations);
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(5_000);
    expect(charges).toHaveLength(10_000);
  });
  
  it('tiered pricing calculates in under 1ms', () => {
    const tiers = createComplexTiers(10); // 10 tiers
    
    const startTime = performance.now();
    const result = calculateTieredCharge(1_000_000, tiers);
    const duration = performance.now() - startTime;
    
    expect(duration).toBeLessThan(1); // < 1ms
    expect(result.total).toBeGreaterThan(0);
  });
});
```

---

### 7. Database Performance

**Objective**: Verify query performance with realistic data

**Setup**:
```typescript
describe('Database Performance', () => {
  beforeAll(async () => {
    // Seed database with realistic data
    await seedDatabase({
      customers: 10_000,
      events: 10_000_000,
      aggregations: 1_000_000,
      charges: 500_000,
      invoices: 50_000
    });
  });
  
  it('point lookup by ID < 5ms', async () => {
    const startTime = performance.now();
    const invoice = await db.findOne('invoices', { invoice_id: 'inv_123' });
    const duration = performance.now() - startTime;
    
    expect(duration).toBeLessThan(5);
    expect(invoice).toBeDefined();
  });
  
  it('range query with partition < 50ms', async () => {
    const startTime = performance.now();
    const events = await db.query(`
      SELECT * FROM telemetry_events
      WHERE customer_id = $1
        AND event_time BETWEEN $2 AND $3
    `, ['cust_123', '2024-01-01', '2024-01-31']);
    const duration = performance.now() - startTime;
    
    expect(duration).toBeLessThan(50);
  });
});
```

---

## Concurrency Testing

### Race Condition Scenarios

#### 1. Concurrent Event Ingestion (Same Event ID)

**Scenario**: Two requests try to ingest same event_id simultaneously

**Expected Behavior**: Idempotency - only one succeeds, other gets 409

**Test**:
```typescript
describe('Concurrency: Event Ingestion', () => {
  it('handles duplicate event_id concurrently', async () => {
    const event = createTestEvent({ event_id: 'evt_race_123' });
    
    // Send same event simultaneously from two clients
    const [response1, response2] = await Promise.all([
      ingestEvent(event),
      ingestEvent(event)
    ]);
    
    // One succeeds (201), one detects duplicate (409)
    const statuses = [response1.status, response2.status].sort();
    expect(statuses).toEqual([201, 409]);
    
    // Verify only one event in database
    const events = await db.query(
      'SELECT * FROM telemetry_events WHERE event_id = $1',
      ['evt_race_123']
    );
    expect(events).toHaveLength(1);
  });
});
```

---

#### 2. Concurrent Window Updates (Late Events)

**Scenario**: Multiple late events for same window arrive simultaneously

**Expected Behavior**: All events aggregated exactly once

**Test**:
```typescript
describe('Concurrency: Window Updates', () => {
  it('handles concurrent late arrivals correctly', async () => {
    const windowStart = new Date('2024-01-15T14:00:00Z');
    const customer_id = 'cust_123';
    
    // Create 10 late events for same window
    const lateEvents = Array.from({ length: 10 }, (_, i) => 
      createTestEvent({
        event_id: `evt_late_${i}`,
        customer_id,
        event_time: new Date('2024-01-15T14:30:00Z')
      })
    );
    
    // Ingest all simultaneously
    await Promise.all(lateEvents.map(e => ingestEvent(e)));
    
    // Wait for aggregation
    await waitForAggregationComplete(customer_id, windowStart);
    
    // Verify all 10 events counted exactly once
    const agg = await getAggregation(customer_id, windowStart);
    expect(agg.value).toBe(10);
    expect(agg.event_ids).toHaveLength(10);
  });
});
```

---

#### 3. Concurrent Invoice Generation

**Scenario**: Two processes try to generate same invoice

**Expected Behavior**: Only one succeeds, uses database locking

**Test**:
```typescript
describe('Concurrency: Invoice Generation', () => {
  it('prevents duplicate invoice generation', async () => {
    const customer_id = 'cust_123';
    const period = {
      start: '2024-01-01T00:00:00Z',
      end: '2024-01-31T23:59:59.999Z'
    };
    
    // Try to generate invoice concurrently
    const results = await Promise.allSettled([
      generateInvoice(customer_id, period),
      generateInvoice(customer_id, period)
    ]);
    
    // One succeeds, one fails with conflict
    const succeeded = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');
    
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason.code).toBe('INVOICE_ALREADY_EXISTS');
    
    // Verify only one invoice exists
    const invoices = await db.query(
      'SELECT * FROM invoices WHERE customer_id = $1 AND billing_period_start = $2',
      [customer_id, period.start]
    );
    expect(invoices).toHaveLength(1);
  });
});
```

---

#### 4. Concurrent Re-rating

**Scenario**: Two re-rating jobs for overlapping scope

**Expected Behavior**: Second job waits or fails with conflict

**Test**:
```typescript
describe('Concurrency: Re-rating', () => {
  it('prevents concurrent re-rating of same scope', async () => {
    const scope = {
      customer_ids: ['cust_123'],
      window_start: '2024-01-01T00:00:00Z',
      window_end: '2024-01-31T23:59:59.999Z'
    };
    
    // Start first re-rating job
    const job1 = await startReratingJob(scope);
    
    // Try to start second job with same scope
    await expect(
      startReratingJob(scope)
    ).rejects.toThrow('RERATING_IN_PROGRESS');
    
    // After job1 completes, job2 can start
    await waitForJobComplete(job1.job_id);
    
    const job2 = await startReratingJob(scope);
    expect(job2.status).toBe('pending');
  });
});
```

---

#### 5. Concurrent Price Book Creation

**Scenario**: Two price books with overlapping effective dates

**Expected Behavior**: Database constraint prevents overlap

**Test**:
```typescript
describe('Concurrency: Price Books', () => {
  it('prevents overlapping effective dates', async () => {
    const priceBook1 = {
      metric_type: 'api_calls',
      effective_from: '2024-01-15T00:00:00Z',
      unit_price: 0.08
    };
    
    const priceBook2 = {
      metric_type: 'api_calls',
      effective_from: '2024-01-15T00:00:00Z', // Same date!
      unit_price: 0.09
    };
    
    // Try to create both simultaneously
    const results = await Promise.allSettled([
      createPriceBook(priceBook1),
      createPriceBook(priceBook2)
    ]);
    
    // One succeeds, one fails with unique constraint violation
    const succeeded = results.filter(r => r.status === 'fulfilled');
    expect(succeeded).toHaveLength(1);
  });
});
```

---

## Performance Monitoring

### Key Metrics to Track

```typescript
// Prometheus metrics example
import { Counter, Histogram, Gauge } from 'prom-client';

// Request metrics
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status']
});

// Business metrics
const eventsIngested = new Counter({
  name: 'events_ingested_total',
  help: 'Total events ingested',
  labelNames: ['customer_id', 'event_type']
});

const aggregationLag = new Gauge({
  name: 'aggregation_lag_seconds',
  help: 'Time between event time and aggregation',
  labelNames: ['customer_id']
});

const windowCloseTime = new Histogram({
  name: 'window_close_duration_seconds',
  help: 'Time to finalize window after watermark',
  buckets: [1, 2, 5, 10, 30]
});
```

---

## Performance Optimization Checklist

### Before Optimization

- ✅ Profile code to find bottlenecks
- ✅ Measure current performance
- ✅ Define target improvements
- ✅ Have rollback plan

### Database Optimizations

- ✅ Add indexes on query columns
- ✅ Use partitioning for time-series data
- ✅ Implement connection pooling
- ✅ Use prepared statements
- ✅ Add materialized views for complex queries
- ✅ Archive old data

### Application Optimizations

- ✅ Cache price books in memory
- ✅ Batch database operations
- ✅ Use async/await properly (avoid sequential when parallel possible)
- ✅ Implement pagination for large result sets
- ✅ Use streaming for large data transfers
- ✅ Optimize JSON serialization

### Infrastructure Optimizations

- ✅ Horizontal scaling (add instances)
- ✅ Load balancing
- ✅ CDN for static assets
- ✅ Database read replicas
- ✅ Kafka partition scaling
- ✅ Redis for caching

---

## Performance Testing Tools

### Recommended Tools

1. **k6** - Load testing (JavaScript-based)
2. **JMeter** - Load testing (Java-based)
3. **Artillery** - Modern load testing
4. **Locust** - Python-based load testing
5. **Gatling** - Scala-based load testing

### Profiling Tools

1. **Node.js** - `node --prof`, clinic.js
2. **Database** - EXPLAIN ANALYZE
3. **Memory** - heap snapshots, memory profiler
4. **CPU** - flame graphs

---

## Continuous Performance Testing

### CI/CD Integration

```yaml
# .github/workflows/performance.yml
name: Performance Tests

on:
  pull_request:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

jobs:
  performance:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Start services
        run: docker-compose up -d
      
      - name: Run load test
        run: npm run test:performance
      
      - name: Check thresholds
        run: |
          if [ "$P99_LATENCY" -gt "200" ]; then
            echo "P99 latency exceeded threshold"
            exit 1
          fi
      
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: performance-results
          path: performance-results/
```

---

## Production Recommendations

When moving to production, adjust targets based on:

1. **Measure actual usage** - Don't guess, measure
2. **Set SLAs with business** - What's acceptable?
3. **Budget for infrastructure** - Performance costs money
4. **Monitor continuously** - Catch regressions early
5. **Load test before major releases** - Prevent surprises

---

**Remember**: This is a study project. Real production systems need comprehensive performance engineering based on actual requirements and constraints.

