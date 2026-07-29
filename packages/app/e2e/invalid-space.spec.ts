import { expect, test } from './fixtures';

test('an unsupported imported space renders complete startup diagnostics', async ({ page }) => {
  await page.goto('/');

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(
    alert.getByRole('heading', { name: 'Application could not start', exact: true }),
  ).toBeVisible();
  await expect(alert).toContainText('The space could not be opened.');
  await expect(alert).toContainText('The bundled space failed to import:');
  await expect(alert).toContainText('version: Invalid literal value, expected 2');
  await expect(page.locator('.react-flow')).toHaveCount(0);
});
