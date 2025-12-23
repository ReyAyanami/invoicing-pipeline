export const KAFKA_TOPICS = {
  TELEMETRY_EVENTS: 'telemetry-events',
  AGGREGATED_USAGE: 'aggregated-usage',
  RATED_CHARGES: 'rated-charges',
  INVOICES: 'invoices',
  LATE_EVENTS: 'telemetry-events-late',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];
