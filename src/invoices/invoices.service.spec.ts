import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { Invoice } from './entities/invoice.entity';
import { InvoiceLineItem } from './entities/invoice-line-item.entity';
import { RatingService } from '../rating/rating.service';
import { CustomersService } from '../customers/customers.service';

describe('InvoicesService', () => {
  let service: InvoicesService;

  const mockInvoiceRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockLineItemRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockRatingService = {
    findChargesForPeriod: jest.fn(),
  };

  const mockCustomersService = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        {
          provide: getRepositoryToken(Invoice),
          useValue: mockInvoiceRepository,
        },
        {
          provide: getRepositoryToken(InvoiceLineItem),
          useValue: mockLineItemRepository,
        },
        {
          provide: RatingService,
          useValue: mockRatingService,
        },
        {
          provide: CustomersService,
          useValue: mockCustomersService,
        },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateInvoice', () => {
    it('should generate an invoice and group charges by metric type', async () => {
      const dto = {
        customerId: 'customer-123',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
      };

      const charges = [
        {
          chargeId: 'charge-1',
          subtotal: '50.00',
          quantity: '1000',
          rule: { metricType: 'api_calls', unit: 'requests' },
        },
        {
          chargeId: 'charge-2',
          subtotal: '25.00',
          quantity: '500',
          rule: { metricType: 'api_calls', unit: 'requests' },
        },
        {
          chargeId: 'charge-3',
          subtotal: '40.00',
          quantity: '100',
          rule: { metricType: 'storage', unit: 'GB' },
        },
      ];

      mockCustomersService.findOne.mockResolvedValue({ id: 'customer-123' });
      mockRatingService.findChargesForPeriod.mockResolvedValue(charges);
      mockInvoiceRepository.create.mockImplementation((arg) => ({
        ...arg,
        invoiceId: 'inv-123',
      }));
      mockInvoiceRepository.save.mockImplementation((arg) => arg);
      mockLineItemRepository.create.mockImplementation((arg) => arg);
      mockLineItemRepository.save.mockImplementation((arg) => arg);
      mockInvoiceRepository.findOne.mockResolvedValue({
        invoiceId: 'inv-123',
        lineItems: [
          { metricType: 'api_calls', amount: '75.00', quantity: '1500' },
          { metricType: 'storage', amount: '40.00', quantity: '100' },
        ],
      });

      const result = await service.generateInvoice(dto);

      expect(result).toBeDefined();
      expect(mockLineItemRepository.create).toHaveBeenCalledTimes(2); // Two unique metrics
      expect(mockLineItemRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metricType: 'api_calls',
          description: 'Api Calls usage',
          amount: '75.00',
          quantity: '1500.000000', // Quantity might be formatted too
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return an invoice with line items', async () => {
      const invoice = {
        id: 'invoice-123',
        customerId: 'customer-123',
        totalAmount: 100,
        lineItems: [],
      };

      mockInvoiceRepository.findOne.mockResolvedValue(invoice);

      const result = await service.findOne('invoice-123');

      expect(result).toEqual(invoice);
      expect(mockInvoiceRepository.findOne).toHaveBeenCalledWith({
        where: { invoiceId: 'invoice-123' },
        relations: ['lineItems'],
      });
    });

    it('should throw NotFoundException if invoice not found', async () => {
      mockInvoiceRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('issueInvoice', () => {
    it('should mark invoice as issued', async () => {
      const invoice = {
        id: 'invoice-123',
        status: 'draft',
        issuedAt: null,
      };

      mockInvoiceRepository.findOne.mockResolvedValue(invoice);
      const issuedInvoice = {
        ...invoice,
        status: 'issued' as const,
        issuedAt: new Date(),
      };
      mockInvoiceRepository.save.mockResolvedValue(issuedInvoice);

      const result = await service.issueInvoice('invoice-123');

      expect(result.status).toBe('issued');
      expect(result.issuedAt).toBeDefined();
    });
  });
});
