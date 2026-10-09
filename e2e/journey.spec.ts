import { expect, test, type Page } from '@playwright/test';

const password = 'correct-horse-battery-e2e-91';

test('sign up, move to Screen, then Interview, and keep that history after reload', async ({
  page,
}, testInfo) => {
  const email = `e2e.${Date.now()}@example.test`;
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  const mailbox = await page.request.get('/api/test/mailbox');
  expect(mailbox.ok()).toBeTruthy();
  const messages = (await mailbox.json()) as { messages: Array<{ text: string }> };
  const token = messages.messages
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

  await page.getByRole('link', { name: 'Add application' }).first().click();
  await page.getByLabel('Company').fill('Acme Robotics');
  await page.getByLabel('Role').fill('Frontend Engineer');
  await page.getByRole('button', { name: 'Add application' }).click();
  await expect(page.getByRole('heading', { name: 'Acme Robotics' })).toBeVisible();

  await moveTo(page, 'Screen');
  await expect(page.getByText('Moved to Screen.')).toBeVisible();
  await moveTo(page, 'Interview');
  await expect(page.getByText('Moved to Interview.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Acme Robotics' })).toBeVisible();
  const history = page.getByRole('region', { name: 'Stage history' });
  await expect(history.getByText('Screen', { exact: true })).toBeVisible();
  await expect(history.getByText('Interview', { exact: true })).toBeVisible();
  await expect(history.getByText('Applied', { exact: true })).toBeVisible();

  const video = testInfo.attachments.find((item) => item.name === 'video');
  if (video?.path) testInfo.annotations.push({ type: 'journey-video', description: video.path });
});

async function moveTo(page: Page, stage: 'Screen' | 'Interview') {
  await page.getByRole('button', { name: 'Move to stage' }).click();
  await page.getByRole('radio', { name: new RegExp(stage) }).click();
  await page.getByRole('button', { name: `Move to ${stage}` }).click();
  await expect(page.getByRole('heading', { name: 'Acme Robotics' })).toBeVisible();
}
