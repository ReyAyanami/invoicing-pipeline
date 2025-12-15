# Usage-Based Metering & Invoicing Pipeline

A study project exploring cloud-billing style metering, rating, and invoicing with focus on **correctness under correction**.

## 🎯 Project Goals

Build a system that ingests telemetry events, aggregates by event-time windows, applies pricing rules, and produces auditable invoices with complete explainability trails.

### Core Capabilities

1. **Event Ingestion** - Consume high-volume telemetry events from multiple sources
2. **Time-Window Aggregation** - Event-time windowing with late arrival handling
3. **Rating Engine** - Apply immutable price books with effective dating
4. **Invoice Generation** - Produce invoices with line-item explainability
5. **Re-rating & Corrections** - Handle backfills and adjustments deterministically
6. **Reconciliation** - Ledger tie-out and audit trails

### Hard Problems We're Solving

- **Correctness under correction** - Backfills that maintain consistency
- **Event-time vs processing-time** - Proper handling of late/out-of-order events
- **Deterministic calculations** - Same inputs always produce same outputs
- **Immutable price books** - Time-traveling pricing with effective dates
- **Auditability** - Complete trail from raw event → invoice line item
- **Dispute resolution** - Drill-down from charge to source events

## 🏗️ Architecture Principles

This is a **study project** exploring:

- Event-time windowing with watermarks (the hard part of usage billing)
- Late arrival handling and out-of-order events
- Event sourcing for complete audit trails
- Immutable data structures (append-only, never update)
- Idempotent operations (safe retries)
- Stream processing with Kafka

**Not Production Ready** - This prioritizes learning billing semantics over scale.

## 📖 Documentation

**Start here:**

- 👋 **New?** → [Getting Started Guide](docs/GETTING_STARTED.md)
- 🤔 **Why?** → [Project Philosophy](docs/PROJECT_PHILOSOPHY.md)
- 🏗️ **Architecture?** → [Visual Overview](docs/ARCHITECTURE_OVERVIEW.md)
- 📚 **Everything?** → [Complete Index](docs/INDEX.md)

**Core Architecture:**

- [System Architecture](docs/architecture/SYSTEM_ARCHITECTURE.md) - Components and data flow
- [Time Semantics](docs/architecture/TIME_SEMANTICS.md) ⚠️ Critical - Event-time concepts
- [Rating Engine](docs/architecture/RATING_ENGINE.md) - Pricing models
- [Re-rating & Corrections](docs/architecture/RERATING.md) - Handling adjustments
- [Reconciliation](docs/architecture/RECONCILIATION.md) - Verification strategies
- [Data Model](docs/design/DATA_MODEL.md) - Database schema

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start infrastructure (Kafka, PostgreSQL)
npm run env:start

# Run migrations
npm run migration:run

# Start development server
npm run dev
```

## 🧪 Development

```bash
# Run tests
npm test

# Run with coverage
npm run test:cov

# Type checking
npm run type-check

# Lint
npm run lint
```

## 📚 Key Concepts

### Event-Time Windows
Events are windowed by their occurrence time, not arrival time. Late events trigger re-computation.

### Immutable Price Books
Price changes are versioned with effective dates. Historical invoices always reference their exact pricing snapshot.

### Explainability Trails
Every invoice line item traces back to:
- Source telemetry events
- Applied pricing rule version
- Aggregation window
- Calculation formula

### Deterministic Re-rating
Reprocessing the same events with the same price book produces identical results.

## ⚠️ This is a Study Project

**Not for Production Use**

- ❌ Simplified error handling
- ❌ No performance optimization
- ❌ Missing edge cases
- ✅ Focus on learning core concepts
- ✅ Document trade-offs
- ✅ Explore hard problems

## 🤝 Contributing

This is a learning exercise. Questions, suggestions, and better approaches are welcome!

See [CONTRIBUTING.md](CONTRIBUTING.md)

## 📄 License

Unlicensed - use freely for learning.

---

**Inspiration**: This project builds on patterns from systems like AWS Cost Explorer, Stripe Billing, and Zuora - but simplified for learning.
