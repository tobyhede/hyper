import {
  FLOW_SPACE_VIEW_ID,
  GRID_SPACE_VIEW_ID,
  encodeCompactUuid,
  uuidSchema,
} from '@project/core';
import { expect, test } from './fixtures';

const FIXTURE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000040');
const MISSING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000041');
const FIRST_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000050');
const CARD_A_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_E_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');

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

test('canonical and contextual Card links reveal a Closed Card without authoring', async ({
  page,
}) => {
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/cards/${encodeCompactUuid(CARD_E_ID)}`;
  const contextual = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/cards/${encodeCompactUuid(CARD_A_ID)}`;
  const before = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());

  expect((await page.goto(canonical))?.status()).toBe(200);
  const cardE = page.locator(`.react-flow__node[data-id="${CARD_E_ID}"]`);
  await expect(cardE).toBeFocused();
  await expect(cardE.getByTestId('card')).toHaveAttribute('data-expanded', 'false');

  expect((await page.goto(contextual))?.status()).toBe(200);
  const cardA = page.locator(`.react-flow__node[data-id="${CARD_A_ID}"]`);
  await expect(cardA).toBeFocused();
  await expect(cardA.getByTestId('card')).toHaveAttribute('data-expanded', 'false');
  await page.reload();
  await expect(cardA).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(canonical);
  await expect(cardE).toBeFocused();
  await page.goForward();
  await expect(page).toHaveURL(contextual);
  await expect(cardA).toBeFocused();

  const after = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());
  expect(after).toEqual(before);
});

test('a contextual Layout-and-Card link is not found when the Layout omits the Card', async ({
  page,
}) => {
  const response = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/cards/${encodeCompactUuid(CARD_E_ID)}`,
  );

  expect(response?.status()).toBe(404);
});

test('history restores a canonical Card through the default Space View, not the context being left', async ({
  page,
}) => {
  const contextual = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/cards/${encodeCompactUuid(CARD_A_ID)}`;
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/cards/${encodeCompactUuid(CARD_A_ID)}`;
  await page.goto(contextual);
  await page.goto(canonical);
  await page.goBack();
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 1');

  await page.goForward();
  await expect(page).toHaveURL(canonical);
  await expect(page.getByTestId('selected-canvas')).toContainText('Flow');
});

test('copy commands distinguish canonical Card identity from its current Space View', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (value: string) => {
          sessionStorage.setItem('copied-product-url', value);
          return Promise.resolve();
        },
        readText: () => Promise.resolve(sessionStorage.getItem('copied-product-url') ?? ''),
      },
    });
  });
  const view = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}`;
  await page.goto(view);
  await page.locator(`.react-flow__node[data-id="${CARD_A_ID}"]`).click();

  await page.getByRole('button', { name: 'Copy link to A' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(
      `${new URL(page.url()).origin}/spaces/${encodeCompactUuid(FIXTURE_ID)}/cards/${encodeCompactUuid(CARD_A_ID)}`,
    );

  await page.getByRole('button', { name: 'Copy link in this Space View' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${new URL(page.url()).origin}${view}/cards/${encodeCompactUuid(CARD_A_ID)}`);
});
