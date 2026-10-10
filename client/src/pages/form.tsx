import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ApiError, apiJson } from '@/lib/api';
import { formatCalendarDate, friendlyError, todayInZone } from '@/lib/copy';
import type { ApplicationDetail } from '@/lib/types';
import { Alert, Button } from '@/components/kit';
import { DateField, TextAreaField, TextField } from '@/components/fields';
import { useAuth } from '@/components/auth-context';
import { BackLink } from '@/components/shell';

export function ApplicationFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const existing = useQuery({
    queryKey: ['application', id],
    enabled: editing,
    queryFn: () => apiJson<{ application: ApplicationDetail }>(`/api/applications/${id}`),
  });
  if (editing && existing.isPending) {
    return (
      <div aria-busy="true">
        <p className="sr-only">Loading application</p>
        <div className="skeleton h-8 w-48" />
      </div>
    );
  }
  if (editing && existing.isError) {
    return <Alert tone="error">Couldn't load that application.</Alert>;
  }
  return (
    <Form
      key={existing.data?.application.updatedAt ?? 'new'}
      initial={existing.data?.application ?? null}
    />
  );
}

function Form({ initial }: { initial: ApplicationDetail | null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const zone = user?.timeZone ?? 'America/Denver';
  const [company, setCompany] = useState(initial?.company ?? '');
  const [role, setRole] = useState(initial?.role ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [appliedOn, setAppliedOn] = useState(initial?.appliedOn ?? todayInZone(zone));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const editing = Boolean(initial);

  function fieldErrors() {
    const next: Record<string, string> = {};
    if (company.trim().length < 1 || company.trim().length > 120)
      next.company = 'Enter a company (1–120 characters).';
    if (role.trim().length < 1 || role.trim().length > 120)
      next.role = 'Enter a role (1–120 characters).';
    if (url.trim()) {
      try {
        const parsed = new URL(url.trim());
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
          next.url = 'Use an http or https link.';
      } catch {
        next.url = 'Use an http or https link.';
      }
    }
    if (notes.length > 5000) next.notes = 'Notes must be 5,000 characters or fewer.';
    if (!editing && appliedOn > todayInZone(zone)) next.appliedOn = "Can't be in the future.";
    return next;
  }

  function validate() {
    const next = fieldErrors();
    setErrors(next);
    return next;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = validate();
    const order = ['company', 'role', 'url', 'appliedOn', 'notes'];
    const invalid = order.filter((field) => next[field]);
    if (invalid.length > 0) {
      const noun = invalid.length === 1 ? 'field' : 'fields';
      setFormError(`Fix ${invalid.length} ${noun} to save`);
      document.getElementById(invalid[0] ?? '')?.focus();
      return;
    }
    setFormError(null);
    setPending(true);
    const payload = {
      company: company.trim(),
      role: role.trim(),
      url: url.trim(),
      notes,
    };
    try {
      const body = editing
        ? await apiJson<{ application: ApplicationDetail }>(`/api/applications/${initial?.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiJson<{ application: ApplicationDetail }>('/api/applications', {
            method: 'POST',
            body: JSON.stringify({ ...payload, applied_on: appliedOn }),
          });
      await queryClient.invalidateQueries({ queryKey: ['applications'] });
      toast.success(editing ? 'Application saved.' : 'Application added.');
      navigate(`/applications/${body.application.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const field = err.field ?? err.body.issues?.[0]?.path;
        const message = err.field
          ? (err.body.message ?? friendlyError(err.body))
          : friendlyError(err.body);
        if (field)
          setErrors((current) => ({ ...current, [field]: message ?? 'Check this field.' }));
        setFormError(friendlyError(err.body));
      } else {
        setFormError('Something went wrong. Try again.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink to={editing && initial ? `/applications/${initial.id}` : '/applications'}>
        {editing ? 'Back to application' : 'All applications'}
      </BackLink>
      <h1
        tabIndex={-1}
        className="mt-2 text-[26px] font-semibold leading-8 tracking-tight sm:text-[30px] sm:leading-9"
      >
        {editing ? 'Edit application' : 'Add application'}
      </h1>
      {formError ? (
        <div className="mt-4">
          <Alert tone="error">{formError}</Alert>
        </div>
      ) : null}
      <form
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        className="mt-6 min-w-0 space-y-4"
      >
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <TextField
            id="company"
            label="Company"
            value={company}
            error={errors.company}
            onChange={(event) => setCompany(event.target.value)}
            onBlur={() => validate()}
          />
          <TextField
            id="role"
            label="Role"
            value={role}
            error={errors.role}
            onChange={(event) => setRole(event.target.value)}
            onBlur={() => validate()}
          />
        </div>
        <TextField
          id="url"
          label="Job posting"
          type="text"
          inputMode="url"
          value={url}
          error={errors.url}
          hint="Optional. http or https only."
          onChange={(event) => setUrl(event.target.value)}
        />
        {editing ? (
          <TextField
            id="appliedOn"
            label="Applied on"
            value={formatCalendarDate(appliedOn, true)}
            disabled
            hint="Applied on can't be changed."
            readOnly
          />
        ) : (
          <DateField
            id="appliedOn"
            label="Applied on"
            value={appliedOn}
            max={todayInZone(zone)}
            onChange={setAppliedOn}
            error={errors.appliedOn}
          />
        )}
        <TextAreaField
          id="notes"
          label="Notes"
          value={notes}
          error={errors.notes}
          hint="Running summary of this application. What changed goes on the stage move."
          onChange={(event) => setNotes(event.target.value)}
        />
        <p className="num text-[13px] text-muted">{notes.length} / 5000</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" pending={pending} pendingLabel={editing ? 'Saving…' : 'Adding…'}>
            {editing ? 'Save changes' : 'Add application'}
          </Button>
        </div>
      </form>
    </div>
  );
}
