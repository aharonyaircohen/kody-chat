import { expect, test } from '@playwright/test';

test('creates a link page, saves it, and opens the public profile', async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByLabel('Display name').fill('Alex Studio');
  await page.getByLabel('Bio').fill('Independent designer');
  await page.getByLabel('Public URL').fill('alex');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved locally')).toBeVisible();

  await page.getByRole('button', { name: '+ Add link' }).click();
  await page.getByLabel('Title').fill('My work');
  await page.getByLabel('URL', { exact: true }).fill('alex.example/work');
  await page.getByRole('button', { name: 'Save link' }).click();
  await expect(page.locator('#builder').getByText('My work', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edit My work' }).click();
  await page.getByLabel('Title').fill('Selected work');
  await page.getByRole('button', { name: 'Save link' }).click();
  await expect(page.locator('#builder').getByText('Selected work', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Toggle Selected work' }).click();
  await expect(page.locator('.screen .profile-link').filter({ hasText: 'Selected work' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle Selected work' }).click();
  await expect(page.locator('.screen .profile-link').filter({ hasText: 'Selected work' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Move Selected work up' }).click();
  await expect(page.locator('#builder .link-row').filter({ hasText: 'Selected work' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Selected work' }).click();
  await expect(page.locator('#builder').getByText('Selected work', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Midnight' }).click();
  await expect(page.locator('.screen')).toHaveCSS('background-color', 'rgb(23, 21, 32)');
  await page.getByLabel('Purple accent').click();
  await expect(page.locator('.screen .profile-link b').first()).toHaveCSS('color', 'rgb(109, 88, 217)');
  await page.getByRole('button', { name: 'Pill button style' }).click();
  await expect(page.locator('.profile-link').first()).toHaveCSS('border-radius', '28px');

  await page.getByRole('button', { name: 'Serif' }).click();
  await expect(page.locator('.screen')).toHaveCSS('font-family', /Georgia/);
  await page.getByRole('button', { name: 'Compact' }).click();
  await expect(page.locator('.screen .profile-links')).toHaveClass(/compact/);

  await page.reload();
  await expect(page.getByLabel('Display name')).toHaveValue('Alex Studio');
  await expect(page.locator('.screen')).toHaveCSS('background-color', 'rgb(23, 21, 32)');

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4186' });
  await page.getByRole('button', { name: 'Copy public link' }).click();
  await expect(page.getByRole('status')).toContainText('Public link copied');

  const publicPage = await page.context().newPage();
  await publicPage.goto('/p/alex');
  await expect(publicPage.getByText('Alex Studio')).toBeVisible();
  await expect(publicPage.getByText('בניית מערכת ימה - Digital Reality')).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await publicPage.close();
});
