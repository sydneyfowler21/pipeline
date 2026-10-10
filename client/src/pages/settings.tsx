import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ApiError, apiJson } from '@/lib/api';
import {
  browserTimeZone,
  formatWhen,
  friendlyError,
  otherDeviceCount,
  passwordWarning,
} from '@/lib/copy';
import type { AuthEventRow, SessionRow } from '@/lib/types';
import { Alert, Button, ConfirmDialog } from '@/components/kit';
import { TextField, TimeZoneField } from '@/components/fields';
import { useAuth } from '@/components/auth-context';
import { SettingsNav } from '@/components/shell';

export function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1
        tabIndex={-1}
        className="text-[26px] font-semibold leading-8 tracking-tight sm:text-[30px] sm:leading-9"
      >
        Settings
      </h1>
      <div className="mt-6 md:flex md:gap-8">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

export function SecurityPage() {
  const { user } = useAuth();
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiJson<{ sessions: SessionRow[] }>('/api/auth/sessions'),
  });
  const events = useQuery({
    queryKey: ['events'],
    queryFn: () => apiJson<{ events: AuthEventRow[] }>('/api/auth/events'),
  });
  const others = otherDeviceCount(sessions.data?.sessions.length ?? 1);

  return (
    <SettingsLayout>
      <section className="card p-5 sm:p-6" aria-labelledby="sessions-heading">
        <h2 id="sessions-heading" className="text-[17px] font-semibold">
          Active sessions
        </h2>
        <p className="mt-1 text-[13.5px] text-muted">Device and IP only. No location.</p>
        {sessions.isPending ? <p className="mt-4 text-muted">Loading sessions…</p> : null}
        {sessions.isError ? (
          <div className="mt-4">
            <Alert tone="error">
              Couldn't load sessions.{' '}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void sessions.refetch()}
              >
                Try again
              </button>
            </Alert>
          </div>
        ) : null}
        <ul className="mt-4 divide-y divide-line">
          {sessions.data?.sessions.map((row, index, all) => (
            <SessionItem
              key={row.id}
              row={row}
              nextId={all.slice(index + 1).find((item) => !item.isCurrent)?.id}
            />
          ))}
        </ul>
        <SignOutEverywhere count={sessions.data?.sessions.length ?? 0} />
      </section>

      <section className="card mt-6 p-5 sm:p-6" aria-labelledby="password-heading">
        <h2 id="password-heading" tabIndex={-1} className="text-[17px] font-semibold">
          Change password
        </h2>
        {user?.isDemo ? (
          <div className="mt-4">
            <Alert tone="warn">
              Demo accounts can't change their password. Create your own account to use this.
            </Alert>
          </div>
        ) : (
          <p className="mt-2 text-[14px] text-muted">{passwordWarning(others)}</p>
        )}
        <PasswordForm disabled={Boolean(user?.isDemo)} />
      </section>

      <section className="card mt-6 p-5 sm:p-6" aria-labelledby="two-factor-heading">
        <h2 id="two-factor-heading" className="text-[17px] font-semibold">
          Two-factor authentication
        </h2>
        <p className="mt-2 text-[14px] text-muted">Not available yet.</p>
        <span className="mt-3 inline-flex h-6 items-center rounded-full bg-subtle px-2 text-[12px] font-medium">
          Coming in slice 2
        </span>
        <button type="button" className="btn btn-secondary mt-4" disabled aria-disabled="true">
          Set up two-factor authentication
        </button>
      </section>

      <section className="card mt-6 p-5 sm:p-6" aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-[17px] font-semibold">
          Sign-in history
        </h2>
        <p className="mt-1 text-[13.5px] text-muted">Times use {user?.timeZone}.</p>
        {events.data && events.data.events.length === 0 ? (
          <p className="mt-4 text-[14px] text-muted">No security events yet.</p>
        ) : null}
        <ul className="mt-4 divide-y divide-line">
          {events.data?.events.map((event) => (
            <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <span>
                <span className="font-medium">{event.label}</span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  {event.device}
                  {event.ip ? ` · ${event.ip}` : ''}
                </span>
              </span>
              <span className="num text-[13px] text-muted">
                {user ? formatWhen(event.createdAt, user.timeZone) : event.createdAt}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </SettingsLayout>
  );
}

export function SessionSignOutControl({
  isCurrent,
  device,
  sessionId,
  pending,
  onSignOut,
}: {
  isCurrent: boolean;
  device: string;
  sessionId?: string;
  pending?: boolean;
  onSignOut?: () => void;
}) {
  if (isCurrent) {
    return <p className="text-[13px] text-muted">Sign out here from the account menu.</p>;
  }
  return (
    <Button
      variant="session"
      data-session-signout={sessionId}
      pending={pending}
      pendingLabel="Signing out…"
      aria-label={`Sign out ${device}`}
      onClick={onSignOut}
    >
      Sign out
    </Button>
  );
}

function SessionItem({ row, nextId }: { row: SessionRow; nextId?: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [pending, setPending] = useState(false);

  async function revoke() {
    setPending(true);
    try {
      await apiJson(`/api/sessions/${row.id}`, { method: 'DELETE' });
      toast.success(`Signed out ${row.device}.`);
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      window.setTimeout(() => {
        const next = nextId
          ? document.querySelector<HTMLButtonElement>(
              `[data-session-signout="${CSS.escape(nextId)}"]`,
            )
          : document.getElementById('sign-out-everywhere');
        next?.focus();
      }, 50);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? friendlyError(error.body) : 'Could not sign out that device.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <p className="font-medium">
          {row.device}{' '}
          {row.isCurrent ? (
            <span className="ml-1 rounded-full bg-ink px-2 py-0.5 text-[12px] font-medium text-white">
              This device
            </span>
          ) : null}
        </p>
        <p className="text-[13px] text-muted">
          {row.ip ?? 'Unknown IP'} · last seen{' '}
          {formatWhen(row.lastSeenAt, user?.timeZone ?? 'America/Denver')}
        </p>
        {row.isCurrent ? <SessionSignOutControl isCurrent device={row.device} /> : null}
      </div>
      {row.isCurrent ? null : (
        <SessionSignOutControl
          isCurrent={false}
          device={row.device}
          sessionId={row.id}
          pending={pending}
          onSignOut={() => void revoke()}
        />
      )}
    </li>
  );
}

function SignOutEverywhere({ count }: { count: number }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { finishSignOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await apiJson('/api/auth/logout-all', { method: 'POST' });
      finishSignOut();
      toast.success('Signed out everywhere.');
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 401 &&
        error.body.error === 'Unauthorized'
      ) {
        finishSignOut();
        return;
      }
      toast.error(error instanceof ApiError ? friendlyError(error.body) : 'Could not sign out.');
      setPending(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        ref={triggerRef}
        id="sign-out-everywhere"
        type="button"
        className="btn btn-danger"
        onClick={() => setOpen(true)}
      >
        Sign out everywhere
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        returnFocusTo={triggerRef}
        title="Sign out everywhere?"
        description={`This signs out all ${count} ${count === 1 ? 'device' : 'devices'}, including this one.`}
        confirmLabel="Sign out everywhere"
        danger
        pending={pending}
        onConfirm={() => void confirm()}
      />
    </div>
  );
}

function PasswordForm({ disabled }: { disabled: boolean }) {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    if (newPassword.length < 12) {
      setError('Use at least 12 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiJson('/api/me/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Password changed. Your other devices were signed out.');
      document.getElementById('password-heading')?.focus();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.field
            ? (err.body.message ?? friendlyError(err.body))
            : friendlyError(err.body)
          : 'Something went wrong. Try again.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="mt-4 max-w-md space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <fieldset disabled={disabled} className="space-y-3">
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrent(event.target.value)}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          hint="At least 12 characters."
          onChange={(event) => setNext(event.target.value)}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        <Button
          type="submit"
          pending={pending}
          pendingLabel="Saving…"
          aria-disabled={disabled || undefined}
        >
          Change password
        </Button>
      </fieldset>
    </form>
  );
}

export function PreferencesPage() {
  const { user, refresh } = useAuth();
  const browser = browserTimeZone();
  const [zone, setZone] = useState(user?.timeZone ?? browser);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = zone !== user?.timeZone;

  useEffect(() => {
    if (saved) document.getElementById('tz-saved')?.focus();
  }, [saved]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setPending(true);
    setError(null);
    try {
      await apiJson('/api/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ timeZone: zone }),
      });
      await refresh();
      setSaved(zone);
      toast.success(`Saved. Dates now use ${zone}.`);
    } catch (err) {
      setError(
        err instanceof ApiError ? friendlyError(err.body) : 'Something went wrong. Try again.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingsLayout>
      <form onSubmit={(event) => void onSubmit(event)} className="card max-w-xl p-5 sm:p-6">
        <h2 className="text-[17px] font-semibold">Time zone</h2>
        <p className="mt-2 text-[14px] leading-[22px] text-muted">
          Changing your time zone re-counts days in each stage. It does not change the history of
          what happened.
        </p>
        <div className="mt-4">
          <TimeZoneField value={zone} onChange={setZone} browserZone={browser} />
        </div>
        {saved ? (
          <div className="mt-4">
            <Alert id="tz-saved" tone="success">
              Saved. Dates now use {saved}.
            </Alert>
          </div>
        ) : null}
        {error ? (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}
        <Button
          className="mt-4"
          type="submit"
          disabled={!dirty}
          pending={pending}
          pendingLabel="Saving…"
        >
          Save time zone
        </Button>
        {!dirty ? <p className="mt-2 text-[13px] text-muted">No changes to save.</p> : null}
      </form>
    </SettingsLayout>
  );
}
