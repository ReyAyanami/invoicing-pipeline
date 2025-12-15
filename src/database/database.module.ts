import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  Customer,
  TelemetryEvent,
  AggregatedUsage,
  PriceBook,
  PriceRule,
  RatedCharge,
  Invoice,
  InvoiceLineItem,
} from '../entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST', 'localhost'),
        port: configService.get('DATABASE_PORT', 5432),
        username: configService.get('DATABASE_USER', 'billing'),
        password: configService.get(
          'DATABASE_PASSWORD',
          'billing_dev_password',
        ),
        database: configService.get('DATABASE_NAME', 'billing_db'),
        entities: [
          Customer,
          TelemetryEvent,
          AggregatedUsage,
          PriceBook,
          PriceRule,
          RatedCharge,
          Invoice,
          InvoiceLineItem,
        ],
        synchronize: configService.get('NODE_ENV') !== 'production',
        logging: configService.get('DATABASE_LOGGING', false),
        extra: {
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
