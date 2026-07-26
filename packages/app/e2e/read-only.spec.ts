import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures';
import { dragBy, nodeByTitle, positionOf, settled } from './graph';

/**
 * The read-only guarantee, asserted.
 *
 * `SPACE_READ_ONLY` is what stops a suite that drags cards from editing the
 * committed fixture it asserts against — and until now nothing tested it. That
 * mattered because the guarantee was reachable only through a config field
 * (`webServer.env`) that Playwright skips for a server it did not start, so it
 * could silently not apply while every test still passed. A guarantee nothing
 * asserts is a guarantee that leaves without telling you.
 *
 * Both halves are checked here: that the endpoint answers without writing, and
 * that a real drag *saved* through the real app leaves the fixture
 * byte-identical. The second is the one that would have caught the original bug,
 * because it goes through the same save path a human's does — which since ADR
 * 0029 means pressing Save, the drag itself having stopped writing anything.
 */

const fixtureDir = fileURLToPath(new URL('../fixture', import.meta.url));
const spaceFile = `${fixtureDir}/space.json`;

/** The fixture's bytes, not its parse — a rewrite that happens to round-trip to
 *  the same JSON is still a rewrite, and formatting churn is exactly what the
 *  write-if-changed guard exists to prevent. */
const readFixture = (): string => readFileSync(spaceFile, 'utf8');

test('the endpoint answers a save without writing, and says so by omission', async ({
  request,
}) => {
  const before = readFixture();

  // A payload that *would* write: the fixture's own space file plus a Layout,
  // which is what a drag-save adds. Sending something the server would reject
  // anyway would prove nothing about the read-only branch.
  const response = await request.put('/__space', {
    data: {
      spaceFile: {
        ...(JSON.parse(before) as Record<string, unknown>),
        layouts: [{ id: 'probe', cards: { a: { x: 999, y: 999 } } }],
      },
      cards: [],
    },
  });

  expect(response.status()).toBe(204);
  // The write count is the only thing distinguishing a no-op from a save: both
  // answer 204. Absent means the request never reached the write path at all.
  expect(response.headers()).not.toHaveProperty('x-space-files-written');
  expect(readFixture()).toBe(before);
});

test('a saved drag through the app leaves the authored fixture byte-identical', async ({ page }) => {
  const before = readFixture();

  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);

  const from = await positionOf(a);
  await dragBy(page, a, 0, 240);

  // The drag alone reaches no server (ADR 0029), so pressing Save is what puts
  // this test on the path it exists to guard.
  const saved = page.waitForResponse((response) => response.url().endsWith('/__space'));
  await page.getByTestId('save-button').click();

  // Assert the drag actually landed and the save actually happened. Either one
  // silently not occurring would leave the fixture untouched too, and would pass
  // this test for entirely the wrong reason.
  expect((await positionOf(a)).y).toBeGreaterThan(from.y + 100);
  expect((await saved).status()).toBe(204);

  expect(readFixture()).toBe(before);
});
