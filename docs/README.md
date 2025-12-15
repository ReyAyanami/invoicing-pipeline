# Documentation

Complete documentation for the usage-based metering and invoicing pipeline.

## 🚀 Quick Start

**New to the project?** Choose your path:

- 👋 **First Time Here?** → [Getting Started](GETTING_STARTED.md)
- 🤔 **Why This Approach?** → [Project Philosophy](PROJECT_PHILOSOPHY.md)
- 🏗️ **Architecture Overview?** → [Visual Architecture Guide](ARCHITECTURE_OVERVIEW.md)
- 📚 **Everything?** → [Complete Index](INDEX.md)

---

## 📁 Documentation Structure

### Core Documentation

- **[Getting Started](GETTING_STARTED.md)** - Setup, first API calls, and quick examples
- **[Project Philosophy](PROJECT_PHILOSOPHY.md)** - Why we made these architectural decisions
- **[Architecture Overview](ARCHITECTURE_OVERVIEW.md)** - Visual guide with diagrams and flows
- **[Complete Index](INDEX.md)** - Full documentation map and search

---

### Architecture & Design

#### [architecture/](architecture/) - System Design

Deep dives into system components and patterns:

- **[System Architecture](architecture/SYSTEM_ARCHITECTURE.md)** - Components, data flow, tech stack
- **[Time Semantics](architecture/TIME_SEMANTICS.md)** ⚠️ Critical - Event-time vs processing-time
- **[Rating Engine](architecture/RATING_ENGINE.md)** - Pricing models and calculations
- **[Re-rating & Corrections](architecture/RERATING.md)** - Handling backfills and adjustments
- **[Reconciliation](architecture/RECONCILIATION.md)** - Ledger tie-out and verification

#### [design/](design/) - Implementation Specifications

- **[Data Model](design/DATA_MODEL.md)** - Complete database schema, indexes, constraints

#### [adr/](adr/) - Architecture Decision Records

Why we made key architectural decisions:

- **[ADR-001: Event-Time Semantics](adr/ADR-001-EVENT-TIME-SEMANTICS.md)** - Why event-time over processing-time
- **[ADR-002: Immutable Price Books](adr/ADR-002-IMMUTABLE-PRICE-BOOKS.md)** - Why version-based pricing

---

### Development

#### [development/](development/) - Developer Guides

- **[Testing Guide](development/TESTING.md)** - Unit, integration, E2E test strategies
- **[Testability Analysis](development/TESTABILITY_ANALYSIS.md)** - How documentation enables TDD

---

### API Reference

#### [api/](api/) - Coming Soon

REST API documentation will be added during implementation.

---

## 🎯 Learning Paths

### Beginner Path (2-3 hours)

1. Read [Project Philosophy](PROJECT_PHILOSOPHY.md) (20 min)
2. Work through [Getting Started](GETTING_STARTED.md) (1 hour)
3. Skim [Architecture Overview](ARCHITECTURE_OVERVIEW.md) (30 min)
4. Understand [Time Semantics](architecture/TIME_SEMANTICS.md) (45 min)

**Goal**: Understand why event-time billing is hard and how we tackle it.

---

### Implementation Path (1 week)

1. Study [System Architecture](architecture/SYSTEM_ARCHITECTURE.md) (2 hours)
2. Review [Data Model](design/DATA_MODEL.md) (2 hours)
3. Read all [ADRs](adr/) (1 hour)
4. Study [Rating Engine](architecture/RATING_ENGINE.md) (2 hours)
5. Read [Testing Guide](development/TESTING.md) (1 hour)
6. Implement following the specifications

**Goal**: Build the system using test-driven development.

---

### Deep Dive Path (Advanced)

1. Complete Beginner + Implementation paths
2. Study [Re-rating & Corrections](architecture/RERATING.md) (2 hours)
3. Study [Reconciliation](architecture/RECONCILIATION.md) (2 hours)
4. Review [Testability Analysis](development/TESTABILITY_ANALYSIS.md) (1 hour)
5. Extend the system with new metric types or pricing models

**Goal**: Master the hard problems in usage-based billing.

---

## 🔍 Quick Reference

### By Topic

- **Event-Time Windowing** → [TIME_SEMANTICS.md](architecture/TIME_SEMANTICS.md)
- **Pricing Logic** → [RATING_ENGINE.md](architecture/RATING_ENGINE.md)
- **Fixing Past Invoices** → [RERATING.md](architecture/RERATING.md)
- **Database Schema** → [DATA_MODEL.md](design/DATA_MODEL.md)
- **Testing Strategies** → [TESTING.md](development/TESTING.md)
- **Decision Rationale** → [adr/](adr/)

### By Phase

- **Planning** → [PROJECT_PHILOSOPHY.md](PROJECT_PHILOSOPHY.md), [ADRs](adr/)
- **Design** → [SYSTEM_ARCHITECTURE.md](architecture/SYSTEM_ARCHITECTURE.md), [DATA_MODEL.md](design/DATA_MODEL.md)
- **Implementation** → [TESTING.md](development/TESTING.md), all architecture docs
- **Debugging** → [RECONCILIATION.md](architecture/RECONCILIATION.md), [RERATING.md](architecture/RERATING.md)

---

## 📊 Documentation Status

| Category | Status | Progress |
|----------|--------|----------|
| Core Concepts | ✅ Complete | 100% |
| Architecture | ✅ Complete | 100% |
| Design | ✅ Complete | 100% |
| Development Guides | ✅ Complete | 100% |
| API Reference | 🚧 Pending | 0% (implementation phase) |

**Total**: ~6,400 lines of documentation across 16 files

---

## 🤝 Contributing

Found an issue or want to improve the docs?

1. Check [existing issues](https://github.com/ReyAyanami/invoicing-pipeline/issues)
2. See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines
3. Open a PR with your improvements

---

## 📝 Documentation Principles

This documentation follows these principles:

1. **Examples over explanation** - Show, don't just tell
2. **Trade-offs are explicit** - Every decision documents pros/cons
3. **Testability first** - Specifications enable test-driven development
4. **Visual aids** - Diagrams and code examples throughout
5. **Progressive disclosure** - Start simple, dive deep as needed

---

## ❓ Need Help?

- **Can't find something?** Check [INDEX.md](INDEX.md) for complete navigation
- **Unclear documentation?** Open an issue with specific questions
- **Want to discuss?** Use GitHub Discussions
- **Found a bug?** Check if it's a documentation vs implementation issue

---

**Remember**: This is a learning project. The documentation prioritizes understanding over completeness. Use it to learn the patterns, then apply them to your own billing systems.

Happy coding! 🚀

