import {
  Injectable,
  Inject,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const PUBLIC_ROUTE = 'oncotrack:public';
export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE, true);

/** Foundation boundary: replace with verified sessions during identity milestone. */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    throw new UnauthorizedException('Staff authentication is required.');
  }
}
