# Architecture Overview - Visual Guide

Quick visual reference for the invoicing pipeline architecture.

## 🎯 One-Sentence Summary

**Ingest telemetry events → aggregate by event-time windows → apply effective-dated pricing → produce auditable invoices with complete explainability.**

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     TELEMETRY SOURCES                            │
│    (APIs, Services, Infrastructure, Applications, etc.)          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ POST /events
                             │ { event_id, event_time, customer_id, ... }
                             ▼
                  ┌──────────────────────┐
                  │  EVENT INGESTION API  │
                  │  (REST + Validation)  │
                  └──────────┬────────────┘
                             │
                             │ Publish to Kafka
                             ▼
                  ┌──────────────────────┐
                  │  telemetry-events    │◄─── Raw Event Stream
                  │  (Kafka Topic)        │     (Ordered, Durable)
                  └──────────┬────────────┘
                             │
                             │ Consume & Process
                             ▼
          ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
          ┃      METERING ENGINE              ┃
          ┃                                   ┃
          ┃  1. Deduplication (event_id)     ┃
          ┃  2. Event-time Extraction        ┃
          ┃  3. Window Assignment            ┃
          ┃  4. Aggregation (count/sum)     ┃
          ┃  5. Watermark Tracking           ┃
          ┃  6. Late Arrival Handling        ┃
          ┗━━━━━━━━━━━━┬━━━━━━━━━━━━━━━━━━━━┛
                       │
                       │ Emit when window closes
                       ▼
          ┌──────────────────────┐
          │  aggregated-usage    │◄─── Windowed Aggregations
          │  (Event Store)        │     (Event-time windows)
          └──────────┬────────────┘
                     │
                     │ Consume finalized aggregations
                     ▼
       ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
       ┃       RATING ENGINE               ┃
       ┃                                   ┃
       ┃  1. Fetch Price Book              ┃◄── Price Books DB
       ┃     (effective-dated)              ┃    (Versioned)
       ┃  2. Apply Pricing Model           ┃
       ┃     (flat/tiered/volume)          ┃
       ┃  3. Calculate Charge              ┃
       ┃  4. Store Explainability          ┃
       ┗━━━━━━━━━━━━┬━━━━━━━━━━━━━━━━━━━━┛
                    │
                    │ Emit rated charges
                    ▼
       ┌──────────────────────┐
       │   rated-charges      │◄─── Priced Usage
       │   (Event Store)       │     (With explainability)
       └──────────┬────────────┘
                  │
                  │ Monthly batch job
                  ▼
    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    ┃    INVOICE GENERATOR             ┃
    ┃                                  ┃
    ┃  1. Query all charges for        ┃
    ┃     customer + period            ┃
    ┃  2. Group by metric type         ┃
    ┃  3. Apply credits/adjustments    ┃
    ┃  4. Format line items            ┃
    ┃  5. Generate PDF/JSON            ┃
    ┃  6. Mark as issued               ┃
    ┗━━━━━━━━━━━━┬━━━━━━━━━━━━━━━━━━━┛
                 │
                 ▼
    ┌──────────────────────┐
    │      invoices        │◄─── Customer-Facing
    │  (PostgreSQL)         │     Documents
    └───────────────────────┘

         ┌─────────────────────────────┐
         │  RE-RATING WORKFLOW         │
         │  (Correction Process)       │
         │                             │
         │  Trigger → Scope → Re-agg   │
         │  → Re-rate → Correction     │
         │  Invoice → Reconcile        │
         └─────────────────────────────┘
```

---

## ⏰ Time Semantics - The Critical Concept

```
                    The Two Times
                    =============

Event-Time:         When it HAPPENED
Processing-Time:    When we LEARNED about it


Example: Month-End Boundary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  January 31           │           February 1
  23:59:50            │           00:00:15
      │                │               │
      │ API call made  │  Log arrives  │
      │ (event-time)   │  (processing-time)
      │                │               │
      ▼                │               ▼
  ┌────────────────────┼───────────────────┐
  │   January Invoice  │  February Invoice │
  │        ✓           │                   │
  └────────────────────┴───────────────────┘

Decision: Bill to January (event-time)
Why: Customer's usage happened in January


Challenge: Late Arrivals
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Events arrive out-of-order:

  Event A: 14:00:00 → arrives 14:00:01 ✓ on time
  Event B: 14:00:05 → arrives 14:00:06 ✓ on time
  Event C: 14:00:02 → arrives 14:00:30 ⚠️  late!

Solution: Watermarks + Allowed Lateness

  Watermark = "We've seen all events up to time T"
  Allowed Lateness = "Accept events up to N hours late"

  Window [14:00 - 15:00):
    - Open: Accepting events
    - Closing: Watermark reached, wait for stragglers
    - Closed: After allowed lateness, finalize
    - Very Late: Trigger re-rating workflow
```

---

## 💰 Rating Engine - Price Application

```
Input:  1,234 API calls on 2024-01-15
Output: $X.XX charge with explainability


Step 1: Fetch Effective Price
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Price Book Timeline:

2024-01-01  v1: $0.10/call  ─────────┐
                                      │
2024-01-15  v2: $0.08/call  ─────────┼────►
                                      │
2024-02-01  v3: $0.12/call           │
                                      │
Event date: 2024-01-15 ──────────────┘
            Use v2 ($0.08)


Step 2: Apply Pricing Model
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FLAT RATE:
  1,234 calls × $0.08 = $98.72

TIERED:
  Tier 1: First 1,000 @ $0.10 = $100.00
  Tier 2: Next  234 @ $0.08  = $ 18.72
  Total                      = $118.72

VOLUME:
  Total: 1,234 calls falls in tier 2
  All units @ $0.08 = $98.72


Step 3: Store Explainability
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  charge_id: "chrg_789",
  amount: "$98.72",
  calculation: {
    formula: "quantity × unit_price",
    quantity: 1234,
    unit_price: 0.08,
    price_book: "v2",
    effective_date: "2024-01-15",
    source_events: [evt_1, evt_2, ...]
  }
}
```

---

## 🔄 Re-rating Workflow - Corrections

```
Problem: Need to fix past invoices
Reason: Late events, bugs, disputes


The Process
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. TRIGGER
   └─► Late event, bug discovery, or manual request

2. DEFINE SCOPE
   └─► Which customers, metrics, time window?

3. RE-AGGREGATE
   └─► Pull raw events from event store
   └─► Re-compute aggregations
   └─► Use same windowing logic

4. RE-RATE
   └─► Fetch price books (effective-dated)
   └─► Apply pricing (fixed or updated logic)
   └─► Calculate new charges

5. COMPARE
   └─► Original charges: $500
   └─► Re-rated charges: $520
   └─► Difference: +$20

6. CORRECTION INVOICE
   └─► Issue document showing adjustment
   └─► Link to original invoice
   └─► Provide explainability

7. RECONCILE
   └─► Verify ledger balance
   └─► Update accounting system


Immutability Principle
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ WRONG: Update original charge
   UPDATE charges SET amount = 520 WHERE id = 'chrg_123';

✓ RIGHT: Create correction event
   INSERT INTO charges (..., supersedes_charge_id = 'chrg_123');
   INSERT INTO invoices (type = 'correction', ...);

Why: Complete audit trail, legal protection
```

---

## 📊 Reconciliation - Verification

```
Question: How do we know everything is correct?
Answer: Reconcile at every stage


The Reconciliation Chain
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Raw Events
    │
    │ COUNT: 10,234 events
    ▼
Aggregations
    │ SUM(event_count): 10,234 ✓ MATCH
    │
    │ SUM(value): 10,234 calls
    ▼
Rated Charges
    │ SUM(quantity): 10,234 ✓ MATCH
    │
    │ SUM(subtotal): $204.68
    ▼
Invoices
    │ SUM(line_items): $204.68 ✓ MATCH
    │
    ▼
Financial Ledger
    Revenue: $204.68 ✓ MATCH


Daily Checks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ All events processed?
✓ All aggregations finalized?
✓ All charges rated?
✓ All charges invoiced?
✓ No duplicates?
✓ Totals match across stages?

If discrepancy:
  - < $0.01: Acceptable rounding
  - Missing data: Re-process
  - Duplicates: Void extras
  - Large gap: Investigate & remediate
```

---

## 🗄️ Data Model - Core Tables

```sql
┌─────────────────────────────────────────────────────┐
│ telemetry_events                                    │
├─────────────────────────────────────────────────────┤
│ event_id          UUID PK                           │
│ event_time        TIMESTAMPTZ (event-time!)         │
│ ingestion_time    TIMESTAMPTZ (processing-time)     │
│ customer_id       UUID                              │
│ event_type        VARCHAR                           │
│ metadata          JSONB                             │
└─────────────────────────────────────────────────────┘
                        │
                        │ Metering
                        ▼
┌─────────────────────────────────────────────────────┐
│ aggregated_usage                                    │
├─────────────────────────────────────────────────────┤
│ aggregation_id    UUID PK                           │
│ customer_id       UUID                              │
│ window_start      TIMESTAMPTZ                       │
│ window_end        TIMESTAMPTZ                       │
│ value             DECIMAL                           │
│ is_final          BOOLEAN                           │
│ event_ids         UUID[]  ← Traceability            │
└─────────────────────────────────────────────────────┘
                        │
                        │ Rating
                        ▼
┌─────────────────────────────────────────────────────┐
│ price_books                                         │
├─────────────────────────────────────────────────────┤
│ price_book_id     UUID PK                           │
│ version           VARCHAR                           │
│ effective_from    TIMESTAMPTZ                       │
│ effective_until   TIMESTAMPTZ (nullable)            │
│ prices            JSONB                             │
└─────────────────────────────────────────────────────┘
                        │
                        │ Applies to
                        ▼
┌─────────────────────────────────────────────────────┐
│ rated_charges                                       │
├─────────────────────────────────────────────────────┤
│ charge_id         UUID PK                           │
│ aggregation_id    UUID FK                           │
│ price_book_id     UUID FK                           │
│ quantity          DECIMAL                           │
│ subtotal          DECIMAL                           │
│ calculation_metadata JSONB  ← Explainability        │
└─────────────────────────────────────────────────────┘
                        │
                        │ Invoicing
                        ▼
┌─────────────────────────────────────────────────────┐
│ invoices                                            │
├─────────────────────────────────────────────────────┤
│ invoice_id        UUID PK                           │
│ customer_id       UUID                              │
│ subtotal          DECIMAL                           │
│ total             DECIMAL                           │
│ status            VARCHAR                           │
└─────────────────────────────────────────────────────┘
                        │
                        │ Contains
                        ▼
┌─────────────────────────────────────────────────────┐
│ invoice_line_items                                  │
├─────────────────────────────────────────────────────┤
│ line_item_id      UUID PK                           │
│ invoice_id        UUID FK                           │
│ charge_ids        UUID[]  ← Links to charges        │
│ amount            DECIMAL                           │
└─────────────────────────────────────────────────────┘
```

---

## 🎯 Key Design Principles

### 1. Event-Time Semantics
```
✓ Bill based on when usage occurred
✓ Not when we learned about it
✓ Requires watermarks and late-data handling
```

### 2. Immutability
```
✓ Never update past records
✓ Create correction events instead
✓ Complete audit trail
```

### 3. Determinism
```
✓ Same inputs → same outputs
✓ Re-rating produces identical results
✓ No randomness, no Date.now() in calculations
```

### 4. Effective-Dating
```
✓ Prices versioned with dates
✓ Time-travel through price changes
✓ Historical accuracy
```

### 5. Explainability
```
✓ Every charge traces to source events
✓ Show calculation formula
✓ Link price book version used
```

---

## 🚀 Quick Implementation Roadmap

```
Phase 1: Foundation (Weeks 1-2)
  ✓ Setup NestJS + TypeORM + Kafka
  ✓ Create database schema
  ✓ Event ingestion endpoint
  ✓ Basic Kafka producer/consumer

Phase 2: Metering (Weeks 3-4)
  ✓ Event-time extraction
  ✓ Windowing logic (hourly tumbling)
  ✓ Simple aggregation (count)
  ✓ Watermark tracking (basic)

Phase 3: Rating (Weeks 5-6)
  ✓ Price book CRUD
  ✓ Flat rate pricing
  ✓ Rating engine
  ✓ Explainability metadata

Phase 4: Invoicing (Week 7)
  ✓ Invoice generation
  ✓ Line item grouping
  ✓ Status management

Phase 5: Advanced (Weeks 8-10)
  ✓ Late arrival handling
  ✓ Re-rating workflow
  ✓ Tiered pricing
  ✓ Reconciliation reports

Phase 6: Polish (Weeks 11-12)
  ✓ E2E tests
  ✓ Documentation completion
  ✓ Example scenarios
```

---

## 📖 Documentation Map

```
START HERE
  └─► README.md
  └─► docs/PROJECT_PHILOSOPHY.md (Why?)
  └─► docs/GETTING_STARTED.md (How?)

ARCHITECTURE
  └─► docs/architecture/SYSTEM_ARCHITECTURE.md
  └─► docs/architecture/TIME_SEMANTICS.md ⚠️ Critical
  └─► docs/architecture/RATING_ENGINE.md
  └─► docs/architecture/RERATING.md
  └─► docs/architecture/RECONCILIATION.md

DESIGN
  └─► docs/design/DATA_MODEL.md

DECISIONS
  └─► docs/adr/ADR-001-EVENT-TIME-SEMANTICS.md
  └─► docs/adr/ADR-002-IMMUTABLE-PRICE-BOOKS.md

REFERENCE
  └─► docs/INDEX.md (Complete index)
```

---

## 🎓 Learning Outcomes

After building this, you'll understand:

1. ✅ **Why event-time billing is hard but necessary**
2. ✅ **How watermarks enable late-data handling**
3. ✅ **Why immutability matters for auditing**
4. ✅ **How to make calculations deterministic**
5. ✅ **Trade-offs between accuracy and timeliness**
6. ✅ **Why price versioning enables corrections**
7. ✅ **How to build complete audit trails**
8. ✅ **Reconciliation strategies for verification**

---

## ⚠️ What This Is NOT

❌ Production-ready billing system
❌ Stripe/Zuora competitor
❌ Optimized for scale
❌ Feature-complete

✅ Learning exercise
✅ Architectural exploration
✅ Pattern demonstration
✅ Foundation for understanding

---

## 🔗 External References

- **Stripe Billing**: Real-world implementation
- **AWS Cost Explorer**: Cloud usage billing
- **Apache Kafka Streams**: Stream processing patterns
- **Event Sourcing**: Greg Young's work
- **Apache Flink**: Event-time processing concepts

---

**Ready to start?** Head to [Getting Started](docs/GETTING_STARTED.md) →

