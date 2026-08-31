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
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);

  await expect(page.getByRole('button', { name: 'Add Card' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create Layout' })).toHaveAccessibleDescription(
    'Computed Views are read-only. Create a Layout to edit.',
  );
  await expect(authoringHandle(card, 'source', 'right')).not.toHaveClass(/connectable/);
  await page.getByRole('button', { name: 'Create Layout' }).click();
  await expect(page.getByRole('button', { name: 'Add Card' })).toBeEnabled();

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
  // The explicit command created the Layout; the later Alt-drop authors its Edge.
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  expect(readFixture()).toEqual(before);
});
