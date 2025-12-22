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
      new Date(effectiveDate),
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
    priceRule: {
      pricingModel: string;
      tiers: Array<{ upTo: number | null; unitPrice: number; flatFee?: number }>;
    },
    quantity: number,
    effectiveDate: Date,
  ): { totalAmount: Money; calculationMetadata: Record<string, any> } {
    const { pricingModel, tiers } = priceRule;

    switch (pricingModel) {
      case 'flat':
        return this.calculateFlat(
          tiers.length > 0 ? tiers[0].unitPrice : 0,
          effectiveDate,
        );

      case 'per_unit':
        return this.calculatePerUnit(
          tiers.length > 0 ? tiers[0].unitPrice : 0,
          quantity,
          effectiveDate,
        );

      case 'tiered':
        return this.calculateTiered(tiers, quantity, effectiveDate);

      case 'volume':
        return this.calculateVolume(tiers, quantity, effectiveDate);

      case 'committed':
        // TODO: Implement committed pricing
        this.logger.warn(
          'Committed pricing not yet implemented, using simple calc',
        );
        return this.calculatePerUnit(
          tiers.length > 0 ? tiers[0].unitPrice : 0,
          quantity,
          effectiveDate,
        );

      default:
        throw new Error(`Unknown pricing model: ${pricingModel}`);
    }
  }

  private calculateFlat(
    unitPrice: number,
    effectiveDate: Date,
  ): {
    totalAmount: Money;
    calculationMetadata: Record<string, any>;
  } {
    const totalAmount = Money.from(unitPrice);
    return {
      totalAmount,
      calculationMetadata: {
        model: 'flat',
        unitPrice: unitPrice.toString(),
        formula: `${unitPrice}`,
        effectiveDate: effectiveDate.toISOString(),
        sourceEvents: [], // Should be passed in if available
      },
    };
  }

  private calculatePerUnit(
    unitPrice: number,
    quantity: number,
    effectiveDate: Date,
  ): { totalAmount: Money; calculationMetadata: Record<string, any> } {
    const priceAsMoney = Money.from(unitPrice);
    const totalAmount = Money.multiply(priceAsMoney, quantity);

    return {
      totalAmount,
      calculationMetadata: {
        model: 'per_unit',
        unitPrice: unitPrice.toString(),
        quantity: quantity.toString(),
        formula: `${unitPrice} × ${quantity}`,
        effectiveDate: effectiveDate.toISOString(),
        sourceEvents: [], // Should be passed from aggregation
      },
    };
  }

  private calculateTiered(
    tiers: Array<{ upTo: number | null; unitPrice: number; flatFee?: number }>,
    quantity: number,
    effectiveDate: Date,
  ): { totalAmount: Money; calculationMetadata: Record<string, any> } {
    let remaining = quantity;
    let total = Money.zero();
    const tiersApplied: Array<any> = [];
    let previousLimit = 0;

    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      const tierLimit = tier.upTo ?? Infinity;
      const tierCapacity = tierLimit - previousLimit;
      const unitsInTier = Math.max(0, Math.min(remaining, tierCapacity));

      if (unitsInTier <= 0 && remaining > 0) {
        previousLimit = tierLimit;
        continue;
      }

      const tierPrice = Money.from(tier.unitPrice);
      const tierCharge = Money.multiply(tierPrice, unitsInTier);
      const flatFee = Money.from(tier.flatFee ?? 0);
      const subtotal = Money.add(tierCharge, flatFee);

      total = Money.add(total, subtotal);

      tiersApplied.push({
        tier: i + 1,
        units: unitsInTier,
        unitPrice: tier.unitPrice,
        flatFee: tier.flatFee ?? 0,
        charge: subtotal.toString(),
      });

      remaining -= unitsInTier;
      previousLimit = tierLimit;

      if (remaining <= 0) break;
    }

    return {
      totalAmount: total,
      calculationMetadata: {
        model: 'tiered',
        quantity: quantity.toString(),
        tiersApplied,
        formula: tiersApplied
          .map((t) => `(${t.unitPrice} × ${t.units} + ${t.flatFee})`)
          .join(' + '),
        effectiveDate: effectiveDate.toISOString(),
        sourceEvents: [],
      },
    };
  }

  private calculateVolume(
    tiers: Array<{ upTo: number | null; unitPrice: number; flatFee?: number }>,
    quantity: number,
    effectiveDate: Date,
  ): { totalAmount: Money; calculationMetadata: Record<string, any> } {
    // Find the tier where quantity fits
    const applicableTier =
      tiers.find((t) => t.upTo === null || quantity <= t.upTo) ??
      tiers[tiers.length - 1];

    if (!applicableTier) {
      throw new Error('No tiers defined for volume pricing');
    }

    const unitPrice = Money.from(applicableTier.unitPrice);
    const flatFee = Money.from(applicableTier.flatFee ?? 0);
    const totalAmount = Money.add(Money.multiply(unitPrice, quantity), flatFee);

    return {
      totalAmount,
      calculationMetadata: {
        model: 'volume',
        quantity: quantity.toString(),
        unitPrice: applicableTier.unitPrice.toString(),
        flatFee: (applicableTier.flatFee ?? 0).toString(),
        formula: `${applicableTier.unitPrice} × ${quantity} + ${applicableTier.flatFee ?? 0}`,
        effectiveDate: effectiveDate.toISOString(),
        sourceEvents: [],
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
      relations: ['rule'],
      order: { createdAt: 'ASC' },
    });
  }
}
