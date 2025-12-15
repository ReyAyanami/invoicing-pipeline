import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1702675200000 implements MigrationInterface {
  name = 'InitialSchema1702675200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create customers table
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "customer_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "external_id" character varying(255),
        "name" character varying(255) NOT NULL,
        "email" character varying(255),
        "billing_currency" character varying(3) NOT NULL DEFAULT 'USD',
        "billing_cycle" character varying(20) NOT NULL DEFAULT 'monthly',
        "status" character varying(20) NOT NULL DEFAULT 'active',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customers_customer_id" PRIMARY KEY ("customer_id"),
        CONSTRAINT "UQ_customers_external_id" UNIQUE ("external_id"),
        CONSTRAINT "CHK_customer_status" CHECK (status IN ('active', 'suspended', 'cancelled'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_customers_external_id" ON "customers" ("external_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_customers_status" ON "customers" ("status") WHERE status = 'active'
    `);

    // Create telemetry_events table
    await queryRunner.query(`
      CREATE TABLE "telemetry_events" (
        "event_id" uuid NOT NULL,
        "event_type" character varying(100) NOT NULL,
        "customer_id" uuid NOT NULL,
        "event_time" TIMESTAMP WITH TIME ZONE NOT NULL,
        "ingestion_time" TIMESTAMP WITH TIME ZONE NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "source" character varying(255),
        "processed_at" TIMESTAMP WITH TIME ZONE,
        "processing_version" character varying(50),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_telemetry_events_event_id" PRIMARY KEY ("event_id"),
        CONSTRAINT "CHK_event_time" CHECK (event_time <= NOW() + INTERVAL '1 day')
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_telemetry_customer_time" ON "telemetry_events" ("customer_id", "event_time")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_telemetry_type_time" ON "telemetry_events" ("event_type", "event_time")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_telemetry_ingestion" ON "telemetry_events" ("ingestion_time") WHERE processed_at IS NULL
    `);

    // Create aggregated_usage table
    await queryRunner.query(`
      CREATE TABLE "aggregated_usage" (
        "aggregation_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customer_id" uuid NOT NULL,
        "metric_type" character varying(100) NOT NULL,
        "window_start" TIMESTAMP WITH TIME ZONE NOT NULL,
        "window_end" TIMESTAMP WITH TIME ZONE NOT NULL,
        "value" numeric(20,6) NOT NULL,
        "unit" character varying(50) NOT NULL,
        "event_count" integer NOT NULL,
        "event_ids" uuid[] NOT NULL,
        "is_final" boolean NOT NULL DEFAULT false,
        "version" integer NOT NULL DEFAULT 1,
        "computed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "rerating_job_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_aggregated_usage_aggregation_id" PRIMARY KEY ("aggregation_id"),
        CONSTRAINT "CHK_window_order" CHECK (window_start < window_end),
        CONSTRAINT "CHK_positive_value" CHECK (value >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_aggregated_customer_window" ON "aggregated_usage" ("customer_id", "window_start")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_aggregated_metric_window" ON "aggregated_usage" ("metric_type", "window_start")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_aggregated_finalized" ON "aggregated_usage" ("customer_id", "is_final", "window_start") WHERE is_final = true
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_aggregated_unique_window" ON "aggregated_usage" ("customer_id", "metric_type", "window_start", "window_end") WHERE rerating_job_id IS NULL
    `);

    // Create price_books table
    await queryRunner.query(`
      CREATE TABLE "price_books" (
        "price_book_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "description" text,
        "parent_id" uuid,
        "version" character varying(50) NOT NULL,
        "effective_from" TIMESTAMP WITH TIME ZONE NOT NULL,
        "effective_until" TIMESTAMP WITH TIME ZONE,
        "currency" character varying(3) NOT NULL DEFAULT 'USD',
        "created_by" character varying(255),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_price_books_price_book_id" PRIMARY KEY ("price_book_id"),
        CONSTRAINT "CHK_effective_dates" CHECK (effective_until IS NULL OR effective_from < effective_until),
        CONSTRAINT "FK_price_books_parent" FOREIGN KEY ("parent_id") REFERENCES "price_books"("price_book_id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_price_books_effective" ON "price_books" ("effective_from", "effective_until")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_price_books_current" ON "price_books" ("effective_from") WHERE effective_until IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_price_books_no_overlap" ON "price_books" ("parent_id", "effective_from") WHERE parent_id IS NOT NULL
    `);

    // Create price_rules table
    await queryRunner.query(`
      CREATE TABLE "price_rules" (
        "rule_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "price_book_id" uuid NOT NULL,
        "metric_type" character varying(100) NOT NULL,
        "pricing_model" character varying(20) NOT NULL,
        "tiers" jsonb NOT NULL,
        "unit" character varying(50) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_price_rules_rule_id" PRIMARY KEY ("rule_id"),
        CONSTRAINT "CHK_pricing_model" CHECK (pricing_model IN ('flat', 'tiered', 'volume', 'committed')),
        CONSTRAINT "FK_price_rules_price_book" FOREIGN KEY ("price_book_id") REFERENCES "price_books"("price_book_id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_price_rules_book" ON "price_rules" ("price_book_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_price_rules_metric" ON "price_rules" ("metric_type")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_price_rules_unique" ON "price_rules" ("price_book_id", "metric_type")
    `);

    // Create rated_charges table
    await queryRunner.query(`
      CREATE TABLE "rated_charges" (
        "charge_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customer_id" uuid NOT NULL,
        "aggregation_id" uuid NOT NULL,
        "price_book_id" uuid NOT NULL,
        "price_version" character varying(50) NOT NULL,
        "rule_id" uuid NOT NULL,
        "quantity" numeric(20,6) NOT NULL,
        "unit_price" numeric(12,6) NOT NULL,
        "subtotal" numeric(12,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'USD',
        "calculation_metadata" jsonb NOT NULL,
        "calculated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "rerating_job_id" uuid,
        "supersedes_charge_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_rated_charges_charge_id" PRIMARY KEY ("charge_id"),
        CONSTRAINT "CHK_positive_subtotal" CHECK (subtotal >= 0),
        CONSTRAINT "FK_rated_charges_aggregation" FOREIGN KEY ("aggregation_id") REFERENCES "aggregated_usage"("aggregation_id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_rated_charges_price_book" FOREIGN KEY ("price_book_id") REFERENCES "price_books"("price_book_id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_rated_charges_rule" FOREIGN KEY ("rule_id") REFERENCES "price_rules"("rule_id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_rated_charges_supersedes" FOREIGN KEY ("supersedes_charge_id") REFERENCES "rated_charges"("charge_id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_rated_customer_time" ON "rated_charges" ("customer_id", "calculated_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_rated_aggregation" ON "rated_charges" ("aggregation_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_rated_rerating" ON "rated_charges" ("rerating_job_id") WHERE rerating_job_id IS NOT NULL
    `);

    // Create invoices table
    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "invoice_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "invoice_number" character varying(50) NOT NULL,
        "invoice_type" character varying(20) NOT NULL DEFAULT 'standard',
        "customer_id" uuid NOT NULL,
        "billing_period_start" TIMESTAMP WITH TIME ZONE NOT NULL,
        "billing_period_end" TIMESTAMP WITH TIME ZONE NOT NULL,
        "subtotal" numeric(12,2) NOT NULL,
        "tax" numeric(12,2) NOT NULL DEFAULT 0,
        "credits_applied" numeric(12,2) NOT NULL DEFAULT 0,
        "total" numeric(12,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'USD',
        "status" character varying(20) NOT NULL DEFAULT 'draft',
        "issued_at" TIMESTAMP WITH TIME ZONE,
        "due_at" TIMESTAMP WITH TIME ZONE,
        "paid_at" TIMESTAMP WITH TIME ZONE,
        "reference_invoice_id" uuid,
        "correction_reason" text,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invoices_invoice_id" PRIMARY KEY ("invoice_id"),
        CONSTRAINT "UQ_invoices_invoice_number" UNIQUE ("invoice_number"),
        CONSTRAINT "CHK_billing_period" CHECK (billing_period_start < billing_period_end),
        CONSTRAINT "CHK_invoice_type" CHECK (invoice_type IN ('standard', 'correction', 'credit_memo')),
        CONSTRAINT "CHK_status" CHECK (status IN ('draft', 'issued', 'paid', 'void', 'overdue')),
        CONSTRAINT "FK_invoices_reference" FOREIGN KEY ("reference_invoice_id") REFERENCES "invoices"("invoice_id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_invoices_customer" ON "invoices" ("customer_id", "billing_period_start")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_invoices_status" ON "invoices" ("status", "due_at") WHERE status IN ('issued', 'overdue')
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_invoices_corrections" ON "invoices" ("reference_invoice_id") WHERE invoice_type = 'correction'
    `);

    // Create invoice_line_items table
    await queryRunner.query(`
      CREATE TABLE "invoice_line_items" (
        "line_item_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "invoice_id" uuid NOT NULL,
        "line_number" integer NOT NULL,
        "description" text NOT NULL,
        "metric_type" character varying(100),
        "quantity" numeric(20,6),
        "unit" character varying(50),
        "unit_price" numeric(12,6),
        "amount" numeric(12,2) NOT NULL,
        "charge_ids" uuid[] NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invoice_line_items_line_item_id" PRIMARY KEY ("line_item_id"),
        CONSTRAINT "CHK_line_number" CHECK (line_number > 0),
        CONSTRAINT "FK_invoice_line_items_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("invoice_id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_line_items_invoice" ON "invoice_line_items" ("invoice_id", "line_number")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "invoice_line_items" CASCADE`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "invoices" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rated_charges" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "price_rules" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "price_books" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "aggregated_usage" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "telemetry_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customers" CASCADE`);
  }
}
