import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const KEY_LENGTH = 64;
const COST = { N: 32768, r: 8, p: 1 } as const;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { ...params, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** Returns a message when the password is not acceptable, otherwise null. */
export function checkPasswordPolicy(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}

/** Stored as scrypt$N$r$p$salt$hash (base64). The salt is random per password. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), key.toString('base64')].join(
    '$',
  );
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltText, keyText] = parts as [string, string, string, string, string, string];
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (
    !Number.isInteger(params.N) ||
    !Number.isInteger(params.r) ||
    !Number.isInteger(params.p) ||
    params.N < 2 ||
    params.N > 1 << 20 ||
    params.r < 1 ||
    params.r > 16 ||
    params.p < 1 ||
    params.p > 4
  ) {
    return false;
  }
  const expected = Buffer.from(keyText, 'base64');
  if (expected.length !== KEY_LENGTH) return false;
  let actual: Buffer;
  try {
    actual = await derive(password, Buffer.from(saltText, 'base64'), params);
  } catch {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

/** Spends the same time as a real check, so an unknown username is not faster than a wrong password. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, await dummyHash);
}
