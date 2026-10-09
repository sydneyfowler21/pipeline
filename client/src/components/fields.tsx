import * as Popover from '@radix-ui/react-popover';
import { Calendar, Check, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { formatCalendarDate } from '@/lib/copy';
import { cn } from '@/lib/utils';
import { Modal } from './kit';

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-[13.5px] leading-5 text-danger">
      {children}
    </p>
  );
}

export function TextField({
  label,
  hint,
  error,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  return (
    <div>
      <label className="field" htmlFor={fieldId}>
        <span className="field-label">{label}</span>
        <input
          id={fieldId}
          className="control"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          {...props}
        />
      </label>
      {hint && !error ? (
        <span id={hintId} className="mt-1.5 block text-[13px] leading-5 text-muted">
          {hint}
        </span>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  return (
    <div>
      <label className="field" htmlFor={fieldId}>
        <span className="field-label">{label}</span>
        <textarea
          id={fieldId}
          className="control"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          {...props}
        />
      </label>
      {hint && !error ? (
        <span id={hintId} className="mt-1.5 block text-[13px] leading-5 text-muted">
          {hint}
        </span>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

function parseDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function DateField({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
  hint,
  error,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
  error?: string;
}) {
  const parsed = parseDate(value);
  const [cursor, setCursor] = useState(() => ({
    year: parsed?.year ?? 2026,
    month: parsed?.month ?? 10,
  }));
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const errorId = useId();

  useEffect(() => {
    const next = parseDate(value);
    if (next) setCursor({ year: next.year, month: next.month });
  }, [value]);

  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
  const start = new Date(Date.UTC(cursor.year, cursor.month - 1, 1)).getUTCDay();
  const cells: Array<number | null> = [
    ...Array.from({ length: start }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  function shift(delta: number) {
    const next = new Date(Date.UTC(cursor.year, cursor.month - 1 + delta, 1));
    setCursor({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 });
  }

  return (
    <div>
      <span id={labelId} className="field-label">
        {label}
      </span>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          type="button"
          className="control mt-1.5 inline-flex items-center justify-between text-left"
          aria-labelledby={labelId}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
        >
          <span>{value ? formatCalendarDate(value) : 'Choose a date'}</span>
          <Calendar aria-hidden className="h-4 w-4 text-muted" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="menu z-50 w-[340px] p-3" align="start" sideOffset={8}>
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                className="icon-btn btn btn-ghost"
                aria-label="Previous month"
                onClick={() => shift(-1)}
              >
                <ChevronLeft aria-hidden className="h-4 w-4" />
              </button>
              <p className="text-[14px] font-medium">
                {new Intl.DateTimeFormat('en-US', {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                }).format(new Date(Date.UTC(cursor.year, cursor.month - 1, 1)))}
              </p>
              <button
                type="button"
                className="icon-btn btn btn-ghost"
                aria-label="Next month"
                onClick={() => shift(1)}
              >
                <ChevronRight aria-hidden className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[12px] text-muted">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                <span key={`${day}-${index}`} className="grid h-8 place-items-center">
                  {day}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7" role="grid">
              {cells.map((day, index) => {
                if (!day) return <span key={`empty-${index}`} />;
                const iso = isoDate(cursor.year, cursor.month, day);
                const blocked = Boolean((min && iso < min) || (max && iso > max));
                return (
                  <button
                    key={iso}
                    type="button"
                    className="day-btn"
                    disabled={blocked}
                    aria-pressed={iso === value}
                    aria-label={formatCalendarDate(iso)}
                    onClick={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {hint && !error ? <p className="mt-1.5 text-[13px] leading-5 text-muted">{hint}</p> : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

type Zone = { id: string; offset: string };

function zoneOffset(zone: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(now);
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

export function timeZones(now = new Date()): Zone[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  const ids = intl.supportedValuesOf?.('timeZone') ?? ['America/Denver', 'UTC'];
  return ids.map((id) => ({ id, offset: zoneOffset(id, now) }));
}

export function TimeZoneField({
  value,
  onChange,
  browserZone,
}: {
  value: string;
  onChange: (zone: string) => void;
  browserZone: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const zones = useMemo(() => timeZones(), []);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = needle
      ? zones.filter(
          (zone) =>
            zone.id.toLowerCase().includes(needle) || zone.offset.toLowerCase().includes(needle),
        )
      : zones;
    return rows.slice(0, 80);
  }, [query, zones]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  const current = zones.find((zone) => zone.id === value);

  return (
    <div>
      <span className="field-label" id="tz-label">
        Time zone
      </span>
      <button
        type="button"
        className="control mt-1.5 inline-flex items-center justify-between text-left"
        aria-labelledby="tz-label"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="truncate">
          {value}
          {current ? <span className="text-muted"> · {current.offset}</span> : null}
        </span>
        <Search aria-hidden className="h-4 w-4 text-muted" />
      </button>
      {browserZone !== value ? (
        <button
          type="button"
          className="btn btn-ghost mt-2 px-0"
          onClick={() => onChange(browserZone)}
        >
          Your browser reports {browserZone}. Use browser time zone
        </button>
      ) : (
        <p className="mt-1.5 text-[13px] leading-5 text-muted">
          Your browser reports {browserZone}.
        </p>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Time zone"
        description="Search for a time zone."
        sheet
      >
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted"
          />
          <input
            className="control pl-9"
            autoFocus
            placeholder="Search time zones"
            aria-label="Search time zones"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, filtered.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
              } else if (event.key === 'Enter' && filtered[active]) {
                event.preventDefault();
                onChange(filtered[active].id);
                setOpen(false);
              }
            }}
          />
        </div>
        <div
          ref={listRef}
          role="listbox"
          aria-label="Time zones"
          className="mt-3 max-h-80 overflow-auto"
        >
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-[14px] text-muted">
              No time zones match “{query.trim()}”.
            </p>
          ) : (
            filtered.map((zone, index) => (
              <button
                key={zone.id}
                type="button"
                role="option"
                aria-selected={zone.id === value}
                data-active={index === active ? 'true' : 'false'}
                className={cn('option-row', zone.id === value && 'font-medium')}
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  onChange(zone.id);
                  setOpen(false);
                }}
              >
                {zone.id === value ? (
                  <Check aria-hidden className="h-4 w-4 text-accent" />
                ) : (
                  <span className="w-4" />
                )}
                <span className="min-w-0 flex-1 truncate">{zone.id}</span>
                <span className="num text-[13px] text-muted">{zone.offset}</span>
              </button>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
