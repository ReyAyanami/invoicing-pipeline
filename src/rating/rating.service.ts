import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { RatedCharge } from './entities/rated-charge.entity';
import { AggregatedUsage } from '../aggregation/entities/aggregated-usage.entity';
import { PriceBooksService } from '../price-books/price-books.service';
import { RateUsageDto } from './dto/rate-usage.dto';
import { Money, Quantity } from '../common/types';

/**
 * Rating Service
 *
 * Applies pricing rules to aggregated usage to produce rated charges.
 * Implements different pricing models: flat, per_unit, tiered, volume.
 *
 * TODO: Implement tiered pricing logic
 * TODO: Implement volume pricing logic
 * TODO: Add support for custom pricing formulas
 * TODO: Handle proration for partial periods
 */
@Injectable()
export class RatingService {
  private readonly logger = new Logger(RatingService.name);

  constructor(
    @InjectRepository(RatedCharge)
    private readonly ratedChargeRepository: Repository<RatedCharge>,
    @InjectRepository(AggregatedUsage)
    private readonly aggregatedUsageRepository: Repository<AggregatedUsage>,
    private readonly priceBooksService: PriceBooksService,
  ) {}

  /**
   * Rate an aggregated usage record
   */
  async rateUsage(rateUsageDto: RateUsageDto): Promise<RatedCharge> {
    const {
      aggregatedUsageId,
      customerId,
      metricType,
      quantity,
      effectiveDate,
    } = rateUsageDto;

    // Find effective price book for the date
    const priceBook = await this.priceBooksService.findEffectivePriceBook(
      new Date(effectiveDate),
    );

    if (!priceBook) {
      throw new NotFoundException(
        `No price book found for date: ${effectiveDate}`,
      );
    }

    // Find applicable price rule
    const priceRules = await this.priceBooksService.findPriceRulesForBook(
      priceBook.priceBookId,
    );
    const priceRule = priceRules.find((rule) => rule.metricType === metricType);

    if (!priceRule) {
      throw new NotFoundException(
        `No price rule found for metric: ${metricType} in price book: ${priceBook.priceBookId}`,
      );
    }

    // Calculate charge based on pricing model
    const { totalAmount, calculationMetadata } = this.calculateCharge(
      priceRule,
      quantity,
    );

    // For simplicity, use first tier's unit price
    const unitPrice =
      priceRule.tiers.length > 0 ? priceRule.tiers[0].unitPrice : 0;

    // Create rated charge
    const ratedCharge = this.ratedChargeRepository.create({
      customerId,
      aggregationId: aggregatedUsageId,
      priceBookId: priceBook.priceBookId,
      priceVersion: priceBook.version,
      ruleId: priceRule.ruleId,
      quantity: Quantity.from(quantity),
      unitPrice: Money.fromPrecision(unitPrice, 6),
      subtotal: totalAmount, // Already Money type from calculateCharge
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      calculationMetadata: calculationMetadata as any,
      calculatedAt: new Date(),
    });

    const saved = await this.ratedChargeRepository.save(ratedCharge);

    this.logger.log(
      `Rated usage ${aggregatedUsageId}: ${quantity} ${metricType} = $${totalAmount}`,
    );

    return saved;
  }

  /**
   * Calculate charge based on pricing model
   */
  private calculateCharge(
    priceRule: { pricingModel: string; tiers: Array<{ unitPrice: number }> },
    quantity: number,
  ): { totalAmount: Money; calculationMetadata: Record<string, any> } {
    const { pricingModel, tiers } = priceRule;
    const unitPrice = tiers.length > 0 ? tiers[0].unitPrice : 0;

    switch (pricingModel) {
      case 'flat':
        return this.calculateFlat(unitPrice);

      case 'tiered':
        // TODO: Implement tiered pricing
        this.logger.warn(
          'Tiered pricing not yet implemented, using simple calc',
        );
        return this.calculatePerUnit(unitPrice, quantity);

      case 'volume':
        // TODO: Implement volume pricing
        this.logger.warn(
          'Volume pricing not yet implemented, using simple calc',
        );
        return this.calculatePerUnit(unitPrice, quantity);

      case 'committed':
        // TODO: Implement committed pricing
        this.logger.warn(
          'Committed pricing not yet implemented, using simple calc',
        );
        return this.calculatePerUnit(unitPrice, quantity);

      default:
        throw new Error(`Unknown pricing model: ${pricingModel}`);
    }
  }

  private calculateFlat(unitPrice: number): {
    totalAmount: Money;
    calculationMetadata: Record<string, any>;
  } {
    return {
      totalAmount: Money.from(unitPrice),
      calculationMetadata: {
        model: 'flat',
        unitPrice: unitPrice.toString(),
      },
    };
  }

  private calculatePerUnit(
    unitPrice: number,
    quantity: number,
  ): { totalAmount: Money; calculationMetadata: Record<string, any> } {
    const priceAsMoney = Money.from(unitPrice);
    const totalAmount = Money.multiply(priceAsMoney, quantity);

    return {
      totalAmount,
      calculationMetadata: {
        model: 'per_unit',
        unitPrice: unitPrice.toString(),
        quantity: quantity.toString(),
        calculation: `${unitPrice} × ${quantity} = ${totalAmount}`,
      },
    };
  }

  /**
   * Find all rated charges for a customer in a date range
   */
  async findChargesForPeriod(
    customerId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<RatedCharge[]> {
    return this.ratedChargeRepository.find({
      where: {
        customerId,
        createdAt: Between(startDate, endDate),
      },
      order: { createdAt: 'ASC' },
    });
  }
}
