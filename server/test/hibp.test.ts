import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { passwordBreachStatus } from '../src/auth/hibp.js';

describe('HIBP k-anonymity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends only the first 5 SHA-1 hex characters', async () => {
    const password = 'horse-battery-staple-99';
    const digest = createHash('sha1').update(password).digest('hex').toUpperCase();
    let requested = '';
    const result = await passwordBreachStatus(password, async (input) => {
      requested = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return new Response(`${digest.slice(5)}:3\n`, { status: 200 });
    });
    expect(result).toBe(true);
    expect(requested).toBe(`https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`);
    expect(requested).not.toContain(digest.slice(5));
    expect(requested).not.toContain(password);
  });

  it('fails open when HIBP is unreachable and does not log the password', async () => {
    const password = 'horse-battery-staple-99';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await passwordBreachStatus(password, async () => {
      throw new Error('network down');
    });
    expect(result).toBe('unavailable');
    const logged = spy.mock.calls.flat().join(' ');
    expect(logged.toLowerCase()).toContain('fail open');
    expect(logged).not.toContain(password);
  });

  it('fails open on a non-200 range response', async () => {
    const result = await passwordBreachStatus('horse-battery-staple-99', async () => {
      return new Response('nope', { status: 503 });
    });
    expect(result).toBe('unavailable');
  });
});
