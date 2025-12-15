# API Error Codes & Handling

Comprehensive error handling strategy for the invoicing pipeline API.

## Error Response Format

All API errors follow a consistent JSON structure:

```typescript
interface ErrorResponse {
  error: {
    code: string;              // Machine-readable error code
    message: string;           // Human-readable message
    details?: object;          // Additional context
    request_id: string;        // For support/debugging
    timestamp: string;         // ISO 8601 timestamp
  };
  status: number;              // HTTP status code
}
```

### Example Error Response

```json
{
  "error": {
    "code": "INVALID_EVENT_TIME",
    "message": "Event time cannot be more than 24 hours in the future",
    "details": {
      "event_time": "2024-12-20T10:00:00Z",
      "max_allowed": "2024-12-16T22:30:00Z",
      "diff_hours": 85.5
    },
    "request_id": "req_abc123def456",
    "timestamp": "2024-12-15T22:30:00Z"
  },
  "status": 400
}
```

---

## HTTP Status Codes

### 2xx Success

#### 200 OK
**Usage**: Successful GET, PUT, PATCH requests

**Example**:
```http
GET /api/v1/aggregations?customer_id=cust_123
200 OK

{
  "aggregations": [...],
  "total": 42
}
```

---

#### 201 Created
**Usage**: Successful POST that creates a resource

**Example**:
```http
POST /api/v1/events
201 Created
Location: /api/v1/events/evt_123

{
  "event_id": "evt_123",
  "status": "accepted"
}
```

---

#### 202 Accepted
**Usage**: Request accepted for async processing

**Example**:
```http
POST /api/v1/rerating-jobs
202 Accepted

{
  "job_id": "job_789",
  "status": "pending",
  "status_url": "/api/v1/rerating-jobs/job_789"
}
```

---

#### 204 No Content
**Usage**: Successful DELETE or update with no response body

**Example**:
```http
DELETE /api/v1/invoices/inv_123
204 No Content
```

---

### 4xx Client Errors

#### 400 Bad Request
**Usage**: Invalid request format, validation failure

**Common Error Codes**:
- `INVALID_REQUEST_FORMAT`
- `VALIDATION_FAILED`
- `INVALID_EVENT_TIME`
- `INVALID_CUSTOMER_ID`
- `MISSING_REQUIRED_FIELD`

**Example**:
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "details": {
      "field": "event_time",
      "constraint": "must be valid ISO 8601 date",
      "received": "2024-13-45"
    },
    "request_id": "req_xyz789",
    "timestamp": "2024-12-15T22:30:00Z"
  },
  "status": 400
}
```

---

#### 401 Unauthorized
**Usage**: Missing or invalid authentication

**Error Codes**:
- `MISSING_AUTH_TOKEN`
- `INVALID_AUTH_TOKEN`
- `TOKEN_EXPIRED`

**Example**:
```json
{
  "error": {
    "code": "MISSING_AUTH_TOKEN",
    "message": "Authentication token is required",
    "details": {
      "header": "Authorization",
      "format": "Bearer <token>"
    },
    "request_id": "req_abc123",
    "timestamp": "2024-12-15T22:30:00Z"
  },
  "status": 401
}
```

---

#### 403 Forbidden
**Usage**: Authenticated but not authorized for this resource

**Error Codes**:
- `INSUFFICIENT_PERMISSIONS`
- `RESOURCE_ACCESS_DENIED`
- `CUSTOMER_NOT_OWNED`

**Example**:
```json
{
  "error": {
    "code": "CUSTOMER_NOT_OWNED",
    "message": "You do not have access to this customer's data",
    "details": {
      "customer_id": "cust_456",
      "required_permission": "read:customer:cust_456"
    },
    "request_id": "req_def456",
    "timestamp": "2024-12-15T22:30:00Z"
  },
  "status": 403
}
```

---

#### 404 Not Found
**Usage**: Resource does not exist

**Error Codes**:
- `RESOURCE_NOT_FOUND`
- `CUSTOMER_NOT_FOUND`
- `INVOICE_NOT_FOUND`
- `PRICE_BOOK_NOT_FOUND`

**Example**:
```json
{
  "error": {
    "code": "INVOICE_NOT_FOUND",
    "message": "Invoice not found",
    "details": {
      "invoice_id": "inv_nonexistent"
    },
    "request_id": "req_ghi789",
    "timestamp": "2024-12-15T22:30:00Z"
  },
  "status": 404
}
```

---

#### 409 Conflict
**Usage**: Resource state conflict (duplicate, version mismatch)

**Error Codes**:
- `DUPLICATE_EVENT_ID`
- `INVOICE_ALREADY_ISSUED`
- `PRICE_BOOK_OVERLAP`
- `VERSION_CONFLICT`

**Example**:
```json
{
  "error": {
    "code": "DUPLICATE_EVENT_ID",
    "message": "Event with this ID already exists",
    "details": {
      "event_id": "evt_123",
      "existing_timestamp": "2024-12-15T10:00:00Z",
      "action": "Event was not processed (idempotent)"
    },
    "request_id": "req_jkl012",
    "timestamp": "2024-12-15T22:30:00Z"
  },
  "status": 409
}
```

---

#### 422 Unprocessable Entity
**Usage**: Request format is valid, but semantically incorrect

**Error Codes**:
- `NO_PRICE_BOOK_FOR_DATE`
- `EVENT_TIME_TOO_LATE`
- `INVALID_BILLING_PERIOD`
- `INSUFFICIENT_CREDITS`

**Example**:
```json
{
  "error": {
    "code": "NO_PRICE_BOOK_FOR_DATE",
    "message": "No price book exists for the given date",
    "details": {
      "metric_type": "api_calls",
      "event_time": "2023-01-01T00:00:00Z",
      "available_from": "2024-01-01T00:00:00Z"
    },
    "request_id": "req_mno345",
    "timestamp": "2024-12-15T22:30:00Z"
  },
  "status": 422
}
```

---

#### 429 Too Many Requests
**Usage**: Rate limit exceeded

**Error Codes**:
- `RATE_LIMIT_EXCEEDED`

**Example**:
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "API rate limit exceeded",
    "details": {
      "limit": 1000,
      "period": "1 hour",
      "retry_after": 3600
    },
    "request_id": "req_pqr678",
    "timestamp": "2024-12-15T22:30:00Z"
  },
  "status": 429
}
```

**Headers**:
```
Retry-After: 3600
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1702686000
```

---

### 5xx Server Errors

#### 500 Internal Server Error
**Usage**: Unexpected server error

**Error Codes**:
- `INTERNAL_SERVER_ERROR`
- `CALCULATION_ERROR`
- `UNEXPECTED_ERROR`

**Example**:
```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred",
    "details": {
      "error_id": "err_abc123",
      "support": "Contact support@example.com with this error ID"
    },
    "request_id": "req_stu901",
    "timestamp": "2024-12-15T22:30:00Z"
  },
  "status": 500
}
```

---

#### 502 Bad Gateway
**Usage**: Upstream service (Kafka, database) unavailable

**Error Codes**:
- `UPSTREAM_SERVICE_ERROR`
- `KAFKA_UNAVAILABLE`
- `DATABASE_UNAVAILABLE`

---

#### 503 Service Unavailable
**Usage**: Service temporarily unavailable (maintenance, overload)

**Error Codes**:
- `SERVICE_UNAVAILABLE`
- `MAINTENANCE_MODE`

**Example**:
```json
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Service temporarily unavailable",
    "details": {
      "retry_after": 300,
      "reason": "Scheduled maintenance"
    },
    "request_id": "req_vwx234",
    "timestamp": "2024-12-15T22:30:00Z"
  },
  "status": 503
}
```

**Headers**:
```
Retry-After: 300
```

---

#### 504 Gateway Timeout
**Usage**: Upstream service timeout

**Error Codes**:
- `GATEWAY_TIMEOUT`
- `PROCESSING_TIMEOUT`

---

## Domain-Specific Error Codes

### Event Ingestion Errors

| Code | Status | Description |
|------|--------|-------------|
| `INVALID_EVENT_TIME` | 400 | Event time is invalid or too far in future |
| `DUPLICATE_EVENT_ID` | 409 | Event ID already processed (idempotent) |
| `EVENT_TOO_OLD` | 422 | Event time is before system start date |
| `INVALID_CUSTOMER_ID` | 400 | Customer ID format invalid |
| `CUSTOMER_NOT_FOUND` | 404 | Customer does not exist |

---

### Aggregation Errors

| Code | Status | Description |
|------|--------|-------------|
| `AGGREGATION_NOT_FOUND` | 404 | Aggregation does not exist |
| `WINDOW_NOT_FINALIZED` | 422 | Window is still open (not final) |
| `NO_EVENTS_IN_WINDOW` | 404 | No events found for window |

---

### Rating Errors

| Code | Status | Description |
|------|--------|-------------|
| `NO_PRICE_BOOK_FOR_DATE` | 422 | No price book exists for event date |
| `INVALID_PRICE_RULE` | 500 | Price rule configuration error |
| `CALCULATION_ERROR` | 500 | Error calculating charge |
| `AGGREGATION_NOT_FINAL` | 422 | Cannot rate non-final aggregation |

---

### Invoice Errors

| Code | Status | Description |
|------|--------|-------------|
| `INVOICE_NOT_FOUND` | 404 | Invoice does not exist |
| `INVOICE_ALREADY_ISSUED` | 409 | Cannot modify issued invoice |
| `INVALID_BILLING_PERIOD` | 400 | Billing period invalid |
| `NO_CHARGES_IN_PERIOD` | 404 | No charges for billing period |

---

### Re-rating Errors

| Code | Status | Description |
|------|--------|-------------|
| `RERATING_JOB_NOT_FOUND` | 404 | Re-rating job does not exist |
| `INVALID_TIME_WINDOW` | 400 | Time window invalid (start > end) |
| `NO_EVENTS_TO_RERATE` | 404 | No events in scope |
| `RERATING_IN_PROGRESS` | 409 | Re-rating already running for scope |

---

## Retry Strategies

### Client-Side Retry Logic

```typescript
interface RetryConfig {
  maxRetries: number;
  initialDelay: number;      // milliseconds
  maxDelay: number;
  backoffMultiplier: number;
  retryableStatuses: number[];
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,        // 1 second
  maxDelay: 30000,           // 30 seconds
  backoffMultiplier: 2,      // Exponential backoff
  retryableStatuses: [408, 429, 500, 502, 503, 504]
};
```

### Retry Decision Matrix

| Status Code | Retry? | Strategy | Max Retries |
|-------------|--------|----------|-------------|
| 400 | ❌ No | Fix request | - |
| 401 | ❌ No | Re-authenticate | - |
| 403 | ❌ No | Check permissions | - |
| 404 | ❌ No | Verify resource exists | - |
| 408 | ✅ Yes | Exponential backoff | 3 |
| 409 | ⚠️ Conditional | Idempotent operations only | 1 |
| 422 | ❌ No | Fix request data | - |
| 429 | ✅ Yes | Use Retry-After header | 5 |
| 500 | ✅ Yes | Exponential backoff | 3 |
| 502 | ✅ Yes | Exponential backoff | 3 |
| 503 | ✅ Yes | Use Retry-After header | 5 |
| 504 | ✅ Yes | Exponential backoff | 3 |

---

### Exponential Backoff Implementation

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = defaultRetryConfig
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry if not retryable status
      if (!config.retryableStatuses.includes(error.status)) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === config.maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.initialDelay * Math.pow(config.backoffMultiplier, attempt),
        config.maxDelay
      );
      
      // Add jitter (±10%)
      const jitter = delay * 0.1 * (Math.random() * 2 - 1);
      const finalDelay = delay + jitter;
      
      await sleep(finalDelay);
    }
  }
  
  throw lastError;
}
```

---

## Idempotency

### Idempotency Keys

For operations that should be safe to retry:

```http
POST /api/v1/events
Idempotency-Key: evt_unique_key_123

{
  "event_id": "evt_unique_key_123",
  "customer_id": "cust_123",
  "event_time": "2024-12-15T14:00:00Z",
  "event_type": "api_call"
}
```

**Behavior**:
- First request: Processes event, returns 201
- Duplicate request: Returns 409 with original response
- After 24 hours: Idempotency key expires

---

## Error Monitoring & Alerting

### Metrics to Track

1. **Error Rate by Status Code**
   - Alert if 5xx > 1% of requests
   - Alert if 4xx > 10% of requests

2. **Error Rate by Endpoint**
   - Identify problematic endpoints
   - Alert if specific endpoint > 5% errors

3. **Specific Error Codes**
   - Alert on `NO_PRICE_BOOK_FOR_DATE` (config issue)
   - Alert on `CALCULATION_ERROR` (logic bug)
   - Alert on database connection errors

4. **Retry Success Rate**
   - Track how often retries succeed
   - Alert if retry success < 70%

---

## Testing Error Handling

### Test Cases

```typescript
describe('Error Handling', () => {
  it('returns 400 for invalid event time', async () => {
    const response = await request(app)
      .post('/api/v1/events')
      .send({
        event_id: 'evt_123',
        event_time: '2025-01-01T00:00:00Z',  // Future
        customer_id: 'cust_123'
      });
    
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_EVENT_TIME');
    expect(response.body.error.details).toHaveProperty('max_allowed');
  });
  
  it('returns 409 for duplicate event', async () => {
    // First request
    await request(app).post('/api/v1/events').send(event);
    
    // Duplicate request (idempotent)
    const response = await request(app).post('/api/v1/events').send(event);
    
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DUPLICATE_EVENT_ID');
  });
  
  it('returns 422 when no price book exists', async () => {
    const response = await request(app)
      .post('/api/v1/charges')
      .send({
        aggregation_id: 'agg_123',
        event_time: '2023-01-01T00:00:00Z'  // Before pricing starts
      });
    
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('NO_PRICE_BOOK_FOR_DATE');
  });
});
```

---

## Client Libraries

### Error Handling Example

```typescript
import { InvoicingClient, ApiError } from '@invoicing/client';

const client = new InvoicingClient({ apiKey: 'key_123' });

try {
  const event = await client.events.create({
    event_id: 'evt_123',
    customer_id: 'cust_123',
    event_time: new Date(),
    event_type: 'api_call'
  });
} catch (error) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'DUPLICATE_EVENT_ID':
        // Idempotent - this is OK
        console.log('Event already processed');
        break;
      
      case 'INVALID_EVENT_TIME':
        // Fix the data
        console.error('Invalid event time:', error.details);
        break;
      
      case 'RATE_LIMIT_EXCEEDED':
        // Wait and retry
        await sleep(error.retryAfter * 1000);
        return retry();
      
      default:
        throw error;
    }
  } else {
    // Network error, etc.
    throw error;
  }
}
```

---

## Best Practices

1. **Always include request_id** - For support and debugging
2. **Provide actionable details** - Help clients fix the issue
3. **Use consistent error codes** - Machine-readable across versions
4. **Document retry behavior** - When to retry, how long to wait
5. **Log all errors** - With context for debugging
6. **Monitor error patterns** - Detect systemic issues
7. **Test error paths** - Don't just test happy paths

---

## References

- [RFC 7807 - Problem Details for HTTP APIs](https://tools.ietf.org/html/rfc7807)
- [HTTP Status Codes](https://httpstatuses.com/)
- [Stripe Error Handling](https://stripe.com/docs/api/errors)

