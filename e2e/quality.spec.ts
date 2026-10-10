import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const widths = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

test.describe.configure({ mode: 'serial' });

test('axe and screenshots for public screens', async ({ page }) => {
  await sweep(page, 'signin', '/');
  await sweep(page, 'signup', '/signup');
  await sweep(page, 'verify', '/verify');
  await sweep(page, 'forgot', '/forgot');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/reset-password?token=this-token-is-long-enough-but-invalid');
  await expect(page.getByRole('alert')).toContainText('invalid or expired');
  await expect(page.getByRole('link', { name: 'Request a new link' })).toBeVisible();
  await capture(page, 'reset-invalid');
});

test('interactive controls use a pointer and change on hover', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try the demo' })).toBeVisible();
  await expectPointerAndHover(page);

  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByRole('heading', { name: 'Applications', exact: true })).toBeVisible();
  await expectPointerAndHover(page);
});

test('axe and screenshots for signed-in screens', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByRole('heading', { name: 'Applications', exact: true })).toBeVisible();
  await capture(page, 'list');

  await page.getByLabel('Search applications').fill('zzzz-no-match');
  await expect(page.getByRole('heading', { name: /No applications match/ })).toBeVisible();
  await capture(page, 'list-no-results');
  await page.getByRole('button', { name: 'Clear search and filter' }).click();
  await expect(page.getByRole('link', { name: /Acme Robotics/ }).first()).toBeVisible();

  const abortApplications = (route: { abort: () => Promise<void> }) => route.abort();
  await page.route('**/api/applications*', abortApplications);
  await page.reload();
  await expect(page.getByRole('alert')).toBeVisible();
  await capture(page, 'list-error');
  await page.unroute('**/api/applications*', abortApplications);

  let releaseHold: () => void = () => undefined;
  const hold = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });
  const stallApplications = async (route: { continue: () => Promise<void> }) => {
    await hold;
    await route.continue().catch(() => undefined);
  };
  await page.route('**/api/applications*', stallApplications);
  await page.reload();
  await expect(page.locator('.skeleton').first()).toBeVisible();
  await capture(page, 'list-loading');
  releaseHold();
  await page.unroute('**/api/applications*', stallApplications);
  await page.reload();
  await expect(page.getByRole('link', { name: /Acme Robotics/ }).first()).toBeVisible();

  await page.getByRole('link', { name: 'Add application' }).click();
  await expect(page.getByRole('heading', { name: 'Add application' })).toBeVisible();
  await capture(page, 'application-form');
  await page.goto('/applications');

  await page
    .getByRole('link', { name: /Acme Robotics/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await capture(page, 'detail');
  await page.getByRole('button', { name: 'Move to stage' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await capture(page, 'move-stage');
  await page.getByRole('button', { name: 'Close' }).click();

  await page.goto('/settings/security');
  await expect(page.getByRole('heading', { name: 'Active sessions' })).toBeVisible();
  const thisDevice = page.locator('li').filter({ hasText: 'This device' });
  await expect(thisDevice).toContainText('Sign out here from the account menu.');
  await expect(thisDevice.getByRole('button')).toHaveCount(0);
  await capture(page, 'settings-security');
  await page.goto('/settings/preferences');
  await expect(page.getByRole('heading', { name: 'Time zone' })).toBeVisible();
  await capture(page, 'settings-preferences');
});

test('empty list screen', async ({ page }) => {
  const email = `empty.${Date.now()}@example.test`;
  const password = 'correct-horse-battery-e2e-91';
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const mailbox = await page.request.get('/api/test/mailbox');
  const body = (await mailbox.json()) as { messages: Array<{ text: string; to: string }> };
  const message = [...body.messages].reverse().find((item) => item.to === email);
  const token = message?.text.match(/token=([A-Za-z0-9_-]+)/)?.[1];
  expect(token).toBeTruthy();
  await page.goto(`/verify-email?token=${token}`);
  await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible();
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No applications yet' })).toBeVisible();
  await capture(page, 'list-empty');

  await page.goto('/settings/security');
  await expect(page.getByRole('heading', { name: 'Active sessions' })).toBeVisible();
  await expect(page.getByLabel('Current password')).toBeEnabled();
  const thisDevice = page.locator('li').filter({ hasText: 'This device' });
  await expect(thisDevice).toContainText('Sign out here from the account menu.');
  await expect(thisDevice.getByRole('button')).toHaveCount(0);
  await capture(page, 'settings-security-account');
});

async function sweep(page: Page, name: string, path: string) {
  for (const viewport of widths) {
    await page.setViewportSize(viewport);
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    await assertAxe(page);
    await assertNoOverflow(page);
    await page.screenshot({
      path: `e2e-screenshots/${name}-${viewport.width}.png`,
      fullPage: true,
    });
  }
}

async function capture(page: Page, name: string) {
  for (const viewport of widths) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    await assertAxe(page);
    await assertNoOverflow(page);
    await page.screenshot({
      path: `e2e-screenshots/${name}-${viewport.width}.png`,
      fullPage: true,
    });
  }
}

async function assertAxe(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const failures = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
}

async function assertNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
}

async function expectPointerAndHover(page: Page) {
  const problems: string[] = [];
  const handles = await page.locator('a, button, [role="radio"]').all();
  for (const handle of handles) {
    const box = await handle.boundingBox();
    if (!box || box.width < 8 || box.height < 8 || box.y < 0) continue;
    const name = (
      (await handle.innerText()) ||
      (await handle.getAttribute('aria-label')) ||
      'control'
    )
      .replace(/\s+/g, ' ')
      .slice(0, 80);
    const disabled = await handle.isDisabled().catch(() => false);
    const ariaDisabled = await handle.getAttribute('aria-disabled');
    const cursor = await handle.evaluate((element) => getComputedStyle(element).cursor);
    if (disabled || ariaDisabled === 'true') {
      if (cursor !== 'not-allowed') problems.push(`${name}: disabled cursor is ${cursor}`);
      continue;
    }
    if (cursor !== 'pointer') problems.push(`${name}: cursor is ${cursor}`);
    const snapshot = () =>
      handle.evaluate((element) => {
        const style = getComputedStyle(element);
        return [
          style.backgroundColor,
          style.borderTopColor,
          style.color,
          style.textDecorationLine,
          style.textDecorationThickness,
          style.boxShadow,
        ].join('|');
      });
    const before = await snapshot();
    await handle.hover({ force: true }).catch(() => undefined);
    const after = await snapshot();
    if (before === after) problems.push(`${name}: hover did not change style`);
  }
  expect(problems).toEqual([]);
}
