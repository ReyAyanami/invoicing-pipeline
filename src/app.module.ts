import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { KafkaModule } from './kafka/kafka.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { CustomersModule } from './customers/customers.module';
import { PriceBooksModule } from './price-books/price-books.module';
import { AggregationModule } from './aggregation/aggregation.module';
import { RatingModule } from './rating/rating.module';
import { InvoicesModule } from './invoices/invoices.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    KafkaModule,
    HealthModule,
    EventsModule,
    CustomersModule,
    PriceBooksModule,
    AggregationModule,
    RatingModule,
    InvoicesModule,
    AnalyticsModule,
  ],
})
export class AppModule { }
