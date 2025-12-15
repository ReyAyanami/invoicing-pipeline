import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KafkaService } from './kafka.service';

describe('KafkaService', () => {
  let service: KafkaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KafkaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const config: Record<string, string> = {
                KAFKA_CLIENT_ID: 'test-client',
                KAFKA_BROKERS: 'localhost:9092',
              };
              return config[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<KafkaService>(KafkaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize with correct configuration', () => {
    expect(service).toHaveProperty('kafka');
    expect(service).toHaveProperty('producer');
  });

  describe('methods', () => {
    it('should have sendMessage method', () => {
      expect(typeof service.sendMessage).toBe('function');
    });

    it('should have sendMessages method', () => {
      expect(typeof service.sendMessages).toBe('function');
    });

    it('should have createConsumer method', () => {
      expect(typeof service.createConsumer).toBe('function');
    });
  });
});
