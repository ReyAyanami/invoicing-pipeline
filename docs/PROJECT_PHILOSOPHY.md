# Project Philosophy

## Why This Project Exists

Usage-based billing is deceptively hard. The challenge isn't "sum up some numbers"—it's maintaining **correctness under correction** when reality is messy:

- Events arrive late
- Prices change mid-cycle
- Customers dispute charges
- Systems need backfills
- Bugs require re-rating historical data

This project explores how to build a billing system that handles these realities while maintaining auditability and explainability.

## Core Principles

### 1. Event-Time is Truth

**Decision**: Use event-time windowing, not processing-time.

**Why**: A request at 11:59 PM belongs in today's usage, even if it arrives tomorrow.

**Trade-off**: Complexity (watermarks, late data) vs correctness (usage matches reality).

**Example**: Customer's API call at `2024-01-31 23:59:00` arrives on Feb 1st. It must count toward January's invoice.

---

### 2. Immutability for Auditability

**Decision**: Never modify past records. Create correction events instead.

**Why**: Complete audit trail for dispute resolution and compliance.

**Trade-off**: Storage cost vs legal protection.

**Example**: Wrong charge? Don't update it—issue credit memo and new charge.

---

### 3. Deterministic Calculations

**Decision**: Same inputs → same outputs, always.

**Why**: Re-rating after bug fixes must produce verifiable results.

**Trade-off**: No random values, no current timestamps in calculations.

**Example**: Re-running January's rating on March 15th produces identical charges (given same events + price book).

---

### 4. Effective-Dated Price Books

**Decision**: Price changes are versioned with `effective_from` dates.

**Why**: Time-travel pricing for re-rating and customer communication.

**Trade-off**: Complexity vs ability to explain "you were charged $0.05/GB because that was the price on Jan 15th."

**Example**:
```
v1: $0.10/GB, effective 2024-01-01
v2: $0.08/GB, effective 2024-01-15
v3: $0.12/GB, effective 2024-02-01
```
January invoice uses v1 (days 1-14) and v2 (days 15-31).

---

### 5. Explainability over Abstraction

**Decision**: Every invoice line item links to source events and calculation logic.

**Why**: "Why was I charged this?" must be answerable by drilling down.

**Trade-off**: Storage + complexity vs customer trust.

**Example**:
```
Line Item: "API Calls - Standard Tier" → $47.50
  ↓
2,850 events in window [2024-01-01 to 2024-01-31]
  ↓
Applied: Price Book v2 ($0.02 per call, effective 2024-01-15)
  ↓
Calculation: 1,400 calls @ $0.02 = $28.00 (Jan 1-14)
             1,450 calls @ $0.02 = $29.00 (Jan 15-31)
  ↓
Source events: event_ids [abc-123, def-456, ...]
```

---

### 6. Re-rating is First-Class

**Decision**: Design for corrections from day one.

**Why**: Bugs happen. Price disputes happen. Re-rating shouldn't be an afterthought.

**Trade-off**: Upfront complexity vs panic-mode hacks later.

**Example**: Bug undercharged customers in January. Re-rate January with:
- Same event window
- Fixed calculation logic
- Issue "correction invoice" (not update)
- Maintain audit trail

---

### 7. Separation of Concerns

**Decision**: Metering → Rating → Invoicing are distinct phases.

**Why**: Each has different failure modes and timing requirements.

**Trade-off**: More moving parts vs independent scaling and debugging.

**Pipeline**:
```
Telemetry → Metering     → Rating        → Invoicing
(events)    (aggregation)  (apply prices)  (generate docs)

Real-time   Event-time     Batch/schedule  Monthly/on-demand
High volume Watermarked    Deterministic   Customer-facing
No pricing  No customers   No formatting   Final output
```

---

## What We're NOT Building

### 1. Real-Time Billing
This is batch-oriented. Real-time preview is a separate (hard) problem.

### 2. Payment Processing
We produce invoices, not process payments. Integration with Stripe/etc is out of scope.

### 3. Multi-Tenancy
Single-tenant for simplicity. Tenant isolation is its own complexity.

### 4. ML/Forecasting
No predictions. Pure deterministic computation.

### 5. Currency Conversion
Single currency (USD). FX rates add significant complexity.

---

## Inspiration & Patterns

### Similar Systems
- **AWS Cost & Usage Report** - Event-time aggregation, immutable records
- **Stripe Billing** - Effective-dated prices, line item explainability
- **Zuora** - Rating engine, re-rating workflows
- **Confluent Cloud Billing** - Stream processing metering

### Architectural Patterns
- **Event Sourcing** - Complete audit trail
- **Stream Processing** - Kafka Streams / Flink semantics
- **Idempotency** - Same event processed twice = same result
- **Pipeline Separation** - Clear stages with defined inputs/outputs
- **Saga Pattern** - Multi-step workflows with compensation

---

## Learning Goals

By building this, you'll understand:

1. **Why event-time windowing is hard** but necessary
2. **How late data breaks naive aggregation** and how watermarks help
3. **Why immutability matters** for auditing and re-rating
4. **How to make calculations deterministic** (harder than it sounds!)
5. **Trade-offs between accuracy and timeliness** in billing systems
6. **Why "just update the row" doesn't work** for financial data

---

## Success Criteria

This project succeeds if:

1. ✅ Re-rating produces deterministic results
2. ✅ Late events are handled correctly
3. ✅ Every charge is explainable to source events
4. ✅ Price changes don't break historical invoices
5. ✅ Audit trail is complete and immutable
6. ✅ Code clearly documents trade-offs

**Not**: "Production-ready billing system"

**Yes**: "Understanding why billing is hard and how to tackle it"

---

## Further Reading

- [Martin Kleppmann - Stream Processing](https://www.confluent.io/blog/making-sense-of-stream-processing/)
- [Designing Data-Intensive Applications](https://dataintensive.net/) - Chapter 11 (Stream Processing)
- [Event Sourcing - Greg Young](https://www.eventstore.com/blog/what-is-event-sourcing)
- [Stripe Billing Architecture](https://stripe.com/docs/billing)

---

**Remember**: This is a learning exercise. Real billing systems have 10x more complexity. Start simple, understand principles, then add sophistication.

