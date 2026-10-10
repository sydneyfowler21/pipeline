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
