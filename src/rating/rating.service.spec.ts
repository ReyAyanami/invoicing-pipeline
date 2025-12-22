import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { RatingService } from './rating.service';
import { RatedCharge } from './entities/rated-charge.entity';
import { AggregatedUsage } from '../aggregation/entities/aggregated-usage.entity';
import { PriceBooksService } from '../price-books/price-books.service';

describe('RatingService', () => {
  let service: RatingService;

  const mockRatedChargeRepository = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockAggregatedUsageRepository = {
    findOne: jest.fn(),
  };

  const mockPriceBooksService = {
    findEffectivePriceBook: jest.fn(),
    findPriceRulesForBook: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingService,
        {
          provide: getRepositoryToken(RatedCharge),
          useValue: mockRatedChargeRepository,
        },
        {
          provide: getRepositoryToken(AggregatedUsage),
          useValue: mockAggregatedUsageRepository,
        },
        {
          provide: PriceBooksService,
          useValue: mockPriceBooksService,
        },
      ],
    }).compile();

    service = module.get<RatingService>(RatingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('rateUsage', () => {
    it('should rate usage with per_unit pricing', async () => {
      const rateDto = {
        aggregatedUsageId: 'usage-123',
        customerId: 'customer-123',
        metricType: 'api_calls',
        quantity: 1000,
        effectiveDate: '2024-01-15',
      };

      const priceBook = {
        priceBookId: 'pb-123',
        name: 'Standard 2024',
        version: 'v1',
      };
      const priceRule = {
        ruleId: 'rule-123',
        metricType: 'api_calls',
        pricingModel: 'flat' as const,
        tiers: [{ tier: 1, upTo: null, unitPrice: 0.01 }],
      };

      mockPriceBooksService.findEffectivePriceBook.mockResolvedValue(priceBook);
      mockPriceBooksService.findPriceRulesForBook.mockResolvedValue([
        priceRule,
      ]);

      const expectedCharge = {
        id: 'charge-123',
        aggregationId: rateDto.aggregatedUsageId,
        customerId: rateDto.customerId,
        ruleId: priceRule.ruleId,
        quantity: String(rateDto.quantity),
        unitPrice: '0.01',
        subtotal: '0.01', // flat pricing
        calculationMetadata: {
          model: 'flat',
          unitPrice: 0.01,
        },
      };

      mockRatedChargeRepository.create.mockReturnValue(expectedCharge);
      mockRatedChargeRepository.save.mockResolvedValue(expectedCharge);

      const result = await service.rateUsage(rateDto);

      expect(result).toBeDefined();
      expect(result.calculationMetadata).toBeDefined();
    });

    it('should rate usage with tiered pricing', async () => {
      const rateDto = {
        aggregatedUsageId: 'usage-123',
        customerId: 'customer-123',
        metricType: 'api_calls',
        quantity: 1200,
        effectiveDate: '2024-01-15',
      };

      const priceBook = {
        priceBookId: 'pb-123',
        name: 'Standard 2024',
        version: 'v1',
      };
      const priceRule = {
        ruleId: 'rule-456',
        metricType: 'api_calls',
        pricingModel: 'tiered' as const,
        tiers: [
          { tier: 1, upTo: 1000, unitPrice: 0.1 }, // First 1000 @ 0.1 = 100
          { tier: 2, upTo: null, unitPrice: 0.05 }, // Next 200 @ 0.05 = 10
        ],
      };

      mockPriceBooksService.findEffectivePriceBook.mockResolvedValue(priceBook);
      mockPriceBooksService.findPriceRulesForBook.mockResolvedValue([
        priceRule,
      ]);

      mockRatedChargeRepository.create.mockImplementation((arg) => arg);
      mockRatedChargeRepository.save.mockImplementation((arg) => arg);

      const result = await service.rateUsage(rateDto);

      expect(result.subtotal.toString()).toBe('110.00'); // 100 + 10
      expect(result.calculationMetadata.model).toBe('tiered');
      expect(result.calculationMetadata.tiersApplied).toHaveLength(2);
      expect(result.calculationMetadata.tiersApplied![0].charge).toBe('100.00');
      expect(result.calculationMetadata.tiersApplied![1].charge).toBe('10.00');
    });

    it('should rate usage with volume pricing', async () => {
      const rateDto = {
        aggregatedUsageId: 'usage-123',
        customerId: 'customer-123',
        metricType: 'storage',
        quantity: 5000,
        effectiveDate: '2024-01-15',
      };

      const priceBook = {
        priceBookId: 'pb-123',
        name: 'Standard 2024',
        version: 'v1',
      };
      const priceRule = {
        ruleId: 'rule-789',
        metricType: 'storage',
        pricingModel: 'volume' as const,
        tiers: [
          { tier: 1, upTo: 1000, unitPrice: 0.1 },
          { tier: 2, upTo: null, unitPrice: 0.08 }, // should use this for 5000
        ],
      };

      mockPriceBooksService.findEffectivePriceBook.mockResolvedValue(priceBook);
      mockPriceBooksService.findPriceRulesForBook.mockResolvedValue([
        priceRule,
      ]);

      mockRatedChargeRepository.create.mockImplementation((arg) => arg);
      mockRatedChargeRepository.save.mockImplementation((arg) => arg);

      const result = await service.rateUsage(rateDto);

      expect(result.subtotal.toString()).toBe('400.00'); // 5000 * 0.08
      expect(result.calculationMetadata.model).toBe('volume');
      expect(result.calculationMetadata.unitPrice).toBe('0.08');
    });

    it('should throw NotFoundException if no price book found', async () => {
      const rateDto = {
        aggregatedUsageId: 'usage-123',
        customerId: 'customer-123',
        metricType: 'api_calls',
        quantity: 1000,
        effectiveDate: '2024-01-15',
      };

      mockPriceBooksService.findEffectivePriceBook.mockResolvedValue(null);

      await expect(service.rateUsage(rateDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
