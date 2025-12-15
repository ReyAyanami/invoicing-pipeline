import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RatingService } from './rating.service';
import { RatedCharge } from './entities/rated-charge.entity';
import { AggregatedUsage } from '../aggregation/entities/aggregated-usage.entity';
import { PriceBooksModule } from '../price-books/price-books.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RatedCharge, AggregatedUsage]),
    PriceBooksModule,
  ],
  providers: [RatingService],
  exports: [RatingService],
})
export class RatingModule {}
