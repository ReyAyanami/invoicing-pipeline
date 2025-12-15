import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { Customer } from './entities/customer.entity';

describe('CustomersService', () => {
  let service: CustomersService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        {
          provide: getRepositoryToken(Customer),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new customer', async () => {
      const createDto = {
        name: 'Acme Corp',
        email: 'billing@acme.com',
      };
      const customer = { id: '123', ...createDto };

      mockRepository.create.mockReturnValue(customer);
      mockRepository.save.mockResolvedValue(customer);

      const result = await service.create(createDto);

      expect(mockRepository.create).toHaveBeenCalledWith(createDto);
      expect(mockRepository.save).toHaveBeenCalledWith(customer);
      expect(result).toEqual(customer);
    });
  });

  describe('findOne', () => {
    it('should return a customer if found', async () => {
      const customer = {
        id: '123',
        name: 'Acme Corp',
        email: 'billing@acme.com',
      };

      mockRepository.findOne.mockResolvedValue(customer);

      const result = await service.findOne('123');

      expect(result).toEqual(customer);
    });

    it('should throw NotFoundException if customer not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
