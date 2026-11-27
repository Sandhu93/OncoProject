import { HttpException } from '@nestjs/common';

/**
 * A refusal with a stable code. The code is what screens and tests rely on; the message is for people.
 * Throwing one inside a command rolls the whole transaction back, so a refusal never changes data.
 */
export class DomainError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
  ) {
    super({ code, message }, status);
  }
}
