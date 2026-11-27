import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { Actor } from '../../apps/api/src/auth/actor.js';
import { CommandService, canonicalJson } from '../../apps/api/src/transactions/command.service.js';
import { DomainError } from '../../apps/api/src/transactions/domain-error.js';
import { addStaff, createTestDatabase } from '../helpers/test-database.js';

describe('TXN-001 canonical request text', () => {
  it('is the same whatever order the keys were written in, and ignores undefined', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }], u: undefined })).toBe(
      canonicalJson({ a: [{ c: 2, d: 1 }], b: 1 }),
    );
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });
});

describe('TXN-002 idempotent command service', () => {
  let test: Awaited<ReturnType<typeof createTestDatabase>>;
  let commands: CommandService;
  let actor: Actor;
  let other: Actor;
  const asActor = (id: string): Actor => ({
    id,
    username: id,
    fullName: 'Synthetic',
    roles: ['CONSULTANT'],
    capabilities: [],
    sessionId: id,
  });
  const key = () => crypto.randomUUID();

  beforeAll(async () => {
    test = await createTestDatabase();
    commands = new CommandService(test.service);
    actor = asActor((await addStaff(test.db, { roles: ['CONSULTANT'] })).id);
    other = asActor((await addStaff(test.db, { roles: ['CONSULTANT'] })).id);
  });
  afterAll(() => test.close());

  it('requires an Idempotency-Key that is a UUID', async () => {
    for (const bad of [undefined, '', 'not-a-uuid']) {
      await expect(
        commands.run(actor, { operation: 'op', key: bad, payload: {} }, async () => ({
          status: 201,
          body: {},
        })),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }
  });

  it('runs the work once and replays the first answer for the same key and request', async () => {
    const k = key();
    let runs = 0;
    const work = async () => {
      runs += 1;
      return { status: 201, body: { run: runs } };
    };
    const first = await commands.run(
      actor,
      { operation: 'op', key: k, payload: { a: 1, b: 2 } },
      work,
    );
    const again = await commands.run(
      actor,
      { operation: 'op', key: k, payload: { b: 2, a: 1 } },
      work,
    );
    expect(runs).toBe(1);
    expect(first).toEqual({ status: 201, body: { run: 1 }, replayed: false });
    expect(again).toEqual({ status: 201, body: { run: 1 }, replayed: true });
  });

  it('refuses the same key for a different request or a different operation', async () => {
    const k = key();
    const work = async () => ({ status: 200, body: {} });
    await commands.run(actor, { operation: 'op', key: k, payload: { a: 1 } }, work);
    await expect(
      commands.run(actor, { operation: 'op', key: k, payload: { a: 2 } }, work),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 422 });
    await expect(
      commands.run(actor, { operation: 'other-op', key: k, payload: { a: 1 } }, work),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('keeps keys separate for each staff member', async () => {
    const k = key();
    let runs = 0;
    const work = async () => ({ status: 200, body: { run: ++runs } });
    await commands.run(actor, { operation: 'op', key: k, payload: {} }, work);
    const second = await commands.run(other, { operation: 'op', key: k, payload: {} }, work);
    expect(second.replayed).toBe(false);
    expect(runs).toBe(2);
  });

  it('saves nothing when the work is refused, so the same key can be tried again', async () => {
    const k = key();
    await expect(
      commands.run(actor, { operation: 'op', key: k, payload: {} }, async (tx) => {
        await tx.query(
          `INSERT INTO audit_events(action, entity_type, entity_id, request_id)
           VALUES ('SHOULD_ROLL_BACK', 'TEST', 'x', gen_random_uuid())`,
        );
        throw new DomainError(409, 'REFUSED', 'No.');
      }),
    ).rejects.toMatchObject({ code: 'REFUSED' });
    const rolledBack = await test.db.query(
      "SELECT 1 FROM audit_events WHERE action = 'SHOULD_ROLL_BACK'",
    );
    expect(rolledBack.rows).toHaveLength(0);
    const saved = await test.db.query(
      'SELECT 1 FROM idempotency_records WHERE request_key = $1::uuid',
      [k],
    );
    expect(saved.rows).toHaveLength(0);
    const retry = await commands.run(actor, { operation: 'op', key: k, payload: {} }, async () => ({
      status: 200,
      body: { ok: true },
    }));
    expect(retry.replayed).toBe(false);
  });

  it('gives each request one request id for all its audit rows, and runs again after the record expires', async () => {
    const k = key();
    let seen = '';
    await commands.run(actor, { operation: 'op', key: k, payload: {} }, async (_tx, context) => {
      seen = context.requestId;
      return { status: 200, body: {} };
    });
    expect(seen).toMatch(/^[0-9a-f-]{36}$/);
    await test.db.query(
      "UPDATE idempotency_records SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE request_key = $1::uuid",
      [k],
    );
    const rerun = await commands.run(actor, { operation: 'op', key: k, payload: {} }, async () => ({
      status: 200,
      body: { second: true },
    }));
    expect(rerun).toEqual({ status: 200, body: { second: true }, replayed: false });
  });
});
