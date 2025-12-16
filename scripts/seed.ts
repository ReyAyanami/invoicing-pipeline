/**
 * Seed Script
 *
 * Populates database with sample data for development and testing:
 * - Sample customers
 * - Price books with multiple pricing models
 * - Price rules for common metric types
 *
 * Run with: npm run seed
 */

import { DataSource } from 'typeorm';
import { Customer } from '../src/customers/entities/customer.entity';
import { PriceBook } from '../src/price-books/entities/price-book.entity';
import {
  PriceRule,
  PriceTier,
} from '../src/price-books/entities/price-rule.entity';

// Import data source configuration
const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'billing',
  password: process.env.DB_PASSWORD || 'billing',
  database: process.env.DB_NAME || 'billing_db',
  entities: [__dirname + '/../src/**/*.entity{.ts,.js}'],
  synchronize: false,
});

/**
 * Sample customers
 */
const customers: Array<Partial<Customer>> = [
  {
    customerId: 'demo-customer-001',
    externalId: 'ext-demo-001',
    name: 'Acme Corporation',
    email: 'billing@acme.com',
    billingCurrency: 'USD',
    billingCycle: 'monthly',
    status: 'active' as const,
  },
  {
    customerId: 'demo-customer-002',
    externalId: 'ext-demo-002',
    name: 'TechStart Inc.',
    email: 'finance@techstart.io',
    billingCurrency: 'USD',
    billingCycle: 'monthly',
    status: 'active' as const,
  },
  {
    customerId: 'demo-customer-003',
    externalId: 'ext-demo-003',
    name: 'Enterprise Solutions Ltd',
    email: 'accounts@enterprise.com',
    billingCurrency: 'USD',
    billingCycle: 'quarterly',
    status: 'active' as const,
  },
];

/**
 * Price books with different pricing strategies
 */
async function createPriceBooks(ds: DataSource): Promise<void> {
  const priceBookRepo = ds.getRepository(PriceBook);
  const priceRuleRepo = ds.getRepository(PriceRule);

  console.log('\n📚 Creating price books...');

  // Price Book 1: Standard Pricing (Flat rates)
  let standardPriceBook = await priceBookRepo.findOne({
    where: { name: 'Standard Pricing v1' },
  });

  if (!standardPriceBook) {
    standardPriceBook = priceBookRepo.create({
      priceBookId: 'pb-standard-v1',
      name: 'Standard Pricing v1',
      description: 'Flat rate pricing for all customers',
      version: 'v1',
      effectiveFrom: new Date('2024-01-01T00:00:00Z'),
      effectiveUntil: null, // Currently active
      currency: 'USD',
      createdBy: 'seed-script',
    });
    await priceBookRepo.save(standardPriceBook);
    console.log('  ✅ Created: Standard Pricing v1');

    // Rules for standard pricing
    const standardRules: Array<Partial<PriceRule>> = [
      {
        ruleId: 'rule-std-api-calls',
        priceBookId: standardPriceBook.priceBookId,
        metricType: 'api_call',
        pricingModel: 'flat',
        tiers: [{ tier: 1, upTo: null, unitPrice: 0.02, flatFee: 0 }],
        unit: 'count',
      },
      {
        ruleId: 'rule-std-storage',
        priceBookId: standardPriceBook.priceBookId,
        metricType: 'storage_gb_hours',
        pricingModel: 'flat',
        tiers: [{ tier: 1, upTo: null, unitPrice: 0.1, flatFee: 0 }],
        unit: 'gb_hours',
      },
      {
        ruleId: 'rule-std-compute',
        priceBookId: standardPriceBook.priceBookId,
        metricType: 'compute_hours',
        pricingModel: 'flat',
        tiers: [{ tier: 1, upTo: null, unitPrice: 0.5, flatFee: 0 }],
        unit: 'hours',
      },
    ];

    for (const rule of standardRules) {
      await priceRuleRepo.save(priceRuleRepo.create(rule));
    }
    console.log('  ✅ Created 3 pricing rules (flat rates)');
  } else {
    console.log('  ⏭️  Standard Pricing v1 already exists');
  }

  // Price Book 2: Volume Pricing (Tiered discounts)
  let volumePriceBook = await priceBookRepo.findOne({
    where: { name: 'Volume Pricing v1' },
  });

  if (!volumePriceBook) {
    volumePriceBook = priceBookRepo.create({
      priceBookId: 'pb-volume-v1',
      name: 'Volume Pricing v1',
      description: 'Tiered pricing with volume discounts',
      version: 'v1',
      effectiveFrom: new Date('2024-01-01T00:00:00Z'),
      effectiveUntil: null,
      currency: 'USD',
      createdBy: 'seed-script',
    });
    await priceBookRepo.save(volumePriceBook);
    console.log('  ✅ Created: Volume Pricing v1');

    // Rules for volume pricing (tiered)
    const volumeRules: Array<Partial<PriceRule>> = [
      {
        ruleId: 'rule-vol-api-calls',
        priceBookId: volumePriceBook.priceBookId,
        metricType: 'api_call',
        pricingModel: 'tiered',
        tiers: [
          { tier: 1, upTo: 1000, unitPrice: 0.02, flatFee: 0 }, // First 1K
          { tier: 2, upTo: 10000, unitPrice: 0.015, flatFee: 0 }, // Next 9K
          { tier: 3, upTo: 100000, unitPrice: 0.01, flatFee: 0 }, // Next 90K
          { tier: 4, upTo: null, unitPrice: 0.005, flatFee: 0 }, // Beyond 100K
        ] as PriceTier[],
        unit: 'count',
      },
      {
        ruleId: 'rule-vol-storage',
        priceBookId: volumePriceBook.priceBookId,
        metricType: 'storage_gb_hours',
        pricingModel: 'tiered',
        tiers: [
          { tier: 1, upTo: 1000, unitPrice: 0.1, flatFee: 0 }, // First 1K GB-hrs
          { tier: 2, upTo: 10000, unitPrice: 0.08, flatFee: 0 }, // Next 9K
          { tier: 3, upTo: null, unitPrice: 0.05, flatFee: 0 }, // Beyond 10K
        ] as PriceTier[],
        unit: 'gb_hours',
      },
      {
        ruleId: 'rule-vol-compute',
        priceBookId: volumePriceBook.priceBookId,
        metricType: 'compute_hours',
        pricingModel: 'tiered',
        tiers: [
          { tier: 1, upTo: 100, unitPrice: 0.5, flatFee: 0 }, // First 100 hrs
          { tier: 2, upTo: 1000, unitPrice: 0.4, flatFee: 0 }, // Next 900 hrs
          { tier: 3, upTo: null, unitPrice: 0.3, flatFee: 0 }, // Beyond 1K
        ] as PriceTier[],
        unit: 'hours',
      },
    ];

    for (const rule of volumeRules) {
      await priceRuleRepo.save(priceRuleRepo.create(rule));
    }
    console.log('  ✅ Created 3 pricing rules (tiered)');
  } else {
    console.log('  ⏭️  Volume Pricing v1 already exists');
  }

  // Price Book 3: Enterprise Pricing (Lower flat rates)
  let enterprisePriceBook = await priceBookRepo.findOne({
    where: { name: 'Enterprise Pricing v1' },
  });

  if (!enterprisePriceBook) {
    enterprisePriceBook = priceBookRepo.create({
      priceBookId: 'pb-enterprise-v1',
      name: 'Enterprise Pricing v1',
      description: 'Discounted rates for enterprise customers',
      version: 'v1',
      effectiveFrom: new Date('2024-01-01T00:00:00Z'),
      effectiveUntil: null,
      currency: 'USD',
      createdBy: 'seed-script',
    });
    await priceBookRepo.save(enterprisePriceBook);
    console.log('  ✅ Created: Enterprise Pricing v1');

    // Rules for enterprise pricing
    const enterpriseRules: Array<Partial<PriceRule>> = [
      {
        ruleId: 'rule-ent-api-calls',
        priceBookId: enterprisePriceBook.priceBookId,
        metricType: 'api_call',
        pricingModel: 'flat',
        tiers: [{ tier: 1, upTo: null, unitPrice: 0.01, flatFee: 0 }],
        unit: 'count',
      },
      {
        ruleId: 'rule-ent-storage',
        priceBookId: enterprisePriceBook.priceBookId,
        metricType: 'storage_gb_hours',
        pricingModel: 'flat',
        tiers: [{ tier: 1, upTo: null, unitPrice: 0.06, flatFee: 0 }],
        unit: 'gb_hours',
      },
      {
        ruleId: 'rule-ent-compute',
        priceBookId: enterprisePriceBook.priceBookId,
        metricType: 'compute_hours',
        pricingModel: 'flat',
        tiers: [{ tier: 1, upTo: null, unitPrice: 0.35, flatFee: 0 }],
        unit: 'hours',
      },
    ];

    for (const rule of enterpriseRules) {
      await priceRuleRepo.save(priceRuleRepo.create(rule));
    }
    console.log('  ✅ Created 3 pricing rules (enterprise rates)');
  } else {
    console.log('  ⏭️  Enterprise Pricing v1 already exists');
  }
}

/**
 * Create sample customers
 */
async function createCustomers(ds: DataSource): Promise<void> {
  const customerRepo = ds.getRepository(Customer);

  console.log('\n👥 Creating customers...');

  for (const customerData of customers) {
    const existing = await customerRepo.findOne({
      where: { customerId: customerData.customerId },
    });

    if (!existing) {
      await customerRepo.save(customerRepo.create(customerData));
      console.log(
        `  ✅ Created: ${customerData.name} (${customerData.customerId})`,
      );
    } else {
      console.log(`  ⏭️  ${customerData.name} already exists`);
    }
  }
}

/**
 * Display summary
 */
async function displaySummary(ds: DataSource): Promise<void> {
  const customerRepo = ds.getRepository(Customer);
  const priceBookRepo = ds.getRepository(PriceBook);
  const priceRuleRepo = ds.getRepository(PriceRule);

  const customerCount = await customerRepo.count();
  const priceBookCount = await priceBookRepo.count();
  const priceRuleCount = await priceRuleRepo.count();

  console.log('\n📊 Database Summary:');
  console.log(`  Customers: ${customerCount}`);
  console.log(`  Price Books: ${priceBookCount}`);
  console.log(`  Price Rules: ${priceRuleCount}`);

  console.log('\n💰 Price Books Available:');
  const priceBooks = await priceBookRepo.find();
  for (const pb of priceBooks) {
    const rulesCount = await priceRuleRepo.count({
      where: { priceBookId: pb.priceBookId },
    });
    console.log(`  - ${pb.name}: ${rulesCount} rules (${pb.currency})`);
  }

  console.log('\n📋 Sample Queries:');
  console.log('  # View customers:');
  console.log("  SELECT * FROM customers WHERE status = 'active';");
  console.log('\n  # View price books:');
  console.log(
    '  SELECT price_book_id, name, version, effective_from FROM price_books;',
  );
  console.log('\n  # View pricing rules:');
  console.log('  SELECT pb.name, pr.metric_type, pr.pricing_model, pr.unit');
  console.log('  FROM price_rules pr');
  console.log('  JOIN price_books pb ON pr.price_book_id = pb.price_book_id;');

  console.log('\n🎯 Next Steps:');
  console.log('  1. Start the application: npm run dev');
  console.log('  2. Send test events: npm run demo:windowing');
  console.log('  3. Wait 5-10 minutes for windows to finalize');
  console.log('  4. Check aggregated_usage table for results');
}

/**
 * Main seed function
 */
async function seed() {
  console.log('🌱 Seeding database...\n');

  try {
    // Initialize data source
    await dataSource.initialize();
    console.log('✅ Connected to database');

    // Seed data
    await createCustomers(dataSource);
    await createPriceBooks(dataSource);

    // Display summary
    await displaySummary(dataSource);

    console.log('\n✅ Seeding complete!\n');
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

// Run seed
seed().catch(console.error);
