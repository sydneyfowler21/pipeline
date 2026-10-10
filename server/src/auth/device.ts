/** Browser and OS from a user agent. No location, no raw fingerprint. */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Browser';
  const os = /iPhone|iPad/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Mac OS X|Macintosh/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Unknown OS';
  return `${browser} on ${os}`;
}

const EVENT_LABELS: Record<string, string> = {
  sign_in: 'Signed in',
  sign_in_failure: 'Sign-in failed',
  sign_out: 'Signed out',
  sign_out_all: 'Signed out everywhere',
  password_reset: 'Password reset',
  email_verified: 'Email confirmed',
  password_change: 'Password changed',
  session_revoked: 'Signed out a device',
};

export function authEventLabel(kind: string): string {
  return EVENT_LABELS[kind] ?? 'Security event';
}
