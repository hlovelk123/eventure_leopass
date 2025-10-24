import { expect, test } from '@playwright/test';

test.describe('bootstrap smoke', () => {
  test('home page renders headline', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Leo Pass Platform' })).toBeVisible();
  });
});
