import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Render `generateValue: true` is standard base64 of 32 bytes: 44 characters
 * with one trailing `=` (for example `B0jrphAPOY7pg92AN0c9MN4yecczLMdwnx4OkA1KFUk=`).
 */
const RENDER_GENERATED_SECRET = /^[A-Za-z0-9+/]{43}=$/;

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * 32-byte AES-256-GCM key for slice-2 TOTP secrets.
 * A Render-generated base64 secret decodes to those raw bytes.
 * Any other accepted string is SHA-256'd so the key is still 32 bytes.
 */
export function aes256Key(secret: string): Buffer {
  if (RENDER_GENERATED_SECRET.test(secret)) {
    const decoded = Buffer.from(secret, 'base64');
    if (decoded.length === 32) return decoded;
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

/** Session primary key. The cookie holds the raw token; the database stores this HMAC. */
export function sessionIdForToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

export function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
