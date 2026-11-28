import { Inject, Injectable } from '@nestjs/common';
import {
  CLINICAL_ROLES,
  STAFF_CAPABILITIES,
  type ClinicalRole,
  type StaffCapability,
  type StaffMember,
} from '@oncotrack/contracts';
import { randomUUID } from 'node:crypto';
import type { Actor } from '../auth/actor.js';
import { DIRECTORY_USERNAME } from '../auth/directory.service.js';
import { DirectoryService } from '../auth/directory.service.js';
import { checkPasswordPolicy, hashPassword } from '../auth/password.js';
import { DatabaseService, type Queryable } from '../database/database.service.js';
import { CommandService } from '../transactions/command.service.js';
import { DomainError, type FieldProblem } from '../transactions/domain-error.js';
import { requireCapability } from './capability.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME = DIRECTORY_USERNAME;

interface Row {
  id: string;
  username: string;
  full_name: string;
  identity_provider: 'LOCAL' | 'DIRECTORY';
  is_active: boolean;
  is_available: boolean;
  created_at: Date | string;
  roles: string[];
  capabilities: string[];
  last_login: Date | string | null;
}

/** Rows that go with an account and are not history, so they are removed when it is deleted. */
const CLEARED_WITH_ACCOUNT = new Set([
  'staff_roles',
  'staff_capabilities',
  'staff_sessions',
  'notifications',
  'idempotency_records',
]);

const iso = (value: Date | string) =>
  (value instanceof Date ? value : new Date(value)).toISOString();

const toMember = (row: Row, used: ReadonlySet<string>): StaffMember => ({
  id: row.id,
  username: row.username,
  fullName: row.full_name,
  roles: row.roles as ClinicalRole[],
  capabilities: row.capabilities as StaffCapability[],
  identityProvider: row.identity_provider,
  isActive: row.is_active,
  isAvailable: row.is_available,
  createdAt: iso(row.created_at),
  lastLoginAt: row.last_login ? iso(row.last_login) : null,
  canDelete: !used.has(row.id),
});

const refuse = (problems: FieldProblem[]): never => {
  throw new DomainError(400, 'VALIDATION_FAILED', 'Some fields need attention.', problems);
};

/** Reads a list of known values, or reports it as a problem. */
function readSet<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  problems: FieldProblem[],
): T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => !allowed.includes(item as T))) {
    problems.push({ field, message: `Choose from: ${allowed.join(', ')}.` });
    return undefined;
  }
  return [...new Set(value as T[])];
}

/** Staff accounts: list, create, change roles and access, switch off, set a password. Needs MANAGE_STAFF. */
@Injectable()
export class StaffAdminService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandService) private readonly commands: CommandService,
    @Inject(DirectoryService) private readonly directory: DirectoryService,
  ) {}

  /** Whether accounts can be set up to sign in with the hospital directory. */
  get directoryEnabled(): boolean {
    return this.directory.enabled;
  }

  async list(actor: Actor, db: Queryable = this.database): Promise<StaffMember[]> {
    requireCapability(actor, 'MANAGE_STAFF');
    const found = await db.query<Row>(
      `SELECT u.id, u.username, u.full_name, u.identity_provider, u.is_active, u.is_available, u.created_at,
              COALESCE((SELECT array_agg(r.role_code ORDER BY r.role_code) FROM staff_roles r WHERE r.staff_id = u.id), '{}') AS roles,
              COALESCE((SELECT array_agg(c.capability ORDER BY c.capability) FROM staff_capabilities c WHERE c.staff_id = u.id), '{}') AS capabilities,
              (SELECT max(a.occurred_at) FROM audit_events a WHERE a.actor_id = u.id AND a.action = 'LOGIN_SUCCEEDED') AS last_login
         FROM staff_users u ORDER BY u.is_active DESC, u.full_name, u.id`,
    );
    const used = await this.usedIds(db);

    return found.rows.map((row) => toMember(row, used));
  }

  async create(actor: Actor, key: string | undefined, body: unknown) {
    requireCapability(actor, 'MANAGE_STAFF');
    const input = (typeof body === 'object' && body !== null ? body : {}) as Record<
      string,
      unknown
    >;
    const problems: FieldProblem[] = [];
    const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
    if (!USERNAME.test(username)) {
      problems.push({
        field: 'username',
        message:
          'Use 3 to 50 letters, numbers, dots, dashes or underscores, starting with a letter or number.',
      });
    }
    const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
    if (fullName.length < 1 || fullName.length > 120) {
      problems.push({ field: 'fullName', message: 'Enter the full name (up to 120 characters).' });
    }
    const roles = readSet(input.roles ?? [], CLINICAL_ROLES, 'roles', problems) ?? [];
    const capabilities =
      readSet(input.capabilities ?? [], STAFF_CAPABILITIES, 'capabilities', problems) ?? [];
    if (
      roles.length === 0 &&
      capabilities.length === 0 &&
      !problems.some((p) => p.field === 'roles')
    ) {
      problems.push({ field: 'roles', message: 'Choose at least one role.' });
    }
    const provider = input.identityProvider ?? 'LOCAL';
    if (provider !== 'LOCAL' && provider !== 'DIRECTORY') {
      problems.push({ field: 'identityProvider', message: 'Choose LOCAL or DIRECTORY.' });
    }
    const password = typeof input.password === 'string' ? input.password : '';
    if (provider === 'DIRECTORY') {
      if (!this.directory.enabled) {
        problems.push({
          field: 'identityProvider',
          message: 'Directory sign-in is not set up on this server.',
        });
      }
      if (password) {
        problems.push({
          field: 'password',
          message: 'A directory account has no password here. The directory keeps it.',
        });
      }
    } else {
      const passwordProblem = checkPasswordPolicy(password);
      if (passwordProblem) problems.push({ field: 'password', message: passwordProblem });
    }
    if (problems.length > 0) refuse(problems);

    const passwordHash = provider === 'DIRECTORY' ? null : await hashPassword(password);
    return this.commands.run(
      actor,
      // The password is left out on purpose, so nothing derived from it is kept with the request.
      {
        operation: 'staff.create',
        key,
        payload: { username, fullName, roles, capabilities, provider },
      },
      async (tx, { requestId }) => {
        const taken = await tx.query('SELECT 1 FROM staff_users WHERE username = $1', [username]);
        if (taken.rows.length > 0) {
          throw new DomainError(409, 'USERNAME_TAKEN', 'That username is already used.', [
            { field: 'username', message: 'That username is already used.' },
          ]);
        }
        const id = randomUUID();
        await tx.query(
          `INSERT INTO staff_users(id, username, full_name, identity_provider, password_hash, external_subject, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, true)`,
          [
            id,
            username,
            fullName,
            provider,
            passwordHash,
            provider === 'DIRECTORY' ? username : null,
          ],
        );
        await this.writeSets(tx, id, roles, capabilities);
        await this.audit(tx, actor, requestId, 'STAFF_CREATED', id, null, {
          username,
          fullName,
          roles,
          capabilities,
        });
        return { status: 201, body: (await this.one(tx, id))! };
      },
    );
  }

  async update(actor: Actor, key: string | undefined, id: string, body: unknown) {
    requireCapability(actor, 'MANAGE_STAFF');
    this.requireKnownShape(id);
    const input = (typeof body === 'object' && body !== null ? body : {}) as Record<
      string,
      unknown
    >;
    const problems: FieldProblem[] = [];
    const change: {
      fullName?: string;
      roles?: ClinicalRole[];
      capabilities?: StaffCapability[];
      isActive?: boolean;
      isAvailable?: boolean;
    } = {};
    if (input.fullName !== undefined) {
      const name = typeof input.fullName === 'string' ? input.fullName.trim() : '';
      if (name.length < 1 || name.length > 120) {
        problems.push({
          field: 'fullName',
          message: 'Enter the full name (up to 120 characters).',
        });
      } else change.fullName = name;
    }
    const roles = readSet(input.roles, CLINICAL_ROLES, 'roles', problems);
    if (roles) change.roles = roles;
    const capabilities = readSet(input.capabilities, STAFF_CAPABILITIES, 'capabilities', problems);
    if (capabilities) change.capabilities = capabilities;
    for (const flag of ['isActive', 'isAvailable'] as const) {
      if (input[flag] === undefined) continue;
      if (typeof input[flag] !== 'boolean')
        problems.push({ field: flag, message: 'Must be true or false.' });
      else change[flag] = input[flag];
    }
    if (problems.length > 0) refuse(problems);

    return this.commands.run(
      actor,
      { operation: 'staff.update', key, payload: { id, change } },
      async (tx, { requestId }) => {
        const before = await this.one(tx, id, true);
        if (!before) throw new DomainError(404, 'STAFF_NOT_FOUND', 'No such staff account.');

        const after = {
          fullName: change.fullName ?? before.fullName,
          roles: change.roles ?? before.roles,
          capabilities: change.capabilities ?? before.capabilities,
          isActive: change.isActive ?? before.isActive,
          isAvailable: change.isAvailable ?? before.isAvailable,
        };
        if (after.roles.length === 0 && after.capabilities.length === 0) {
          refuse([{ field: 'roles', message: 'Keep at least one role or access.' }]);
        }
        if (id === actor.id) {
          if (!after.isActive) {
            throw new DomainError(
              409,
              'CANNOT_SWITCH_OFF_SELF',
              'You cannot switch off your own account.',
            );
          }
          if (!after.capabilities.includes('MANAGE_STAFF')) {
            throw new DomainError(
              409,
              'CANNOT_REMOVE_OWN_ACCESS',
              'You cannot remove your own permission to manage staff. Ask another administrator.',
            );
          }
        }
        // Someone must always be able to manage staff.
        const others = await tx.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM staff_users u JOIN staff_capabilities c ON c.staff_id = u.id
            WHERE u.id <> $1 AND u.is_active AND c.capability = 'MANAGE_STAFF'`,
          [id],
        );
        if (
          others.rows[0]!.n === 0 &&
          !(after.isActive && after.capabilities.includes('MANAGE_STAFF'))
        ) {
          throw new DomainError(
            409,
            'LAST_ADMINISTRATOR',
            'At least one active account must be able to manage staff.',
          );
        }

        await tx.query(
          `UPDATE staff_users SET full_name = $2, is_active = $3, is_available = $4, updated_at = now() WHERE id = $1`,
          [id, after.fullName, after.isActive, after.isAvailable],
        );
        if (change.roles || change.capabilities) {
          await this.writeSets(tx, id, after.roles, after.capabilities);
        }
        if (before.isActive && !after.isActive) await this.endSessions(tx, id);
        await this.audit(
          tx,
          actor,
          requestId,
          'STAFF_UPDATED',
          id,
          {
            fullName: before.fullName,
            roles: before.roles,
            capabilities: before.capabilities,
            isActive: before.isActive,
            isAvailable: before.isAvailable,
          },
          after,
        );
        return { status: 200, body: (await this.one(tx, id))! };
      },
    );
  }

  async setPassword(actor: Actor, key: string | undefined, id: string, body: unknown) {
    requireCapability(actor, 'MANAGE_STAFF');
    this.requireKnownShape(id);
    const input = (typeof body === 'object' && body !== null ? body : {}) as Record<
      string,
      unknown
    >;
    const password = typeof input.password === 'string' ? input.password : '';
    const problem = checkPasswordPolicy(password);
    if (problem) refuse([{ field: 'password', message: problem }]);
    const passwordHash = await hashPassword(password);

    return this.commands.run(
      actor,
      { operation: 'staff.password', key, payload: { id } },
      async (tx, { requestId }) => {
        const member = await this.one(tx, id, true);
        if (!member) throw new DomainError(404, 'STAFF_NOT_FOUND', 'No such staff account.');
        if (member.identityProvider === 'DIRECTORY') {
          throw new DomainError(
            409,
            'DIRECTORY_ACCOUNT',
            'This account signs in with the hospital directory. Its password is changed there.',
          );
        }
        await tx.query(
          'UPDATE staff_users SET password_hash = $2, updated_at = now() WHERE id = $1',
          [id, passwordHash],
        );
        await this.endSessions(tx, id);
        await tx.query('DELETE FROM login_throttle WHERE username = $1', [member.username]);
        await this.audit(tx, actor, requestId, 'STAFF_PASSWORD_RESET', id, null, {
          username: member.username,
        });
        return { status: 200, body: member };
      },
    );
  }

  /** Removes an account nothing was ever recorded against. An account with history is switched off instead. */
  async remove(actor: Actor, key: string | undefined, id: string) {
    requireCapability(actor, 'MANAGE_STAFF');
    this.requireKnownShape(id);

    return this.commands.run(
      actor,
      { operation: 'staff.delete', key, payload: { id } },
      async (tx, { requestId }) => {
        const member = await this.one(tx, id, true);
        if (!member) throw new DomainError(404, 'STAFF_NOT_FOUND', 'No such staff account.');
        if (id === actor.id) {
          throw new DomainError(409, 'CANNOT_DELETE_SELF', 'You cannot delete your own account.');
        }
        if (!member.canDelete) {
          throw new DomainError(
            409,
            'HAS_HISTORY',
            'This account appears in the history, so it cannot be deleted. Switch it off instead.',
          );
        }
        const others = await tx.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM staff_users u JOIN staff_capabilities c ON c.staff_id = u.id
            WHERE u.id <> $1 AND u.is_active AND c.capability = 'MANAGE_STAFF'`,
          [id],
        );
        if (others.rows[0]!.n === 0 && member.capabilities.includes('MANAGE_STAFF')) {
          throw new DomainError(
            409,
            'LAST_ADMINISTRATOR',
            'At least one active account must be able to manage staff.',
          );
        }
        for (const table of CLEARED_WITH_ACCOUNT) {
          const column =
            table === 'notifications'
              ? 'recipient_id'
              : table === 'idempotency_records'
                ? 'actor_id'
                : 'staff_id';
          await tx.query(`DELETE FROM ${table} WHERE ${column} = $1::uuid`, [id]);
        }
        await tx.query('DELETE FROM login_throttle WHERE username = $1', [member.username]);
        await tx.query('DELETE FROM staff_users WHERE id = $1::uuid', [id]);
        await this.audit(
          tx,
          actor,
          requestId,
          'STAFF_DELETED',
          id,
          {
            username: member.username,
            fullName: member.fullName,
            roles: member.roles,
            capabilities: member.capabilities,
          },
          null,
        );

        return { status: 200, body: member };
      },
    );
  }

  /** Ids of accounts that something in the system points at, other than rows that go with the account. */
  private async usedIds(db: Queryable): Promise<Set<string>> {
    const found = await db.query<{ tbl: string; col: string }>(
      `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND c.confrelid = 'staff_users'::regclass`,
    );
    const sources = found.rows
      .filter((row) => !CLEARED_WITH_ACCOUNT.has(row.tbl))
      .map((row) => `SELECT ${row.col}::text AS id FROM ${row.tbl} WHERE ${row.col} IS NOT NULL`);
    if (sources.length === 0) return new Set();
    const used = await db.query<{ id: string }>(sources.join(' UNION '));

    return new Set(used.rows.map((row) => row.id));
  }

  /** An id that is not even shaped like one cannot match anyone. */
  private requireKnownShape(id: string): void {
    if (!UUID.test(id)) throw new DomainError(404, 'STAFF_NOT_FOUND', 'No such staff account.');
  }

  private async one(db: Queryable, id: string, lock = false): Promise<StaffMember | null> {
    if (lock)
      await db
        .query('SELECT 1 FROM staff_users WHERE id = $1 FOR UPDATE', [id])
        .catch(() => undefined);
    const found = await db.query<Row>(
      `SELECT u.id, u.username, u.full_name, u.identity_provider, u.is_active, u.is_available, u.created_at,
              COALESCE((SELECT array_agg(r.role_code ORDER BY r.role_code) FROM staff_roles r WHERE r.staff_id = u.id), '{}') AS roles,
              COALESCE((SELECT array_agg(c.capability ORDER BY c.capability) FROM staff_capabilities c WHERE c.staff_id = u.id), '{}') AS capabilities,
              (SELECT max(a.occurred_at) FROM audit_events a WHERE a.actor_id = u.id AND a.action = 'LOGIN_SUCCEEDED') AS last_login
         FROM staff_users u WHERE u.id::text = $1`,
      [id],
    );
    return found.rows[0] ? toMember(found.rows[0], await this.usedIds(db)) : null;
  }

  private async writeSets(
    tx: Queryable,
    id: string,
    roles: readonly string[],
    capabilities: readonly string[],
  ): Promise<void> {
    await tx.query('DELETE FROM staff_roles WHERE staff_id = $1', [id]);
    await tx.query('DELETE FROM staff_capabilities WHERE staff_id = $1', [id]);
    for (const role of roles) {
      await tx.query('INSERT INTO staff_roles(staff_id, role_code) VALUES ($1, $2)', [id, role]);
    }
    for (const capability of capabilities) {
      await tx.query('INSERT INTO staff_capabilities(staff_id, capability) VALUES ($1, $2)', [
        id,
        capability,
      ]);
    }
  }

  private async endSessions(tx: Queryable, id: string): Promise<void> {
    await tx.query(
      'UPDATE staff_sessions SET revoked_at = now() WHERE staff_id = $1 AND revoked_at IS NULL',
      [id],
    );
  }

  private async audit(
    tx: Queryable,
    actor: Actor,
    requestId: string,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO audit_events(actor_id, actor_roles, action, entity_type, entity_id, before_values, after_values, request_id)
       VALUES ($1::uuid, $2::text[], $3::text, 'STAFF_USER', $4::text, $5::jsonb, $6::jsonb, $7::uuid)`,
      [
        actor.id,
        [...actor.roles],
        action,
        entityId,
        before === null ? null : JSON.stringify(before),
        after === null ? null : JSON.stringify(after),
        requestId,
      ],
    );
  }
}
