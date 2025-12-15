# Type-Safe Database Queries

This guide demonstrates type-safe approaches to database queries in our NestJS/TypeORM application.

## ✅ Recommended: Type-Safe `.find()` Method

**Best for:** Simple to moderate queries with filters, sorting, and relations.

```typescript
import { Repository, Between, MoreThan, LessThan, Like, In } from 'typeorm';

// ✅ GOOD: Type-safe field names
async findChargesForPeriod(
  customerId: string,
  startDate: Date,
  endDate: Date,
): Promise<RatedCharge[]> {
  return this.ratedChargeRepository.find({
    where: {
      customerId,              // ✅ TypeScript checks this exists
      createdAt: Between(startDate, endDate), // ✅ Type-safe operator
    },
    order: { createdAt: 'ASC' }, // ✅ TypeScript checks this exists
  });
}

// ❌ BAD: String literals in query builder (no compile-time checking)
async findChargesForPeriodUnsafe(customerId: string): Promise<RatedCharge[]> {
  return this.repository
    .createQueryBuilder('charge')
    .where('charge.customrId = :id', { id: customerId }) // ❌ Typo! Won't catch until runtime
    .orderBy('charge.cretedAt', 'ASC')  // ❌ Typo! Won't catch until runtime
    .getMany();
}
```

## Type-Safe Operators

TypeORM provides type-safe operators for common conditions:

```typescript
import {
  Between,
  MoreThan,
  MoreThanOrEqual,
  LessThan,
  LessThanOrEqual,
  Equal,
  Like,
  ILike,
  In,
  Not,
  IsNull,
  Raw,
} from 'typeorm';

// Date ranges
where: { createdAt: Between(startDate, endDate) }

// Comparisons
where: { amount: MoreThan(100) }
where: { status: In(['active', 'pending']) }

// Text search
where: { name: Like('%john%') }
where: { email: ILike('%JOHN%') } // Case-insensitive

// Null checks
where: { deletedAt: IsNull() }

// Negation
where: { status: Not('cancelled') }
```

## Multiple Conditions (AND)

```typescript
// Multiple fields = implicit AND
where: {
  customerId: '123',
  status: 'active',
  createdAt: MoreThan(new Date('2024-01-01')),
}
// SQL: WHERE customer_id = '123' AND status = 'active' AND created_at > '2024-01-01'
```

## Multiple Conditions (OR)

For OR conditions, use an array of where objects:

```typescript
// Array = implicit OR
where: [
  { status: 'active', customerId: '123' },
  { status: 'pending', customerId: '123' },
]
// SQL: WHERE (status = 'active' AND customer_id = '123') 
//         OR (status = 'pending' AND customer_id = '123')
```

## Relations (JOINs)

```typescript
// Type-safe relations loading
const invoice = await this.invoiceRepository.findOne({
  where: { invoiceId: id },
  relations: ['lineItems', 'customer'], // ✅ Type-checked relation names
});
```

## Complex Queries: When to Use Query Builder

For **complex queries** (subqueries, complex JOINs, aggregations), query builder is necessary but less type-safe:

```typescript
// When you MUST use query builder, at least parameterize values
const results = await this.repository
  .createQueryBuilder('entity')
  .where('entity.customerId = :customerId', { customerId }) // ✅ Parameterized
  .andWhere('entity.amount > :minAmount', { minAmount })   // ✅ Parameterized
  .leftJoinAndSelect('entity.lineItems', 'items')
  .groupBy('entity.customerId')
  .having('SUM(entity.amount) > :threshold', { threshold: 1000 })
  .getMany();
```

**Risk:** Field names in strings won't be caught at compile time.
**Mitigation:** Write comprehensive integration tests for these queries.

## Migration Strategy

### Before (Unsafe):
```typescript
.createQueryBuilder('charge')
.where('charge.customerId = :id', { id })
.andWhere('charge.createdAt >= :start', { start })
```

### After (Type-Safe):
```typescript
.find({
  where: {
    customerId: id,
    createdAt: MoreThanOrEqual(start),
  },
})
```

## Testing Type Safety

Try intentionally breaking field names to verify type checking:

```typescript
// This SHOULD fail TypeScript compilation:
where: { customerIdTypo: '123' } // ❌ Error: Property 'customerIdTypo' does not exist

// This SHOULD fail TypeScript compilation:
order: { creatdAtTypo: 'ASC' }   // ❌ Error: Property 'creatdAtTypo' does not exist
```

## Summary

| Approach | Type Safety | Complexity | Use For |
|----------|-------------|------------|---------|
| `.find()` with operators | ✅ Full | Low | Simple queries (80% of cases) |
| Query builder with strings | ❌ None | High | Complex queries only |
| Raw SQL | ❌ None | Highest | Migrations only |

**Best Practice:** Use `.find()` with type-safe operators for all simple queries. Reserve query builder for truly complex cases, and write integration tests for those.

