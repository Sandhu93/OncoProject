import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './auth/access.guard.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { SessionService } from './auth/session.service.js';
import { ChartsController } from './charts/charts.controller.js';
import { ChartsService } from './charts/charts.service.js';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';
import { CommandService } from './transactions/command.service.js';

@Module({
  controllers: [HealthController, AuthController, ChartsController],
  providers: [
    DatabaseService,
    SessionService,
    AuthService,
    CommandService,
    ChartsService,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class AppModule {}
