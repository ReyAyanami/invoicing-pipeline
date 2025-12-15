# Reconciliation & Ledger Tie-Out

How do we verify that our billing system calculated everything correctly?

## The Problem

Complex data flows with multiple stages create opportunities for discrepancies:

```
Raw Events → Aggregations → Rated Charges → Invoices
   ↓             ↓              ↓              ↓
10,234       10,234         10,234         10,234  ← Should match!
```

**Questions we must answer:**

1. Did we process all events?
2. Did aggregations count correctly?
3. Did rating apply prices correctly?
4. Do invoice totals match charges?
5. Can we tie out to financial ledger?

---

## Types of Reconciliation

### 1. Event → Aggregation Reconciliation

**Verify**: All events were aggregated exactly once.

```sql
-- Count events in time window
SELECT 
  customer_id,
  metric_type,
  DATE_TRUNC('hour', event_time) AS window,
  COUNT(*) AS event_count
FROM telemetry_events
WHERE event_time BETWEEN $1 AND $2
GROUP BY customer_id, metric_type, window;

-- Compare to aggregations
SELECT
  customer_id,
  metric_type,
  window_start AS window,
  event_count
FROM aggregated_usage
WHERE window_start BETWEEN $1 AND $2;
```

**Discrepancy?**
- Missing aggregation: Metering engine failed
- Extra aggregation: Duplicate processing
- Count mismatch: Lost or duplicated events

---

### 2. Aggregation → Charge Reconciliation

**Verify**: All final aggregations were rated exactly once.

```sql
-- Final aggregations
SELECT
  aggregation_id,
  customer_id,
  value AS quantity
FROM aggregated_usage
WHERE is_final = true
  AND window_start BETWEEN $1 AND $2;

-- Rated charges
SELECT
  aggregation_id,
  customer_id,
  quantity
FROM rated_charges
WHERE aggregation_id IN (...)
  AND supersedes_charge_id IS NULL;  -- Exclude re-rated charges
```

**Discrepancy?**
- Missing charge: Rating engine failed
- Extra charge: Duplicate rating
- Quantity mismatch: Data corruption

---

### 3. Charge → Invoice Reconciliation

**Verify**: All charges appear on exactly one invoice.

```sql
-- Total charges for customer/period
SELECT
  customer_id,
  SUM(subtotal) AS total_charges
FROM rated_charges
WHERE customer_id = $1
  AND calculated_at BETWEEN $2 AND $3
GROUP BY customer_id;

-- Invoice total
SELECT
  customer_id,
  subtotal
FROM invoices
WHERE customer_id = $1
  AND billing_period_start = $2
  AND billing_period_end = $3
  AND status != 'void';
```

**Discrepancy?**
- Total mismatch: Missing or duplicated charges
- No invoice: Generation failed
- Multiple invoices: Duplicate generation

---

### 4. Invoice → Ledger Reconciliation

**Verify**: Revenue in financial system matches billing system.

```sql
-- Billing system: Total invoiced
SELECT
  SUM(total) AS total_invoiced
FROM invoices
WHERE issued_at BETWEEN $1 AND $2
  AND status IN ('issued', 'paid');

-- Ledger system: Total revenue recognized
SELECT
  SUM(amount) AS total_revenue
FROM general_ledger
WHERE account = 'revenue'
  AND transaction_date BETWEEN $1 AND $2;
```

**Discrepancy?**
- Timing difference: Accrual vs cash basis
- Missing entry: Integration failure
- Amount mismatch: Rounding or calculation error

---

## Reconciliation Reports

### Daily Event Reconciliation

```typescript
interface EventReconciliationReport {
  date: Date;
  
  events_ingested: number;
  events_processed: number;
  events_pending: number;
  
  aggregations_created: number;
  aggregations_finalized: number;
  
  discrepancies: {
    missing_aggregations: number;
    duplicate_events: number;
    late_arrivals: number;
  };
  
  status: 'clean' | 'discrepancies' | 'error';
}
```

**Implementation**:

```typescript
async function generateEventReconciliationReport(
  date: Date
): Promise<EventReconciliationReport> {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  
  // Count events by event_time
  const events_ingested = await db.count('telemetry_events', {
    where: { event_time: Between(dayStart, dayEnd) }
  });
  
  // Count aggregations covering this day
  const aggregations = await db.query(`
    SELECT 
      COUNT(*) AS total,
      SUM(event_count) AS events_in_aggregations
    FROM aggregated_usage
    WHERE window_start >= $1 AND window_start < $2
  `, [dayStart, dayEnd]);
  
  const discrepancy = events_ingested - aggregations.events_in_aggregations;
  
  return {
    date,
    events_ingested,
    events_processed: aggregations.events_in_aggregations,
    aggregations_created: aggregations.total,
    discrepancies: {
      missing_aggregations: Math.max(0, discrepancy)
    },
    status: discrepancy === 0 ? 'clean' : 'discrepancies'
  };
}
```

---

### Monthly Invoice Reconciliation

```typescript
interface InvoiceReconciliationReport {
  month: string;  // 'YYYY-MM'
  
  total_charges: number;
  total_invoiced: number;
  total_credits: number;
  net_billed: number;
  
  invoice_count: number;
  customer_count: number;
  
  discrepancies: {
    uninvoiced_charges: number;
    charges_without_events: number;
    rounding_difference: number;
  };
  
  status: 'balanced' | 'discrepancies';
}
```

**Implementation**:

```typescript
async function generateInvoiceReconciliationReport(
  month: string
): Promise<InvoiceReconciliationReport> {
  const [year, monthNum] = month.split('-').map(Number);
  const periodStart = new Date(year, monthNum - 1, 1);
  const periodEnd = new Date(year, monthNum, 1);
  
  // Sum all charges for the period
  const charges = await db.query(`
    SELECT SUM(subtotal) AS total
    FROM rated_charges
    WHERE calculated_at >= $1 AND calculated_at < $2
  `, [periodStart, periodEnd]);
  
  // Sum all invoices for the period
  const invoices = await db.query(`
    SELECT 
      SUM(subtotal) AS total_invoiced,
      SUM(credits_applied) AS total_credits,
      SUM(total) AS net_billed,
      COUNT(*) AS invoice_count,
      COUNT(DISTINCT customer_id) AS customer_count
    FROM invoices
    WHERE billing_period_start >= $1 
      AND billing_period_end < $2
      AND status != 'void'
  `, [periodStart, periodEnd]);
  
  const rounding_difference = 
    Math.abs(charges.total - invoices.total_invoiced);
  
  return {
    month,
    total_charges: charges.total,
    total_invoiced: invoices.total_invoiced,
    total_credits: invoices.total_credits,
    net_billed: invoices.net_billed,
    invoice_count: invoices.invoice_count,
    customer_count: invoices.customer_count,
    discrepancies: {
      uninvoiced_charges: 0,  // Calculate separately
      charges_without_events: 0,  // Calculate separately
      rounding_difference
    },
    status: rounding_difference < 0.01 ? 'balanced' : 'discrepancies'
  };
}
```

---

## Idempotency Verification

**Ensure**: Processing same event twice produces same result.

```typescript
describe('Idempotency', () => {
  it('processes duplicate event only once', async () => {
    const event = createTelemetryEvent({ event_id: 'evt_123' });
    
    // Process first time
    await ingestEvent(event);
    const agg1 = await getAggregation(event.customer_id, event.event_time);
    
    // Process duplicate
    await ingestEvent(event);  // Same event_id
    const agg2 = await getAggregation(event.customer_id, event.event_time);
    
    // Should be identical
    expect(agg1.value).toBe(agg2.value);
    expect(agg1.event_count).toBe(agg2.event_count);
  });
});
```

---

## Determinism Verification

**Ensure**: Same inputs produce same outputs.

```typescript
describe('Determinism', () => {
  it('re-rating produces identical charges', async () => {
    // Original rating
    const charges1 = await rateAggregations(aggregations, priceBook);
    
    // Re-rate same aggregations with same price book
    const charges2 = await rateAggregations(aggregations, priceBook);
    
    // Must match exactly
    expect(charges1).toEqual(charges2);
  });
});
```

---

## Handling Discrepancies

### Small Rounding Differences (< $0.01)

**Cause**: Floating point arithmetic, multiple aggregations

**Action**: Accept and document

```typescript
const ACCEPTABLE_ROUNDING_ERROR = 0.01;

if (Math.abs(expected - actual) <= ACCEPTABLE_ROUNDING_ERROR) {
  logger.info('Rounding difference within tolerance', {
    expected,
    actual,
    difference: actual - expected
  });
} else {
  throw new ReconciliationError('Discrepancy exceeds tolerance');
}
```

---

### Missing Aggregations

**Cause**: Metering engine failure, Kafka lag

**Action**: Re-aggregate from events

```typescript
async function fixMissingAggregations(
  window: TimeWindow
): Promise<void> {
  // Find events without aggregations
  const orphanEvents = await db.query(`
    SELECT te.*
    FROM telemetry_events te
    LEFT JOIN aggregated_usage au 
      ON te.event_id = ANY(au.event_ids)
    WHERE te.event_time >= $1 
      AND te.event_time < $2
      AND au.aggregation_id IS NULL
  `, [window.start, window.end]);
  
  if (orphanEvents.length > 0) {
    logger.warn('Found orphan events, re-aggregating', {
      count: orphanEvents.length
    });
    
    await reaggregateEvents(orphanEvents);
  }
}
```

---

### Duplicate Charges

**Cause**: Rating engine ran twice, failed idempotency

**Action**: Identify and void duplicates

```typescript
async function findDuplicateCharges(): Promise<RatedCharge[]> {
  const duplicates = await db.query(`
    SELECT aggregation_id, COUNT(*) AS charge_count
    FROM rated_charges
    WHERE supersedes_charge_id IS NULL  -- Not re-rated charges
    GROUP BY aggregation_id
    HAVING COUNT(*) > 1
  `);
  
  for (const dup of duplicates) {
    logger.error('Duplicate charges detected', {
      aggregation_id: dup.aggregation_id,
      charge_count: dup.charge_count
    });
    
    // Void all but most recent
    await voidDuplicateCharges(dup.aggregation_id);
  }
  
  return duplicates;
}
```

---

## Audit Trail Queries

### Trace Charge to Source Events

```sql
WITH charge_detail AS (
  SELECT
    rc.charge_id,
    rc.aggregation_id,
    rc.subtotal,
    au.event_ids
  FROM rated_charges rc
  JOIN aggregated_usage au ON au.aggregation_id = rc.aggregation_id
  WHERE rc.charge_id = $1
)
SELECT
  cd.charge_id,
  cd.subtotal,
  te.event_id,
  te.event_time,
  te.event_type,
  te.metadata
FROM charge_detail cd
CROSS JOIN LATERAL UNNEST(cd.event_ids) AS event_id
JOIN telemetry_events te ON te.event_id = event_id
ORDER BY te.event_time;
```

---

### Invoice Lineage

```sql
-- All corrections for an invoice
WITH RECURSIVE invoice_chain AS (
  -- Original invoice
  SELECT 
    invoice_id,
    invoice_number,
    total,
    0 AS depth
  FROM invoices
  WHERE invoice_id = $1
  
  UNION ALL
  
  -- Correction invoices
  SELECT
    i.invoice_id,
    i.invoice_number,
    i.total,
    ic.depth + 1
  FROM invoices i
  JOIN invoice_chain ic ON i.reference_invoice_id = ic.invoice_id
)
SELECT * FROM invoice_chain
ORDER BY depth;
```

---

## Monitoring & Alerting

### Key Metrics

1. **Reconciliation Status**
   - Alert if daily reconciliation fails
   - Threshold: > 0.1% discrepancy

2. **Processing Lag**
   - Alert if events not aggregated within 4 hours
   - Threshold: 99th percentile < 4h

3. **Duplicate Detection**
   - Alert on any duplicates
   - Threshold: 0

4. **Rounding Errors**
   - Alert if cumulative rounding > $10
   - Threshold: < 0.01% of revenue

---

## Reconciliation Schedule

| Frequency | Report | Audience |
|-----------|--------|----------|
| Hourly | Event ingestion status | Ops team |
| Daily | Event → Aggregation reconciliation | Ops team |
| Daily | Aggregation → Charge reconciliation | Ops team |
| Weekly | Charge → Invoice reconciliation | Finance team |
| Monthly | Invoice → Ledger tie-out | Finance team |
| Quarterly | Full audit trail verification | Compliance |

---

## Compliance Requirements

### SOC 2 / ISO 27001

- **Completeness**: All events processed
- **Accuracy**: Calculations correct
- **Auditability**: Trail from event to invoice
- **Segregation**: Separate systems reconcile

### Tax Compliance

- **Revenue Recognition**: Match GAAP rules
- **Period Cutoff**: Proper accrual
- **Audit Support**: Export reconciliation reports

---

## Future Enhancements

1. **Automated Remediation**: Auto-fix common discrepancies
2. **Predictive Alerting**: Detect patterns before month-end
3. **Blockchain Anchoring**: Immutable proof of calculations
4. **Real-time Reconciliation**: Continuous verification vs batch

---

## Key Takeaways

1. **Reconcile at every stage** - Events → Aggregations → Charges → Invoices
2. **Accept small rounding** - Define tolerance thresholds
3. **Automate detection** - Daily reconciliation reports
4. **Manual remediation** - Complex discrepancies need investigation
5. **Audit everything** - Complete trail for compliance

---

**Next**: [Data Model](../design/DATA_MODEL.md) - Schema supporting reconciliation

