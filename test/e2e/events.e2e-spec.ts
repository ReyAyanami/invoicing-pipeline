import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Events API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/events', () => {
    it('should create a new event', () => {
      const eventData = {
        eventId: `test-event-${Date.now()}`,
        customerId: 'customer-123',
        metricType: 'api_calls',
        eventTime: new Date().toISOString(),
        payload: {
          endpoint: '/api/users',
          method: 'GET',
          statusCode: 200,
        },
      };

      return request(app.getHttpServer())
        .post('/api/v1/events')
        .send(eventData)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.eventId).toBe(eventData.eventId);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.customerId).toBe(eventData.customerId);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.metricType).toBe(eventData.metricType);
        });
    });

    it('should reject duplicate events (idempotency)', async () => {
      const eventId = `duplicate-test-${Date.now()}`;
      const eventData = {
        eventId,
        customerId: 'customer-123',
        metricType: 'api_calls',
        eventTime: new Date().toISOString(),
        payload: { test: true },
      };

      // First submission - should succeed
      await request(app.getHttpServer())
        .post('/api/v1/events')
        .send(eventData)
        .expect(201);

      // Second submission - should be rejected as duplicate
      return request(app.getHttpServer())
        .post('/api/v1/events')
        .send(eventData)
        .expect(409);
    });

    it('should validate required fields', () => {
      return request(app.getHttpServer())
        .post('/api/v1/events')
        .send({
          // Missing required fields
          customerId: 'customer-123',
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/events', () => {
    it('should return list of events', () => {
      return request(app.getHttpServer())
        .get('/api/v1/events')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should filter events by customerId', async () => {
      const customerId = `customer-${Date.now()}`;
      const eventData = {
        eventId: `test-${Date.now()}`,
        customerId,
        metricType: 'api_calls',
        eventTime: new Date().toISOString(),
        payload: {},
      };

      // Create event
      await request(app.getHttpServer()).post('/api/v1/events').send(eventData);

      // Filter by customerId
      return request(app.getHttpServer())
        .get(`/api/v1/events?customerId=${customerId}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.length).toBeGreaterThan(0);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          expect(res.body.every((e: any) => e.customerId === customerId)).toBe(
            true,
          );
        });
    });
  });

  describe('GET /api/v1/events/:id', () => {
    it('should return a specific event', async () => {
      const eventData = {
        eventId: `test-${Date.now()}`,
        customerId: 'customer-123',
        metricType: 'api_calls',
        eventTime: new Date().toISOString(),
        payload: { test: true },
      };

      // Create event
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/events')
        .send(eventData);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const eventId = createRes.body.id;

      // Retrieve event
      return request(app.getHttpServer())
        .get(`/api/v1/events/${eventId}`)
        .expect(200)
        .expect((res) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.id).toBe(eventId);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          expect(res.body.eventId).toBe(eventData.eventId);
        });
    });

    it('should return 404 for non-existent event', () => {
      return request(app.getHttpServer())
        .get('/api/v1/events/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });
});
