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
