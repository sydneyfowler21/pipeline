import { Link } from 'react-router-dom';

export function Mark({ inverted = false }: { inverted?: boolean }) {
  return (
    <span
      className={`grid h-7 w-7 place-items-center rounded-lg ${inverted ? 'bg-white text-ink' : 'bg-ink text-white'}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
        <path
          d="M4 7h7M4 12h11M4 17h16"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="15" cy="7" r="1.6" fill="currentColor" />
        <circle cx="19" cy="12" r="1.6" fill="currentColor" />
      </svg>
    </span>
  );
}

export function Wordmark({ to = '/', inverted = false }: { to?: string; inverted?: boolean }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center gap-2 text-[17px] font-semibold tracking-tight text-inherit no-underline hover:underline"
    >
      <Mark inverted={inverted} />
      pipeline
    </Link>
  );
}
