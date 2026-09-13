import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@oncotrack/contracts';
import { PublicRoute } from '../auth/access.guard.js';
import { DatabaseService } from '../database/database.service.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @PublicRoute()
  @Get('live')
  live(): HealthResponse {
    return { status: 'ok', service: 'oncotrack-api' };
  }

  @PublicRoute()
  @Get('ready')
  async ready(): Promise<HealthResponse> {
    if (!(await this.database.isReady())) {
      throw new ServiceUnavailableException({ status: 'unavailable', service: 'oncotrack-api' });
    }
    return { status: 'ok', service: 'oncotrack-api' };
  }
}
