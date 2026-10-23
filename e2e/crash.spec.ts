// A crash inside the exercise shows a message, not a black screen.
import { expect, test } from '@playwright/test';

test('a crash shows a readable error message', async ({ page }) => {
  page.on('pageerror', () => {});
  await page.goto('/');
  await page.getByTestId('start-practice').click();
  await page.getByTestId('arrive').click();
  await page.evaluate(() => {
    const h = (window as unknown as { __firstFive: { session: { getState: () => { sim: object }; setState: (s: object) => void } } }).__firstFive.session;
    h.setState({ sim: { ...h.getState().sim, log: null } });
  });
  await expect(page.getByRole('alert').first()).toContainText('Something went wrong');
  await expect(page.getByRole('button', { name: 'Reload the page' }).first()).toBeVisible();
});
