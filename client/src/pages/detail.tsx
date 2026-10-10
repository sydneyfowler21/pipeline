import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as RadioGroup from '@radix-ui/react-radio-group';
import { MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { Stage } from '@pipeline/shared';
import { ApiError, api, apiJson } from '@/lib/api';
import {
  daysPhrase,
  formatCalendarDate,
  friendlyError,
  monogramLetter,
  noteCounter,
  occurredAtForMove,
  STAGES,
  toneIndex,
} from '@/lib/copy';
import type { ApplicationDetail } from '@/lib/types';
import { Alert, Button, ConfirmDialog, Menu, MenuItem, Modal } from '@/components/kit';
import { DateField } from '@/components/fields';
import { StageChip } from '@/components/stage-chip';
import { BackLink } from '@/components/shell';

export function DetailPage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['application', id],
    queryFn: () => apiJson<{ application: ApplicationDetail }>(`/api/applications/${id}`),
  });

  useEffect(() => {
    document.getElementById('detail-heading')?.focus();
  }, [query.data?.application.id, query.data?.application.currentStage]);

  if (query.isPending) {
    return (
      <div aria-busy="true">
        <p className="sr-only">Loading application</p>
        <div className="skeleton h-10 w-64" />
        <div className="skeleton mt-4 h-40 w-full" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Alert tone="error">
        Couldn't load that application.{' '}
        <button type="button" className="btn btn-ghost" onClick={() => void query.refetch()}>
          Try again
        </button>
      </Alert>
    );
  }
  return <Detail application={query.data.application} />;
}

function Detail({ application }: { application: ApplicationDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const moveTrigger = useRef<HTMLButtonElement>(null);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const [deleting, setDeleting] = useState(false);
  const maxDays = Math.max(1, ...STAGES.map((stage) => application.totals[stage] ?? 0));

  async function remove() {
    setDeleting(true);
    try {
      const response = await api(`/api/applications/${application.id}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 204) throw new Error('delete failed');
      await queryClient.invalidateQueries({ queryKey: ['applications'] });
      toast.success('Application deleted.');
      navigate('/applications');
    } catch {
      toast.error('Could not delete that application.');
      setDeleting(false);
    }
  }

  return (
    <div className="min-w-0">
      <BackLink to="/applications">All applications</BackLink>
      <div className="mt-3 flex flex-wrap items-start gap-4">
        <span
          className={`tone-${toneIndex(application.company)} grid h-12 w-12 flex-none place-items-center rounded-lg text-[18px] font-semibold text-white`}
        >
          {monogramLetter(application.company)}
        </span>
        <div className="min-w-0 flex-1">
          <h1
            id="detail-heading"
            tabIndex={-1}
            className="min-w-0 truncate text-[26px] font-semibold leading-8 tracking-tight sm:text-[30px] sm:leading-9"
            title={application.company}
          >
            {application.company}
          </h1>
          <p className="min-w-0 truncate text-[15px] text-muted" title={application.role}>
            {application.role}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button ref={moveTrigger} className="w-full sm:w-auto" onClick={() => setMoveOpen(true)}>
            Move to stage
          </Button>
          <Link
            to={`/applications/${application.id}/edit`}
            className="btn btn-secondary w-full sm:w-auto"
          >
            Edit
          </Link>
          <Menu
            label="More actions"
            className="icon-btn btn btn-secondary"
            triggerRef={moreTrigger}
            trigger={<MoreHorizontal aria-hidden className="h-4 w-4" />}
          >
            <MenuItem danger onSelect={() => setDeleteOpen(true)}>
              Delete application
            </MenuItem>
          </Menu>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-muted">
        <StageChip stage={application.currentStage} />
        <span className="num">
          {daysPhrase(application.visits.at(-1)?.days ?? 0, true)} in stage
        </span>
        <span>Applied {formatCalendarDate(application.appliedOn)}</span>
        {application.url ? (
          <a
            className="job-link inline-flex min-h-11 items-center text-accent underline underline-offset-2"
            href={application.url}
            rel="noreferrer"
          >
            Job posting
          </a>
        ) : null}
      </div>

      <div className="mt-8 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
        <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="history-heading">
          <h2 id="history-heading" className="text-[17px] font-semibold leading-6">
            Stage history
          </h2>
          <ol className="mt-4 space-y-4">
            {[...application.visits].reverse().map((visit, index) => (
              <li
                key={`${visit.occurredAt}-${visit.stage}-${visit.visitNumber}`}
                id={index === 0 ? 'latest-visit' : undefined}
                tabIndex={index === 0 ? -1 : undefined}
                className="flex min-w-0 gap-3"
              >
                <span className={`mt-1 h-3 w-3 flex-none rounded-full dot-${visit.stage}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StageChip stage={visit.stage} />
                    {visit.visitNumber > 1 ? (
                      <span className="rounded-full bg-subtle px-2 py-0.5 text-[12px] font-medium">
                        Visit {visit.visitNumber}
                      </span>
                    ) : null}
                    {visit.current ? (
                      <span className="rounded-full bg-ink px-2 py-0.5 text-[12px] font-medium text-white">
                        Current
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[13.5px] text-muted">
                    {formatCalendarDate(visit.enteredLocal)} ·{' '}
                    {daysPhrase(visit.days, Boolean(visit.current))}
                  </p>
                  {visit.note ? <p className="user-text mt-1 text-[14px]">{visit.note}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="totals-heading">
          <h2 id="totals-heading" className="text-[17px] font-semibold leading-6">
            Time per stage
          </h2>
          <ul className="mt-4 space-y-3">
            {STAGES.map((stage) => {
              const days = application.totals[stage] ?? 0;
              const visits = application.visitCounts[stage] ?? 0;
              if (!visits) return null;
              return (
                <li key={stage}>
                  <div className="flex items-center justify-between gap-3 text-[14px]">
                    <StageChip stage={stage} />
                    <span className="num shrink-0 whitespace-nowrap text-muted">
                      {daysPhrase(days)}
                      {visits > 1 ? ` · ${visits} visits` : ''}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-subtle">
                    <div className={`bar-${stage} h-full ${barWidth(days / maxDays)}`} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[13px] leading-5 text-muted">
            Days are calendar dates in {application.timeZone}. Changing the time zone can shift a
            total by a day. It does not change what happened.
          </p>
        </section>
      </div>

      <section className="card mt-6 p-5 sm:p-6" aria-labelledby="notes-heading">
        <h2 id="notes-heading" className="text-[17px] font-semibold leading-6">
          Notes
        </h2>
        <p className="user-text mt-2 text-[15px] leading-[22px]">
          {application.notes.trim() ? application.notes : 'No running summary yet.'}
        </p>
      </section>

      <MoveDialog
        application={application}
        open={moveOpen}
        onOpenChange={setMoveOpen}
        returnFocusTo={moveTrigger}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this application?"
        description="Stage history is deleted with it. This can't be undone."
        confirmLabel="Delete application"
        danger
        pending={deleting}
        onConfirm={() => void remove()}
        returnFocusTo={moreTrigger}
      />
    </div>
  );
}

const BAR_WIDTH = [
  'w-[4%]',
  'w-[10%]',
  'w-[20%]',
  'w-[30%]',
  'w-[40%]',
  'w-[50%]',
  'w-[60%]',
  'w-[70%]',
  'w-[80%]',
  'w-[90%]',
  'w-full',
] as const;

function barWidth(ratio: number): string {
  const index = Math.max(
    0,
    Math.min(BAR_WIDTH.length - 1, Math.round(ratio * (BAR_WIDTH.length - 1))),
  );
  return BAR_WIDTH[index] ?? 'w-[4%]';
}

function MoveDialog({
  application,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  application: ApplicationDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLButtonElement | null>;
}) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage | ''>('');
  const [date, setDate] = useState(application.today);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const counter = noteCounter(note.length);
  const over = note.length > 280;

  useEffect(() => {
    if (!open) return;
    setStage('');
    setDate(application.today);
    setNote('');
    setError(null);
  }, [open, application.today]);

  async function move() {
    if (!stage || over) return;
    setPending(true);
    setError(null);
    const occurredAt = occurredAtForMove({
      selectedDate: date,
      today: application.today,
      latestEventAt: application.latestEventAt,
      latestEventLocalDate: application.latestEventLocalDate,
      timeZone: application.timeZone,
      now: new Date(),
    });
    try {
      await apiJson(`/api/applications/${application.id}/stages`, {
        method: 'POST',
        body: JSON.stringify({
          stage,
          note: note.trim() ? note : null,
          ...(occurredAt ? { occurred_at: occurredAt } : {}),
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ['application', application.id] });
      await queryClient.invalidateQueries({ queryKey: ['applications'] });
      toast.success(`Moved to ${stage}.`);
      onOpenChange(false);
      window.setTimeout(() => document.getElementById('latest-visit')?.focus(), 0);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.body.field === 'note'
            ? (err.body.message ?? 'Note must be 280 characters or fewer.')
            : friendlyError(err.body)
          : 'Something went wrong. Try again.';
      const dated =
        err instanceof ApiError && /earlier/i.test(err.body.error ?? '')
          ? `Can't be before the last change (${formatCalendarDate(application.latestEventLocalDate)}).`
          : message;
      setError(dated);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Move ${application.company}`}
      description="History is added. Earlier stages stay on the timeline."
      sheet
      returnFocusTo={returnFocusTo}
      footer={
        <Button
          className="w-full"
          disabled={!stage || over}
          pending={pending}
          pendingLabel="Moving…"
          onClick={() => void move()}
        >
          {stage ? `Move to ${stage}` : 'Move to stage'}
        </Button>
      }
    >
      {error ? (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      <RadioGroup.Root
        className="grid gap-2"
        value={stage}
        onValueChange={(value) => setStage(value as Stage)}
        aria-label="Stage"
      >
        {STAGES.map((item) => {
          const current = item === application.currentStage;
          const revisit = (application.visitCounts[item] ?? 0) > 0 && !current;
          return (
            <RadioGroup.Item
              key={item}
              value={item}
              disabled={current}
              className="choice w-full text-left"
            >
              <StageChip stage={item} />
              <span className="text-[13.5px] text-muted">
                {current ? 'Current stage' : revisit ? 'Revisit' : 'Move here'}
              </span>
            </RadioGroup.Item>
          );
        })}
      </RadioGroup.Root>
      <div className="mt-4">
        <DateField
          label="Date"
          value={date}
          min={application.latestEventLocalDate}
          max={application.today}
          onChange={setDate}
          hint="Today uses the current time. Earlier days can't be before the last change."
        />
      </div>
      <label className="field mt-4">
        <span className="field-label">Note (optional)</span>
        <textarea
          className="control"
          value={note}
          aria-describedby="note-count"
          onChange={(event) => setNote(event.target.value)}
          placeholder="What changed"
        />
      </label>
      <p
        id="note-count"
        aria-live={note.length >= 260 ? 'polite' : 'off'}
        className={`num mt-1 text-[13px] ${counter.tone === 'danger' ? 'text-danger' : counter.tone === 'warn' ? 'text-warn' : 'text-muted'}`}
      >
        {counter.text}
      </p>
      {over ? <p className="text-[13px] text-danger">Shorten the note to move.</p> : null}
    </Modal>
  );
}
