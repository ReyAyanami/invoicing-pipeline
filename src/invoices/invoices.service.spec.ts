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
