# Source Code Structure

This document describes the organization of the source code.

## Directory Structure

```
src/
├── common/              # Shared utilities and infrastructure
│   ├── filters/         # Exception filters
│   ├── guards/          # Auth guards, validation guards
│   ├── interceptors/    # Request/response interceptors
│   ├── pipes/           # Custom pipes
│   └── decorators/      # Custom decorators
│
├── config/              # Configuration files and utilities
│
├── database/            # Database layer
│   ├── entities/        # TypeORM entities
│   ├── migrations/      # Database migrations
│   └── database.module.ts
│
├── health/              # Health check module
│   ├── health.controller.ts
│   ├── health.service.ts
│   ├── health.service.spec.ts
│   └── health.module.ts
│
├── events/              # Event ingestion module
│   ├── dto/             # Data transfer objects
│   ├── events.controller.ts
│   ├── events.service.ts
│   ├── events.service.spec.ts
│   └── events.module.ts
│
├── metering/            # Future: Metering engine
├── rating/              # Future: Rating engine
├── invoicing/           # Future: Invoice generation
│
├── app.module.ts        # Root application module
└── main.ts              # Application entry point
```

## Module Organization

Each feature module follows this structure:

```
module-name/
├── dto/                 # Data transfer objects (input/output)
├── interfaces/          # TypeScript interfaces (if needed)
├── module-name.controller.ts
├── module-name.service.ts
├── module-name.module.ts
├── module-name.controller.spec.ts
├── module-name.service.spec.ts
└── ...other files
```

## Testing Structure

```
test/
├── e2e/                 # End-to-end tests
│   ├── health.e2e-spec.ts
│   └── events.e2e-spec.ts
│
├── integration/         # Integration tests
│   └── ...
│
└── jest-e2e.json       # E2E test configuration
```

**Unit tests** (`.spec.ts`) are colocated with source files.

## Design Principles

### 1. Separation of Concerns
- Each module handles a specific domain
- Controllers handle HTTP layer
- Services contain business logic
- Entities define data models

### 2. Dependency Injection
- Use NestJS DI container
- Inject dependencies via constructors
- Make modules self-contained

### 3. Testing
- Unit tests alongside source files
- E2E tests in test/e2e/
- Integration tests in test/integration/
- Mock external dependencies

### 4. Type Safety
- Strict TypeScript mode enabled
- DTOs for all external data
- Interfaces for internal contracts

## Common Patterns

### DTOs (Data Transfer Objects)
```typescript
// events/dto/create-event.dto.ts
export class CreateEventDto {
  @IsUUID()
  event_id: string;
  
  @IsString()
  event_type: string;
  // ...
}
```

### Services
```typescript
// events/events.service.ts
@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(TelemetryEvent)
    private readonly repository: Repository<TelemetryEvent>,
  ) {}
  
  async ingest(dto: CreateEventDto) {
    // Business logic
  }
}
```

### Controllers
```typescript
// events/events.controller.ts
@Controller('events')
export class EventsController {
  constructor(private readonly service: EventsService) {}
  
  @Post()
  async create(@Body() dto: CreateEventDto) {
    return this.service.ingest(dto);
  }
}
```

### Modules
```typescript
// events/events.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([TelemetryEvent])],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
```

## Naming Conventions

- **Files**: kebab-case (e.g., `events.service.ts`)
- **Classes**: PascalCase (e.g., `EventsService`)
- **Variables**: camelCase (e.g., `eventId`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`)
- **Interfaces**: PascalCase with 'I' prefix (e.g., `IEventMetadata`)

## Import Order

1. Node.js built-ins
2. External dependencies
3. NestJS imports
4. Internal absolute imports (using @/)
5. Relative imports

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelemetryEvent } from '../database/entities/telemetry-event.entity';
import { CreateEventDto } from './dto/create-event.dto';
```

## Future Modules

### Metering Engine
Will handle:
- Event windowing
- Aggregation logic
- Watermark tracking
- Late arrival handling

### Rating Engine
Will handle:
- Price book lookups
- Tiered pricing calculations
- Charge generation
- Explainability metadata

### Invoicing
Will handle:
- Invoice generation
- Line item grouping
- PDF/JSON formatting
- Status management

## Documentation

- Each module should have clear purpose
- Complex logic should have inline comments
- Public APIs documented with JSDoc
- Architecture decisions in docs/adr/

