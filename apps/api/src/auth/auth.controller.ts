import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import type { LoginResponse, StaffProfile } from '@oncotrack/contracts';
import { CurrentActor, type Actor } from './actor.js';
import { PublicRoute } from './access.guard.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @PublicRoute()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown): Promise<LoginResponse> {
    return this.auth.login(body);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentActor() actor: Actor): Promise<void> {
    await this.auth.logout(actor);
  }

  @Get('me')
  me(@CurrentActor() actor: Actor): StaffProfile {
    return {
      id: actor.id,
      username: actor.username,
      fullName: actor.fullName,
      roles: actor.roles,
      capabilities: actor.capabilities,
    };
  }
}
