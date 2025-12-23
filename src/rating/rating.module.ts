import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RatingService } from './rating.service';
import { RatedCharge } from './entities/rated-charge.entity';
import { AggregatedUsage } from '../aggregation/entities/aggregated-usage.entity';
import { PriceBooksModule } from '../price-books/price-books.module';
import { KafkaModule } from '../kafka/kafka.module';
import { ReRatingService } from './re-rating.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RatedCharge, AggregatedUsage]),
    PriceBooksModule,
    KafkaModule,
  ],
  providers: [RatingService, ReRatingService],
  exports: [RatingService],
})
export class RatingModule { }
