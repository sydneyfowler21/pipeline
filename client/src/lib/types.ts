import type { Stage } from '@pipeline/shared';

export type User = {
  id: string;
  email: string;
  emailVerified: boolean;
  timeZone: string;
  isDemo: boolean;
  demoExpiresAt: string | null;
};

export type Visit = {
  stage: Stage;
  enteredLocal: string;
  days: number;
  current?: boolean;
  visitNumber: number;
  occurredAt: string;
  note: string | null;
};

export type ApplicationDetail = {
  id: string;
  company: string;
  role: string;
  url: string | null;
  notes: string;
  appliedOn: string;
  createdAt: string;
  updatedAt: string;
  currentStage: Stage;
  lastActivity: string;
  lastActivityAt: string;
  lastActivityKind: 'stage_change' | 'edited';
  lastActivityStage: Stage | null;
  visits: Visit[];
  totals: Partial<Record<Stage, number>>;
  visitCounts: Partial<Record<Stage, number>>;
  latestEventAt: string;
  latestEventLocalDate: string;
  timeZone: string;
  today: string;
};

export type ApplicationListItem = {
  id: string;
  company: string;
  role: string;
  currentStage: Stage;
  daysInCurrentStage: number;
  lastActivity: string;
  lastActivityAt: string;
  lastActivityKind: 'stage_change' | 'edited';
  lastActivityStage: Stage | null;
};

export type ApplicationList = {
  applications: ApplicationListItem[];
  total: number;
  countsByStage: Record<Stage, number>;
  unfilteredTotal: number;
};

export type SessionRow = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  device: string;
  current: boolean;
  isCurrent: boolean;
};

export type AuthEventRow = {
  id: string;
  kind: string;
  label: string;
  ip: string | null;
  userAgent: string | null;
  device: string;
  createdAt: string;
};

export type ApiBody = {
  error?: string;
  message?: string;
  field?: string;
  retryAfterSeconds?: number;
  issues?: Array<{ path: string; message: string }>;
};
