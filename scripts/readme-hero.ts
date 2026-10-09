import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium, type Locator, type Page } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = 4174;
const localBase = `http://127.0.0.1:${port}`;
const frozen = '2026-10-09T18:00:00Z';
const urlPill = '/applications/acme-robotics';
const canvas = { width: 1600, height: 900 };
const githubScale = 880 / canvas.width;

type Box = { x: number; y: number; width: number; height: number };
type TextSample = { font: number; text: string };

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

async function waitForHealth(base: string) {
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
      APP_URL: localBase,
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

async function boxOf(locator: Locator, label: string): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`missing box for ${label}`);
  return box;
}

async function seedHero(page: Page, base: string): Promise<string> {
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

/** Text inside the desktop crop. GitHub shows the 1600px image at about 880px. */
async function cropText(page: Page): Promise<TextSample[]> {
  return page.evaluate(() => {
    const header = document.querySelector('header');
    const history = document.querySelector('[aria-labelledby="history-heading"]');
    const grid = history?.parentElement;
    const main = document.querySelector('main');
    if (!header || !grid || !main) return [];
    const top = header.getBoundingClientRect().top;
    const bottom = grid.getBoundingClientRect().bottom;
    const left = Math.min(header.getBoundingClientRect().left, main.getBoundingClientRect().left);
    const right = Math.max(
      header.getBoundingClientRect().right,
      main.getBoundingClientRect().right,
    );
    const samples: TextSample[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const el = node.parentElement;
      node = walker.nextNode();
      if (!text || !el) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      if (rect.bottom < top - 1 || rect.top > bottom + 1) continue;
      if (rect.right < left - 1 || rect.left > right + 1) continue;
      const font = Number.parseFloat(style.fontSize);
      if (!Number.isFinite(font)) continue;
      samples.push({ font, text: text.slice(0, 60) });
    }
    return samples;
  });
}

function assertLegible(samples: TextSample[], scale: number, label: string) {
  const short = samples
    .map((sample) => ({ ...sample, displayed: sample.font * scale * githubScale }))
    .filter((sample) => sample.displayed < 12)
    .sort((a, b) => a.displayed - b.displayed);
  if (short.length > 0) {
    const detail = short
      .slice(0, 8)
      .map((sample) => `${sample.displayed.toFixed(2)}px "${sample.text}" (${sample.font}px)`)
      .join('; ');
    throw new Error(`${label} text under 12px at 880px display: ${detail}`);
  }
  const smallest = Math.min(...samples.map((sample) => sample.font * scale * githubScale));
  console.log(`${label} smallest text ${smallest.toFixed(2)}px at 880px display`);
  return smallest;
}

async function main() {
  const remote = process.env.HERO_BASE_URL?.replace(/\/$/, '');
  const base = remote || localBase;
  let server: ChildProcess | undefined;
  if (!remote) {
    await run('npm', ['run', 'build', '-w', 'client', '--', '--mode', 'test']);
    server = startServer();
  }
  const outDir = resolve(root, 'docs/images');
  const tmp = resolve(root, 'test-results/hero');
  await mkdir(outDir, { recursive: true });
  await mkdir(tmp, { recursive: true });
  try {
    if (!remote) await waitForHealth(base);
    const browser = await chromium.launch();
    const desktop = await browser.newContext({
      locale: 'en-US',
      timezoneId: 'America/Denver',
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 2,
    });
    await desktop.clock.setFixedTime(new Date(frozen));
    const desktopPage = await desktop.newPage();
    const acmeId = await seedHero(desktopPage, base);
    await desktopPage.goto(`${base}/applications/${acmeId}?screenshot=1`);
    await desktopPage.getByRole('heading', { name: 'Acme Robotics' }).waitFor();
    await desktopPage.getByText('Visit 2').first().waitFor();
    const account = desktopPage.getByRole('button', { name: 'Account menu' });
    const accountText = await account.innerText();
    if (!accountText.includes('Demo user')) {
      throw new Error(`account button should show Demo user, saw: ${accountText}`);
    }

    const header = desktopPage.locator('header');
    const main = desktopPage.locator('main');
    const grid = desktopPage.locator('[aria-labelledby="history-heading"]').locator('..');
    await grid.waitFor();

    let viewport = { width: 1280, height: 720 };
    let headerBox = await boxOf(header, 'header');
    let mainBox = await boxOf(main, 'main');
    let gridBox = await boxOf(grid, 'cards');
    const needed = Math.ceil(gridBox.y + gridBox.height + 8);
    if (needed > viewport.height) {
      viewport = { width: 1280, height: needed };
      await desktopPage.setViewportSize(viewport);
      await settle(desktopPage);
      headerBox = await boxOf(header, 'header');
      mainBox = await boxOf(main, 'main');
      gridBox = await boxOf(grid, 'cards');
    }
    const left = Math.min(headerBox.x, mainBox.x);
    const right = Math.max(headerBox.x + headerBox.width, mainBox.x + mainBox.width);
    const crop = {
      x: Math.max(0, Math.floor(left)),
      y: Math.max(0, Math.floor(headerBox.y)),
      width: Math.max(1, Math.ceil(right) - Math.floor(left)),
      height: Math.max(1, Math.ceil(gridBox.y + gridBox.height) - Math.floor(headerBox.y)),
    };
    if (crop.x + crop.width > viewport.width) crop.width = viewport.width - crop.x;
    if (crop.y + crop.height > viewport.height) crop.height = viewport.height - crop.y;

    const samples = await cropText(desktopPage);
    if (samples.length === 0) throw new Error('hero crop has no text to measure');
    const shotPng = resolve(tmp, 'shot.png');
    await settle(desktopPage);
    await desktopPage.screenshot({ path: shotPng, clip: crop });

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
    await settle(phonePage);
    await phonePage.screenshot({ path: phonePng, clip: { x: 0, y: 0, width: 390, height: 844 } });

    const [shotBytes, phoneBytes, frame] = await Promise.all([
      readFile(shotPng),
      readFile(phonePng),
      readFile(resolve(root, 'scripts/hero-frame.html'), 'utf8'),
    ]);

    const chrome = 40;
    const top = 48;
    const bottomMargin = 16;
    const browserX = 48;
    const phoneOuter = { width: 340, height: 690 };
    const gap = 16;
    const maxFrameW = canvas.width - browserX - gap - phoneOuter.width;
    const maxContentH = canvas.height - top - bottomMargin - chrome;
    const scale = Math.min(maxFrameW / crop.width, maxContentH / crop.height);
    const desktopW = Math.round(crop.width * scale);
    const shotH = Math.round(crop.height * scale);
    const browserW = desktopW;
    const browserH = chrome + shotH;
    const browserY = Math.round((canvas.height - browserH) / 2);
    const phoneX = browserX + browserW + gap;
    const phoneY = Math.round((canvas.height - phoneOuter.height) / 2);
    const smallest = assertLegible(samples, scale, 'desktop crop');

    console.log(
      `hero crop ${crop.width}x${crop.height} scale ${scale.toFixed(3)} ` +
        `frame ${browserW}x${browserH} smallest ${smallest.toFixed(2)}px`,
    );

    let html = frame
      .replaceAll('/*BROWSER_X*/ 80px', `${browserX}px`)
      .replaceAll('/*BROWSER_Y*/ 64px', `${browserY}px`)
      .replaceAll('/*BROWSER_W*/ 1180px', `${browserW}px`)
      .replaceAll('/*BROWSER_H*/ 760px', `${browserH}px`)
      .replaceAll('/*DESKTOP_W*/ 1180px', `${desktopW}px`)
      .replaceAll('/*SHOT_H*/ 720px', `${shotH}px`)
      .replaceAll('/*PHONE_X*/ 1260px', `${phoneX}px`)
      .replaceAll('/*PHONE_Y*/ 105px', `${phoneY}px`)
      .replaceAll('/*PHONE_W*/ 340px', `${phoneOuter.width}px`)
      .replaceAll('/*PHONE_H*/ 690px', `${phoneOuter.height}px`)
      .replace(
        'id="shot" alt=""',
        `id="shot" alt="" src="data:image/png;base64,${shotBytes.toString('base64')}"`,
      )
      .replace(
        'id="phone" alt=""',
        `id="phone" alt="" src="data:image/png;base64,${phoneBytes.toString('base64')}"`,
      );
    if (!html.includes(urlPill) || html.includes('localhost')) {
      throw new Error('hero url pill must be the path only');
    }

    for (const [factor, name] of [
      [1, 'readme-hero.png'],
      [2, 'readme-hero@2x.png'],
    ] as const) {
      const context = await browser.newContext({
        viewport: canvas,
        deviceScaleFactor: factor,
      });
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const frameText = await page.evaluate(() => {
        const samples: TextSample[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          const el = node.parentElement;
          node = walker.nextNode();
          if (!text || !el) continue;
          const font = Number.parseFloat(getComputedStyle(el).fontSize);
          if (Number.isFinite(font)) samples.push({ font, text: text.slice(0, 60) });
        }
        return samples;
      });
      assertLegible(frameText, 1, 'hero frame');
      await page.screenshot({
        path: resolve(outDir, name),
        clip: { x: 0, y: 0, width: canvas.width, height: canvas.height },
      });
      await context.close();
    }
    await browser.close();
  } finally {
    server?.kill('SIGTERM');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
