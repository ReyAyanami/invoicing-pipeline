# Re-rating & Corrections

The hardest problem in billing: **How do you fix past invoices without breaking trust?**

## The Problem

### Scenario 1: Late Events

Customer's 10,000 API calls on Jan 31 arrive on Feb 5 (4 days late).

January invoice already issued. Now what?

### Scenario 2: Pricing Bug

Bug discovered: January charges used wrong tier structure. All customers undercharged.

How do you fix without accusations of price gouging?

### Scenario 3: Customer Dispute

Customer: "I didn't make those calls!"

Investigation: They're right. Telemetry bug. Need to issue credits.

---

## Core Principle

**Never update past records. Create correction events.**

### Why Immutability?

1. **Audit trail**: See exactly what happened and when
2. **Legal protection**: Prove you didn't retroactively inflate charges
3. **Debugging**: Understand the sequence of corrections
4. **Customer trust**: Transparent correction process

---

## Re-rating Triggers

### 1. Late Events (Automatic)

Event arrives after allowed lateness window closed.

**Detection**:
```typescript
if (event.event_time < currentWatermark - allowedLateness) {
  // Window already closed and finalized
  triggerRerating(event);
}
```

**Policy**: Depends on volume and timing
- Single late event: May absorb cost (customer goodwill)
- Bulk late events: Re-rate automatically
- Post-invoice late events: Case-by-case

---

### 2. Calculation Bug (Manual)

Developer discovers bug in rating logic.

**Example**:
```typescript
// ❌ BUG: Forgot to apply tier 2
function calculateTieredCharge(qty, tiers) {
  return qty * tiers[0].unit_price;  // Always uses tier 1!
}
```

**Impact**: All January invoices undercharged customers.

**Response**:
1. Fix bug in code
2. Define re-rating window (e.g., January 2024)
3. Re-run rating for that period
4. Generate correction invoices

---

### 3. Price Dispute (Manual)

Customer contests charge. Investigation finds error.

**Example**: Customer charged $500, but their plan had custom 50% discount that wasn't applied.

**Response**:
1. Verify discount should apply
2. Re-rate with correct price book
3. Issue credit memo for difference ($250)
4. Apologize and document

---

### 4. Backfill (Operational)

Lost data recovered from backup. Need to process historical events.

**Example**: Kafka topic lost. Restore from 7-day backup.

**Response**:
1. Ingest recovered events
2. Mark as backfill (don't re-open closed windows)
3. Aggregate separately
4. Decide: re-rate or absorb?

---

## Re-rating Process

### Step 1: Identify Scope

Define what to re-rate:

```typescript
interface ReratingJob {
  job_id: string;
  triggered_by: 'late_events' | 'bug_fix' | 'dispute' | 'backfill';
  reason: string;
  
  // Scope
  customer_ids: string[] | null;  // null = all customers
  metric_types: string[];
  window_start: Date;
  window_end: Date;
  
  // Price book to use
  price_book_id: string;
  price_version: string;
  
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: Date;
}
```

---

### Step 2: Re-aggregate Events

Pull raw events from event store and re-compute aggregations.

```typescript
async function reaggregateEvents(job: ReratingJob): Promise<AggregatedUsage[]> {
  const events = await eventStore.queryEvents({
    customer_ids: job.customer_ids,
    metric_types: job.metric_types,
    event_time_start: job.window_start,
    event_time_end: job.window_end
  });
  
  // Group by customer + metric + window
  const windows = groupEventsIntoWindows(events, {
    window_size: Duration.hours(1)
  });
  
  const aggregations: AggregatedUsage[] = [];
  
  for (const window of windows) {
    aggregations.push({
      aggregation_id: generateUUID(),
      customer_id: window.customer_id,
      metric_type: window.metric_type,
      window_start: window.start,
      window_end: window.end,
      value: window.events.length,  // Or sum, avg, etc.
      unit: window.unit,
      event_ids: window.events.map(e => e.event_id),
      event_count: window.events.length,
      computed_at: new Date(),
      is_final: true,
      rerating_job_id: job.job_id  // Mark as re-rated
    });
  }
  
  return aggregations;
}
```

**Key**: Use same windowing logic as original metering.

---

### Step 3: Re-apply Rating

Calculate charges with (possibly) new price book or fixed logic.

```typescript
async function rerateAggregations(
  aggregations: AggregatedUsage[],
  job: ReratingJob
): Promise<RatedCharge[]> {
  const priceBook = await getPriceBook(
    job.price_book_id,
    job.price_version
  );
  
  const charges: RatedCharge[] = [];
  
  for (const agg of aggregations) {
    const charge = await calculateCharge(agg, priceBook);
    charge.rerating_job_id = job.job_id;  // Mark as re-rated
    charges.push(charge);
  }
  
  return charges;
}
```

---

### Step 4: Generate Correction Invoice

Compare new charges to original charges.

```typescript
async function generateCorrectionInvoice(
  customer_id: string,
  original_charges: RatedCharge[],
  rerated_charges: RatedCharge[]
): Promise<CorrectionInvoice> {
  const corrections: LineItem[] = [];
  
  for (const rerated of rerated_charges) {
    const original = original_charges.find(
      c => c.aggregation_id === rerated.aggregation_id
    );
    
    if (!original) {
      // New charge (late event)
      corrections.push({
        description: `Additional ${rerated.metric_type}`,
        amount: rerated.subtotal,
        type: 'charge'
      });
    } else if (rerated.subtotal !== original.subtotal) {
      // Different charge
      const diff = rerated.subtotal - original.subtotal;
      corrections.push({
        description: `Adjustment to ${rerated.metric_type}`,
        original_amount: original.subtotal,
        corrected_amount: rerated.subtotal,
        difference: diff,
        type: diff > 0 ? 'charge' : 'credit'
      });
    }
  }
  
  const total_adjustment = corrections.reduce(
    (sum, item) => sum + (item.difference || item.amount),
    0
  );
  
  return {
    invoice_id: generateUUID(),
    invoice_type: 'correction',
    customer_id,
    reference_invoice_id: original_invoice.invoice_id,
    line_items: corrections,
    total_adjustment,
    reason: job.reason,
    issued_at: new Date()
  };
}
```

---

### Step 5: Customer Communication

**Critical**: Explain why and how.

#### Good Example

```
Subject: Billing Correction - Additional Usage Found

Hi [Customer],

We discovered additional API usage from January that wasn't included 
in your original invoice due to delayed event processing.

Details:
- Original charge: $127.50
- Additional usage: 234 API calls on Jan 31
- Additional charge: $4.68
- New total: $132.18

You can view the detailed breakdown here: [link to explainability page]

The additional charge will appear on your February invoice as 
"January usage adjustment."

We apologize for the inconvenience. If you have questions, please 
contact support@example.com.

Best,
Billing Team
```

#### Bad Example

```
Subject: Invoice Update

Your invoice has been updated. You now owe $132.18.
```

---

## Determinism Verification

**Critical**: Re-rating must produce same results if run multiple times.

### Test

```typescript
describe('Rerating Determinism', () => {
  it('produces identical results on multiple runs', async () => {
    const job: ReratingJob = {
      // ... define scope ...
    };
    
    // Run 1
    const aggregations1 = await reaggregateEvents(job);
    const charges1 = await rerateAggregations(aggregations1, job);
    
    // Run 2 (should be identical)
    const aggregations2 = await reaggregateEvents(job);
    const charges2 = await rerateAggregations(aggregations2, job);
    
    expect(charges1).toEqual(charges2);  // Must match exactly
  });
});
```

**Common pitfall**: Using `Date.now()` or `Math.random()` in calculations.

---

## Reconciliation

After re-rating, verify ledger consistency.

### Double-Entry Check

In a double-entry system, debits must equal credits.

```typescript
async function reconcileCorrectionInvoice(
  correction: CorrectionInvoice
): Promise<ReconciliationReport> {
  // Original invoice entries
  const original_debit = await ledger.getDebit(
    correction.reference_invoice_id
  );
  
  // Correction entries
  const correction_debit = correction.total_adjustment > 0
    ? correction.total_adjustment
    : 0;
  const correction_credit = correction.total_adjustment < 0
    ? Math.abs(correction.total_adjustment)
    : 0;
  
  // Verify balance
  const total_debit = original_debit + correction_debit;
  const total_credit = correction_credit;
  
  return {
    is_balanced: total_debit === getExpectedRevenue(),
    original_debit,
    correction_debit,
    correction_credit,
    discrepancy: total_debit - getExpectedRevenue()
  };
}
```

If discrepancy ≠ 0, something is wrong!

---

## When NOT to Re-rate

### 1. Immaterial Amounts

Cost of correction > value of correction.

**Threshold**: < $1 or < 0.1% of invoice.

**Action**: Absorb the discrepancy, log for monitoring.

---

### 2. Customer Advantage

Bug resulted in undercharging customer, but they've already paid.

**Decision**: Depends on policy
- Large enterprise: May re-rate
- Small customer: Likely absorb (goodwill)
- Terms of service: Check your legal rights

---

### 3. Too Far in the Past

Re-rating 2-year-old invoices is operationally complex and erodes trust.

**Statute of limitations**: Define window (e.g., 90 days).

---

## Operational Considerations

### Re-rating Job Management

Track all re-rating jobs for audit.

```sql
CREATE TABLE rerating_jobs (
  job_id UUID PRIMARY KEY,
  triggered_by VARCHAR(50) NOT NULL,
  reason TEXT NOT NULL,
  
  -- Scope
  customer_ids UUID[],
  metric_types VARCHAR(100)[],
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  
  -- Execution
  status VARCHAR(20) NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Results
  aggregations_created INT,
  charges_created INT,
  correction_invoices_issued INT,
  total_adjustment_amount DECIMAL(12,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Idempotency

Re-rating the same scope twice shouldn't duplicate corrections.

```typescript
async function createCorrectionInvoice(
  correction: CorrectionInvoice
): Promise<void> {
  // Idempotency key: rerating_job_id + customer_id
  const idempotency_key = `${correction.rerating_job_id}:${correction.customer_id}`;
  
  const existing = await db.findCorrectionByKey(idempotency_key);
  if (existing) {
    // Already created
    return;
  }
  
  await db.insert('correction_invoices', {
    ...correction,
    idempotency_key
  });
}
```

---

### Monitoring

Track re-rating metrics:

1. **Re-rating job count**: How often are we correcting?
2. **Average adjustment amount**: Are corrections large or small?
3. **Time to completion**: How long does re-rating take?
4. **Failure rate**: Are re-rating jobs succeeding?

**Alerting**:
- Alert if > 5% of invoices require corrections
- Alert if re-rating job fails
- Alert if adjustment > $10,000

---

## Alternative: Credit Memos vs Re-invoicing

### Option 1: Correction Invoice (Our Approach)

Issue separate document: "Adjustment to Invoice #12345"

**Pros**:
- Clear audit trail
- Original invoice unchanged
- Easy to explain

**Cons**:
- More documents to manage
- Customer sees multiple invoices

---

### Option 2: Credit Memo + New Invoice

1. Issue credit memo voiding original
2. Issue new correct invoice

**Pros**:
- "Clean slate"
- Customer has one correct invoice

**Cons**:
- More complex accounting
- May confuse customers (two full invoices)

---

### Option 3: Update Original (DON'T DO THIS)

Modify original invoice amount.

**Pros**: None worth mentioning

**Cons**:
- ❌ No audit trail
- ❌ Breaks trust (looks like you changed past)
- ❌ Legal risk
- ❌ Can't explain what happened

---

## Case Study: AWS Cost Explorer

AWS handles late data elegantly:

1. **Initial estimate**: Show usage as it arrives
2. **Mark as preliminary**: "Your charges may change as we process more data"
3. **Finalize after 3 days**: Most data has arrived
4. **Small corrections**: Applied to next month's invoice as "previous month adjustments"
5. **Large corrections**: Proactive outreach

**Key insight**: Set expectations that data is preliminary.

---

## Testing Re-rating

### Test Scenarios

1. **Late single event**: Should trigger re-aggregation
2. **Late bulk events**: Should trigger re-rating job
3. **Price bug fix**: Should produce deterministic corrections
4. **Duplicate re-rating**: Should be idempotent (no double-corrections)
5. **Partial re-rating**: Only some customers/metrics
6. **Reconciliation**: Ledger must balance after correction

---

## Future: Real-Time Preview

Advanced problem: Show customers "current month usage so far" while acknowledging incompleteness.

**Challenges**:
- Data still arriving
- Prices might change
- Windows not closed
- Can't guarantee accuracy

**Solution**: Clearly mark as "estimated" and update daily.

Out of scope for v1.

---

## Key Takeaways

1. **Immutability is non-negotiable** - Never modify past records
2. **Determinism must be verified** - Same inputs → same outputs
3. **Transparency builds trust** - Explain why and how you corrected
4. **Define policies upfront** - When to re-rate vs absorb?
5. **Monitor correction rate** - High rate signals upstream problems
6. **Reconciliation is essential** - Verify ledger balance after corrections

---

**Next Steps**:
- [Data Model](../design/DATA_MODEL.md) - Database schema for re-rating
- [Testing Guide](../development/TESTING.md) - How to test corrections

