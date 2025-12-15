import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { PriceBooksService } from './price-books.service';
import { CreatePriceBookDto } from './dto/create-price-book.dto';
import { CreatePriceRuleDto } from './dto/create-price-rule.dto';

@Controller('api/v1/price-books')
export class PriceBooksController {
  constructor(private readonly priceBooksService: PriceBooksService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createPriceBook(@Body() createPriceBookDto: CreatePriceBookDto) {
    return this.priceBooksService.createPriceBook(createPriceBookDto);
  }

  @Get()
  findAllPriceBooks() {
    return this.priceBooksService.findAllPriceBooks();
  }

  @Get('effective')
  async findEffectivePriceBook(@Query('date') date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    return this.priceBooksService.findEffectivePriceBook(targetDate);
  }

  @Get(':id')
  findPriceBook(@Param('id') id: string) {
    return this.priceBooksService.findPriceBook(id);
  }

  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  createPriceRule(@Body() createPriceRuleDto: CreatePriceRuleDto) {
    return this.priceBooksService.createPriceRule(createPriceRuleDto);
  }

  @Get(':priceBookId/rules')
  findPriceRulesForBook(@Param('priceBookId') priceBookId: string) {
    return this.priceBooksService.findPriceRulesForBook(priceBookId);
  }
}
