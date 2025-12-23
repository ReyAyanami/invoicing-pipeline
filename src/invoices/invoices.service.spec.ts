import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { Invoice } from './entities/invoice.entity';
import { InvoiceLineItem } from './entities/invoice-line-item.entity';
import { InvoiceAdjustment } from './entities/invoice-adjustment.entity';
import { RatingService } from '../rating/rating.service';
import { CustomersService } from '../customers/customers.service';
import { CustomerCredit } from '../customers/entities/customer-credit.entity';

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

  const mockAdjustmentRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockCreditRepository = {
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
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
          provide: getRepositoryToken(InvoiceAdjustment),
          useValue: mockAdjustmentRepository,
        },
        {
          provide: getRepositoryToken(CustomerCredit),
          useValue: mockCreditRepository,
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
      mockCreditRepository.find.mockResolvedValue([]); // No credits
      mockAdjustmentRepository.save.mockResolvedValue({});

      mockInvoiceRepository.findOne.mockResolvedValue({
        invoiceId: 'inv-123',
        subtotal: '115.00',
        tax: '5.75',
        total: '120.75',
        lineItems: [
          { metricType: 'api_calls', amount: '75.00', quantity: '1500' },
          { metricType: 'storage', amount: '40.00', quantity: '100' },
        ],
      });

      const result = await service.generateInvoice(dto);

      expect(result).toBeDefined();
      expect(mockLineItemRepository.create).toHaveBeenCalledTimes(2);
      expect(mockInvoiceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotal: '115.00',
          tax: '5.75',
          total: '120.75',
        }),
      );
    });

    it('should apply customer credits and reduce total', async () => {
      const dto = {
        customerId: 'customer-123',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
      };

      const charges = [
        {
          chargeId: 'charge-1',
          subtotal: '100.00',
          quantity: '1',
          rule: { metricType: 'api_calls', unit: 'requests' },
        },
      ];

      const activeCredit = {
        creditId: 'credit-1',
        remainingAmount: '50.00',
        expiresAt: null,
      };

      mockCustomersService.findOne.mockResolvedValue({ id: 'customer-123' });
      mockRatingService.findChargesForPeriod.mockResolvedValue(charges);
      mockCreditRepository.find.mockResolvedValue([activeCredit]);
      mockCreditRepository.save.mockImplementation((arg) => arg);
      mockAdjustmentRepository.create.mockImplementation((arg) => arg);
      mockAdjustmentRepository.save.mockResolvedValue({});
      mockInvoiceRepository.create.mockImplementation((arg) => ({ ...arg, invoiceId: 'inv-123' }));
      mockInvoiceRepository.save.mockImplementation((arg) => arg);
      mockLineItemRepository.create.mockImplementation((arg) => arg);
      mockLineItemRepository.save.mockImplementation((arg) => arg);

      mockInvoiceRepository.findOne.mockResolvedValue({
        invoiceId: 'inv-123',
        subtotal: '100.00',
        tax: '5.00',
        creditsApplied: '50.00',
        total: '55.00',
        lineItems: [],
      });

      const result = await service.generateInvoice(dto);

      expect(result.creditsApplied).toBe('50.00');
      expect(result.total).toBe('55.00');
      expect(mockCreditRepository.save).toHaveBeenCalled();
      expect(mockAdjustmentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'credit_application',
          amount: '50.00',
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
