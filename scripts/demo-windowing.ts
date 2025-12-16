/**
 * Demo script to demonstrate event-time windowing
 *
 * This script:
 * 1. Sends events with different event_times
 * 2. Shows how they're grouped into hourly windows
 * 3. Demonstrates watermark-based finalization
 * 4. Shows late arrival handling
 *
 * Run with: npm run demo:windowing
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3000/api/v1';
const CUSTOMER_ID = 'demo-customer-001';

interface Event {
  eventId: string;
  eventType: string;
  customerId: string;
  eventTime: string;
  metadata?: Record<string, unknown>;
}

/**
 * Send an event to the API
 */
async function sendEvent(event: Event): Promise<void> {
  try {
    await axios.post(`${API_BASE}/events`, event);
    console.log(`✅ Sent event ${event.eventId} at ${event.eventTime}`);
  } catch (error) {
    console.error(`❌ Failed to send event ${event.eventId}:`, error);
  }
}

/**
 * Generate events for demonstration
 */
function generateDemoEvents(): Event[] {
  const now = new Date();
  const events: Event[] = [];

  // Window 1: 2 hours ago (should finalize quickly)
  const window1Start = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  for (let i = 0; i < 5; i++) {
    events.push({
      eventId: `evt-window1-${i}`,
      eventType: 'api_call',
      customerId: CUSTOMER_ID,
      eventTime: new Date(
        window1Start.getTime() + i * 10 * 60 * 1000,
      ).toISOString(),
      metadata: { endpoint: '/api/users', method: 'GET' },
    });
  }

  // Window 2: 1 hour ago (should finalize soon)
  const window2Start = new Date(now.getTime() - 1 * 60 * 60 * 1000);
  for (let i = 0; i < 3; i++) {
    events.push({
      eventId: `evt-window2-${i}`,
      eventType: 'api_call',
      customerId: CUSTOMER_ID,
      eventTime: new Date(
        window2Start.getTime() + i * 15 * 60 * 1000,
      ).toISOString(),
      metadata: { endpoint: '/api/products', method: 'POST' },
    });
  }

  // Window 3: Current hour (won't finalize yet)
  const window3Start = new Date(
    Math.floor(now.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000,
  );
  for (let i = 0; i < 2; i++) {
    events.push({
      eventId: `evt-window3-${i}`,
      eventType: 'api_call',
      customerId: CUSTOMER_ID,
      eventTime: new Date(
        window3Start.getTime() + i * 5 * 60 * 1000,
      ).toISOString(),
      metadata: { endpoint: '/api/orders', method: 'GET' },
    });
  }

  // Late arrival: Event from 3 hours ago (within allowed lateness)
  const lateEvent = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  events.push({
    eventId: 'evt-late-arrival',
    eventType: 'api_call',
    customerId: CUSTOMER_ID,
    eventTime: lateEvent.toISOString(),
    metadata: { endpoint: '/api/late', method: 'GET', late: true },
  });

  return events;
}

/**
 * Main demo function
 */
async function main() {
  console.log('🚀 Event-Time Windowing Demo\n');
  console.log(
    'This demo shows how events are grouped into hourly windows based on event_time\n',
  );

  const events = generateDemoEvents();

  console.log(
    `📊 Generated ${events.length} events across multiple time windows:\n`,
  );

  // Group events by window for display
  const windowGroups = new Map<string, Event[]>();
  for (const event of events) {
    const eventTime = new Date(event.eventTime);
    const windowStart = new Date(
      Math.floor(eventTime.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000,
    );
    const key = windowStart.toISOString();

    if (!windowGroups.has(key)) {
      windowGroups.set(key, []);
    }
    windowGroups.get(key)!.push(event);
  }

  // Display window groups
  for (const [windowStart, windowEvents] of windowGroups.entries()) {
    const windowEnd = new Date(
      new Date(windowStart).getTime() + 60 * 60 * 1000,
    );
    console.log(`📦 Window: ${windowStart} → ${windowEnd.toISOString()}`);
    console.log(`   Events: ${windowEvents.length}`);
    windowEvents.forEach((e) => {
      console.log(`   - ${e.eventId} at ${e.eventTime}`);
    });
    console.log();
  }

  console.log('📤 Sending events to API...\n');

  // Send events
  for (const event of events) {
    await sendEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay
  }

  console.log('\n✅ All events sent!');
  console.log('\n📝 What happens next:');
  console.log('1. Events are consumed from Kafka by aggregation service');
  console.log('2. Events are grouped into hourly windows based on event_time');
  console.log('3. Watermark advances every 5 minutes');
  console.log(
    '4. Windows are finalized when watermark passes window_end + 1 hour',
  );
  console.log('5. Aggregated usage records are created and published to Kafka');
  console.log('\n⏰ Wait 5-10 minutes, then check aggregated_usage table:');
  console.log(
    "   SELECT * FROM aggregated_usage WHERE customer_id = 'demo-customer-001' ORDER BY window_start;",
  );
  console.log('\n🔍 Expected results:');
  console.log('   - Window from 2 hours ago: 5 events → finalized');
  console.log('   - Window from 1 hour ago: 3 events → finalized');
  console.log(
    '   - Current window: 2 events → not yet finalized (waiting for watermark)',
  );
  console.log(
    '   - Late arrival: May be rejected if too late, or added to its window',
  );
}

main().catch(console.error);
