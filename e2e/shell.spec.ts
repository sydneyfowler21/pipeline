import { expect, test } from '@playwright/test';

test('shell renders the product name and the fixed stages', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'pipeline' })).toBeVisible();
  await expect(page.getByText('Applied, Screen, Interview, Offer, Closed')).toBeVisible();
  await expect(page.getByText(/API: (ok|unavailable)/)).toBeVisible();
});

test('shell stays readable at a phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'pipeline' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
});
