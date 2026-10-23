import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

// promisify loses the overload that takes options, so the signature is restated here.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Password hashing with scrypt from Node's own crypto module.
 *
 * No native dependency on purpose: argon2 and bcrypt both need a build toolchain, which turns
 * a routine `npm ci` into a platform problem on a small team. scrypt is memory-hard, is in the
 * standard library, and is strong enough for a pilot.
 *
 * N is 2^14 rather than 2^15 because 2^15 with r=8 lands exactly on Node's default 32MB maxmem
 * and throws.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(plain.normalize('NFKC'), salt, KEY_LENGTH, { N, r: R, p: P });

  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(keyB64, 'base64url');

  const actual = await scryptAsync(plain.normalize('NFKC'), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });

  // Constant time: a length check first, because timingSafeEqual throws on a mismatch.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Session tokens are 256 bits of randomness, so they need no slow hash. Only the digest is
 * stored: a copy of the database cannot then be used to impersonate anyone.
 */
export function issueSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
