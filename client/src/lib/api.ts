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

export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('X-CSRF-Token', await ensureCsrf());
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  }
  return fetch(path, { ...init, headers, credentials: 'same-origin' });
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await api(path, init);
  const text = await response.text();
  const body = (text ? JSON.parse(text) : {}) as T & ApiBody;
  if (!response.ok) throw new ApiError(response.status, body);
  return body;
}
