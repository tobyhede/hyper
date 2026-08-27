import { encodeCompactUuid, uuidSchema } from '@project/core';
import { expect, test } from './fixtures';

const FIXTURE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000040');
const MISSING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000041');

test('root redirects to and opens the canonical Entry Space URL', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(`/spaces/${encodeCompactUuid(FIXTURE_ID)}`);
  await expect(page.getByRole('heading', { name: 'Layout fixture', exact: true })).toBeVisible();
});

test('a direct canonical URL opens its exact existing Space', async ({ page }) => {
  const response = await page.goto(`/spaces/${encodeCompactUuid(FIXTURE_ID)}`);

  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Layout fixture', exact: true })).toBeVisible();
});

test('malformed and unresolved Space URLs have real host statuses', async ({ page }) => {
  const malformed = await page.goto('/spaces/not-a-compact-uuid');
  expect(malformed?.status()).toBe(400);

  const unresolved = await page.goto(`/spaces/${encodeCompactUuid(MISSING_ID)}`);
  expect(unresolved?.status()).toBe(404);
});
