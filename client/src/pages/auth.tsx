import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ApiError, apiJson } from '@/lib/api';
import { browserTimeZone, friendlyError, rateLimitMessage, signInTroubleHint } from '@/lib/copy';
import { Alert, Button } from '@/components/kit';
import { TextField } from '@/components/fields';
import { useAuth } from '@/components/auth-context';
import { Wordmark } from '@/components/wordmark';
import { StageChip } from '@/components/stage-chip';

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <div className="mx-auto grid min-h-screen max-w-[1320px] gap-6 p-4 sm:p-6 lg:grid-cols-2">
        <div className="flex flex-col">
          <div className="py-2 lg:hidden">
            <Wordmark />
          </div>
          <div className="grid flex-1 place-items-center py-8">
            <div id="content" className="w-full max-w-[400px]">
              {children}
            </div>
          </div>
          <p className="pb-2 text-center text-[12.5px] text-muted">
            A portfolio project ·{' '}
            <a
              className="underline underline-offset-2"
              href="https://github.com/sydneyfowler21/pipeline"
            >
              Source on GitHub
            </a>
          </p>
        </div>
        <aside className="hidden flex-col justify-between rounded-2xl bg-ink p-12 text-white lg:flex">
          <Wordmark inverted to="/" />
          <div>
            <p className="text-[13px] uppercase tracking-[0.14em] text-[#D6D6DA]">
              Job search, with receipts
            </p>
            <h2 className="mt-3 max-w-[440px] text-[34px] font-semibold leading-[1.15] tracking-tight">
              Every stage you've been through, and how long each one took.
            </h2>
            <div className="mt-8 max-w-[420px] rounded-xl bg-white p-4 text-ink shadow-e3">
              <div className="flex items-center gap-3">
                <span className="tone-3 grid h-9 w-9 place-items-center rounded-lg text-[14px] font-semibold text-white">
                  A
                </span>
                <div>
                  <p className="text-[14px] font-semibold">Acme Robotics</p>
                  <p className="text-[12.5px] text-muted">Frontend Engineer</p>
                </div>
                <span className="ml-auto">
                  <StageChip stage="Offer" />
                </span>
              </div>
              <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                <span className="bar-Applied w-[10%]" />
                <span className="bar-Screen w-[13%]" />
                <span className="bar-Interview w-[7%]" />
                <span className="bar-Screen w-[10%]" />
                <span className="bar-Interview w-[20%]" />
                <span className="bar-Offer w-[40%]" />
              </div>
              <p className="mt-2 text-[12px] text-muted">
                6 stage changes · Screen and Interview revisited · 67 days
              </p>
            </div>
          </div>
          <p className="text-[13px] text-[#D6D6DA]">Append-only history. Fictional demo data.</p>
        </aside>
      </div>
    </div>
  );
}

export function SignInPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<'demo' | 'sign-in' | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);

  async function startDemo() {
    setPending('demo');
    setError(null);
    try {
      await apiJson('/api/demo', {
        method: 'POST',
        body: JSON.stringify({ timeZone: browserTimeZone() }),
      });
      await refresh();
      toast.success('Demo ready. Sample data is deleted after 24 hours.');
      navigate('/applications');
    } catch (err) {
      setError(
        err instanceof ApiError ? friendlyError(err.body) : "Couldn't start the demo. Try again.",
      );
    } finally {
      setPending(null);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending('sign-in');
    setError(null);
    try {
      await apiJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await refresh();
      toast.success('Signed in.');
      navigate('/applications');
    } catch (err) {
      setPassword('');
      setFailedAttempts((count) => count + 1);
      setError(
        err instanceof ApiError
          ? err.status === 429
            ? rateLimitMessage()
            : friendlyError(err.body)
          : 'Something went wrong. Try again.',
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <AuthFrame>
      <h1 className="text-[28px] font-semibold leading-[34px] tracking-tight">
        Track a job search the honest way
      </h1>
      <p className="mt-2 text-[15px] leading-[22px] text-muted">
        See every stage an application went through and how many days each one took.
      </p>
      <Button
        className="mt-7 h-12 w-full text-[15px]"
        pending={pending === 'demo'}
        pendingLabel="Setting up your demo…"
        onClick={() => void startDemo()}
      >
        Try the demo
      </Button>
      <p className="mt-2 text-center text-[13px] text-muted">
        No sign-up. Sample data, deleted after 24 hours.
      </p>
      <div className="my-7 flex items-center gap-3 text-[12.5px] text-muted">
        <span className="h-px flex-1 bg-line" />
        or sign in
        <span className="h-px flex-1 bg-line" />
      </div>
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {signInTroubleHint(failedAttempts) ? (
          <p className="text-[14px] leading-5 text-muted">
            Having trouble?{' '}
            <Link to="/forgot" className="font-medium text-accent underline underline-offset-2">
              Reset your password
            </Link>
            , or check your email.
          </p>
        ) : null}
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <div>
          <div className="flex items-center justify-between">
            <label className="field-label" htmlFor="signin-password">
              Password
            </label>
            <Link
              to="/forgot"
              className="inline-flex min-h-11 items-center text-[13.5px] text-accent underline underline-offset-2"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="signin-password"
            className="control"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          className="w-full"
          pending={pending === 'sign-in'}
          pendingLabel="Signing in…"
        >
          Sign in
        </Button>
      </form>
      <p className="mt-5 text-center text-[14px] text-muted">
        New here?{' '}
        <Link to="/signup" className="font-medium text-accent underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </AuthFrame>
  );
}

export function SignUpPage() {
  const navigate = useNavigate();
  const zone = browserTimeZone();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function validate() {
    const next: Record<string, string> = {};
    if (!email.includes('@')) next.email = 'Enter an email address.';
    if (password.length < 12) next.password = 'Use at least 12 characters.';
    if (password !== confirm) next.confirm = "Passwords don't match.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setPending(true);
    try {
      await apiJson('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, timeZone: zone }),
      });
      toast.success('Check your email for a confirmation link.');
      navigate('/verify');
    } catch (err) {
      setFormError(
        err instanceof ApiError ? friendlyError(err.body) : 'Something went wrong. Try again.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame>
      <h1 className="text-[28px] font-semibold leading-[34px] tracking-tight">Create an account</h1>
      <p className="mt-2 text-[15px] text-muted">Password must be at least 12 characters.</p>
      {formError ? (
        <div className="mt-4">
          <Alert tone="error">{formError}</Alert>
        </div>
      ) : null}
      <form onSubmit={(event) => void onSubmit(event)} className="mt-6 space-y-4">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          error={errors.email}
          onBlur={validate}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          error={errors.password}
          hint="At least 12 characters. We check it against known breaches."
          onBlur={validate}
          onChange={(event) => setPassword(event.target.value)}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          onBlur={validate}
          onChange={(event) => setConfirm(event.target.value)}
        />
        <p className="text-[13px] leading-5 text-muted">
          Time zone: {zone}, from your browser. You can change it in Settings.
        </p>
        <Button type="submit" className="w-full" pending={pending} pendingLabel="Creating account…">
          Create account
        </Button>
      </form>
      <p className="mt-5 text-center text-[14px] text-muted">
        Already have an account?{' '}
        <Link to="/" className="font-medium text-accent underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </AuthFrame>
  );
}

export function VerifyPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'bad'>(
    token ? 'working' : 'idle',
  );
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void apiJson('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then(() => setState('done'))
      .catch(() => setState('bad'));
  }, [token]);

  return (
    <AuthFrame>
      <h1 className="text-[28px] font-semibold leading-[34px] tracking-tight">
        {state === 'done'
          ? 'Email confirmed'
          : state === 'bad'
            ? 'Link expired'
            : 'Check your email'}
      </h1>
      {state === 'idle' ? (
        <p className="mt-3 text-[15px] leading-[22px] text-muted">
          If that email can be used, we've sent a link. Open it on this device, then sign in. You
          can sign in before confirming, but you can't add applications until you do.
        </p>
      ) : null}
      {state === 'working' ? <p className="mt-3 text-muted">Confirming your email…</p> : null}
      {state === 'done' ? (
        <div className="mt-4">
          <Alert tone="success">Your email is confirmed. You can add applications.</Alert>
        </div>
      ) : null}
      {state === 'bad' ? (
        <div className="mt-4">
          <Alert tone="error">This link is invalid or expired. Sign in and resend a new one.</Alert>
        </div>
      ) : null}
      <Link to="/" className="btn btn-secondary mt-6 w-full">
        Go to sign in
      </Link>
    </AuthFrame>
  );
}

export function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body = await apiJson<{ message: string }>('/api/auth/request-reset', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
      toast.success(body.message);
    } catch (err) {
      setError(
        err instanceof ApiError ? friendlyError(err.body) : 'Something went wrong. Try again.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame>
      <h1 className="text-[28px] font-semibold leading-[34px] tracking-tight">Forgot password</h1>
      {sent ? (
        <div className="mt-4">
          <Alert tone="success">If that email can be used, we've sent a link.</Alert>
        </div>
      ) : (
        <form onSubmit={(event) => void onSubmit(event)} className="mt-6 space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Button type="submit" className="w-full" pending={pending} pendingLabel="Sending…">
            Send reset link
          </Button>
        </form>
      )}
      <Link
        to="/"
        className="mt-4 inline-flex min-h-11 items-center text-[14px] text-accent underline underline-offset-2"
      >
        Back to sign in
      </Link>
    </AuthFrame>
  );
}

export function ResetPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) {
      setLink('invalid');
      return;
    }
    let cancel = false;
    apiJson(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then(() => {
        if (!cancel) setLink('valid');
      })
      .catch(() => {
        if (!cancel) setLink('invalid');
      });
    return () => {
      cancel = true;
    };
  }, [token]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 12) {
      setError('Use at least 12 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiJson('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      toast.success(
        "Password saved. You've been signed out everywhere. Sign in with your new password.",
      );
      navigate('/');
    } catch (err) {
      setError(
        err instanceof ApiError ? friendlyError(err.body) : 'Something went wrong. Try again.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame>
      <h1 className="text-[28px] font-semibold leading-[34px] tracking-tight">
        Choose a new password
      </h1>
      {link === 'checking' ? <p className="mt-4 text-muted">Checking this link…</p> : null}
      {link === 'invalid' ? (
        <div className="mt-4">
          <Alert tone="error">This link is invalid or expired.</Alert>
          <Link to="/forgot" className="btn btn-secondary mt-4 w-full">
            Request a new link
          </Link>
        </div>
      ) : null}
      {link === 'valid' ? (
        <form onSubmit={(event) => void onSubmit(event)} className="mt-6 space-y-4">
          <Alert tone="warn">Saving a new password signs you out of every device.</Alert>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            hint="At least 12 characters."
          />
          <TextField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          <Button type="submit" className="w-full" pending={pending} pendingLabel="Saving…">
            Save password
          </Button>
        </form>
      ) : null}
    </AuthFrame>
  );
}
