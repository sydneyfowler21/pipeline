import { sessionEnded } from './session';
import type { ApiBody } from './types';

export class ApiError extends Error {
  status: number;
  field?: string;
  retryAfterSeconds?: number;
  body: ApiBody;

  constructor(status: number, body: ApiBody) {
    super(body.error ?? body.message ?? 'Request failed');
    this.status = status;
    this.field = body.field;
    this.retryAfterSeconds = body.retryAfterSeconds;
    this.body = body;
  }
}

let csrfToken: string | null = null;

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Could not fetch CSRF token');
  const body = (await response.json()) as { csrfToken: string };
  csrfToken = body.csrfToken;
  return csrfToken;
}

const CREDENTIAL_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/me',
  '/api/auth/csrf',
  '/api/auth/request-reset',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/logout',
  '/api/auth/logout-all',
]);

export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('X-CSRF-Token', await ensureCsrf());
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (await isExpiredSession(path, response)) sessionEnded();
  return response;
}

async function isExpiredSession(path: string, response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  const pathname = path.split('?')[0] ?? path;
  if (CREDENTIAL_PATHS.has(pathname)) return false;
  try {
    const body = (await response.clone().json()) as { error?: string };
    if (body.error && body.error !== 'Unauthorized') return false;
  } catch {
    /* A 401 without JSON on an authenticated route is still a dead session. */
  }
  return true;
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await api(path, init);
  const text = await response.text();
  const body = (text ? JSON.parse(text) : {}) as T & ApiBody;
  if (!response.ok) throw new ApiError(response.status, body);
  return body;
}
