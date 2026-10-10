import { randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

export function newSalt(): Buffer {
  return randomBytes(16);
}

export function hashSecret(secret: string, salt: Buffer): string {
  return scryptSync(secret, salt, 64).toString('hex');
}

export function verifySecret(
  secret: string,
  saltHex: string,
  hashHex: string,
): boolean {
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(secret, salt, 64);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Cryptographically secure, URL-safe token (e.g. session ids, share tokens). */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function newUuid(): string {
  return randomUUID();
}

/** Cryptographically secure 6-digit numeric PIN/OTP. */
export function newPin(): string {
  return String(randomInt(100000, 1000000));
}
