# ADR-001: Event-Time Semantics

## Status

**Accepted**

## Context

Billing systems must decide: when aggregating usage events, do we use:
- **Processing-time**: When we received/processed the event
- **Event-time**: When the event actually occurred

Example scenario:
- API call made at `Jan 31, 23:59:50`
- Log arrives at `Feb 1, 00:00:15`
- Which month's invoice should include this charge?

## Decision

**We use event-time semantics for all aggregations and billing.**

Events are windowed and aggregated based on `event_time`, not `ingestion_time` or `processed_at`.

## Rationale

### Why Event-Time?

1. **Customer Expectations**: Usage in January should appear on January's invoice, regardless of delivery delays

2. **Fairness**: Network issues shouldn't change billing periods

3. **Auditability**: Usage aligns with actual customer behavior timeline

4. **Industry Standard**: AWS, GCP, Stripe all use event-time billing

### Why Not Processing-Time?

Processing-time is simpler but incorrect for billing:

```
Processing-time approach:
- Event occurs Jan 31 at 23:59
- Arrives Feb 1
- Bills to February ❌ (wrong month)

Event-time approach:
- Event occurs Jan 31 at 23:59
- Arrives Feb 1
- Bills to January ✅ (correct month)
```

## Consequences

### Positive

- ✅ Correct billing aligned with actual usage
- ✅ Fair to customers
- ✅ Industry-standard approach
- ✅ Enables accurate re-rating

### Negative

- ❌ Increased complexity (watermarks, late data handling)
- ❌ Cannot finalize invoices immediately (must wait for stragglers)
- ❌ Need buffering and state management
- ❌ Late arrivals require re-aggregation

### Mitigations

1. **Watermarks**: Track progress through event-time, define "how complete is our data"

2. **Allowed Lateness**: Accept events up to N hours late (e.g., 3 hours)

3. **Re-rating Workflow**: Handle very late events via correction invoices

4. **Customer Communication**: Set expectations that charges may adjust as data arrives

## Implementation

### Event Schema

```typescript
interface TelemetryEvent {
  event_id: string;
  event_time: Date;        // ← Event-time (when it happened)
  ingestion_time: Date;    // ← Processing-time (when we got it)
  // ...
}
```

### Windowing

```typescript
// Group by event_time, not ingestion_time
const window = {
  start: truncateToHour(event.event_time),  // ✅
  end: addHours(truncateToHour(event.event_time), 1)
};

// ❌ WRONG:
// const window = {
//   start: truncateToHour(event.ingestion_time)
// };
```

### Watermark Management

```typescript
class WatermarkManager {
  // Track latest event_time seen
  private watermark: Date;
  
  // Define allowed lateness
  private allowedLateness = Duration.hours(3);
  
  canCloseWindow(windowEnd: Date): boolean {
    return this.watermark > windowEnd + this.allowedLateness;
  }
}
```

## Alternatives Considered

### Alternative 1: Processing-Time

**Rejected** because it bills customers incorrectly when events are delayed.

### Alternative 2: Hybrid (Processing-Time with Event-Time Correction)

Use processing-time initially, then correct later based on event-time.

**Rejected** because:
- Still requires event-time infrastructure
- Adds complexity without benefit
- Confusing to customers (preliminary vs final charges)

### Alternative 3: Ignore Late Events

Only accept events within N minutes of ingestion.

**Rejected** because:
- Punishes customers for our infrastructure issues
- Unfair and likely contractually problematic
- Misses legitimate usage

## References

- [Streaming 101: Event-Time vs Processing-Time](https://www.oreilly.com/radar/the-world-beyond-batch-streaming-101/)
- [Kafka Streams Time Semantics](https://kafka.apache.org/documentation/streams/core-concepts#streams_time)
- [Google Dataflow Windowing](https://cloud.google.com/dataflow/docs/concepts/streaming-windowing)
- AWS Cost & Usage Report (uses event-time)

## Notes

This is the foundational decision that cascades through the entire system architecture. Most complexity in this project stems from honoring event-time semantics correctly.

---

**Date**: 2024-12-15  
**Author**: Study Project  
**Reviewers**: N/A (learning exercise)

