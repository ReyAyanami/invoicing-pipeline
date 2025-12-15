import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceBook } from './entities/price-book.entity';
import { PriceRule } from './entities/price-rule.entity';
import { CreatePriceBookDto } from './dto/create-price-book.dto';
import { CreatePriceRuleDto } from './dto/create-price-rule.dto';

@Injectable()
export class PriceBooksService {
  constructor(
    @InjectRepository(PriceBook)
    private readonly priceBookRepository: Repository<PriceBook>,
    @InjectRepository(PriceRule)
    private readonly priceRuleRepository: Repository<PriceRule>,
  ) {}

  // Price Books
  async createPriceBook(
    createPriceBookDto: CreatePriceBookDto,
  ): Promise<PriceBook> {
    const priceBook = this.priceBookRepository.create(createPriceBookDto);
    return this.priceBookRepository.save(priceBook);
  }

  async findAllPriceBooks(): Promise<PriceBook[]> {
    return this.priceBookRepository.find({
      order: { effectiveFrom: 'DESC' },
    });
  }

  async findPriceBook(id: string): Promise<PriceBook> {
    const priceBook = await this.priceBookRepository.findOne({
      where: { priceBookId: id },
    });

    if (!priceBook) {
      throw new NotFoundException(`Price book with ID ${id} not found`);
    }

    return priceBook;
  }

  /**
   * Find the effective price book for a given date
   * Returns the most recent price book where effective_from <= targetDate
   */
  async findEffectivePriceBook(targetDate: Date): Promise<PriceBook | null> {
    return this.priceBookRepository
      .createQueryBuilder('price_book')
      .where('price_book.effectiveFrom <= :targetDate', { targetDate })
      .andWhere(
        '(price_book.effectiveUntil IS NULL OR price_book.effectiveUntil > :targetDate)',
        { targetDate },
      )
      .orderBy('price_book.effectiveFrom', 'DESC')
      .limit(1)
      .getOne();
  }

  // Price Rules
  async createPriceRule(
    createPriceRuleDto: CreatePriceRuleDto,
  ): Promise<PriceRule> {
    // Verify price book exists
    await this.findPriceBook(createPriceRuleDto.priceBookId);

    const priceRule = this.priceRuleRepository.create(createPriceRuleDto);
    return this.priceRuleRepository.save(priceRule);
  }

  async findPriceRulesForBook(priceBookId: string): Promise<PriceRule[]> {
    return this.priceRuleRepository.find({
      where: { priceBookId },
    });
  }

  async findPriceRule(id: string): Promise<PriceRule> {
    const priceRule = await this.priceRuleRepository.findOne({
      where: { ruleId: id },
    });

    if (!priceRule) {
      throw new NotFoundException(`Price rule with ID ${id} not found`);
    }

    return priceRule;
  }
}
