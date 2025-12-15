import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AggregationService } from './aggregation.service';
import { AggregatedUsage } from './entities/aggregated-usage.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AggregatedUsage]), ConfigModule],
  providers: [AggregationService],
  exports: [AggregationService],
})
export class AggregationModule {}
