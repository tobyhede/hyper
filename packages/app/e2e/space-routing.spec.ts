import {
  FLOW_SPACE_VIEW_ID,
  GRID_SPACE_VIEW_ID,
  encodeCompactUuid,
  uuidSchema,
} from '@project/core';
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

test('a direct Space View URL restores the named Computed View', async ({ page }) => {
  const response = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FLOW_SPACE_VIEW_ID)}`,
  );

  expect(response?.status()).toBe(200);
  await expect(page.getByText('Flow', { exact: true }).first()).toBeVisible();
});

test('choosing a Space View pushes history and Back, Forward and reload restore it without authoring', async ({
  page,
}) => {
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}`;
  const grid = `${canonical}/views/${encodeCompactUuid(GRID_SPACE_VIEW_ID)}`;
  await page.goto(canonical);
  const before = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());

  await page.getByTestId('canvas-renderer').filter({ hasText: 'Grid' }).click();
  await expect(page).toHaveURL(grid);
  await page.reload();
  await expect(page.getByText('Grid', { exact: true }).first()).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(canonical);
  await expect(page.getByText('Flow', { exact: true }).first()).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(grid);
  await expect(page.getByText('Grid', { exact: true }).first()).toBeVisible();

  const after = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());
  expect(after).toEqual(before);
});

test('malformed and unresolved Space URLs have real host statuses', async ({ page }) => {
  const malformed = await page.goto('/spaces/not-a-compact-uuid');
  expect(malformed?.status()).toBe(400);

  const unresolved = await page.goto(`/spaces/${encodeCompactUuid(MISSING_ID)}`);
  expect(unresolved?.status()).toBe(404);

  const malformedView = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/not-a-compact-uuid`,
  );
  expect(malformedView?.status()).toBe(400);

  const unresolvedView = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(MISSING_ID)}`,
  );
  expect(unresolvedView?.status()).toBe(404);
});
