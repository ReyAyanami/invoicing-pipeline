# System Architecture

## High-Level Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        TELEMETRY SOURCES                          │
│              (APIs, Services, CDN, Databases, etc.)              │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │  EVENT INGESTION│
                    │   (Kafka Topic) │
                    └────────┬────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ METERING ENGINE │◄─── Watermark Management
                    │                 │
                    │ • Deduplication │
                    │ • Validation    │
                    │ • Event-time    │
                    │   Windowing     │
                    │ • Late Arrival  │
                    │   Handling      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ AGGREGATED      │
                    │ USAGE EVENTS    │
                    │ (Event Store)   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ RATING ENGINE   │◄─── Immutable Price Books
                    │                 │
                    │ • Fetch Prices  │
                    │ • Apply Tiers   │
                    │ • Calculate     │
                    │   Charges       │
                    │ • Explainability│
                    └────────┬────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ RATED CHARGES   │
                    │ (Event Store)   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │INVOICE GENERATOR│
                    │                 │
                    │ • Group by      │
                    │   Customer      │
                    │ • Apply Credits │
                    │ • Format Output │
                    │ • Send          │
                    └────────┬────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │    INVOICES     │
                    │  (Read Model)   │
                    └─────────────────┘

          ┌──────────────────────────────┐
          │    RE-RATING WORKFLOW        │
          │                              │
          │  1. Trigger re-rate          │
          │  2. Rewind watermark         │
          │  3. Re-aggregate events      │
          │  4. Re-apply pricing         │
          │  5. Generate correction      │
          │     invoice                  │
          └──────────────────────────────┘
```

## Components

### 1. Event Ingestion

**Responsibility**: Receive and store raw telemetry events.

**Technology**: Kafka (durable, ordered, replayable)

**Schema**:
```typescript
interface TelemetryEvent {
  event_id: string;          // Idempotency key
  event_type: string;         // 'api_call', 'storage_gb_hour', etc.
  customer_id: string;
  event_time: Date;           // When it happened (event-time)
  ingestion_time: Date;       // When we received it (processing-time)
  metadata: Record<string, any>; // Type-specific data
  source: string;             // Origin system
}
```

**Guarantees**:
- At-least-once delivery
- Ordered per partition key (customer_id)
- Retention: 30 days (configurable)

---

### 2. Metering Engine

**Responsibility**: Deduplicate, validate, window, and aggregate events.

**Key Operations**:

1. **Deduplication**: Same `event_id` processed once
2. **Validation**: Schema validation, boundary checks
3. **Event-Time Windowing**: Group by tumbling windows (hourly, daily)
4. **Late Arrival Handling**: Accept late events within allowed lateness
5. **Watermark Management**: Track processing progress

**Technology**: Stream processor (Kafka Streams / Custom)

**Output**: Aggregated usage records per customer/window

```typescript
interface AggregatedUsage {
  aggregation_id: string;     // UUID
  customer_id: string;
  metric_type: string;         // 'api_calls_count', 'storage_gb_hours'
  window_start: Date;          // Event-time window start
  window_end: Date;            // Event-time window end
  value: number;               // Aggregated quantity
  unit: string;                // 'count', 'gb_hours', etc.
  event_count: number;         // How many raw events
  event_ids: string[];         // Traceability
  computed_at: Date;           // Processing-time
  is_final: boolean;           // After watermark
}
```

**State Management**:
- In-memory state stores (windowed)
- Periodic checkpointing
- Changelog topic for recovery

---

### 3. Rating Engine

**Responsibility**: Apply pricing rules to usage aggregations.

**Key Operations**:

1. **Price Book Lookup**: Find effective price for event-time
2. **Tiered Pricing**: Apply volume discounts
3. **Charge Calculation**: Deterministic math
4. **Explainability Trail**: Link charge → price → usage → events

**Technology**: Batch processor (scheduled or event-driven)

**Input**: Aggregated usage records
**Output**: Rated charges

```typescript
interface RatedCharge {
  charge_id: string;
  customer_id: string;
  aggregation_id: string;      // Link to usage
  price_book_id: string;        // Which price book
  price_version: string;        // Effective-dated version
  unit_price: number;
  quantity: number;
  subtotal: number;
  currency: string;
  calculated_at: Date;
  calculation_metadata: {
    formula: string;
    tiers_applied: TierBreakdown[];
    source_events: string[];
  };
}
```

**Determinism Requirements**:
- No random values
- No `Date.now()` in calculations
- Same inputs → same outputs
- Reproducible across runs

---

### 4. Invoice Generator

**Responsibility**: Group charges into customer-facing invoices.

**Key Operations**:

1. **Grouping**: By customer, billing cycle
2. **Summarization**: Line items, subtotals
3. **Credits/Adjustments**: Apply account balance
4. **Formatting**: PDF, JSON, etc.
5. **Delivery**: Email, API, dashboard

**Technology**: Scheduled batch job (monthly) or on-demand

**Output**: Invoices (read model)

```typescript
interface Invoice {
  invoice_id: string;
  invoice_number: string;       // Human-readable
  customer_id: string;
  billing_period_start: Date;
  billing_period_end: Date;
  line_items: LineItem[];
  subtotal: number;
  credits_applied: number;
  total: number;
  currency: string;
  issued_at: Date;
  due_at: Date;
  status: 'draft' | 'issued' | 'paid' | 'void';
}

interface LineItem {
  description: string;
  metric_type: string;
  quantity: number;
  unit_price: number;
  amount: number;
  charge_ids: string[];         // Traceability
}
```

---

## Data Flow

### Happy Path: API Call Usage

1. **T0: Event Occurs**
   - Customer makes API call at `2024-01-15 14:23:45 UTC`
   - Origin system emits telemetry event

2. **T0+100ms: Ingestion**
   - Event written to Kafka `telemetry-events` topic
   - Partition by `customer_id`

3. **T0+1s: Metering**
   - Consumer reads event
   - Checks deduplication cache (event_id not seen)
   - Validates schema
   - Assigns to window: `[2024-01-15 14:00:00, 2024-01-15 15:00:00)`
   - Updates in-memory aggregate counter
   - Writes to state store

4. **T0+1h: Watermark Reached**
   - Watermark advances past `2024-01-15 15:00:00`
   - Window is "closed"
   - Aggregated usage emitted to `aggregated-usage` topic
   - Marked as `is_final: true`

5. **T0+1h+10s: Rating**
   - Rating engine reads aggregated usage
   - Looks up price book effective on `2024-01-15 14:00:00`
   - Applies pricing: 1,234 calls × $0.02 = $24.68
   - Writes to `rated-charges` topic
   - Stores explainability metadata

6. **End of Month: Invoicing**
   - Invoice generator runs
   - Queries all rated charges for customer in Jan 2024
   - Groups by metric type
   - Generates invoice with line items
   - Marks invoice as `issued`

---

### Unhappy Path: Late Event

1. **T0: Event Occurs** at `2024-01-15 23:59:00`
2. **T1 = T0+2h: Event Arrives** (system was down)
   - Ingestion time is `2024-01-16 01:59:00`
   - Event-time is `2024-01-15 23:59:00`
3. **Metering Engine**:
   - Checks: is window still open?
   - Watermark is at `2024-01-16 00:30:00`
   - Allowed lateness: 3 hours
   - Window `[2024-01-15 23:00:00, 2024-01-16 00:00:00)` is still mutable
   - **Accept**: Update aggregate, emit revised count
4. **Rating Engine**:
   - Detects updated aggregation (`is_final: false`)
   - Re-calculates charge
   - Emits correction event
5. **Invoice**:
   - If invoice not yet issued: update accumulates
   - If invoice already issued: triggers re-rating workflow

---

## Architectural Patterns

### Event Sourcing

**All state changes are events.**

- Never delete or update events
- Append-only log
- Rebuild state by replaying events
- Complete audit trail

**Applied**:
- Telemetry events → Kafka
- Aggregated usage → Event store
- Rated charges → Event store
- State recovery via replay

---

### CQRS (Command Query Responsibility Segregation)

**Separate write and read models.**

**Write Side** (Commands):
- Ingest telemetry
- Compute aggregations
- Calculate charges

**Read Side** (Queries):
- Invoice dashboard
- Customer portal
- Analytics/reporting

**Projection**: Async read model updates from event streams

---

### Idempotency

**Processing same event twice = same result.**

**Mechanisms**:
- `event_id` as idempotency key
- Deduplication cache (Redis/state store)
- Deterministic calculations (no randomness)
- Database constraints (unique indexes)

---

### Watermarks

**Track "how complete is our data?"**

- **Event-time watermark**: Latest event-time we've processed
- **Allowed lateness**: Accept events up to N hours late
- **Window closing**: After watermark + lateness, no more updates

**Trade-off**: Latency vs completeness

---

### Immutable Price Books

**Never modify prices, only add versions.**

```typescript
interface PriceBook {
  price_book_id: string;
  version: string;
  effective_from: Date;
  effective_until: Date | null;  // null = current
  prices: PriceRule[];
  created_at: Date;
}
```

**Benefits**:
- Historical accuracy
- Time-travel queries
- Explainability

---

## Technology Stack

### Core
- **Language**: TypeScript 5+ (strict mode)
- **Runtime**: Node.js 20+
- **Framework**: NestJS 11 (modular, testable)

### Data
- **Event Streaming**: Kafka 3.x (KafkaJS client)
- **Database**: PostgreSQL 14+ (JSONB, partitioning)
- **Caching**: Redis (deduplication, state)

### Observability
- **Logging**: Structured JSON (Pino)
- **Metrics**: Prometheus + Grafana
- **Tracing**: OpenTelemetry (optional)

---

## Scalability Considerations

### Horizontal Scaling

**Metering Engine**:
- Partition by `customer_id`
- Add consumers to consumer group
- State stores partitioned same as Kafka

**Rating Engine**:
- Stateless (price books cached)
- Scale horizontally trivially

**Invoice Generator**:
- Batch job per customer shard
- Parallel execution

---

### Performance Targets

- **Ingestion**: 10K events/sec
- **Metering Latency**: < 1 second (P99)
- **Rating Latency**: < 10 seconds per batch
- **Invoice Generation**: < 5 minutes for 10K customers

**Note**: These are study targets, not production SLAs.

---

## What's Next?

Dive deeper into specific components:

- [Time Semantics](TIME_SEMANTICS.md) - Event-time vs processing-time
- [Rating Engine](RATING_ENGINE.md) - Pricing logic
- [Re-rating & Corrections](RERATING.md) - Handling backfills
- [Data Model](../design/DATA_MODEL.md) - Database schema

---

**Key Insight**: This architecture prioritizes **correctness** and **auditability** over **real-time performance**. If customers want instant usage updates, that's a separate (hard) problem involving read replicas and eventual consistency.

