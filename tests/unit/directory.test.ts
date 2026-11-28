import { InvalidCredentialsError } from 'ldapts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildBindDn,
  DirectoryService,
  DirectoryUnavailableError,
  type DirectoryClient,
} from '../../apps/api/src/auth/directory.service.js';
import { readConfig } from '../../apps/api/src/config.js';

const ENV = {
  DIRECTORY_URL: 'ldaps://directory.hospital.local',
  DIRECTORY_BIND_DN: 'uid={username},ou=staff,dc=hospital,dc=local',
};

class FakeClient implements DirectoryClient {
  calls: string[] = [];
  constructor(private readonly outcome: 'ok' | 'wrong' | 'down') {}
  async startTLS() {
    this.calls.push('startTLS');
  }
  async bind(dn: string, password: string) {
    this.calls.push(`bind ${dn} ${password}`);
    if (this.outcome === 'wrong')
      throw new InvalidCredentialsError({ message: 'no', code: 49 } as never);
    if (this.outcome === 'down') throw new Error('connect ECONNREFUSED 10.0.0.9:636');
  }
  async unbind() {
    this.calls.push('unbind');
  }
}

const serviceWith = (client: FakeClient) =>
  new (class extends DirectoryService {
    protected override createClient() {
      return client;
    }
  })();

describe('DIR-001 directory configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is off unless a directory address is set', () => {
    expect(readConfig({}).directory).toBeUndefined();
    expect(readConfig(ENV).directory).toMatchObject({
      url: ENV.DIRECTORY_URL,
      timeoutMs: 5000,
      startTls: false,
    });
  });

  it('refuses a plain ldap:// address unless the connection is upgraded, and a DN without a name slot', () => {
    expect(() => readConfig({ ...ENV, DIRECTORY_URL: 'ldap://directory.hospital.local' })).toThrow(
      /START_TLS/,
    );
    expect(
      readConfig({
        ...ENV,
        DIRECTORY_URL: 'ldap://directory.hospital.local',
        DIRECTORY_START_TLS: 'true',
      }).directory,
    ).toMatchObject({ startTls: true });
    expect(() => readConfig({ ...ENV, DIRECTORY_BIND_DN: 'uid=someone,dc=hospital' })).toThrow(
      /\{username\}/,
    );
    expect(() => readConfig({ ...ENV, DIRECTORY_URL: 'http://x' })).toThrow(/ldaps/);
    expect(() => readConfig({ ...ENV, DIRECTORY_TIMEOUT_MS: '10' })).toThrow(
      /DIRECTORY_TIMEOUT_MS/,
    );
  });
});

describe('DIR-002 binding as the person', () => {
  const stub = (env: Record<string, string>) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  };
  afterEach(() => vi.unstubAllEnvs());

  it('builds the DN only from a name that is safe in one', () => {
    expect(buildBindDn(ENV.DIRECTORY_BIND_DN, 'dr.rao')).toBe(
      'uid=dr.rao,ou=staff,dc=hospital,dc=local',
    );
    expect(buildBindDn('{username}@hospital.local', 'dr.rao')).toBe('dr.rao@hospital.local');
    for (const bad of ['a,ou=admins', 'x*', 'a b', '', 'ab', 'x)(uid=*']) {
      expect(() => buildBindDn(ENV.DIRECTORY_BIND_DN, bad)).toThrow(DirectoryUnavailableError);
    }
  });

  it('accepts a password the directory accepts, and always lets go of the connection', async () => {
    stub(ENV);
    const client = new FakeClient('ok');

    expect(await serviceWith(client).authenticate('dr.rao', 'secret value')).toBe(true);
    expect(client.calls).toEqual([
      'bind uid=dr.rao,ou=staff,dc=hospital,dc=local secret value',
      'unbind',
    ]);
  });

  it('rejects a wrong password, and upgrades the connection first when asked to', async () => {
    stub({ ...ENV, DIRECTORY_URL: 'ldap://directory.hospital.local', DIRECTORY_START_TLS: 'true' });
    const client = new FakeClient('wrong');

    expect(await serviceWith(client).authenticate('dr.rao', 'nope')).toBe(false);
    expect(client.calls[0]).toBe('startTLS');
    expect(client.calls.at(-1)).toBe('unbind');
  });

  it('says it cannot decide when the directory does not answer, without leaking why', async () => {
    stub(ENV);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = new FakeClient('down');

    await expect(serviceWith(client).authenticate('dr.rao', 'secret value')).rejects.toThrow(
      new DirectoryUnavailableError('The directory did not answer.'),
    );
    expect(client.calls.at(-1)).toBe('unbind');
    log.mockRestore();
  });

  it('never binds with an empty password, which many directories treat as anonymous', async () => {
    stub(ENV);
    const client = new FakeClient('ok');

    expect(await serviceWith(client).authenticate('dr.rao', '')).toBe(false);
    expect(client.calls).toEqual([]);
  });

  it('cannot be used when no directory is set up', async () => {
    await expect(
      serviceWith(new FakeClient('ok')).authenticate('dr.rao', 'x'),
    ).rejects.toBeInstanceOf(DirectoryUnavailableError);
  });
});
