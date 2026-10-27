import { test, expect, _electron as electron } from '@playwright/test';

test('launches the dashboard', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, R3X_E2E: '1' },
  });
  const window = await app.firstWindow();
  await expect(window.getByRole('heading', { name: 'R3X Agent Studio' })).toBeVisible();
  await app.close();
});
