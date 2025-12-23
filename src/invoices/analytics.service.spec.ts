import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { Invoice } from './entities/invoice.entity';
import { InvoiceLineItem } from './entities/invoice-line-item.entity';

describe('AnalyticsService', () => {
    let service: AnalyticsService;

    const mockInvoiceRepository = {
        createQueryBuilder: jest.fn(),
    };

    const mockLineItemRepository = {
        createQueryBuilder: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AnalyticsService,
                {
                    provide: getRepositoryToken(Invoice),
                    useValue: mockInvoiceRepository,
                },
                {
                    provide: getRepositoryToken(InvoiceLineItem),
                    useValue: mockLineItemRepository,
                },
            ],
        }).compile();

        service = module.get<AnalyticsService>(AnalyticsService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('getMonthlyRevenue', () => {
        it('should return raw monthly data', async () => {
            const mockResult = [{ month: '2024-01', totalRevenue: '1000.00' }];
            const queryBuilder = {
                select: jest.fn().mockReturnThis(),
                addSelect: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                groupBy: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                getRawMany: jest.fn().mockResolvedValue(mockResult),
            };

            mockInvoiceRepository.createQueryBuilder.mockReturnValue(queryBuilder);

            const result = await service.getMonthlyRevenue();
            expect(result).toEqual(mockResult);
            expect(queryBuilder.getRawMany).toHaveBeenCalled();
        });
    });
});
