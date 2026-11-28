import type { StaffCapability } from '@oncotrack/contracts';
import type { Actor } from '../auth/actor.js';
import { DomainError } from '../transactions/domain-error.js';

/** Refuses (403) unless the signed-in person holds the capability. */
export function requireCapability(actor: Actor, capability: StaffCapability): void {
  if (!actor.capabilities.includes(capability)) {
    throw new DomainError(
      403,
      'CAPABILITY_REQUIRED',
      'You do not have permission to use this page.',
    );
  }
}
