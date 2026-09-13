import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../apps/api/src/app.module.js';
import { configureApp } from '../../apps/api/src/bootstrap.js';
import { DatabaseService } from '../../apps/api/src/database/database.service.js';

@Controller('protected-probe')
class ProtectedProbeController {
  @Get()
  get() {
    return { private: true };
  }
}

describe('API-001 health and fail-closed boundary', () => {
  let app: INestApplication;
  const database = { isReady: vi.fn() };
  beforeEach(async () => {
    database.isReady.mockResolvedValue(true);
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProtectedProbeController],
    })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns liveness without consulting the database', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    expect(response.body).toEqual({ status: 'ok', service: 'oncotrack-api' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(database.isReady).not.toHaveBeenCalled();
  });
  it('reports readiness when the schema is present', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
  });
  it('returns 503 without leaking database details when unavailable', async () => {
    database.isReady.mockResolvedValue(false);
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    expect(response.body).toEqual({ status: 'unavailable', service: 'oncotrack-api' });
  });
  it('denies private routes even with forged role and bearer headers', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/protected-probe')
      .set('X-Role', 'CONSULTANT')
      .set('Authorization', 'Bearer fabricated')
      .expect(401);
  });
});
