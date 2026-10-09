import { isIP } from 'node:net';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import type { ZodError } from 'zod';
import { MSG } from './messages.js';

/**
 * Client address from a trusted-proxy hop count.
 * N means N proxies each appended the peer they saw, so the client is N from the right.
 * Fewer entries than N, or a value that is not an IP, falls back to the socket.
 * N = 0 ignores X-Forwarded-For (local and tests).
 */
export function deriveClientIp(input: {
  forwardedFor: string | undefined;
  remoteAddress: string | undefined;
  trustedProxyHops: number;
}): string {
  const socket = normalizeIp(input.remoteAddress);
  if (input.trustedProxyHops <= 0) return socket ?? 'unknown';
  const parts = (input.forwardedFor ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < input.trustedProxyHops) return socket ?? 'unknown';
  const chosen = parts[parts.length - input.trustedProxyHops];
  return normalizeIp(chosen) ?? socket ?? 'unknown';
}

function normalizeIp(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (isIP(trimmed) === 0) return null;
  return trimmed;
}

function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

export function clientIp(c: Context, trustedProxyHops: number): string {
  return deriveClientIp({
    forwardedFor: c.req.header('x-forwarded-for'),
    remoteAddress: socketAddress(c),
    trustedProxyHops,
  });
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
