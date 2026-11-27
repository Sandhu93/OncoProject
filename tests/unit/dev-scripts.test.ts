import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const run = (script: string, env: Record<string, string>) =>
  spawnSync(process.execPath, [new URL(`../../scripts/${script}`, import.meta.url).pathname], {
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8',
  });

describe('DEV-001 local-only helper commands refuse anything but a local database', () => {
  const remote = 'postgresql://user:secret@db.example.com:5432/oncotrack_dev';

  it('create-test-staff will not set known passwords on a remote database', () => {
    const result = run('create-test-staff.mjs', { DATABASE_URL: remote });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Refusing to create test accounts/);
    expect(result.stderr).not.toMatch(/secret/);
  });

  it('create-test-staff will not run in production even against localhost', () => {
    const result = run('create-test-staff.mjs', {
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/x',
      NODE_ENV: 'production',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Refusing/);
  });

  it('activate-dev-workflow refuses a remote host, a non-dev database name, or a non-development mode', () => {
    for (const env of [
      { DATABASE_URL: remote, NODE_ENV: 'development' },
      { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/oncotrack', NODE_ENV: 'development' },
      { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/oncotrack_dev', NODE_ENV: 'production' },
      { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/oncotrack_dev' },
    ]) {
      const result = run('activate-dev-workflow.mjs', env);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/Refusing to activate/);
      expect(result.stderr).not.toMatch(/secret|:p@/);
    }
  });
});
