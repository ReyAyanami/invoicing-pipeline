import { Test, TestingModule } from '@nestjs/testing';
import { ReRatingService } from './re-rating.service';
import { RatingService } from './rating.service';
import { KafkaService } from '../kafka/kafka.service';

describe('ReRatingService', () => {
    let service: ReRatingService;
    let ratingService: RatingService;
    let kafkaService: KafkaService;

    const mockRatingService = {
        rateUsage: jest.fn().mockResolvedValue({}),
    };

    const mockKafkaService = {
        createConsumer: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ReRatingService,
                { provide: RatingService, useValue: mockRatingService },
                { provide: KafkaService, useValue: mockKafkaService },
            ],
        }).compile();

        service = module.get<ReRatingService>(ReRatingService);
        ratingService = module.get<RatingService>(RatingService);
        kafkaService = module.get<KafkaService>(KafkaService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should process late event and trigger rateUsage', async () => {
        const lateEvent = {
            eventId: 'evt-late',
            customerId: 'cust-1',
            eventType: 'api_calls',
            eventTime: '2024-01-01T12:00:00Z',
            metadata: { value: 100 },
        };

        // Simulate handleLateEvent call (private)
        await (service as any).handleLateEvent(lateEvent);

        expect(mockRatingService.rateUsage).toHaveBeenCalledWith({
            customerId: 'cust-1',
            metricType: 'api_calls',
            quantity: '100',
            effectiveDate: '2024-01-01T12:00:00Z',
            aggregatedUsageId: undefined,
        });
    });
});
