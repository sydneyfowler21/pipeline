import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { authEventLabel, deviceLabel } from '../src/auth/device.js';
import { sessions } from '../src/db/schema.js';
import { demoSeedMode, resolveDemoTimeZone } from '../src/demo.js';
import { MSG } from '../src/messages.js';
import type { Database } from '../src/db/client.js';
import type { MemoryMailTransport } from '../src/mail/transport.js';
import {
  api,
  boot,
  CookieJar,
  login,
  tokenFrom,
  truncate,
  withCsrf,
  type TestApp,
} from './helpers.js';

const password = 'horse-battery-staple-99';

describe('screen helpers', () => {
  it('parses a device without inventing a location', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome on macOS');
    expect(deviceLabel(null)).toBe('Unknown device');
    expect(authEventLabel('session_revoked')).toBe('Signed out a device');
    expect(authEventLabel('password_change')).toBe('Password changed');
  });

  it('keeps the hero seed out of production and falls back on a bad time zone', () => {
    expect(demoSeedMode('production', 'hero')).toBe('default');
    expect(demoSeedMode('test', 'hero')).toBe('hero');
    expect(demoSeedMode('development', undefined)).toBe('default');
    expect(resolveDemoTimeZone('Europe/Berlin')).toBe('Europe/Berlin');
    expect(resolveDemoTimeZone('Not/AZone')).toBe('America/Denver');
    expect(resolveDemoTimeZone(undefined)).toBe('America/Denver');
  });
});

describe('screen api', () => {
  let db: Database;
  let app: TestApp;
  let mail: MemoryMailTransport;
  let close: () => Promise<void>;
  let env: Awaited<ReturnType<typeof boot>>['env'];

  beforeAll(async () => {
    const ctx = await boot();
    db = ctx.db;
    app = ctx.app;
    mail = ctx.mail;
    env = ctx.env;
    close = () => ctx.sql.end({ timeout: 5 });
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    mail.clear();
    await truncate(db);
  });

  it('searches company and role only and adds timeline fields', async () => {
    const jar = new CookieJar();
    await signupAndVerify(jar, 'ada@example.test');
    await login(app, jar, 'ada@example.test', password);
    const created = await api(app, jar, '/api/applications', {
      method: 'POST',
      body: {
        company: 'Acme Robotics',
        role: 'Frontend Engineer',
        notes: 'zebra-unique-note',
        applied_on: '2026-10-01',
      },
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      application: {
        id: string;
        visits: Array<{ visitNumber: number; stage: string }>;
        visitCounts: Record<string, number>;
        latestEventLocalDate: string;
        timeZone: string;
        today: string;
        lastActivity: string;
        lastActivityAt: string;
      };
    };
    expect(createdBody.application.visits[0]?.visitNumber).toBe(1);
    expect(createdBody.application.visitCounts.Applied).toBe(1);
    expect(createdBody.application.latestEventLocalDate).toBe('2026-10-01');
    expect(createdBody.application.timeZone).toBe('America/Denver');
    expect(createdBody.application.today).toBe('2026-10-09');
    expect(createdBody.application.lastActivityAt).toBe(createdBody.application.lastActivity);

    await api(app, jar, '/api/applications', {
      method: 'POST',
      body: {
        company: 'Northwind Labs',
        role: 'QA Engineer',
        applied_on: '2026-10-02',
      },
    });
    await api(app, jar, `/api/applications/${createdBody.application.id}/stages`, {
      method: 'POST',
      body: { stage: 'Screen' },
    });

    const byCompany = await api(app, jar, '/api/applications?q=acme');
    const companyBody = (await byCompany.json()) as {
      applications: Array<{ company: string; lastActivityKind: string; lastActivityStage: string }>;
      total: number;
      unfilteredTotal: number;
      countsByStage: Record<string, number>;
    };
    expect(companyBody.applications.map((item) => item.company)).toEqual(['Acme Robotics']);
    expect(companyBody.applications[0]?.lastActivityKind).toBe('stage_change');
    expect(companyBody.applications[0]?.lastActivityStage).toBe('Screen');
    expect(companyBody.total).toBe(1);
    expect(companyBody.unfilteredTotal).toBe(2);

    const byRole = await api(app, jar, '/api/applications?q=qa');
    const roleBody = (await byRole.json()) as { applications: Array<{ company: string }> };
    expect(roleBody.applications.map((item) => item.company)).toEqual(['Northwind Labs']);

    const byNotes = await api(app, jar, '/api/applications?q=zebra-unique-note');
    const notesBody = (await byNotes.json()) as { applications: unknown[]; total: number };
    expect(notesBody.applications).toHaveLength(0);
    expect(notesBody.total).toBe(0);

    const filtered = await api(app, jar, '/api/applications?stage=Screen');
    const filteredBody = (await filtered.json()) as {
      applications: Array<{ company: string }>;
      total: number;
      countsByStage: Record<string, number>;
    };
    expect(filteredBody.applications.map((item) => item.company)).toEqual(['Acme Robotics']);
    expect(filteredBody.total).toBe(2);
    expect(filteredBody.countsByStage.Screen).toBe(1);
    expect(filteredBody.countsByStage.Applied).toBe(1);

    const badStage = await api(app, jar, '/api/applications?stage=Rejected');
    expect(badStage.status).toBe(400);
  });

  it('returns 422 when a stage note is longer than 280 characters', async () => {
    const jar = new CookieJar();
    await signupAndVerify(jar, 'ada@example.test');
    await login(app, jar, 'ada@example.test', password);
    const created = await api(app, jar, '/api/applications', {
      method: 'POST',
      body: { company: 'Acme Robotics', role: 'Frontend Engineer', applied_on: '2026-10-01' },
    });
    const id = ((await created.json()) as { application: { id: string } }).application.id;
    const over = await api(app, jar, `/api/applications/${id}/stages`, {
      method: 'POST',
      body: { stage: 'Screen', note: 'n'.repeat(281) },
    });
    expect(over.status).toBe(422);
    expect(await over.json()).toEqual({ field: 'note', message: MSG.noteTooLong });

    const ok = await api(app, jar, `/api/applications/${id}/stages`, {
      method: 'POST',
      body: { stage: 'Screen', note: 'n'.repeat(280) },
    });
    expect(ok.status).toBe(201);
  });

  it('refuses to sign out the current session and revokes another', async () => {
    const jar = new CookieJar();
    await signupAndVerify(jar, 'ada@example.test');
    await login(app, jar, 'ada@example.test', password);
    const other = new CookieJar();
    await login(app, other, 'ada@example.test', password);

    const mine = await api(app, jar, '/api/auth/sessions');
    const body = (await mine.json()) as {
      sessions: Array<{ id: string; current: boolean; isCurrent: boolean; device: string }>;
    };
    expect(body.sessions).toHaveLength(2);
    const current = body.sessions.find((row) => row.current);
    const extra = body.sessions.find((row) => !row.current);
    if (!current || !extra) throw new Error('missing sessions');
    expect(current.isCurrent).toBe(true);
    expect(current.device).toBe('Unknown device');

    const refused = await api(app, jar, `/api/auth/sessions/${current.id}`, { method: 'DELETE' });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: MSG.currentSession });
    expect((await api(app, jar, '/api/auth/me')).status).toBe(200);

    const aliasRefused = await api(app, jar, `/api/sessions/${current.id}`, { method: 'DELETE' });
    expect(aliasRefused.status).toBe(409);

    const stranger = new CookieJar();
    await signupAndVerify(stranger, 'blair@example.test');
    await login(app, stranger, 'blair@example.test', password);
    const hidden = await api(app, stranger, `/api/sessions/${extra.id}`, { method: 'DELETE' });
    expect(hidden.status).toBe(404);

    const revoked = await api(app, jar, `/api/sessions/${extra.id}`, { method: 'DELETE' });
    expect(revoked.status).toBe(200);
    expect((await api(app, other, '/api/auth/me')).status).toBe(401);
    expect((await api(app, jar, '/api/auth/me')).status).toBe(200);

    const events = await api(app, jar, '/api/auth/events');
    const eventBody = (await events.json()) as {
      events: Array<{ kind: string; label: string; device: string }>;
    };
    const revokedEvent = eventBody.events.find((event) => event.kind === 'session_revoked');
    expect(revokedEvent?.label).toBe('Signed out a device');
    expect(revokedEvent?.device).toBeTruthy();

    const left = await db.select().from(sessions);
    expect(left.some((row) => row.id === current.id)).toBe(true);
    expect(left.some((row) => row.id === extra.id)).toBe(false);
  });

  it('changes a password, rejects the current one, and saves a time zone', async () => {
    const jar = new CookieJar();
    await signupAndVerify(jar, 'ada@example.test');
    await login(app, jar, 'ada@example.test', password);
    const other = new CookieJar();
    await login(app, other, 'ada@example.test', password);

    const wrong = await api(app, jar, '/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: 'not-the-password', newPassword: 'horse-battery-staple-22' },
    });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: MSG.currentPassword });

    const next = 'horse-battery-staple-22';
    const changed = await api(app, jar, '/api/me/password', {
      method: 'POST',
      body: { currentPassword: password, newPassword: next },
    });
    expect(changed.status).toBe(200);
    expect((await api(app, jar, '/api/auth/me')).status).toBe(200);
    expect((await api(app, other, '/api/auth/me')).status).toBe(401);
    const again = new CookieJar();
    expect((await login(app, again, 'ada@example.test', password)).status).toBe(401);
    expect((await login(app, again, 'ada@example.test', next)).status).toBe(200);

    const zone = await api(app, jar, '/api/me/preferences', {
      method: 'PATCH',
      body: { timeZone: 'Europe/Berlin' },
    });
    expect(zone.status).toBe(200);
    const me = await api(app, jar, '/api/auth/me');
    expect(((await me.json()) as { user: { timeZone: string } }).user.timeZone).toBe(
      'Europe/Berlin',
    );

    const bad = await api(app, jar, '/api/me/preferences', {
      method: 'PATCH',
      body: { timeZone: 'Not/AZone' },
    });
    expect(bad.status).toBe(400);
  });

  it('resends a verification link and only exposes the mailbox in test', async () => {
    const jar = new CookieJar();
    await withCsrf(app, jar);
    await api(app, jar, '/api/auth/signup', {
      method: 'POST',
      body: { email: 'ada@example.test', password, timeZone: 'America/Denver' },
    });
    await login(app, jar, 'ada@example.test', password);
    mail.clear();
    const sent = await api(app, jar, '/api/auth/resend-verification', { method: 'POST' });
    expect(sent.status).toBe(200);
    const sentBody = (await sent.json()) as { retryAfterSeconds: number };
    expect(sentBody.retryAfterSeconds).toBeGreaterThan(0);
    expect(tokenFrom(mail, 'Verify')).toBeTruthy();

    const again = await api(app, jar, '/api/auth/resend-verification', { method: 'POST' });
    expect(again.status).toBe(429);
    const againBody = (await again.json()) as { error: string; retryAfterSeconds: number };
    expect(againBody.error).toBe(MSG.resendWait);
    expect(againBody.retryAfterSeconds).toBeGreaterThan(0);

    const mailbox = await api(app, jar, '/api/test/mailbox');
    expect(mailbox.status).toBe(200);

    const prod = createApp({
      db,
      mail,
      clock: { now: () => new Date('2026-10-09T18:00:00.000Z') },
      env: { ...env, NODE_ENV: 'production' },
      hibp: async () => false,
    });
    const hidden = await prod.request('/api/test/mailbox');
    expect(hidden.status).toBe(404);

    const prodJar = new CookieJar();
    await withCsrf(prod, prodJar);
    const demo = await api(prod, prodJar, '/api/demo', {
      method: 'POST',
      body: { seed: 'hero', timeZone: 'America/Denver' },
    });
    expect(demo.status).toBe(201);
    const demoBody = (await demo.json()) as {
      applications: Array<{ company: string; notes?: string }>;
    };
    const listed = await api(prod, prodJar, '/api/applications');
    const listedBody = (await listed.json()) as {
      applications: Array<{ company: string; notes?: string; role: string }>;
    };
    expect(listedBody.applications.map((item) => item.company).sort()).toEqual(
      ['Acme Robotics', 'Globex', 'Hooli', 'Initech', 'Northwind Labs'].sort(),
    );
    const acme = await api(prod, prodJar, '/api/applications?q=acme');
    const acmeBody = (await acme.json()) as { applications: Array<{ id: string }> };
    const detail = await api(prod, prodJar, `/api/applications/${acmeBody.applications[0]?.id}`);
    const detailBody = (await detail.json()) as { application: { notes: string } };
    expect(detailBody.application.notes).not.toBe('Panel went well; waiting on offer details.');
    expect(demoBody.applications).toHaveLength(5);
  });

  it('seeds the hero fixture outside production and stores a valid demo time zone', async () => {
    const jar = new CookieJar();
    await withCsrf(app, jar);
    const created = await api(app, jar, '/api/demo', {
      method: 'POST',
      body: { seed: 'hero', timeZone: 'Not/AZone' },
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { user: { timeZone: string } };
    expect(body.user.timeZone).toBe('America/Denver');

    const list = await api(app, jar, '/api/applications');
    const listBody = (await list.json()) as {
      applications: Array<{
        id: string;
        company: string;
        currentStage: string;
        lastActivityKind: string;
      }>;
    };
    const acme = listBody.applications.find((item) => item.company === 'Acme Robotics');
    const initech = listBody.applications.find((item) => item.company === 'Initech');
    const globex = listBody.applications.find((item) => item.company === 'Globex');
    const hooli = listBody.applications.find((item) => item.company === 'Hooli');
    expect(initech?.currentStage).toBe('Screen');
    expect(hooli?.currentStage).toBe('Closed');
    expect(globex?.lastActivityKind).toBe('edited');
    const detail = await api(app, jar, `/api/applications/${acme?.id}`);
    const detailBody = (await detail.json()) as {
      application: { notes: string; visits: Array<{ stage: string; visitNumber: number }> };
    };
    expect(detailBody.application.notes).toBe('Panel went well; waiting on offer details.');
    const interviews = detailBody.application.visits.filter((visit) => visit.stage === 'Interview');
    expect(interviews.map((visit) => visit.visitNumber)).toEqual([1, 2]);

    const zoned = new CookieJar();
    await withCsrf(app, zoned);
    const berlin = await api(app, zoned, '/api/demo', {
      method: 'POST',
      body: { timeZone: 'Europe/Berlin' },
    });
    const berlinBody = (await berlin.json()) as { user: { timeZone: string } };
    expect(berlinBody.user.timeZone).toBe('Europe/Berlin');

    const rows = await db.select({ email: sessions.userId }).from(sessions);
    expect(rows.length).toBeGreaterThan(0);
  });

  async function signupAndVerify(jar: CookieJar, address: string) {
    await withCsrf(app, jar);
    const response = await api(app, jar, '/api/auth/signup', {
      method: 'POST',
      body: { email: address, password, timeZone: 'America/Denver' },
    });
    expect(response.status).toBe(200);
    await api(app, jar, '/api/auth/verify-email', {
      method: 'POST',
      body: { token: tokenFrom(mail, 'Verify') },
    });
  }
});
