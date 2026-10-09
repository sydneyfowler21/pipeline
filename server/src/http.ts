import type { Context } from 'hono';
import type { ZodError } from 'zod';
import { MSG } from './messages.js';

export function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const real = c.req.header('x-real-ip');
  if (real) return real.slice(0, 128);
  return 'unknown';
}

export function userAgent(c: Context): string | null {
  const value = c.req.header('user-agent');
  if (!value) return null;
  return value.slice(0, 500);
}

export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export function invalidInput(error: ZodError) {
  return {
    error: MSG.invalidInput,
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return null;
}

const THIRTY_DAYS = 30 * 24 * 60 * 60;

export function sessionCookie(token: string): string {
  return `__Host-sid=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${THIRTY_DAYS}`;
}

export function clearSessionCookie(): string {
  return `__Host-sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function csrfCookie(token: string): string {
  return `__Host-csrf=${token}; Secure; SameSite=Lax; Path=/; Max-Age=${THIRTY_DAYS}`;
}

export const CSRF_COOKIE = '__Host-csrf';
export const SESSION_COOKIE = '__Host-sid';
