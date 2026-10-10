import { describe, expect, it } from 'vitest';
import { aes256Key } from '../src/crypto.js';
import { loadEnv, migrationDatabaseUrl } from '../src/env.js';

const RENDER_SECRET = 'B0jrphAPOY7pg92AN0c9MN4yecczLMdwnx4OkA1KFUk=';

describe('encryption key material', () => {
  it('decodes a Render generateValue secret to 32 bytes and hashes other secrets', () => {
    expect(RENDER_SECRET.length).toBeGreaterThanOrEqual(32);
    const generated = aes256Key(RENDER_SECRET);
    expect(generated).toEqual(Buffer.from(RENDER_SECRET, 'base64'));
    expect(generated).toHaveLength(32);

    const derived = aes256Key('test-encryption-key-32-characters!!');
    expect(derived).toHaveLength(32);
    expect(derived.equals(Buffer.from('test-encryption-key-32-characters!!'))).toBe(false);
    expect(derived.equals(aes256Key('test-encryption-key-32-characters!!'))).toBe(true);
  });

  it('accepts the Render secret as ENCRYPTION_KEY', () => {
    withEnv({ ENCRYPTION_KEY: RENDER_SECRET }, () => {
      expect(loadEnv().ENCRYPTION_KEY).toBe(RENDER_SECRET);
    });
  });
});

describe('migration database url', () => {
  const pooled = 'postgres://user:pass@ep-example-pooler.neon.tech/pipeline';
  const direct = 'postgres://user:pass@ep-example.neon.tech/pipeline';

  it('prefers DATABASE_URL_UNPOOLED, then DIRECT_URL, then DATABASE_URL', () => {
    expect(
      migrationDatabaseUrl({
        DATABASE_URL: pooled,
        DATABASE_URL_UNPOOLED: direct,
        DIRECT_URL: 'postgres://user:pass@other.example/pipeline',
      }),
    ).toBe(direct);
    expect(
      migrationDatabaseUrl({
        DATABASE_URL: pooled,
        DIRECT_URL: direct,
      }),
    ).toBe(direct);
    expect(migrationDatabaseUrl({ DATABASE_URL: pooled })).toBe(pooled);
  });

  it('reads an optional direct URL and ignores a blank one', () => {
    withEnv(
      {
        DATABASE_URL_UNPOOLED: direct,
        DIRECT_URL: undefined,
      },
      () => {
        expect(migrationDatabaseUrl(loadEnv())).toBe(direct);
      },
    );
    withEnv({ DATABASE_URL_UNPOOLED: '   ', DIRECT_URL: '' }, () => {
      expect(loadEnv().DATABASE_URL_UNPOOLED).toBeUndefined();
      expect(loadEnv().DIRECT_URL).toBeUndefined();
      expect(migrationDatabaseUrl(loadEnv())).toBe(process.env.DATABASE_URL);
    });
  });

  it('rejects a direct URL that is not postgres', () => {
    withEnv({ DATABASE_URL_UNPOOLED: 'mysql://localhost/pipeline' }, () => {
      expect(() => loadEnv()).toThrow(/DATABASE_URL_UNPOOLED/);
    });
  });
});

function withEnv(values: Record<string, string | undefined>, run: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
