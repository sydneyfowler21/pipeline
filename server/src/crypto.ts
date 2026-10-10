import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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
