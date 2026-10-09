import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, FlaskConical } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiJson } from '@/lib/api';
import { accountInitials, accountLabel, hoursLeft } from '@/lib/copy';
import { Menu, MenuItem } from './kit';
import { signOut, useAuth } from './auth-context';
import { Wordmark } from './wordmark';

export function Shell() {
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const settingsOn = location.pathname.startsWith('/settings');
  const queryClient = useQueryClient();
  const leaveToSignup = useRef(false);
  const [resendIn, setResendIn] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  if (loading) return <PageSkeleton />;
  if (!user) return <Navigate to={leaveToSignup.current ? '/signup' : '/'} replace />;

  async function leaveDemo() {
    await signOut();
    leaveToSignup.current = true;
    queryClient.setQueryData(['me'], null);
    navigate('/signup', { replace: true });
  }

  async function resend() {
    setResending(true);
    try {
      const body = await apiJson<{ retryAfterSeconds?: number }>('/api/auth/resend-verification', {
        method: 'POST',
      });
      setResendIn(body.retryAfterSeconds ?? 60);
      toast.success('Link sent. Check your email.');
    } catch (error) {
      const wait = error instanceof Error ? 60 : 60;
      setResendIn(wait);
      toast.error('Wait before requesting another link.');
    } finally {
      setResending(false);
    }
  }

  async function logout() {
    await signOut();
    queryClient.clear();
    toast.success('Signed out.');
    navigate('/');
    await refresh();
  }

  return (
    <div className="min-h-screen bg-canvas">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      {user.isDemo ? (
        <div className="demo-banner border-b border-[#E9D6A8] bg-warntint text-[13px] text-warn">
          <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-8">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <FlaskConical aria-hidden className="h-4 w-4" />
              Demo account
            </span>
            <span>
              Sample data, deleted in{' '}
              {user.demoExpiresAt ? hoursLeft(user.demoExpiresAt) : '24 hours'}. Email and password
              can't be changed.
            </span>
            <button
              type="button"
              className="btn btn-ghost ml-auto px-2 text-warn"
              onClick={() => void leaveDemo()}
            >
              Create your own account
            </button>
          </div>
        </div>
      ) : null}
      {!user.emailVerified ? (
        <div className="unverified-banner border-b border-[#E9D6A8] bg-warntint text-[13px] text-warn">
          <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-8">
            <span>Confirm your email to add applications.</span>
            <button
              type="button"
              className="btn btn-ghost ml-auto px-2 text-warn"
              disabled={resending || resendIn > 0}
              onClick={() => void resend()}
            >
              {resendIn > 0 ? `Resend link in ${resendIn}s` : 'Resend link'}
            </button>
          </div>
          {resendIn > 0 ? (
            <p className="mx-auto max-w-page px-4 pb-2 text-[13px] sm:px-8">
              You can request another link when the timer ends.
            </p>
          ) : null}
        </div>
      ) : null}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-page items-center gap-6 px-4 sm:px-8">
          <Wordmark to="/applications" />
          <nav className="hidden gap-1 md:flex" aria-label="Primary">
            <NavLink className="nav-link" to="/applications">
              Applications
            </NavLink>
            <Link
              className="nav-link"
              to="/settings/security"
              aria-current={settingsOn ? 'page' : undefined}
            >
              Settings
            </Link>
          </nav>
          <div className="ml-auto">
            <Menu
              label="Account menu"
              trigger={
                <>
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-tint text-[13px] font-semibold text-accent">
                    {accountInitials(user)}
                  </span>
                  <span className="hidden max-w-[180px] truncate text-[13.5px] text-muted sm:inline">
                    {accountLabel(user)}
                  </span>
                  <ChevronDown aria-hidden className="h-4 w-4 text-muted" />
                </>
              }
            >
              <div className="px-3 py-2 text-[13px] text-muted">{accountLabel(user)}</div>
              <MenuItem onSelect={() => navigate('/settings/security')}>Settings</MenuItem>
              <MenuItem onSelect={() => void logout()}>Sign out</MenuItem>
            </Menu>
          </div>
        </div>
      </header>
      <nav className="flex border-b border-line bg-surface px-2 md:hidden" aria-label="Primary">
        <NavLink className="nav-link flex-1 justify-center" to="/applications">
          Applications
        </NavLink>
        <Link
          className="nav-link flex-1 justify-center"
          to="/settings/security"
          aria-current={settingsOn ? 'page' : undefined}
        >
          Settings
        </Link>
      </nav>
      <main id="content" className="mx-auto min-w-0 max-w-page px-4 py-6 sm:px-8 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-canvas" aria-busy="true">
      <p className="sr-only">Loading</p>
      <div className="mx-auto max-w-page px-4 py-10 sm:px-8">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton mt-6 h-24 w-full" />
        <div className="skeleton mt-3 h-24 w-full" />
      </div>
    </div>
  );
}

export function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageSkeleton />;
  if (user) return <Navigate to="/applications" replace />;
  return children;
}

export function SettingsNav() {
  return (
    <>
      <nav className="mb-6 hidden w-[200px] shrink-0 flex-col gap-1 md:flex" aria-label="Settings">
        <NavLink className="section-link" to="/settings/security">
          Security
        </NavLink>
        <NavLink className="section-link" to="/settings/preferences">
          Preferences
        </NavLink>
      </nav>
      <nav
        className="mb-6 flex gap-1 rounded-lg bg-subtle p-1 md:hidden"
        aria-label="Settings sections"
      >
        <NavLink className="segment" to="/settings/security">
          Security
        </NavLink>
        <NavLink className="segment" to="/settings/preferences">
          Preferences
        </NavLink>
      </nav>
    </>
  );
}

export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="back-link inline-flex min-h-11 items-center text-[14px] text-accent underline underline-offset-2"
    >
      {children}
    </Link>
  );
}
