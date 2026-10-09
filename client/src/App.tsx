import { STAGES } from '@pipeline/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function App() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await api('/api/health');
      if (!response.ok) throw new Error('health failed');
      return (await response.json()) as { ok: boolean };
    },
    retry: false,
  });

  const apiStatus = health.isPending ? 'checking' : health.data?.ok ? 'ok' : 'unavailable';

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-semibold tracking-tight">pipeline</h1>
          <p className="text-sm text-neutral-600">API: {apiStatus}</p>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="max-w-2xl text-neutral-700">
          Job-search pipeline with stage history, not overwritten status.
        </p>
        <p className="mt-4 max-w-2xl text-sm text-neutral-600">
          Screens for sign-in, the list, and the timeline are built separately. This shell only
          proves the client workspace is wired to the API.
        </p>
        <p className="mt-6 text-sm text-neutral-800">Stages: {STAGES.join(', ')}</p>
      </main>
    </div>
  );
}
