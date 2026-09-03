import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures';
import { authoringHandle, connectToEmptyWithAlt, nodeByTitle, settled } from './graph';

const fixtureDir = fileURLToPath(new URL('../fixture', import.meta.url));
const readFixture = (directory = fixtureDir, prefix = ''): Record<string, string> =>
  Object.fromEntries(
    readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
      .flatMap((entry) => {
        const relative = `${prefix}${entry.name}`;
        if (entry.isDirectory()) {
          return Object.entries(readFixture(`${directory}/${entry.name}`, `${relative}/`));
        }
        return [[relative, readFileSync(`${directory}/${entry.name}`, 'utf8')]];
      }),
  );

test('database persistence never writes structural edits back to imported authored files', async ({
  page,
}) => {
  const before = readFixture();
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(9);
  await settled(page);

  await expect(page.getByRole('button', { name: 'Add Card' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Add Layout' })).toBeEnabled();
  await card.hover();
  await connectToEmptyWithAlt(page, authoringHandle(card, 'source', 'right'));
  const created = nodeByTitle(page, 'Card 1');
  await expect(created).toBeVisible();
  const createdId = await created.getAttribute('data-id');
  if (createdId === null) throw new Error('The created Card has no id.');

  // A revision bump only proves *something* committed. Name the connection that
  // was drawn, so a commit that recorded a placement and dropped the Edge fails
  // here rather than passing as "persisted".
  await expect(page.getByLabel(/^Edge from A to Card 1 in /)).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(10);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  expect(readFixture()).toEqual(before);
});
