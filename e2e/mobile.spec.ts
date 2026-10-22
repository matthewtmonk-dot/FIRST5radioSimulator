// Phone-sized layout: the main controls are reachable without overlap.
import { expect, test } from '@playwright/test';

test('exercise is usable at phone width', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-practice').click();
  const arrive = page.getByTestId('arrive');
  await expect(arrive).toBeInViewport();
  await arrive.click();
  await expect(page.getByLabel('Transmission text')).toBeInViewport();
  await expect(page.getByRole('button', { name: /Push to talk/ })).toBeVisible();
  await page.getByLabel('Transmission text').fill('Dispatch, Engine 14 on scene.');
  await page.getByRole('button', { name: /^(Transmit|Say it)$/ }).click();
  await expect(page.getByRole('dialog', { name: 'Transmission feedback' })).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(width).toBeLessThanOrEqual(0);
});
