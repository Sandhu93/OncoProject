import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './auth/access.guard.js';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';

@Module({
  controllers: [HealthController],
  providers: [DatabaseService, { provide: APP_GUARD, useClass: AccessGuard }],
})
export class AppModule {}
