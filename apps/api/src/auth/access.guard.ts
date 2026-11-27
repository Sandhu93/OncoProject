import {
  Injectable,
  Inject,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './actor.js';
import { SessionService } from './session.service.js';

const PUBLIC_ROUTE = 'oncotrack:public';
export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE, true);

function bearerToken(request: AuthenticatedRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match?.[1] ?? null;
}

/**
 * Deny by default: every route needs a live server-side session unless it is marked public.
 * Roles and capabilities always come from the database, never from request headers.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request);
    if (!token) throw new UnauthorizedException('Staff authentication is required.');
    let actor;
    try {
      actor = await this.sessions.resolve(token);
    } catch {
      // If sessions cannot be checked, nothing is allowed through.
      throw new ServiceUnavailableException('Authentication is temporarily unavailable.');
    }
    if (!actor) throw new UnauthorizedException('Staff authentication is required.');
    request.actor = actor;
    return true;
  }
}
