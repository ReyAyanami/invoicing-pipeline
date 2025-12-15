import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PriceBooksService } from './price-books.service';
import { PriceBook } from './entities/price-book.entity';
import { PriceRule } from './entities/price-rule.entity';

describe('PriceBooksService', () => {
  let service: PriceBooksService;

  const mockPriceBookRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockPriceRuleRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceBooksService,
        {
          provide: getRepositoryToken(PriceBook),
          useValue: mockPriceBookRepository,
        },
        {
          provide: getRepositoryToken(PriceRule),
          useValue: mockPriceRuleRepository,
        },
      ],
    }).compile();

    service = module.get<PriceBooksService>(PriceBooksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPriceBook', () => {
    it('should create a new price book', async () => {
      const createDto = {
        name: 'Standard 2024',
        version: 'v1',
        effectiveFrom: '2024-01-01',
      };
      const priceBook = { id: '123', ...createDto };

      mockPriceBookRepository.create.mockReturnValue(priceBook);
      mockPriceBookRepository.save.mockResolvedValue(priceBook);

      const result = await service.createPriceBook(createDto);

      expect(mockPriceBookRepository.create).toHaveBeenCalledWith(createDto);
      expect(mockPriceBookRepository.save).toHaveBeenCalledWith(priceBook);
      expect(result).toEqual(priceBook);
    });
  });

  describe('findPriceBook', () => {
    it('should return a price book with rules', async () => {
      const priceBook = {
        id: '123',
        name: 'Standard 2024',
        priceRules: [],
      };

      mockPriceBookRepository.findOne.mockResolvedValue(priceBook);

      const result = await service.findPriceBook('123');

      expect(result).toEqual(priceBook);
      expect(mockPriceBookRepository.findOne).toHaveBeenCalledWith({
        where: { priceBookId: '123' },
      });
    });

    it('should throw NotFoundException if price book not found', async () => {
      mockPriceBookRepository.findOne.mockResolvedValue(null);

      await expect(service.findPriceBook('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
