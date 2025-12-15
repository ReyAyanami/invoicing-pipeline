# Time Semantics

The hardest part of usage-based billing: **when did it happen vs when did we learn about it?**

## Two Times, Two Truths

### Event-Time
**When the event actually occurred.**

Example: API call made at `2024-01-15 14:23:45 UTC`

### Processing-Time
**When we received/processed the event.**

Example: We received the API call log at `2024-01-15 14:24:10 UTC`

---

## Why Event-Time Matters

### Scenario: Month-End Boundary

```
Event-time:      2024-01-31 23:59:50  ← Belongs in January
Processing-time: 2024-02-01 00:00:15  ← Arrives in February
```

**Question**: Which invoice does this charge go on?

**Wrong Answer**: February (using processing-time)
**Right Answer**: January (using event-time)

**Why**: Customer's usage happened in January. They expect January's invoice to include it.

---

## The Late Arrival Problem

Events arrive out-of-order. This is normal in distributed systems.

### Example Timeline

```
Event A: occurred at 14:00:00, arrived at 14:00:01 ✓
Event B: occurred at 14:00:05, arrived at 14:00:06 ✓
Event C: occurred at 14:00:02, arrived at 14:00:30 ⚠️ (late)
```

**Processing-time order**: A, B, C
**Event-time order**: A, C, B

**If we aggregated at 14:00:20**, we'd have missed Event C.

---

## Watermarks: "How Complete Is Our Data?"

A **watermark** is our estimate of event-time progress.

> "We've seen all events up to time T (probably)"

### How Watermarks Work

```
Current watermark: 14:00:20

Meaning: We believe we've processed all events that occurred before 14:00:20

But: Late events might still arrive!
```

### Advancing Watermarks

**Heuristic**: Watermark = max(event-time) - allowed_lateness

```typescript
const allowedLateness = Duration.hours(3);
const maxEventTime = getMaxEventTimeSeen();
const watermark = maxEventTime.minus(allowedLateness);
```

**Trade-off**:
- Small lateness → faster results, might miss late events
- Large lateness → more accurate, slower results

---

## Window Types

### Tumbling Windows

Fixed-size, non-overlapping.

```
[00:00 - 01:00)
[01:00 - 02:00)
[02:00 - 03:00)
...
```

**Use**: Hourly aggregations

**Example**: "API calls between 2-3 PM"

### Sliding Windows

Overlapping, fixed-size, moves incrementally.

```
[00:00 - 01:00)
[00:15 - 01:15)
[00:30 - 01:30)
...
```

**Use**: Rolling averages, anomaly detection

**Example**: "Average storage over last 15 minutes"

### Session Windows

Dynamic size based on inactivity gap.

```
[Request at 10:00] ─ [Request at 10:05] ─ gap ─ [Request at 11:30]
     └── Session 1 ──────────────────────┘         └── Session 2 ──
```

**Use**: User sessions, batch jobs

**Example**: "Burst compute usage per job"

---

## Window Lifecycle

### States

1. **Open**: Accepting events, watermark hasn't passed
2. **Closed**: No more events accepted (watermark passed + allowed lateness)
3. **Final**: Results emitted, won't change (barring re-rating)

### Visualization

```
Event-time ──────────────────────────────────────────►
          14:00          15:00          16:00

Window    [─────────────)
          14:00       15:00

Watermark              ↑ (at 15:30)
                       │
          Window is CLOSED (1h + 0.5h late allowance passed)
```

---

## Late Data Strategies

### 1. Ignore (Not Acceptable for Billing)

❌ "Sorry, your usage at 23:59:59 doesn't count because it arrived late."

### 2. Accept Within Allowed Lateness

✅ **Our Approach**

- Define max allowed lateness (e.g., 3 hours)
- Accept late events within window
- Update aggregates
- Mark as `is_final: false`
- Re-emit corrected aggregation

```typescript
interface AggregatedUsage {
  is_final: boolean;  // false if within allowed lateness
  version: number;    // increments on updates
}
```

### 3. Infinite Lateness (Impractical)

❌ "We'll accept events from 2022 and update all past invoices."

**Problem**: Need to finalize invoices eventually!

---

## Allowed Lateness: The Trade-Off

### Short Lateness (1 hour)

**Pros**:
- Fast finalization
- Invoices close quickly
- Less state to track

**Cons**:
- More late events rejected
- Triggers re-rating more often
- Customer complaints

### Long Lateness (24 hours)

**Pros**:
- Fewer missed events
- More accurate aggregations

**Cons**:
- Delayed finalization
- More memory/state
- Longer invoice delays

### Recommendation

**3 hours** for most use cases. Enough to handle:
- Temporary network issues
- Service restarts
- Time zone confusion (sadly common)

---

## Handling "Really Late" Events

Events arriving after allowed lateness require **re-rating**.

### Example

**Jan 31 invoice** issued on Feb 1st.

On **Feb 5th**, late event arrives: 10,000 API calls on Jan 31.

**Process**:

1. Detect: Event-time `Jan 31`, but watermark long past
2. Store: Save to `late-events` table
3. Notify: Alert ops team
4. Decision: Re-rate January? Issue credit memo?
5. Re-rating: Recompute Jan usage, generate correction invoice

See [Re-rating & Corrections](RERATING.md) for details.

---

## Implementation: Event-Time Extraction

Every event needs an event-time field.

```typescript
interface TelemetryEvent {
  event_id: string;
  event_type: string;
  customer_id: string;
  
  // The critical fields:
  event_time: Date;        // When it happened
  ingestion_time: Date;    // When we received it
  
  metadata: Record<string, any>;
}
```

### Sources of Event-Time

**Best**: Application provides timestamp
```json
{
  "event_time": "2024-01-15T14:23:45.123Z",
  "customer_id": "cust_123",
  "event_type": "api_call"
}
```

**Fallback**: Ingestion server timestamp
```typescript
if (!event.event_time) {
  event.event_time = new Date(); // Not ideal!
}
```

**Worst**: Database insertion time
```sql
INSERT ... created_at = NOW()  -- ❌ Processing-time!
```

---

## Watermark Tracking

### Per-Partition Watermarks

Kafka is partitioned. Track watermarks per partition.

```typescript
class WatermarkTracker {
  private watermarks: Map<number, Date> = new Map();
  
  updateWatermark(partition: number, eventTime: Date) {
    const current = this.watermarks.get(partition) || new Date(0);
    if (eventTime > current) {
      this.watermarks.set(partition, eventTime);
    }
  }
  
  getGlobalWatermark(): Date {
    // Conservative: min across all partitions
    return new Date(Math.min(
      ...Array.from(this.watermarks.values()).map(d => d.getTime())
    ));
  }
}
```

**Why min?**: Partition with slowest progress determines completeness.

---

## Clock Skew & Time Zones

### Problem: Distributed Clocks

Event source A: clock is 2 minutes fast
Event source B: clock is accurate

**Result**: Out-of-order event-times even if processing-time is ordered!

### Solution: Use UTC Everywhere

```typescript
// ✅ Good
event_time: "2024-01-15T14:23:45.123Z"  // ISO 8601 UTC

// ❌ Bad
event_time: "2024-01-15 14:23:45"       // No timezone
event_time: "2024-01-15T14:23:45-08:00" // Local time (confusing)
```

### Edge Case: User Timezones

Customer in Tokyo makes request at "10:00 AM JST".

**Store in UTC**: `2024-01-15T01:00:00Z`
**Display in JST**: When showing to customer

---

## Testing Time Semantics

### Test Cases

1. **In-Order Events**: Verify basic aggregation
2. **Out-of-Order Events**: Ensure late events update aggregates
3. **Very Late Events**: Trigger re-rating workflow
4. **Clock Skew**: Events with timestamps in "future"
5. **Month Boundary**: Events at 23:59:59 vs 00:00:01
6. **Daylight Saving Time**: Use UTC to avoid entirely

### Mock Time

```typescript
class MockTimeProvider {
  private currentTime: Date;
  
  now(): Date {
    return this.currentTime;
  }
  
  advance(duration: Duration) {
    this.currentTime = addDuration(this.currentTime, duration);
  }
}
```

Inject time provider, never use `Date.now()` directly.

---

## Monitoring & Alerts

### Key Metrics

1. **Event-time lag**: `processing_time - event_time`
   - Alert if P99 > 5 minutes

2. **Late events rate**: Events arriving after window closed
   - Alert if > 1% of events

3. **Watermark progress**: Should advance steadily
   - Alert if stuck for > 30 minutes

4. **Window close latency**: Time from watermark to emission
   - Target: < 5 seconds

---

## Trade-Offs Summary

| Approach | Accuracy | Latency | Complexity |
|----------|----------|---------|------------|
| Processing-time | ❌ Poor | ✅ Low | ✅ Simple |
| Event-time (no late) | ⚠️ Medium | ✅ Low | ⚠️ Medium |
| Event-time + lateness | ✅ High | ⚠️ Medium | ❌ High |
| Event-time + re-rating | ✅ Very High | ❌ High | ❌ Very High |

**Our choice**: Event-time with 3-hour allowed lateness + re-rating workflow

**Why**: Billing requires accuracy over speed.

---

## Further Reading

- [Streaming 101](https://www.oreilly.com/radar/the-world-beyond-batch-streaming-101/) - Tyler Akidau
- [Streaming 102](https://www.oreilly.com/radar/the-world-beyond-batch-streaming-102/) - Watermarks explained
- Kafka Streams [Time Semantics](https://kafka.apache.org/documentation/streams/core-concepts#streams_time)

---

**Key Takeaway**: Event-time billing is harder than processing-time, but it's the only way to bill fairly. Watermarks and allowed lateness let us balance accuracy and timeliness.

