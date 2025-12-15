# Data Model

Database schema for the usage-based metering and invoicing pipeline.

## Precision & Data Types

**Critical**: Financial calculations require exact precision.

- **Database**: Use `DECIMAL(p, s)` types, never `FLOAT` or `DOUBLE`
- **Application**: Use **branded Money/Quantity types** (built on `decimal.js`), never native JavaScript `number`
- **API**: Accept/return strings for monetary values to avoid JSON precision loss

```typescript
// ✅ Correct approach (recommended)
import { Money, Quantity } from '@/common/types';
const price = Money.from('10.99');
const charge = Money.multiply(price, 1234); // Returns '13522.66' as Money

// ✅ Also correct (lower-level)
import { Decimal } from 'decimal.js';
const charge = new Decimal('10.99').times('1234').toDecimalPlaces(2);

// ❌ Wrong approach
const charge = 10.99 * 1234;  // Floating point errors!
```

**Type Safety**: The `Money` and `Quantity` branded types prevent accidental use of arithmetic operators:

```typescript
const subtotal: Money = '100.00' as Money;
const tax: Money = '10.00' as Money;

// ❌ TypeScript compile error
const total = subtotal + tax; // Operator '+' cannot be applied

// ✅ Type-safe
const total = Money.add(subtotal, tax); // '110.00' as Money
```

See:
- [Money Type Safety Guide](../development/MONEY_TYPE_SAFETY.md) - Usage and migration
- [Rating Engine - Precision](../architecture/RATING_ENGINE.md#rounding--precision) - Implementation details

---

## Schema Overview

```
┌─────────────────┐
│ telemetry_events│ (Raw events from sources)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│aggregated_usage │ (Event-time windowed aggregations)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  price_books    │ (Effective-dated pricing rules)
│  price_rules    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ rated_charges   │ (Applied pricing to usage)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    invoices     │ (Customer-facing documents)
│  invoice_lines  │
└─────────────────┘

┌─────────────────┐
│ rerating_jobs   │ (Correction workflows)
└─────────────────┘
```

---

## 1. Telemetry Events

Raw events ingested from source systems.

```sql
CREATE TABLE telemetry_events (
  event_id UUID PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  customer_id UUID NOT NULL,
  
  -- Time semantics
  event_time TIMESTAMPTZ NOT NULL,      -- When it happened
  ingestion_time TIMESTAMPTZ NOT NULL,  -- When we received it
  
  -- Event data
  metadata JSONB NOT NULL DEFAULT '{}',
  source VARCHAR(255),
  
  -- Idempotency & tracking
  processed_at TIMESTAMPTZ,
  processing_version VARCHAR(50),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Partition by event_time month for performance
  CONSTRAINT chk_event_time CHECK (event_time <= NOW() + INTERVAL '1 day')
) PARTITION BY RANGE (event_time);

-- Indexes
CREATE INDEX idx_telemetry_customer_time 
  ON telemetry_events(customer_id, event_time);

CREATE INDEX idx_telemetry_type_time 
  ON telemetry_events(event_type, event_time);

CREATE INDEX idx_telemetry_ingestion 
  ON telemetry_events(ingestion_time) 
  WHERE processed_at IS NULL;  -- Find unprocessed events

-- Unique constraint for idempotency
CREATE UNIQUE INDEX idx_telemetry_event_id 
  ON telemetry_events(event_id);
```

### Partitioning Strategy

```sql
-- Create monthly partitions
CREATE TABLE telemetry_events_2024_01 
  PARTITION OF telemetry_events
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE telemetry_events_2024_02 
  PARTITION OF telemetry_events
  FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Auto-create partitions (PostgreSQL 12+)
-- Or use pg_partman extension
```

---

## 2. Aggregated Usage

Event-time windowed aggregations of telemetry.

```sql
CREATE TABLE aggregated_usage (
  aggregation_id UUID PRIMARY KEY,
  customer_id UUID NOT NULL,
  metric_type VARCHAR(100) NOT NULL,
  
  -- Event-time window
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  
  -- Aggregated values
  value DECIMAL(20, 6) NOT NULL,
  unit VARCHAR(50) NOT NULL,  -- 'count', 'gb_hours', 'requests', etc.
  
  -- Traceability
  event_count INT NOT NULL,
  event_ids UUID[] NOT NULL,
  
  -- Watermark tracking
  is_final BOOLEAN NOT NULL DEFAULT false,
  version INT NOT NULL DEFAULT 1,  -- Increments on late arrivals
  computed_at TIMESTAMPTZ NOT NULL,
  
  -- Re-rating tracking
  rerating_job_id UUID REFERENCES rerating_jobs(job_id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT chk_window_order CHECK (window_start < window_end),
  CONSTRAINT chk_positive_value CHECK (value >= 0)
);

-- Indexes
CREATE INDEX idx_aggregated_customer_window 
  ON aggregated_usage(customer_id, window_start);

CREATE INDEX idx_aggregated_metric_window 
  ON aggregated_usage(metric_type, window_start);

CREATE INDEX idx_aggregated_finalized 
  ON aggregated_usage(customer_id, is_final, window_start)
  WHERE is_final = true;

-- Unique constraint: One aggregation per customer/metric/window (unless re-rating)
CREATE UNIQUE INDEX idx_aggregated_unique_window 
  ON aggregated_usage(customer_id, metric_type, window_start, window_end)
  WHERE rerating_job_id IS NULL;
```

---

## 3. Price Books

Effective-dated pricing rules.

```sql
CREATE TABLE price_books (
  price_book_id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Versioning
  parent_id UUID REFERENCES price_books(price_book_id),
  version VARCHAR(50) NOT NULL,
  
  -- Effective dating
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,  -- NULL = currently active
  
  -- Metadata
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT chk_effective_dates 
    CHECK (effective_until IS NULL OR effective_from < effective_until)
);

-- Indexes
CREATE INDEX idx_price_books_effective 
  ON price_books(effective_from, effective_until);

CREATE INDEX idx_price_books_current 
  ON price_books(effective_from)
  WHERE effective_until IS NULL;

-- Prevent overlapping effective dates for same metric
CREATE UNIQUE INDEX idx_price_books_no_overlap 
  ON price_books(parent_id, effective_from)
  WHERE parent_id IS NOT NULL;
```

---

### Price Rules

Pricing logic per metric type.

```sql
CREATE TABLE price_rules (
  rule_id UUID PRIMARY KEY,
  price_book_id UUID NOT NULL REFERENCES price_books(price_book_id),
  
  metric_type VARCHAR(100) NOT NULL,
  pricing_model VARCHAR(20) NOT NULL,  -- 'flat', 'tiered', 'volume'
  
  -- Tiered pricing structure
  tiers JSONB NOT NULL,
  /* Example tiers structure:
  [
    {
      "tier": 1,
      "up_to": 1000,
      "unit_price": 0.02,
      "flat_fee": 0
    },
    {
      "tier": 2,
      "up_to": 10000,
      "unit_price": 0.015
    },
    {
      "tier": 3,
      "up_to": null,
      "unit_price": 0.01
    }
  ]
  */
  
  unit VARCHAR(50) NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT chk_pricing_model 
    CHECK (pricing_model IN ('flat', 'tiered', 'volume', 'committed'))
);

-- Indexes
CREATE INDEX idx_price_rules_book 
  ON price_rules(price_book_id);

CREATE INDEX idx_price_rules_metric 
  ON price_rules(metric_type);

-- One rule per metric per price book
CREATE UNIQUE INDEX idx_price_rules_unique 
  ON price_rules(price_book_id, metric_type);
```

---

## 4. Rated Charges

Calculated charges after applying pricing to usage.

```sql
CREATE TABLE rated_charges (
  charge_id UUID PRIMARY KEY,
  customer_id UUID NOT NULL,
  aggregation_id UUID NOT NULL REFERENCES aggregated_usage(aggregation_id),
  
  -- Pricing context
  price_book_id UUID NOT NULL REFERENCES price_books(price_book_id),
  price_version VARCHAR(50) NOT NULL,
  rule_id UUID NOT NULL REFERENCES price_rules(rule_id),
  
  -- Calculation
  quantity DECIMAL(20, 6) NOT NULL,
  unit_price DECIMAL(12, 6) NOT NULL,
  subtotal DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  
  -- Explainability
  calculation_metadata JSONB NOT NULL,
  /* Example:
  {
    "formula": "tiered",
    "tiers_applied": [
      {"tier": 1, "units": 1000, "unit_price": 0.02, "charge": 20.00},
      {"tier": 2, "units": 234, "unit_price": 0.015, "charge": 3.51}
    ],
    "source_events": ["evt_1", "evt_2", ...],
    "effective_date": "2024-01-15T00:00:00Z"
  }
  */
  
  -- Timing
  calculated_at TIMESTAMPTZ NOT NULL,
  
  -- Re-rating
  rerating_job_id UUID REFERENCES rerating_jobs(job_id),
  supersedes_charge_id UUID REFERENCES rated_charges(charge_id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT chk_positive_subtotal CHECK (subtotal >= 0)
);

-- Indexes
CREATE INDEX idx_rated_customer_time 
  ON rated_charges(customer_id, calculated_at);

CREATE INDEX idx_rated_aggregation 
  ON rated_charges(aggregation_id);

CREATE INDEX idx_rated_rerating 
  ON rated_charges(rerating_job_id)
  WHERE rerating_job_id IS NOT NULL;
```

---

## 5. Invoices

Customer-facing billing documents.

```sql
CREATE TABLE invoices (
  invoice_id UUID PRIMARY KEY,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,  -- Human-readable: INV-2024-01-12345
  invoice_type VARCHAR(20) NOT NULL DEFAULT 'standard',  -- 'standard', 'correction', 'credit_memo'
  
  customer_id UUID NOT NULL,
  
  -- Billing period
  billing_period_start TIMESTAMPTZ NOT NULL,
  billing_period_end TIMESTAMPTZ NOT NULL,
  
  -- Amounts
  subtotal DECIMAL(12, 2) NOT NULL,
  tax DECIMAL(12, 2) NOT NULL DEFAULT 0,
  credits_applied DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- 'draft', 'issued', 'paid', 'void', 'overdue'
  
  -- Dates
  issued_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  
  -- Correction tracking
  reference_invoice_id UUID REFERENCES invoices(invoice_id),
  correction_reason TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT chk_billing_period CHECK (billing_period_start < billing_period_end),
  CONSTRAINT chk_invoice_type CHECK (invoice_type IN ('standard', 'correction', 'credit_memo')),
  CONSTRAINT chk_status CHECK (status IN ('draft', 'issued', 'paid', 'void', 'overdue'))
);

-- Indexes
CREATE INDEX idx_invoices_customer 
  ON invoices(customer_id, billing_period_start);

CREATE INDEX idx_invoices_status 
  ON invoices(status, due_at)
  WHERE status IN ('issued', 'overdue');

CREATE INDEX idx_invoices_corrections 
  ON invoices(reference_invoice_id)
  WHERE invoice_type = 'correction';
```

---

### Invoice Line Items

Detailed line items per invoice.

```sql
CREATE TABLE invoice_line_items (
  line_item_id UUID PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
  
  -- Display
  line_number INT NOT NULL,
  description TEXT NOT NULL,
  metric_type VARCHAR(100),
  
  -- Quantities
  quantity DECIMAL(20, 6),
  unit VARCHAR(50),
  unit_price DECIMAL(12, 6),
  amount DECIMAL(12, 2) NOT NULL,
  
  -- Traceability
  charge_ids UUID[] NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT chk_line_number CHECK (line_number > 0)
);

-- Indexes
CREATE INDEX idx_line_items_invoice 
  ON invoice_line_items(invoice_id, line_number);

CREATE INDEX idx_line_items_charges 
  ON invoice_line_items USING GIN(charge_ids);
```

---

## 6. Re-rating Jobs

Correction workflow tracking.

```sql
CREATE TABLE rerating_jobs (
  job_id UUID PRIMARY KEY,
  
  triggered_by VARCHAR(50) NOT NULL,  -- 'late_events', 'bug_fix', 'dispute', 'backfill'
  reason TEXT NOT NULL,
  triggered_by_user VARCHAR(255),
  
  -- Scope
  customer_ids UUID[],  -- NULL = all customers
  metric_types VARCHAR(100)[] NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  
  -- Price book to use
  price_book_id UUID REFERENCES price_books(price_book_id),
  price_version VARCHAR(50),
  
  -- Execution
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Results
  aggregations_created INT DEFAULT 0,
  charges_created INT DEFAULT 0,
  correction_invoices_issued INT DEFAULT 0,
  total_adjustment_amount DECIMAL(12, 2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT chk_rerating_window CHECK (window_start < window_end),
  CONSTRAINT chk_rerating_status CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

-- Indexes
CREATE INDEX idx_rerating_status 
  ON rerating_jobs(status, created_at);

CREATE INDEX idx_rerating_window 
  ON rerating_jobs(window_start, window_end);
```

---

## 7. Customers

Basic customer information (simplified for study project).

```sql
CREATE TABLE customers (
  customer_id UUID PRIMARY KEY,
  external_id VARCHAR(255) UNIQUE,  -- Customer's identifier in their system
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  
  -- Billing
  billing_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',  -- 'monthly', 'quarterly', 'annual'
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active', 'suspended', 'cancelled'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT chk_customer_status CHECK (status IN ('active', 'suspended', 'cancelled'))
);

-- Indexes
CREATE INDEX idx_customers_external 
  ON customers(external_id);

CREATE INDEX idx_customers_status 
  ON customers(status)
  WHERE status = 'active';
```

---

## 8. Audit Log

Immutable audit trail for compliance.

```sql
CREATE TABLE audit_log (
  log_id UUID PRIMARY KEY,
  
  event_type VARCHAR(100) NOT NULL,  -- 'invoice_issued', 'charge_calculated', 'rerating_completed'
  entity_type VARCHAR(50) NOT NULL,  -- 'invoice', 'charge', 'rerating_job'
  entity_id UUID NOT NULL,
  
  actor VARCHAR(255),  -- Who triggered (user or system)
  action VARCHAR(50) NOT NULL,  -- 'created', 'updated', 'deleted'
  
  -- Before/after state
  old_values JSONB,
  new_values JSONB,
  
  -- Context
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Never allow updates or deletes
  CONSTRAINT no_updates CHECK (created_at = NOW())
) PARTITION BY RANGE (created_at);

-- Indexes
CREATE INDEX idx_audit_entity 
  ON audit_log(entity_type, entity_id, created_at);

CREATE INDEX idx_audit_actor 
  ON audit_log(actor, created_at);

CREATE INDEX idx_audit_event_type 
  ON audit_log(event_type, created_at);
```

---

## Data Retention

### Policy

- **Telemetry events**: 30 days (replay window)
- **Aggregated usage**: 2 years (re-rating + compliance)
- **Rated charges**: 7 years (tax compliance)
- **Invoices**: 7 years (legal requirement)
- **Audit log**: 10 years (regulatory compliance)

### Implementation

```sql
-- Archive old telemetry to cold storage
CREATE TABLE telemetry_events_archive (
  LIKE telemetry_events INCLUDING ALL
);

-- Scheduled job (monthly)
INSERT INTO telemetry_events_archive
SELECT * FROM telemetry_events
WHERE event_time < NOW() - INTERVAL '30 days';

DELETE FROM telemetry_events
WHERE event_time < NOW() - INTERVAL '30 days';
```

---

## Materialized Views

### Customer Usage Summary

```sql
CREATE MATERIALIZED VIEW customer_monthly_usage AS
SELECT
  customer_id,
  metric_type,
  DATE_TRUNC('month', window_start) AS month,
  SUM(value) AS total_usage,
  COUNT(*) AS aggregation_count,
  MAX(window_end) AS last_window_end
FROM aggregated_usage
WHERE is_final = true
GROUP BY customer_id, metric_type, DATE_TRUNC('month', window_start);

CREATE UNIQUE INDEX idx_customer_monthly_usage 
  ON customer_monthly_usage(customer_id, metric_type, month);

-- Refresh daily
REFRESH MATERIALIZED VIEW CONCURRENTLY customer_monthly_usage;
```

---

## Query Patterns

### Find Price Book for Date

```sql
SELECT * FROM price_books pb
JOIN price_rules pr ON pr.price_book_id = pb.price_book_id
WHERE pr.metric_type = 'api_calls'
  AND pb.effective_from <= '2024-01-15T14:00:00Z'
  AND (pb.effective_until IS NULL OR pb.effective_until > '2024-01-15T14:00:00Z')
ORDER BY pb.effective_from DESC
LIMIT 1;
```

### Explainability Trail

```sql
-- From invoice line item to source events
SELECT
  ili.description,
  ili.amount,
  rc.charge_id,
  au.aggregation_id,
  au.event_ids,
  te.event_id,
  te.event_time,
  te.metadata
FROM invoice_line_items ili
JOIN LATERAL UNNEST(ili.charge_ids) AS charge_id ON true
JOIN rated_charges rc ON rc.charge_id = charge_id
JOIN aggregated_usage au ON au.aggregation_id = rc.aggregation_id
JOIN LATERAL UNNEST(au.event_ids) AS event_id ON true
JOIN telemetry_events te ON te.event_id = event_id
WHERE ili.invoice_id = 'inv_123'
ORDER BY te.event_time;
```

### Re-rating Scope

```sql
-- Find all aggregations that need re-rating
SELECT *
FROM aggregated_usage
WHERE customer_id = ANY($1::UUID[])  -- Or IS NULL for all
  AND metric_type = ANY($2::VARCHAR[])
  AND window_start >= $3
  AND window_end <= $4
  AND rerating_job_id IS NULL;  -- Not already re-rated
```

---

## Database Migrations

Use a migration tool (TypeORM, Flyway, or custom).

### Migration Example

```typescript
// migrations/001_create_telemetry_events.ts
export async function up(db: Database): Promise<void> {
  await db.query(`
    CREATE TABLE telemetry_events (
      -- ... schema ...
    ) PARTITION BY RANGE (event_time);
  `);
  
  // Create initial partitions
  for (let month = 0; month < 12; month++) {
    const start = new Date(2024, month, 1);
    const end = new Date(2024, month + 1, 1);
    await db.query(`
      CREATE TABLE telemetry_events_2024_${month.toString().padStart(2, '0')}
      PARTITION OF telemetry_events
      FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}');
    `);
  }
}

export async function down(db: Database): Promise<void> {
  await db.query(`DROP TABLE telemetry_events CASCADE;`);
}
```

---

## Performance Considerations

### Partitioning

- **Telemetry events**: By month (event_time)
- **Aggregated usage**: Consider by quarter if volume high
- **Audit log**: By year

### Indexing Strategy

- Index on common query patterns (customer_id, time ranges)
- Use partial indexes for status fields
- GIN indexes for JSONB and array columns
- Consider BRIN indexes for time-series data

### Connection Pooling

```typescript
const pool = new Pool({
  max: 20,  // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});
```

---

## Next Steps

- [System Architecture](../architecture/SYSTEM_ARCHITECTURE.md)
- [API Documentation](../api/API_REFERENCE.md)
- [Development Setup](../development/GETTING_STARTED.md)

