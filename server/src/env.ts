import { config } from 'dotenv';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type MailTransportName = 'resend' | 'console' | 'memory';

export type Env = {
  NODE_ENV: string;
  DATABASE_URL: string;
  SESSION_SECRET: string;
  ENCRYPTION_KEY: string;
  APP_URL: string;
  PORT: number;
  MAIL_FROM: string;
  MAIL_TRANSPORT: MailTransportName;
  RESEND_API_KEY?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** Reverse proxies that append to X-Forwarded-For. 0 ignores the header. Unset defaults to 0. */
  TRUSTED_PROXY_HOPS: number;
};

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function required(name: string): string {
  const value = blankToUndefined(process.env[name]);
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function requireLong(name: string, min: number): string {
  const value = required(name);
  if (value.length < min) throw new Error(`${name} must be at least ${min} characters`);
  return value;
}

export function resolveMailTransport(
  nodeEnv: string,
  resendKey: string | undefined,
  explicit: string | undefined,
): MailTransportName {
  if (
    explicit !== undefined &&
    explicit !== 'resend' &&
    explicit !== 'console' &&
    explicit !== 'memory'
  ) {
    throw new Error('MAIL_TRANSPORT must be resend, console, or memory');
  }
  if (nodeEnv === 'production' && explicit !== undefined && explicit !== 'resend') {
    throw new Error('Production mail must use Resend');
  }
  if (explicit === 'resend' && !resendKey) {
    throw new Error('RESEND_API_KEY is required when MAIL_TRANSPORT=resend');
  }
  if (explicit) return explicit;
  if (resendKey) return 'resend';
  if (nodeEnv === 'production') throw new Error('RESEND_API_KEY is required in production');
  if (nodeEnv === 'test') return 'memory';
  return 'console';
}

export function loadEnv(): Env {
  config({ path: join(repoRoot, '.env'), quiet: true });

  const nodeEnv = process.env.NODE_ENV?.trim() || 'development';
  const databaseUrl = required('DATABASE_URL');
  if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must be a postgres connection string');
  }

  const appUrl = required('APP_URL');
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('bad protocol');
    }
  } catch {
    throw new Error('APP_URL must be an absolute http(s) URL');
  }

  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }

  const trustedProxyHops = trustedHops(process.env.TRUSTED_PROXY_HOPS);

  const resendKey = blankToUndefined(process.env.RESEND_API_KEY);
  const encryptionKey = requireLong('ENCRYPTION_KEY', 32);

  return {
    NODE_ENV: nodeEnv,
    DATABASE_URL: databaseUrl,
    SESSION_SECRET: requireLong('SESSION_SECRET', 32),
    ENCRYPTION_KEY: encryptionKey,
    APP_URL: appUrl.replace(/\/$/, ''),
    PORT: port,
    MAIL_FROM: blankToUndefined(process.env.MAIL_FROM) ?? 'Pipeline <noreply@example.test>',
    MAIL_TRANSPORT: resolveMailTransport(
      nodeEnv,
      resendKey,
      blankToUndefined(process.env.MAIL_TRANSPORT),
    ),
    RESEND_API_KEY: resendKey,
    GITHUB_CLIENT_ID: blankToUndefined(process.env.GITHUB_CLIENT_ID),
    GITHUB_CLIENT_SECRET: blankToUndefined(process.env.GITHUB_CLIENT_SECRET),
    TRUSTED_PROXY_HOPS: trustedProxyHops,
  };
}

/**
 * Unset means 0: ignore X-Forwarded-For and use the socket.
 * Invalid or negative values fail startup. They are not treated as "trust the header".
 */
function trustedHops(raw: string | undefined): number {
  const value = blankToUndefined(raw);
  if (value === undefined) return 0;
  if (!/^\d+$/.test(value)) {
    throw new Error(
      'TRUSTED_PROXY_HOPS must be a non-negative integer; unset defaults to 0 and ignores X-Forwarded-For',
    );
  }
  const hops = Number(value);
  if (!Number.isSafeInteger(hops) || hops > 32) {
    throw new Error('TRUSTED_PROXY_HOPS must be an integer from 0 to 32');
  }
  return hops;
}

export function appOrigin(env: Env): string {
  return new URL(env.APP_URL).origin;
}
