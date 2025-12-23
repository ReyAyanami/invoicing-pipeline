import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AggregationService } from './aggregation.service';
import { AggregatedUsage } from './entities/aggregated-usage.entity';
import { KafkaService } from '../kafka/kafka.service';

describe('AggregationService', () => {
  let service: AggregationService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'KAFKA_BROKER') return 'localhost:9092';
      return null;
    }),
  };

  const mockKafkaService = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
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
        {
          provide: KafkaService,
          useValue: mockKafkaService,
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

  describe('addEventToWindow', () => {
    it('should create new aggregation if none exists', async () => {
      const event = {
        eventId: 'evt-1',
        eventType: 'api_calls',
        customerId: 'cust-1',
        eventTime: new Date().toISOString(),
        metadata: {},
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockImplementation((arg) => arg);
      mockRepository.save.mockImplementation((arg) => arg);

      await (service as any).addEventToWindow(event);

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cust-1',
          metricType: 'api_calls',
          value: '1.000000',
        }),
      );
    });

    it('should update existing aggregation using SUM for api_calls', async () => {
      const event = {
        eventId: 'evt-2',
        eventType: 'api_calls',
        customerId: 'cust-1',
        eventTime: new Date().toISOString(),
        metadata: { value: 5 },
      };

      const existing = {
        value: '10.000000',
        eventCount: 1,
        eventIds: ['evt-1'],
      };

      mockRepository.findOne.mockResolvedValue(existing);
      mockRepository.save.mockImplementation((arg) => arg);

      await (service as any).addEventToWindow(event);

      expect(existing.value).toBe('15.000000');
      expect(existing.eventCount).toBe(2);
      expect(existing.eventIds).toContain('evt-2');
    });

    it('should update existing aggregation using MAX for peak metrics', async () => {
      const event = {
        eventId: 'evt-3',
        eventType: 'storage_gb_peak',
        customerId: 'cust-1',
        eventTime: new Date().toISOString(),
        metadata: { value: 50 },
      };

      const existing = {
        value: '30.000000',
        eventCount: 1,
        eventIds: ['evt-1'],
      };

      mockRepository.findOne.mockResolvedValue(existing);
      mockRepository.save.mockImplementation((arg) => arg);

      await (service as any).addEventToWindow(event);

      expect(existing.value).toBe('50.000000');
    });

    it('should redirect late events to Kafka instead of processing', async () => {
      const oldTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const event = {
        eventId: 'evt-late',
        eventType: 'api_calls',
        customerId: 'cust-1',
        eventTime: oldTime,
        metadata: {},
      };

      await (service as any).addEventToWindow(event);

      expect(mockRepository.save).not.toHaveBeenCalled();
      expect(mockKafkaService.sendMessage).toHaveBeenCalledWith(
        'telemetry-events-late',
        expect.objectContaining({ eventId: 'evt-late' }),
      );
    });
  });

  describe('advanceWatermark', () => {
    it('should finalize windows that have passed the watermark', async () => {
      const completedAggregation = {
        aggregationId: 'agg-1',
        metricType: 'api_calls',
        customerId: 'cust-1',
        windowStart: new Date(),
        windowEnd: new Date(),
        value: '100',
        unit: 'count',
        isFinal: false,
      };

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([completedAggregation]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder);
      mockRepository.save.mockImplementation((arg) => arg);

      await service['advanceWatermark']();

      expect(completedAggregation.isFinal).toBe(true);
      expect(mockKafkaService.sendMessage).toHaveBeenCalledWith(
        'aggregated-usage',
        expect.objectContaining({ aggregationId: 'agg-1', isFinal: true }),
      );
    });
  });
});
