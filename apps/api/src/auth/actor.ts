import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ClinicalRole, StaffCapability } from '@oncotrack/contracts';

/** A signed-in staff member, loaded from the server's own records on every request. */
export interface Actor {
  id: string;
  username: string;
  fullName: string;
  roles: readonly ClinicalRole[];
  capabilities: readonly StaffCapability[];
  sessionId: string;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  actor?: Actor;
}

export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const actor = context.switchToHttp().getRequest<AuthenticatedRequest>().actor;
  if (!actor) throw new Error('CurrentActor used on a route without authentication.');
  return actor;
});
