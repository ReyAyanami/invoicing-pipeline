import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceBooksService } from './price-books.service';
import { PriceBooksController } from './price-books.controller';
import { PriceBook } from './entities/price-book.entity';
import { PriceRule } from './entities/price-rule.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PriceBook, PriceRule])],
  controllers: [PriceBooksController],
  providers: [PriceBooksService],
  exports: [PriceBooksService],
})
export class PriceBooksModule {}
