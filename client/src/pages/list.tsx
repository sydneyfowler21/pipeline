import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiJson } from '@/lib/api';
import {
  activityText,
  daysPhrase,
  monogramLetter,
  noResultsCopy,
  STAGES,
  toneIndex,
} from '@/lib/copy';
import type { ApplicationList, ApplicationListItem } from '@/lib/types';
import { Button } from '@/components/kit';
import { StageChip, StageDot } from '@/components/stage-chip';
import { useAuth } from '@/components/auth-context';
import type { Stage } from '@pipeline/shared';

function useAfter(active: boolean, ms = 150) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!active) {
      setShow(false);
      return;
    }
    const timer = window.setTimeout(() => setShow(true), ms);
    return () => window.clearTimeout(timer);
  }, [active, ms]);
  return show;
}

export function ListPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const stageParam = params.get('stage');
  const stage = STAGES.includes(stageParam as Stage) ? (stageParam as Stage) : null;
  const [draft, setDraft] = useState(q);
  const chipRow = useRef<HTMLDivElement>(null);
  const zone = user?.timeZone ?? 'America/Denver';

  useEffect(() => setDraft(q), [q]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = draft.trim();
      if (trimmed === q) return;
      const next = new URLSearchParams(params);
      if (trimmed) next.set('q', trimmed);
      else next.delete('q');
      setParams(next, { replace: true });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [draft, q, params, setParams]);

  const query = useQuery({
    queryKey: ['applications', q, stage ?? ''],
    queryFn: () => {
      const search = new URLSearchParams();
      if (q) search.set('q', q);
      if (stage) search.set('stage', stage);
      const suffix = search.toString();
      return apiJson<ApplicationList>(`/api/applications${suffix ? `?${suffix}` : ''}`);
    },
  });
  const showSkeleton = useAfter(query.isPending);

  function setStage(next: Stage | null) {
    const paramsNext = new URLSearchParams(params);
    if (next) paramsNext.set('stage', next);
    else paramsNext.delete('stage');
    setParams(paramsNext, { replace: true });
  }

  function clearAll() {
    setDraft('');
    setParams({}, { replace: true });
  }

  useEffect(() => {
    const row = chipRow.current;
    const active = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    active?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [stage, query.data]);

  const blocked = user && !user.emailVerified;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            tabIndex={-1}
            className="text-[26px] font-semibold leading-8 tracking-tight sm:text-[30px] sm:leading-9"
          >
            Applications
          </h1>
          {query.data && query.data.unfilteredTotal > 0 ? (
            <p className="mt-1 text-[14px] text-muted">
              {query.data.applications.length}{' '}
              {query.data.applications.length === 1 ? 'application' : 'applications'} · sorted by
              last activity
            </p>
          ) : null}
        </div>
        {blocked ? (
          <div className="text-right">
            <Button disabled aria-disabled="true">
              <Plus aria-hidden className="h-4 w-4" />
              Add application
            </Button>
            <p className="mt-1 text-[13px] text-muted">Confirm your email to add applications.</p>
          </div>
        ) : (
          <Link to="/applications/new" className="btn btn-primary">
            <Plus aria-hidden className="h-4 w-4" />
            Add application
          </Link>
        )}
      </div>

      {query.isPending ? (
        <div aria-busy="true" className="mt-6">
          <p className="sr-only">Loading applications</p>
          {showSkeleton ? (
            <div className="card overflow-hidden" aria-hidden>
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="flex min-h-[68px] items-center gap-3 border-t border-line p-4 first:border-t-0"
                >
                  <div className="skeleton h-10 w-10 flex-none rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="skeleton h-4 w-40 max-w-full" />
                    <div className="skeleton mt-2 h-3 w-24" />
                  </div>
                  <div className="skeleton h-6 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {query.isError ? (
        <div className="card mt-8 px-6 py-12 text-center" role="alert">
          <h2 className="text-[17px] font-semibold">Couldn't load your applications</h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-muted">Nothing was changed.</p>
          <button
            type="button"
            className="btn btn-secondary mt-6"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </div>
      ) : null}

      {query.data && query.data.unfilteredTotal === 0 ? (
        <div className="card mt-8 px-6 py-12 text-center">
          <h2 className="text-[17px] font-semibold">No applications yet</h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-muted">
            Add one and move it through stages. The history stays, so you can see how long each
            stage took.
          </p>
          {!blocked ? (
            <Link to="/applications/new" className="btn btn-primary mt-6">
              Add application
            </Link>
          ) : (
            <p className="mt-4 text-[14px] text-warn">Confirm your email to add applications.</p>
          )}
        </div>
      ) : null}

      {query.data && query.data.unfilteredTotal > 0 ? (
        <>
          <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative lg:w-80">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted"
              />
              <input
                className={`control with-icon !mt-0${draft ? ' with-clear' : ''}`}
                placeholder="Search company or role"
                aria-label="Search applications"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setDraft('');
                    const next = new URLSearchParams(params);
                    next.delete('q');
                    setParams(next, { replace: true });
                  }
                }}
              />
              {draft ? (
                <button
                  type="button"
                  className="icon-btn btn btn-ghost absolute right-0 top-0"
                  aria-label="Clear search"
                  onClick={() => {
                    setDraft('');
                    const next = new URLSearchParams(params);
                    next.delete('q');
                    setParams(next, { replace: true });
                  }}
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div
              ref={chipRow}
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
              role="group"
              aria-label="Filter by stage"
            >
              <button
                type="button"
                className="filter-chip"
                aria-pressed={stage === null}
                onClick={() => setStage(null)}
              >
                All <span className="count num">{query.data.total}</span>
              </button>
              {STAGES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="filter-chip"
                  aria-pressed={stage === item}
                  onClick={() => setStage(item)}
                >
                  <StageDot stage={item} />
                  {item}
                  <span className="count num">{query.data?.countsByStage[item] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="sr-only" aria-live="polite">
            {query.data.applications.length} applications
          </p>
          {query.data.applications.length === 0 ? (
            <div className="card mt-5 px-6 py-10 text-center">
              <h2 className="text-[17px] font-semibold">{noResultsCopy(q, stage)}</h2>
              <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
                <button type="button" className="btn btn-secondary" onClick={() => setStage(null)}>
                  Show all stages
                </button>
                <button type="button" className="btn btn-secondary" onClick={clearAll}>
                  Clear search and filter
                </button>
              </div>
            </div>
          ) : (
            <div className="card mt-5 overflow-hidden">
              <div className="hidden md:block">
                <div className="grid h-10 grid-cols-[minmax(0,1.6fr)_150px_120px_minmax(0,1.1fr)_28px] items-center gap-4 border-b border-line bg-subtle/60 px-5 text-[12px] font-medium uppercase tracking-[0.06em] text-muted">
                  <span>Company · role</span>
                  <span>Stage</span>
                  <span>In stage</span>
                  <span>Last activity</span>
                  <span />
                </div>
                {query.data.applications.map((item) => (
                  <Row key={item.id} item={item} zone={zone} />
                ))}
              </div>
              <div className="md:hidden">
                {query.data.applications.map((item) => (
                  <CardRow key={item.id} item={item} zone={zone} />
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function Row({ item, zone }: { item: ApplicationListItem; zone: string }) {
  return (
    <Link
      to={`/applications/${item.id}`}
      className="row-link grid min-h-[68px] grid-cols-[minmax(0,1.6fr)_150px_120px_minmax(0,1.1fr)_28px] items-center gap-4 border-t border-line px-5 first:border-t-0"
    >
      <Company item={item} />
      <span>
        <StageChip stage={item.currentStage} />
      </span>
      <span className="num text-[14px]">{daysPhrase(item.daysInCurrentStage)}</span>
      <span className="truncate text-[13.5px] text-muted">
        {activityText(item.lastActivityKind, item.lastActivityStage, item.lastActivityAt, zone)}
      </span>
      <ChevronRight aria-hidden className="h-5 w-5 text-muted" />
    </Link>
  );
}

function CardRow({ item, zone }: { item: ApplicationListItem; zone: string }) {
  return (
    <Link
      to={`/applications/${item.id}`}
      className="row-link flex min-h-[88px] gap-3 border-t border-line p-4 first:border-t-0"
    >
      <Monogram company={item.company} />
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1">
            <span
              className="row-title block truncate text-[15px] font-semibold"
              title={item.company}
            >
              {item.company}
            </span>
            <span className="block truncate text-[13.5px] text-muted" title={item.role}>
              {item.role}
            </span>
          </span>
          <ChevronRight aria-hidden className="mt-0.5 h-5 w-5 text-muted" />
        </span>
        <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StageChip stage={item.currentStage} />
          <span className="num text-[13px]">{daysPhrase(item.daysInCurrentStage)}</span>
          <span className="text-[12.5px] text-muted">
            {activityText(item.lastActivityKind, item.lastActivityStage, item.lastActivityAt, zone)}
          </span>
        </span>
      </span>
    </Link>
  );
}

function Company({ item }: { item: ApplicationListItem }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Monogram company={item.company} />
      <span className="min-w-0">
        <span className="row-title block truncate text-[15px] font-semibold" title={item.company}>
          {item.company}
        </span>
        <span className="block truncate text-[13.5px] text-muted" title={item.role}>
          {item.role}
        </span>
      </span>
    </span>
  );
}

function Monogram({ company }: { company: string }) {
  return (
    <span
      className={`tone-${toneIndex(company)} grid h-10 w-10 flex-none place-items-center rounded-lg text-[15px] font-semibold text-white`}
    >
      {monogramLetter(company)}
    </span>
  );
}
