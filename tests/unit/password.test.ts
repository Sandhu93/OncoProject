import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  checkPasswordPolicy,
  hashPassword,
  verifyPassword,
} from '../../apps/api/src/auth/password.js';

describe('AUTH-001 password hashing', () => {
  it('verifies the right password and refuses a wrong one', async () => {
    const stored = await hashPassword('a long synthetic passphrase');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(stored).not.toContain('synthetic');
    expect(await verifyPassword('a long synthetic passphrase', stored)).toBe(true);
    expect(await verifyPassword('a long synthetic passphras', stored)).toBe(false);
  });

  it('uses a different salt every time', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same passphrase!'),
      hashPassword('same passphrase!'),
    ]);
    expect(a).not.toEqual(b);
  });

  it('refuses malformed or out-of-range stored hashes instead of throwing', async () => {
    expect(await verifyPassword('x', 'plain-text')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$1$1$1$AAAA$AAAA')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$99999999$8$1$AAAA$AAAA')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$32768$8$1$AAAA$AAAA')).toBe(false);
  });

  it('enforces length limits', () => {
    expect(checkPasswordPolicy('x'.repeat(PASSWORD_MIN_LENGTH - 1))).toMatch(/at least/);
    expect(checkPasswordPolicy('x'.repeat(PASSWORD_MAX_LENGTH + 1))).toMatch(/at most/);
    expect(checkPasswordPolicy('x'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });
});
