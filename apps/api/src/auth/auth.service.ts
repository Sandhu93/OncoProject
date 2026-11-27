import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { LoginResponse } from '@oncotrack/contracts';
import { readConfig } from '../config.js';
import { DatabaseService } from '../database/database.service.js';
import type { Actor } from './actor.js';
import { PASSWORD_MAX_LENGTH, burnPasswordCheck, verifyPassword } from './password.js';
import { SessionService } from './session.service.js';

/** Starting values; the hospital's own policy (D-08) may change them. */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_FAILURE_WINDOW = '15 minutes';
export const LOGIN_LOCK_DURATION = '15 minutes';

const INVALID_CREDENTIALS = 'Invalid username or password.';
const LOCKED = 'Too many failed sign-in attempts. Try again later.';

function parseLogin(body: unknown): { username: string; password: string } {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('Username and password are required.');
  }
  const { username, password } = body as Record<string, unknown>;
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new BadRequestException('Username and password are required.');
  }
  const name = username.trim().toLowerCase();
  if (name.length < 1 || name.length > 100 || password.length < 1) {
    throw new BadRequestException('Username and password are required.');
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new BadRequestException('Username or password is too long.');
  }
  return { username: name, password };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async login(body: unknown): Promise<LoginResponse> {
    const { username, password } = parseLogin(body);

    // A locked name is refused before any password is checked, so guessing gets no further.
    const locked = await this.database.query<{ seconds: string }>(
      `SELECT ceil(extract(epoch FROM (locked_until - now())))::text AS seconds
         FROM login_throttle WHERE username = $1 AND locked_until > now()`,
      [username],
    );
    if (locked.rows[0]) {
      throw new HttpException(
        { message: LOCKED, retryAfterSeconds: Number(locked.rows[0].seconds) },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const found = await this.database.query<{ id: string; password_hash: string | null }>(
      `SELECT id, password_hash FROM staff_users
        WHERE username = $1 AND identity_provider = 'LOCAL' AND is_active`,
      [username],
    );
    const user = found.rows[0];
    let verified = false;
    if (user?.password_hash) {
      verified = await verifyPassword(password, user.password_hash);
    } else {
      await burnPasswordCheck(password);
    }
    if (!user || !verified) {
      await this.recordFailure(username, user?.id);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const { sessionTtlHours } = readConfig();
    const session = await this.database.transaction(async (tx) => {
      await tx.query('DELETE FROM login_throttle WHERE username = $1', [username]);
      const created = await this.sessions.create(tx, user.id, sessionTtlHours);
      const roles = await tx.query<{ role_code: string }>(
        'SELECT role_code FROM staff_roles WHERE staff_id = $1 ORDER BY role_code',
        [user.id],
      );
      await tx.query(
        `INSERT INTO audit_events(actor_id, actor_roles, action, entity_type, entity_id, request_id)
         VALUES ($1, $2::text[], 'LOGIN_SUCCEEDED', 'STAFF_SESSION', $3, gen_random_uuid())`,
        [user.id, roles.rows.map((row) => row.role_code), created.sessionId],
      );
      return created;
    });
    return {
      access_token: session.token,
      token_type: 'Bearer',
      expires_in: Math.max(1, Math.round((session.expiresAt.getTime() - Date.now()) / 1000)),
    };
  }

  async logout(actor: Actor): Promise<void> {
    await this.database.transaction(async (tx) => {
      await this.sessions.revoke(tx, actor.sessionId);
      await tx.query(
        `INSERT INTO audit_events(actor_id, actor_roles, action, entity_type, entity_id, request_id)
         VALUES ($1, $2::text[], 'LOGOUT', 'STAFF_SESSION', $3, gen_random_uuid())`,
        [actor.id, [...actor.roles], actor.sessionId],
      );
    });
  }

  /** Counts the failure for the name. Only a known account is audited, so typed text is not stored. */
  private async recordFailure(username: string, staffId: string | undefined) {
    await this.database.query('SELECT record_failed_login($1, $2, $3::interval, $4::interval)', [
      username,
      LOGIN_MAX_FAILURES,
      LOGIN_FAILURE_WINDOW,
      LOGIN_LOCK_DURATION,
    ]);
    if (staffId) {
      await this.database.query(
        `INSERT INTO audit_events(actor_id, action, entity_type, entity_id, request_id)
         VALUES ($1::uuid, 'LOGIN_FAILED', 'STAFF_USER', $2::text, gen_random_uuid())`,
        [staffId, staffId],
      );
    }
  }
}
