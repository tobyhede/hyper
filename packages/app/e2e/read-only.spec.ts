import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures';
import { dragBy, nodeByTitle, settled } from './graph';

const fixtureDir = fileURLToPath(new URL('../fixture', import.meta.url));
const spaceFile = `${fixtureDir}/space.json`;
const readFixture = (): string => readFileSync(spaceFile, 'utf8');

test('database persistence never writes back to imported authored files', async ({ page }) => {
  const before = readFixture();
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);

  await dragBy(page, card, 0, 240);
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  expect(readFixture()).toBe(before);
});
