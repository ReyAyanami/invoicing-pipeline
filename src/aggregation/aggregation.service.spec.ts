import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AggregationService } from './aggregation.service';
import { AggregatedUsage } from './entities/aggregated-usage.entity';

describe('AggregationService', () => {
  let service: AggregationService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'KAFKA_BROKER') return 'localhost:9092';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AggregationService,
        {
          provide: getRepositoryToken(AggregatedUsage),
          useValue: mockRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AggregationService>(AggregationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('finalizeWindow', () => {
    it('should create and save an aggregated usage record', async () => {
      const customerId = 'customer-123';
      const metricType = 'api_calls';
      const windowStart = new Date('2024-01-01T00:00:00Z');
      const windowEnd = new Date('2024-01-01T01:00:00Z');

      const aggregation = {
        customerId,
        metricType,
        windowStart,
        windowEnd,
        value: '0',
        unit: 'count',
        eventCount: 0,
        eventIds: [],
        isFinal: true,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        computedAt: expect.any(Date),
      };

      mockRepository.create.mockReturnValue(aggregation);
      mockRepository.save.mockResolvedValue(aggregation);

      const result = await service.finalizeWindow(
        customerId,
        metricType,
        windowStart,
        windowEnd,
      );

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId,
          metricType,
          windowStart,
          windowEnd,
        }),
      );
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual(aggregation);
    });
  });
});
