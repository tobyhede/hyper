import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures';
import {
  authoringHandle,
  connectHandles,
  dragBy,
  FIXTURE_EDGE_COUNT,
  nodeByTitle,
  settled,
} from './graph';

/** The fixture's A and E — the two Cards this test connects. React Flow labels
 *  each drawn Edge `Edge from <source> to <target>` using the Card ids. */
const CARD_A = '00000000-0000-4000-8000-000000000002';
const CARD_E = '00000000-0000-4000-8000-000000000008';

const fixtureDir = fileURLToPath(new URL('../fixture', import.meta.url));
const spaceFile = `${fixtureDir}/space.json`;
const readFixture = (): string => readFileSync(spaceFile, 'utf8');

test('database persistence never writes structural edits back to imported authored files', async ({
  page,
}) => {
  const before = readFixture();
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);

  await dragBy(page, card, 0, -100);
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  await settled(page);

  const target = nodeByTitle(page, 'E').first();
  await connectHandles(
    page,
    authoringHandle(card, 'source', 'right'),
    authoringHandle(target, 'target', 'top'),
  );

  // A revision bump only proves *something* committed. Name the connection that
  // was drawn, so a commit that recorded a placement and dropped the Edge fails
  // here rather than passing as "persisted".
  await expect(page.getByLabel(`Edge from ${CARD_A} to ${CARD_E}`)).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT + 1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  expect(readFixture()).toBe(before);
});
