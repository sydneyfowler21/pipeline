import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const focusWidths = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;

test('sign-in hints after repeated failures without revealing the account', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const emails = [`nobody.${Date.now()}@example.test`, `other.${Date.now()}@example.test`];
  for (const email of emails) {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('not-a-real-password-91');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
    await expect(page.getByText(/minute|locked out|does not exist|doesn't exist/i)).toHaveCount(0);
    await expect(page.getByText('Having trouble?')).toHaveCount(0);
  }
  await page.getByLabel('Email').fill(emails[0] ?? '');
  await page.getByLabel('Password', { exact: true }).fill('not-a-real-password-91');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const hint = page.getByText('Having trouble?');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('or check your email.');
  await expect(hint).not.toContainText(/minute|exist/i);
  await expect(page.getByRole('link', { name: 'Reset your password' })).toHaveAttribute(
    'href',
    '/forgot',
  );
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');

  await page.getByLabel('Email').fill(emails[1] ?? '');
  await page.getByLabel('Password', { exact: true }).fill('not-a-real-password-91');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  await expect(page.getByText('Having trouble?')).toContainText(
    'Reset your password, or check your email.',
  );
});

test('move stays in view and dialogs return focus', async ({ page }) => {
  await openDemoDetail(page);
  for (const viewport of focusWidths) {
    await page.setViewportSize(viewport);
    const move = page.getByRole('button', { name: 'Move to stage' });
    await move.click();
    const dialog = page.getByRole('dialog');
    const action = dialog.getByRole('button', { name: 'Move to stage' });
    await expect(action).toBeVisible();
    await expectInViewport(action, viewport.height);
    await page.keyboard.press('Escape');
    await expect(move).toBeFocused();

    await move.click();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(move).toBeFocused();

    const more = page.getByRole('button', { name: 'More actions' });
    await more.click();
    await page.getByRole('menuitem', { name: 'Delete application' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();

    await more.click();
    await page.getByRole('menuitem', { name: 'Delete application' }).click();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(more).toBeFocused();
  }

  await page.goto('/settings/security');
  for (const viewport of focusWidths) {
    await page.setViewportSize(viewport);
    const trigger = page.getByRole('button', { name: 'Sign out everywhere' });
    await trigger.click();
    const confirm = page.getByRole('alertdialog');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(trigger).toBeFocused();
  }

  await page.goto('/settings/preferences');
  for (const viewport of focusWidths) {
    await page.setViewportSize(viewport);
    const zone = page.getByRole('combobox', { name: 'Time zone' });
    await zone.click();
    await page.keyboard.press('Escape');
    await expect(zone).toBeFocused();
    await zone.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await expect(zone).toBeFocused();
  }
});

test('long stage notes stay within the viewport', async ({ page }) => {
  await openDemoDetail(page);
  const id = page.url().match(/\/applications\/([^/?]+)/)?.[1];
  expect(id).toBeTruthy();
  const notes = ['N'.repeat(280), '😀'.repeat(140), '你'.repeat(280)];
  const stages = ['Closed', 'Screen', 'Interview'] as const;
  for (const [index, note] of notes.entries()) {
    const status = await page.evaluate(
      async ({ applicationId, stage, note: stageNote }) => {
        const csrfResponse = await fetch('/api/auth/csrf');
        const csrf = (await csrfResponse.json()) as { csrfToken: string };
        const response = await fetch(`/api/applications/${applicationId}/stages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrf.csrfToken,
          },
          body: JSON.stringify({ stage, note: stageNote }),
        });
        return response.status;
      },
      { applicationId: id, stage: stages[index], note },
    );
    expect(status).toBe(201);
  }
  await page.reload();
  await expect(page.getByText('N'.repeat(40))).toBeVisible();
  await expect(page.getByText('😀'.repeat(8))).toBeVisible();
  await expect(page.getByText('你'.repeat(8))).toBeVisible();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    const link = page.getByRole('link', { name: 'Job posting' });
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.inner);
  }
});

test('add form validates in page and focuses the first invalid field', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByRole('heading', { name: 'Applications', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Add application' }).click();
  await expect(page.getByRole('heading', { name: 'Add application' })).toBeVisible();
  await page.getByLabel('Company').fill('Acme');
  await page.getByLabel('Job posting').fill('notaurl');
  await page.getByRole('button', { name: 'Add application' }).click();
  await expect(page.getByRole('alert')).toHaveText('Fix 2 fields to save');
  await expect(page.getByText('Enter a role (1–120 characters).')).toBeVisible();
  await expect(page.getByText('Use an http or https link.')).toBeVisible();
  await expect(page.getByLabel('Role')).toBeFocused();
  const validationMessage = await page
    .getByLabel('Job posting')
    .evaluate((el) => (el as HTMLInputElement).validationMessage);
  expect(validationMessage).toBe('');
});

test('sign out leaves the shell and back does not reveal data', async ({ page }) => {
  const email = await signUpAndOpenList(page);
  await page.getByRole('link', { name: 'Add application' }).first().click();
  await page.getByLabel('Company').fill('Acme Robotics');
  await page.getByLabel('Role').fill('Frontend Engineer');
  await page.getByRole('button', { name: 'Add application' }).click();
  await expect(page.getByRole('heading', { name: 'Acme Robotics' })).toBeVisible();
  await page.getByRole('link', { name: 'All applications' }).click();
  await expect(page.getByRole('heading', { name: 'Applications', exact: true })).toBeVisible();

  for (const viewport of focusWidths) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    if ((await heading.innerText()).includes('Track a job search')) {
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'Applications', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByRole('menu', { name: 'Account menu' }).getByText(email)).toBeVisible();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('heading', { name: 'Track a job search the honest way' }),
    ).toBeVisible();
    await expect(page.getByText(email)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Account menu' })).toHaveCount(0);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/applications/);
    await expect(page.getByText(email)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Acme Robotics' })).toHaveCount(0);
    await expect(page.getByText("Couldn't load your applications")).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Account menu' })).toHaveCount(0);
  }
});

test('a 401 from an authenticated request signs out', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByRole('heading', { name: 'Applications', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Acme Robotics/ }).first()).toBeVisible();
  await page.context().clearCookies();
  await page.getByLabel('Search applications').fill('zz');
  await expect(
    page.getByRole('heading', { name: 'Track a job search the honest way' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account menu' })).toHaveCount(0);
  await expect(page.getByText('Demo user')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Acme Robotics/ })).toHaveCount(0);
  await expect(page.getByText("Couldn't load your applications")).toHaveCount(0);
});

test('creating an account leaves the demo', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByRole('heading', { name: 'Applications', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create your own account' }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
});

const password = 'correct-horse-battery-e2e-91';

async function signUpAndOpenList(page: Page): Promise<string> {
  const email = `e2e.signout.${Date.now()}@example.test`;
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const mailbox = await page.request.get('/api/test/mailbox');
  expect(mailbox.ok()).toBeTruthy();
  const messages = (await mailbox.json()) as {
    messages: Array<{ to: string; text: string }>;
  };
  const token = messages.messages
    .filter((message) => message.to === email)
    .map((message) => message.text.match(/token=([A-Za-z0-9_-]+)/)?.[1])
    .find(Boolean);
  expect(token).toBeTruthy();
  await page.goto(`/verify-email?token=${token}`);
  await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to sign in' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Applications', exact: true })).toBeVisible();
  return email;
}

async function openDemoDetail(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByRole('heading', { name: 'Applications', exact: true })).toBeVisible();
  await page
    .getByRole('link', { name: /Acme Robotics/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Acme Robotics' })).toBeVisible();
}

async function expectInViewport(locator: ReturnType<Page['getByRole']>, viewportHeight: number) {
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewportHeight + 1);
}
