# Getting Started

Quick guide to understanding and running the invoicing pipeline.

## What You'll Learn

This project demonstrates:

1. **Event-time windowing** - Aggregate events by when they occurred, not when they arrived
2. **Effective-dated pricing** - Time-travel through price changes
3. **Deterministic re-rating** - Correct past invoices reproducibly
4. **Explainability trails** - Trace every charge to source events
5. **Immutable audit logs** - Complete history of all changes

---

## Prerequisites

- **Node.js 20+**
- **Docker & Docker Compose** (for PostgreSQL and Kafka)
- **Basic TypeScript** knowledge
- **Basic SQL** understanding
- **Curiosity** about billing systems

---

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/[your-username]/invoicing-pipeline.git
cd invoicing-pipeline
```

---

### 2. Install Dependencies

```bash
npm install
```

This installs:
- NestJS framework
- TypeORM for database
- KafkaJS for event streaming
- Testing libraries

---

### 3. Start Infrastructure

```bash
npm run env:start
```

This starts:
- **PostgreSQL 14** on port 5432
- **Kafka 3.x** on port 9092
- **Zookeeper** on port 2181

Wait ~30 seconds for services to be ready.

**Verify**:
```bash
npm run env:status
```

---

### 4. Run Database Migrations

```bash
npm run migration:run
```

This creates:
- `telemetry_events` table (partitioned)
- `aggregated_usage` table
- `price_books` and `price_rules`
- `rated_charges` table
- `invoices` and `invoice_line_items`
- Indexes and constraints

---

### 5. Seed Test Data (Optional)

```bash
npm run seed
```

Creates:
- Sample customers
- Initial price books
- Example telemetry events

---

### 6. Start Development Server

```bash
npm run dev
```

Server starts on `http://localhost:3000`

---

## Your First Request

### Send Telemetry Event

```bash
curl -X POST http://localhost:3000/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "evt_001",
    "event_type": "api_call",
    "customer_id": "cust_123",
    "event_time": "2024-01-15T14:23:45.000Z",
    "metadata": {
      "endpoint": "/api/v1/users",
      "method": "GET",
      "response_time_ms": 45
    }
  }'
```

**Response**:
```json
{
  "status": "accepted",
  "event_id": "evt_001"
}
```

---

### Check Aggregations

Wait ~1 minute for windowing to process, then:

```bash
curl http://localhost:3000/api/v1/aggregations?customer_id=cust_123
```

**Response**:
```json
{
  "aggregations": [
    {
      "aggregation_id": "agg_001",
      "customer_id": "cust_123",
      "metric_type": "api_calls",
      "window_start": "2024-01-15T14:00:00.000Z",
      "window_end": "2024-01-15T15:00:00.000Z",
      "value": 1,
      "unit": "count",
      "is_final": false
    }
  ]
}
```

---

### Check Rated Charges

After aggregation is finalized (watermark passes):

```bash
curl http://localhost:3000/api/v1/charges?customer_id=cust_123
```

**Response**:
```json
{
  "charges": [
    {
      "charge_id": "chrg_001",
      "customer_id": "cust_123",
      "quantity": 1,
      "unit_price": 0.02,
      "subtotal": 0.02,
      "currency": "USD",
      "calculation_metadata": {
        "formula": "quantity × unit_price",
        "effective_date": "2024-01-15T14:00:00.000Z"
      }
    }
  ]
}
```

---

### Generate Invoice

```bash
curl -X POST http://localhost:3000/api/v1/invoices/generate \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust_123",
    "billing_period_start": "2024-01-01T00:00:00.000Z",
    "billing_period_end": "2024-01-31T23:59:59.999Z"
  }'
```

**Response**:
```json
{
  "invoice_id": "inv_001",
  "invoice_number": "INV-2024-01-001",
  "customer_id": "cust_123",
  "total": 0.02,
  "line_items": [
    {
      "description": "API Calls",
      "quantity": 1,
      "unit_price": 0.02,
      "amount": 0.02
    }
  ]
}
```

---

## Understanding the Flow

```
1. Telemetry Event Arrives
   └─> Kafka topic: telemetry-events
   
2. Metering Engine Consumes
   └─> Groups by event-time window (hourly)
   └─> Aggregates count/sum/avg
   └─> Waits for watermark
   
3. Aggregation Finalized
   └─> is_final = true
   └─> Kafka topic: aggregated-usage
   
4. Rating Engine Consumes
   └─> Fetches price book for event-time
   └─> Applies pricing model
   └─> Calculates charge
   └─> Stores with explainability
   
5. Invoice Generator Runs (monthly)
   └─> Queries all charges for customer/period
   └─> Groups by metric type
   └─> Formats invoice
   └─> Marks as issued
```

---

## Key Concepts to Explore

### 1. Event-Time vs Processing-Time

Send an event with past `event_time`:

```bash
curl -X POST http://localhost:3000/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "evt_late_001",
    "event_type": "api_call",
    "customer_id": "cust_123",
    "event_time": "2024-01-15T13:45:00.000Z",
    "metadata": {}
  }'
```

Watch it get aggregated into the correct event-time window (13:00-14:00), not current time.

---

### 2. Late Arrivals

Send event after window should close:

```bash
# Send event for 2 hours ago
curl -X POST http://localhost:3000/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "evt_late_002",
    "event_type": "api_call",
    "customer_id": "cust_123",
    "event_time": "'$(date -u -v-2H +%Y-%m-%dT%H:%M:%S.000Z)'",
    "metadata": {}
  }'
```

Check if it's accepted (within allowed lateness) or triggers re-rating.

---

### 3. Price Book Versioning

Create new price book version:

```bash
curl -X POST http://localhost:3000/api/v1/price-books \
  -H "Content-Type: application/json" \
  -d '{
    "name": "API Pricing v2",
    "version": "v2",
    "effective_from": "2024-01-15T00:00:00.000Z",
    "prices": [
      {
        "metric_type": "api_calls",
        "pricing_model": "flat",
        "tiers": [{"unit_price": 0.015}]
      }
    ]
  }'
```

Now events before Jan 15 use old price ($0.02), events after use new price ($0.015).

---

### 4. Explainability

Drill down from invoice to source events:

```bash
# Get invoice
curl http://localhost:3000/api/v1/invoices/inv_001

# Get line item charges
curl http://localhost:3000/api/v1/charges?invoice_id=inv_001

# Get charge details with source events
curl http://localhost:3000/api/v1/charges/chrg_001/explainability
```

Response shows complete trail: charge → aggregation → events.

---

### 5. Re-rating

Trigger re-rating for a time window:

```bash
curl -X POST http://localhost:3000/api/v1/rerating-jobs \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Testing re-rating workflow",
    "customer_ids": ["cust_123"],
    "metric_types": ["api_calls"],
    "window_start": "2024-01-15T00:00:00.000Z",
    "window_end": "2024-01-16T00:00:00.000Z"
  }'
```

Watch job progress:

```bash
curl http://localhost:3000/api/v1/rerating-jobs/job_001
```

---

## Development Workflow

### Run Tests

```bash
# All tests
npm test

# Specific test file
npm test -- rating-engine.spec.ts

# Watch mode
npm run test:watch

# Coverage
npm run test:cov
```

---

### Check Types

```bash
npm run type-check
```

---

### Lint & Format

```bash
# Auto-fix
npm run lint

# Check only
npm run lint:check

# Format
npm run format
```

---

### Database Management

```bash
# Create new migration
npm run migration:generate -- -n CreateCustomersTable

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# View migration status
npm run migration:show
```

---

### View Logs

```bash
# Application logs
npm run dev  # (console output)

# Infrastructure logs
npm run env:logs

# Specific service
npm run env:logs -- postgres
npm run env:logs -- kafka
```

---

### Clean Restart

```bash
# Stop all services
npm run env:stop

# Remove volumes (fresh start)
npm run env:clean

# Start again
npm run env:start
npm run migration:run
npm run dev
```

---

## Next Steps

### Read the Documentation

1. [**Project Philosophy**](PROJECT_PHILOSOPHY.md) - Why these decisions?
2. [**System Architecture**](architecture/SYSTEM_ARCHITECTURE.md) - How it works
3. [**Time Semantics**](architecture/TIME_SEMANTICS.md) - Event-time deep dive
4. [**Rating Engine**](architecture/RATING_ENGINE.md) - Pricing logic
5. [**Re-rating**](architecture/RERATING.md) - Corrections workflow

---

### Experiment with Scenarios

1. **Month-End Boundary**: Send events at 23:59:59 and 00:00:01
2. **Bulk Late Events**: Send 1000 events with past timestamps
3. **Price Changes**: Create multiple price versions and verify correct application
4. **Re-rating**: Introduce bug, fix it, re-rate, verify corrections
5. **Tiered Pricing**: Create tiered price book and verify tier calculations

---

### Extend the System

Ideas for learning:

1. Add new metric types (storage, bandwidth, compute)
2. Implement volume pricing (vs tiered)
3. Add customer-specific price books
4. Build dashboard for usage visualization
5. Add webhook notifications for invoice events

---

## Troubleshooting

### Services Won't Start

```bash
# Check Docker
docker ps

# View logs
npm run env:logs

# Clean restart
npm run env:clean
npm run env:start
```

---

### Database Errors

```bash
# Check connection
psql -h localhost -U billing -d billing_db

# Re-run migrations
npm run migration:revert
npm run migration:run
```

---

### Kafka Issues

```bash
# Check topics
docker exec -it kafka kafka-topics --list --bootstrap-server localhost:9092

# View messages
docker exec -it kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic telemetry-events \
  --from-beginning
```

---

### Tests Failing

```bash
# Clear test database
npm run test:db:reset

# Run single test
npm test -- --testNamePattern="should calculate tiered charge"
```

---

## Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [TypeORM Guide](https://typeorm.io)
- [Kafka Streams Concepts](https://kafka.apache.org/documentation/streams/)
- [Stripe Billing API](https://stripe.com/docs/billing) - Real-world example
- [AWS Cost & Usage Report](https://aws.amazon.com/aws-cost-management/aws-cost-and-usage-reporting/) - Event-time billing

---

## Getting Help

1. Check [documentation](../README.md#documentation)
2. Search [GitHub issues](https://github.com/[your-username]/invoicing-pipeline/issues)
3. Open new issue with reproduction steps

---

**Ready to dive deeper?** Start with [Project Philosophy](PROJECT_PHILOSOPHY.md) to understand the "why" behind every decision.

