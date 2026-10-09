import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiJson } from '@/lib/api';
import { registerSessionEnd } from '@/lib/session';
import type { User } from '@/lib/types';

type AuthValue = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  finishSignOut: (to?: '/' | '/signup') => void;
};

const USER_QUERY_KEYS = [['applications'], ['application'], ['sessions'], ['events']];

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const finishSignOut = useCallback(
    (to: '/' | '/signup' = '/') => {
      queryClient.setQueryData(['me'], null);
      for (const queryKey of USER_QUERY_KEYS) {
        void queryClient.cancelQueries({ queryKey });
        queryClient.removeQueries({ queryKey });
      }
      navigate(to, { replace: to === '/signup' });
    },
    [navigate, queryClient],
  );

  useEffect(() => registerSessionEnd(() => finishSignOut()), [finishSignOut]);

  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const response = await api('/api/auth/me');
      if (response.status === 401) return null;
      if (!response.ok) throw new Error('Could not load your account');
      const body = (await response.json()) as { user: User };
      return body.user;
    },
  });

  const value: AuthValue = {
    user: me.data ?? null,
    loading: me.isPending,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    finishSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth requires AuthProvider');
  return value;
}

export async function signOut(): Promise<void> {
  await apiJson('/api/auth/logout', { method: 'POST' });
}
