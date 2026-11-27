import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ClinicalRole, StaffCapability } from '@oncotrack/contracts';
import { DatabaseService, type Queryable } from '../database/database.service.js';
import type { Actor } from './actor.js';

/** 32 random bytes, base64url: 43 characters. Only a SHA-256 of it is stored. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface ActorRow {
  id: string;
  username: string;
  full_name: string;
  session_id: string;
  roles: ClinicalRole[];
  capabilities: StaffCapability[];
}

@Injectable()
export class SessionService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async create(tx: Queryable, staffId: string, ttlHours: number) {
    const token = randomBytes(32).toString('base64url');
    const result = await tx.query<{ id: string; expires_at: Date }>(
      `INSERT INTO staff_sessions(staff_id, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(hours => $3::integer))
       RETURNING id, expires_at`,
      [staffId, hashToken(token), ttlHours],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Session was not created.');
    return { token, sessionId: row.id, expiresAt: row.expires_at };
  }

  /** Returns the actor for a live session of an active staff member, otherwise null. */
  async resolve(token: string): Promise<Actor | null> {
    if (!TOKEN_PATTERN.test(token)) return null;
    const result = await this.database.query<ActorRow>(
      `SELECT u.id, u.username, u.full_name, s.id AS session_id,
              COALESCE((SELECT array_agg(r.role_code ORDER BY r.role_code)
                          FROM staff_roles r WHERE r.staff_id = u.id), '{}') AS roles,
              COALESCE((SELECT array_agg(c.capability ORDER BY c.capability)
                          FROM staff_capabilities c WHERE c.staff_id = u.id), '{}') AS capabilities
         FROM staff_sessions s
         JOIN staff_users u ON u.id = s.staff_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active`,
      [hashToken(token)],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      roles: row.roles,
      capabilities: row.capabilities,
      sessionId: row.session_id,
    };
  }

  async revoke(tx: Queryable, sessionId: string) {
    await tx.query(
      'UPDATE staff_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
      [sessionId],
    );
  }
}
