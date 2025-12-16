# Scripts

Utility scripts for development, testing, and demonstration.

## Available Scripts

### 🌱 `npm run seed`

Populates the database with sample data for development and testing.

**Creates:**
- 3 sample customers (Acme Corp, TechStart Inc, Enterprise Solutions)
- 3 price books with different pricing strategies:
  - **Standard Pricing**: Flat rates ($0.02/API call, $0.10/GB-hr, $0.50/compute-hr)
  - **Volume Pricing**: Tiered discounts (4 tiers for API calls, 3 tiers for others)
  - **Enterprise Pricing**: Discounted flat rates ($0.01/API call, etc.)
- 9 pricing rules (3 metric types × 3 price books)

**Features:**
- ✅ Idempotent (safe to run multiple times)
- ✅ Checks for existing data before inserting
- ✅ Displays summary after completion

**Usage:**
```bash
npm run seed
```

**Prerequisites:**
- Database must be running (`npm run env:start`)
- Migrations must be applied (`npm run migration:run`)

---

### 🚀 `npm run demo:windowing`

Demonstrates event-time windowing with live events.

**Sends:**
- 5 events from 2 hours ago (Window 1 - should finalize quickly)
- 3 events from 1 hour ago (Window 2 - should finalize soon)
- 2 events from current hour (Window 3 - won't finalize yet)
- 1 late arrival from 3 hours ago (tests late arrival handling)

**Purpose:**
- Shows how events are grouped into hourly windows based on `event_time`
- Demonstrates watermark-based finalization
- Tests late arrival scenarios

**Usage:**
```bash
# 1. Start infrastructure
npm run env:start

# 2. Run migrations
npm run migration:run

# 3. Seed database
npm run seed

# 4. Start application (in separate terminal)
npm run dev

# 5. Send demo events
npm run demo:windowing

# 6. Wait 5-10 minutes for watermark to advance

# 7. Check results
psql -h localhost -U billing -d billing_db
SELECT * FROM aggregated_usage WHERE customer_id = 'demo-customer-001' ORDER BY window_start;
```

**Expected Results:**
- Window 1 (2 hrs ago): 5 events → aggregated and finalized
- Window 2 (1 hr ago): 3 events → aggregated and finalized
- Window 3 (current): 2 events → waiting for watermark
- Late arrival: May be accepted or logged as too late

---

## Development Workflow

### Initial Setup

```bash
# 1. Start Docker services
npm run env:start

# 2. Run migrations
npm run migration:run

# 3. Seed test data
npm run seed
```

### Daily Development

```bash
# Start application
npm run dev

# In another terminal: Send test events
npm run demo:windowing

# Watch logs for window finalization
# (happens every 5 minutes when watermark advances)
```

### Reset Database

```bash
# Stop services
npm run env:stop

# Clean volumes (removes all data)
npm run env:clean

# Start fresh
npm run env:start
npm run migration:run
npm run seed
```

---

## Script Details

### seed.ts

**Path**: `scripts/seed.ts`

**What it does:**
1. Connects to PostgreSQL using TypeORM
2. Creates 3 sample customers with different billing cycles
3. Creates 3 price books with effective dates
4. Creates 9 pricing rules covering:
   - `api_call` metric (flat & tiered pricing)
   - `storage_gb_hours` metric (flat & tiered pricing)
   - `compute_hours` metric (flat & tiered pricing)
5. Displays summary and sample SQL queries

**Idempotency:**
- Checks if customer/price book exists before inserting
- Safe to run multiple times without duplicates

**Customization:**
Edit the `customers` array or price book definitions in `seed.ts` to create different test scenarios.

---

### demo-windowing.ts

**Path**: `scripts/demo-windowing.ts`

**What it does:**
1. Generates events with different `event_time` timestamps
2. Groups them by hour for visualization
3. Sends events to `/api/v1/events` endpoint
4. Displays expected results and SQL queries

**Event Distribution:**
- Uses `demo-customer-001` from seed data
- Spreads events across 3-4 hourly windows
- Includes one intentionally late event

**Output:**
- Shows window assignments before sending
- Displays each event as it's sent
- Provides SQL queries to check results

---

## Environment Variables

Both scripts respect the following environment variables:

```bash
DB_HOST=localhost      # PostgreSQL host
DB_PORT=5432          # PostgreSQL port
DB_USER=billing       # Database user
DB_PASSWORD=billing   # Database password
DB_NAME=billing_db    # Database name
```

Set in `.env` file or pass directly:

```bash
DB_NAME=test_db npm run seed
```

---

## Troubleshooting

### "Connection refused" error

**Problem**: Can't connect to PostgreSQL

**Solution**:
```bash
# Check if Docker is running
docker ps

# Start services if not running
npm run env:start

# Verify PostgreSQL is healthy
docker logs postgres
```

### "Relation does not exist" error

**Problem**: Database tables not created

**Solution**:
```bash
# Run migrations
npm run migration:run

# Verify tables exist
psql -h localhost -U billing -d billing_db -c "\dt"
```

### "404 Not Found" error (demo script)

**Problem**: Application not running

**Solution**:
```bash
# Start application in separate terminal
npm run dev

# Verify it's running
curl http://localhost:3000/health
```

### No aggregations appear

**Problem**: Watermark hasn't advanced yet

**Solution**:
- Wait 5-10 minutes (watermark checks every 5 minutes)
- Check application logs for "Advancing watermark" messages
- Verify events were received (check `telemetry_events` table)

---

## Adding New Scripts

To add a new script:

1. Create `scripts/your-script.ts`
2. Add script command to `package.json`:
   ```json
   "your-script": "ts-node scripts/your-script.ts"
   ```
3. Document it in this README
4. Make it idempotent if it modifies data

**Example template:**

```typescript
import { DataSource } from 'typeorm';

async function main() {
  const dataSource = new DataSource({
    // ... config
  });

  try {
    await dataSource.initialize();
    // ... your logic
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

main().catch(console.error);
```

---

## Next Steps

After running seed script:

1. ✅ Start application: `npm run dev`
2. ✅ Send test events: `npm run demo:windowing`
3. ⏰ Wait for window finalization (5-10 minutes)
4. 🔍 Query results: Check `aggregated_usage` table
5. 📊 Explore pricing: Try different price books
6. 🧪 Test scenarios: Modify seed data for edge cases

