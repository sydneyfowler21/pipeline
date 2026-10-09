import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = 4174;
const base = `http://127.0.0.1:${port}`;
const frozen = '2026-10-09T18:00:00Z';

function run(command: string, args: string[]) {
  return new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: process.env });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`));
    });
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {
      /* server still booting */
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  throw new Error('server did not become healthy');
}

function startServer(): ChildProcess {
  return spawn('npm', ['run', 'start', '-w', 'server'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      APP_NOW: frozen,
      MAIL_TRANSPORT: 'memory',
      APP_URL: base,
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgres://pipeline:pipeline@127.0.0.1:5432/pipeline',
      SESSION_SECRET: process.env.SESSION_SECRET ?? 'test-session-secret-32-characters-min',
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? 'test-encryption-key-32-characters!!',
    },
  });
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    await document.fonts.ready;
  });
  await page.mouse.move(0, 0);
  await page.waitForLoadState('networkidle');
}

async function seedHero(page: Page): Promise<string> {
  await page.goto(`${base}/?screenshot=1`);
  const created = await page.evaluate(async () => {
    const csrfResponse = await fetch('/api/auth/csrf');
    const csrf = (await csrfResponse.json()) as { csrfToken: string };
    const response = await fetch('/api/demo', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrf.csrfToken,
      },
      body: JSON.stringify({ timeZone: 'America/Denver', seed: 'hero' }),
    });
    if (!response.ok) throw new Error(`demo seed failed: ${response.status}`);
    return (await response.json()) as {
      applications: Array<{ id: string; company: string }>;
    };
  });
  const acme = created.applications.find((item) => item.company === 'Acme Robotics');
  if (!acme) throw new Error('hero seed did not include Acme Robotics');
  return acme.id;
}

async function shot(page: Page, path: string, clip: { width: number; height: number }) {
  await settle(page);
  await page.screenshot({ path, clip: { x: 0, y: 0, ...clip } });
}

async function main() {
  await run('npm', ['run', 'build', '-w', 'client', '--', '--mode', 'test']);
  const server = startServer();
  const outDir = resolve(root, 'docs/images');
  const tmp = resolve(root, 'test-results/hero');
  await mkdir(outDir, { recursive: true });
  await mkdir(tmp, { recursive: true });
  try {
    await waitForHealth();
    const browser = await chromium.launch();
    const desktop = await browser.newContext({
      locale: 'en-US',
      timezoneId: 'America/Denver',
      viewport: { width: 1440, height: 928 },
      deviceScaleFactor: 2,
    });
    await desktop.clock.setFixedTime(new Date(frozen));
    const desktopPage = await desktop.newPage();
    const acmeId = await seedHero(desktopPage);
    await desktopPage.goto(`${base}/applications/${acmeId}?screenshot=1`);
    await desktopPage.getByRole('heading', { name: 'Acme Robotics' }).waitFor();
    const desktopPng = resolve(tmp, 'desktop.png');
    await shot(desktopPage, desktopPng, { width: 1440, height: 928 });

    const phone = await browser.newContext({
      locale: 'en-US',
      timezoneId: 'America/Denver',
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    });
    await phone.clock.setFixedTime(new Date(frozen));
    const phonePage = await phone.newPage();
    await phonePage.context().addCookies(await desktop.cookies());
    await phonePage.goto(`${base}/applications?screenshot=1`);
    await phonePage.getByRole('heading', { name: 'Applications', exact: true }).waitFor();
    const phonePng = resolve(tmp, 'phone.png');
    await shot(phonePage, phonePng, { width: 390, height: 844 });

    const [desktopBytes, phoneBytes, frame] = await Promise.all([
      readFile(desktopPng),
      readFile(phonePng),
      readFile(resolve(root, 'scripts/hero-frame.html'), 'utf8'),
    ]);
    const html = frame
      .replace(
        'id="desktop" alt=""',
        `id="desktop" alt="" src="data:image/png;base64,${desktopBytes.toString('base64')}"`,
      )
      .replace(
        'id="phone" alt=""',
        `id="phone" alt="" src="data:image/png;base64,${phoneBytes.toString('base64')}"`,
      )
      .replace('id="url"></div>', 'id="url">localhost/applications/acme-robotics</div>');

    for (const [scale, name] of [
      [1, 'readme-hero.png'],
      [2, 'readme-hero@2x.png'],
    ] as const) {
      const context = await browser.newContext({
        viewport: { width: 1600, height: 900 },
        deviceScaleFactor: scale,
      });
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      await page.screenshot({
        path: resolve(outDir, name),
        clip: { x: 0, y: 0, width: 1600, height: 900 },
      });
      await context.close();
    }
    await browser.close();
  } finally {
    server.kill('SIGTERM');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
