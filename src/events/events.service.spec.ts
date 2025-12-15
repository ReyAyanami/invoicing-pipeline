import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { TelemetryEvent } from './entities/telemetry-event.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { KafkaService } from '../kafka/kafka.service';

describe('EventsService', () => {
  let service: EventsService;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockKafkaService = {
    sendMessage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: getRepositoryToken(TelemetryEvent),
          useValue: mockRepository,
        },
        {
          provide: KafkaService,
          useValue: mockKafkaService,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ingest', () => {
    const createEventDto: CreateEventDto = {
      eventId: '123e4567-e89b-12d3-a456-426614174000',
      eventType: 'api_call',
      customerId: '123e4567-e89b-12d3-a456-426614174001',
      eventTime: '2024-01-15T14:23:45Z',
      metadata: { endpoint: '/api/users' },
      source: 'api-gateway',
    };

    it('should ingest a new event', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(createEventDto);
      mockRepository.save.mockResolvedValue({
        ...createEventDto,
        eventTime: new Date(createEventDto.eventTime),
        ingestionTime: new Date(),
        createdAt: new Date(),
      });
      mockKafkaService.sendMessage.mockResolvedValue(undefined);

      const result = await service.ingest(createEventDto);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { eventId: createEventDto.eventId },
      });
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockKafkaService.sendMessage).toHaveBeenCalled();
      expect(result.eventId).toBe(createEventDto.eventId);
    });

    it('should throw ConflictException for duplicate eventId', async () => {
      mockRepository.findOne.mockResolvedValue({
        eventId: createEventDto.eventId,
      });

      await expect(service.ingest(createEventDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { eventId: createEventDto.eventId },
      });
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should handle events without optional fields', async () => {
      const minimalDto: CreateEventDto = {
        eventId: '123e4567-e89b-12d3-a456-426614174002',
        eventType: 'api_call',
        customerId: '123e4567-e89b-12d3-a456-426614174001',
        eventTime: '2024-01-15T14:23:45Z',
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(minimalDto);
      mockRepository.save.mockResolvedValue({
        ...minimalDto,
        eventTime: new Date(minimalDto.eventTime),
        metadata: {},
        source: null,
        ingestionTime: new Date(),
        createdAt: new Date(),
      });
      mockKafkaService.sendMessage.mockResolvedValue(undefined);

      const result = await service.ingest(minimalDto);

      expect(result.eventId).toBe(minimalDto.eventId);
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {},
          source: null,
        }),
      );
      expect(mockKafkaService.sendMessage).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return events with filters', async () => {
      const mockEvents = [
        {
          event_id: '123e4567-e89b-12d3-a456-426614174000',
          event_type: 'api_call',
          customer_id: '123e4567-e89b-12d3-a456-426614174001',
        },
      ];

      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockEvents),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll(
        '123e4567-e89b-12d3-a456-426614174001',
        'api_call',
        50,
      );

      expect(result).toEqual(mockEvents);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledTimes(2);
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(50);
    });

    it('should return events without filters', async () => {
      const mockEvents = [
        {
          event_id: '123e4567-e89b-12d3-a456-426614174000',
        },
      ];

      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockEvents),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll();

      expect(result).toEqual(mockEvents);
      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(100);
    });
  });

  describe('findOne', () => {
    it('should return an event by id', async () => {
      const mockEvent = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        eventType: 'api_call',
      };

      mockRepository.findOne.mockResolvedValue(mockEvent);

      const result = await service.findOne(mockEvent.eventId);

      expect(result).toEqual(mockEvent);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { eventId: mockEvent.eventId },
      });
    });

    it('should return null if event not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findOne('non-existent-id');

      expect(result).toBeNull();
    });
  });
});
