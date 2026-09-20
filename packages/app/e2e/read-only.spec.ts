import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures';
import {
  authoringHandle,
  connectToEmptyWithAlt,
  createResourceControl,
  nodeByTitle,
  settled,
} from './graph';

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
  const resource = nodeByTitle(page, 'A').first();
  await expect(resource).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(9);
  await settled(page);

  // Authoring is offered, which is the premise: what this test proves is that
  // running it changes no file on disk, not that it is unavailable.
  await expect(createResourceControl(page)).not.toHaveAttribute('aria-disabled', 'true');
  await resource.hover();
  await connectToEmptyWithAlt(page, authoringHandle(resource, 'source', 'right'));
  const created = nodeByTitle(page, 'Resource 1');
  await expect(created).toBeVisible();
  const createdId = await created.getAttribute('data-id');
  if (createdId === null) throw new Error('The created Resource has no id.');

  // A revision bump only proves *something* committed. Name the connection that
  // was drawn, so a commit that recorded a placement and dropped the Edge fails
  // here rather than passing as "persisted".
  await expect(page.getByLabel(/^Edge from A to Resource 1 in /)).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(10);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  expect(readFixture()).toEqual(before);
});
