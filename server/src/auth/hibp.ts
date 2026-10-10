import { createHash } from 'node:crypto';

export type HibpResult = boolean | 'unavailable';

/**
 * HIBP k-anonymity range API. Only the first 5 hex chars of the SHA-1 digest leave the process.
 * If HIBP is down, fail open and log a line that does not include the password.
 */
export async function passwordBreachStatus(
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HibpResult> {
  const digest = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  try {
    const response = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        'Add-Padding': 'true',
        'User-Agent': 'pipeline-auth',
      },
    });
    if (!response.ok) {
      console.error(
        `HIBP range check unavailable (status ${response.status}); allowing password (fail open)`,
      );
      return 'unavailable';
    }
    const body = await response.text();
    for (const line of body.split(/\r?\n/)) {
      const [hashSuffix, count] = line.trim().split(':');
      if (hashSuffix?.toUpperCase() === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    console.error('HIBP range check unavailable (network); allowing password (fail open)');
    return 'unavailable';
  }
}
