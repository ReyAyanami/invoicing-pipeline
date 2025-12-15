# Documentation Index

Complete guide to the usage-based metering and invoicing pipeline.

## 📊 Documentation Statistics

- **Total Documents**: 17 markdown files
- **Total Lines**: ~6,400 lines of documentation
- **Topics Covered**: Architecture, Design, Implementation, Testing, Patterns
- **Status**: Core documentation complete, API reference pending implementation

---

## 🎯 Start Here

**New to the project?**

1. [README](../README.md) - Project overview
2. [Project Philosophy](PROJECT_PHILOSOPHY.md) - Why these decisions?
3. [Architecture Overview](ARCHITECTURE_OVERVIEW.md) - Visual guide with diagrams
4. [Getting Started](GETTING_STARTED.md) - Run the system

---

## 🏗️ Architecture

Core system design and technical decisions.

### High-Level Architecture
- [**System Architecture**](architecture/SYSTEM_ARCHITECTURE.md) - Components and data flow
- [**Time Semantics**](architecture/TIME_SEMANTICS.md) - Event-time vs processing-time
- [**Rating Engine**](architecture/RATING_ENGINE.md) - Pricing and calculation logic
- [**Re-rating & Corrections**](architecture/RERATING.md) - Handling backfills
- [**Reconciliation**](architecture/RECONCILIATION.md) - Ledger tie-out and verification

### Architecture Decision Records (ADRs)
- [ADR-001: Event-Time Semantics](adr/ADR-001-EVENT-TIME-SEMANTICS.md)
- [ADR-002: Immutable Price Books](adr/ADR-002-IMMUTABLE-PRICE-BOOKS.md)

---

## 📊 Design

Data models and detailed specifications.

- [**Data Model**](design/DATA_MODEL.md) - Database schema and relationships
- [**Event Schemas**](design/EVENT_SCHEMAS.md) *(TODO)* - Telemetry event formats
- [**API Contracts**](design/API_CONTRACTS.md) *(TODO)* - REST API specifications

---

## 🌐 API Reference

Documentation for REST API error handling and specifications.

- [**Error Codes & Handling**](api/ERROR_CODES.md) - HTTP status codes, retry strategies
- REST API Overview *(TODO)*
- Event Ingestion Endpoints *(TODO)*
- Query Endpoints *(TODO)*
- Invoice Generation *(TODO)*
- Re-rating Operations *(TODO)*
- Explainability APIs *(TODO)*

---

## 🛠️ Development

Guides for working with the codebase.

- [**Getting Started**](GETTING_STARTED.md) - Setup and first steps
- [**Testing Guide**](development/TESTING.md) - Unit, integration, E2E test strategies
- [**Testability Analysis**](development/TESTABILITY_ANALYSIS.md) - How docs enable TDD
- [**Performance Testing**](development/PERFORMANCE.md) - Load testing, concurrency scenarios
- [**Development Workflow**](development/WORKFLOW.md) *(TODO)* - Day-to-day development
- [**Debugging**](development/DEBUGGING.md) *(TODO)* - Troubleshooting techniques

---

## 📚 Concepts

Deep dives into specific topics.

### Stream Processing
- Event-time windowing
- Watermarks and late data
- State management
- Exactly-once semantics

### Billing Systems
- Double-entry bookkeeping *(TODO)*
- Revenue recognition *(TODO)*
- Tiered vs volume pricing
- Committed use discounts *(TODO)*

### Data Engineering
- Partitioning strategies
- Event sourcing patterns
- Stream processing pipelines
- Idempotency guarantees

---

## 🧪 Testing

Comprehensive testing strategy and patterns.

- [**Testing Guide**](development/TESTING.md) - Complete test suite organization
- [**Testability Analysis**](development/TESTABILITY_ANALYSIS.md) - Documentation assessment
- Unit Testing Patterns (see Testing Guide)
- Integration Test Setup (see Testing Guide)
- E2E Test Scenarios (see Testing Guide)
- Property-Based Testing (see Testing Guide)

---

## 🚀 Deployment

*(Out of scope for v1 - study project)*

- Infrastructure Setup
- Configuration Management
- Monitoring & Observability
- Backup & Recovery

---

## 📖 Reference

### External Resources

**Stream Processing**
- [Streaming 101](https://www.oreilly.com/radar/the-world-beyond-batch-streaming-101/) - Tyler Akidau
- [Streaming 102](https://www.oreilly.com/radar/the-world-beyond-batch-streaming-102/) - Watermarks
- [Designing Data-Intensive Applications](https://dataintensive.net/) - Martin Kleppmann

**Billing Systems**
- [Stripe Billing Docs](https://stripe.com/docs/billing)
- [AWS Cost & Usage Report](https://aws.amazon.com/aws-cost-management/aws-cost-and-usage-reporting/)
- [Zuora Documentation](https://www.zuora.com/developer/)

**Event Sourcing & Streaming**
- [Event Sourcing - Greg Young](https://www.eventstore.com/blog/what-is-event-sourcing)
- [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) - Martin Fowler

**Technologies**
- [NestJS Documentation](https://docs.nestjs.com)
- [TypeORM Guide](https://typeorm.io)
- [Kafka Streams](https://kafka.apache.org/documentation/streams/)

---

## 🤝 Contributing

- [**Contributing Guide**](../CONTRIBUTING.md) - How to contribute
- [**Code of Conduct**](../CODE_OF_CONDUCT.md) *(TODO)* - Community guidelines

---

## 📋 Checklists

### Implementation Checklist

- [ ] Event ingestion endpoint
- [ ] Kafka topic setup
- [ ] Metering engine (windowing)
- [ ] Watermark management
- [ ] Price book CRUD
- [ ] Rating engine
- [ ] Invoice generation
- [ ] Re-rating workflow
- [ ] Reconciliation reports
- [ ] Explainability API
- [ ] E2E tests

### Documentation Checklist

- [x] README
- [x] Project Philosophy
- [x] Getting Started
- [x] System Architecture
- [x] Time Semantics
- [x] Rating Engine
- [x] Re-rating & Corrections
- [x] Reconciliation
- [x] Data Model
- [x] ADR-001: Event-Time
- [x] ADR-002: Price Books
- [ ] Event Schemas
- [ ] API Reference
- [ ] Testing Guide
- [ ] Workflow Guide

---

## 🗺️ Learning Path

### Beginner Track

1. Read [Project Philosophy](PROJECT_PHILOSOPHY.md)
2. Run [Getting Started](GETTING_STARTED.md)
3. Send test events and trace to invoice
4. Understand [Time Semantics](architecture/TIME_SEMANTICS.md)

### Intermediate Track

1. Study [System Architecture](architecture/SYSTEM_ARCHITECTURE.md)
2. Explore [Rating Engine](architecture/RATING_ENGINE.md)
3. Implement tiered pricing
4. Test late event handling

### Advanced Track

1. Deep dive into [Re-rating](architecture/RERATING.md)
2. Implement correction workflow
3. Study [Reconciliation](architecture/RECONCILIATION.md)
4. Build audit trail queries
5. Extend with new metric types

---

## 📝 Document Status

| Document | Status | Last Updated |
|----------|--------|--------------|
| README | ✅ Complete | 2024-12-15 |
| Project Philosophy | ✅ Complete | 2024-12-15 |
| Architecture Overview | ✅ Complete | 2024-12-15 |
| Getting Started | ✅ Complete | 2024-12-15 |
| System Architecture | ✅ Complete | 2024-12-15 |
| Time Semantics | ✅ Complete | 2024-12-15 |
| Rating Engine | ✅ Complete | 2024-12-15 |
| Re-rating | ✅ Complete | 2024-12-15 |
| Reconciliation | ✅ Complete | 2024-12-15 |
| Data Model | ✅ Complete | 2024-12-15 |
| Testing Guide | ✅ Complete | 2024-12-15 |
| Testability Analysis | ✅ Complete | 2024-12-15 |
| Performance Testing | ✅ Complete | 2024-12-15 |
| Error Codes | ✅ Complete | 2024-12-15 |
| ADR-001 | ✅ Complete | 2024-12-15 |
| ADR-002 | ✅ Complete | 2024-12-15 |
| API Reference | 🚧 TODO | - |
| Workflow Guide | 🚧 TODO | - |

---

## 🔍 Quick Search

**Looking for...**

- **Event-time handling?** → [Time Semantics](architecture/TIME_SEMANTICS.md)
- **Pricing logic?** → [Rating Engine](architecture/RATING_ENGINE.md)
- **Fixing past invoices?** → [Re-rating](architecture/RERATING.md)
- **Database schema?** → [Data Model](design/DATA_MODEL.md)
- **Setup instructions?** → [Getting Started](GETTING_STARTED.md)
- **Why decisions made?** → [Project Philosophy](PROJECT_PHILOSOPHY.md) + [ADRs](adr/)
- **Verification?** → [Reconciliation](architecture/RECONCILIATION.md)

---

**Questions not answered here?**

1. Search existing [GitHub issues](https://github.com/[your-username]/invoicing-pipeline/issues)
2. Check [GitHub discussions](https://github.com/[your-username]/invoicing-pipeline/discussions)
3. Open new issue with specific question

---

*This is a living document. As the project evolves, this index will be updated to reflect new documentation and learnings.*

