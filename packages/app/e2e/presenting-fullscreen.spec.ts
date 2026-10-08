// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// gate that fails a test if React Flow logged a warning while it ran.
import { encodeCompactUuid, uuidSchema } from '@project/core';
import { expect, test, type Page } from './fixtures';
import { presentControl, presentedName, settled, stage } from './graph';

// Present takes the whole document fullscreen within the click that starts
// presenting, and fullscreen and presenting end together. These run against
// Chromium's own Fullscreen API: Playwright's click is a trusted activation,
// so the request is granted as it would be for a presenter.

const FIXTURE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000040');
const FIRST_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000050');
const LONG_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const RESOURCE_B_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');

/** What is fullscreen, by tag name, or `null` when nothing is. */
const fullscreenElement = (page: Page) =>
  page.evaluate(() => document.fullscreenElement?.tagName ?? null);

/** Open the fixture and press Present. */
async function present(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await settled(page);
  await presentControl(page).click();
  await expect(stage(page)).toBeVisible();
}

test('Present takes the whole document fullscreen', async ({ page }) => {
  await present(page);

  await expect.poll(() => fullscreenElement(page)).toBe('HTML');
});

test('leaving fullscreen leaves presenting', async ({ page }) => {
  await present(page);
  await expect.poll(() => fullscreenElement(page)).toBe('HTML');

  // The browser's own exit — its Escape, or its fullscreen control — reaches
  // the page as the document leaving fullscreen.
  await page.evaluate(() => document.exitFullscreen());

  await expect(stage(page)).toHaveCount(0);
});

test.describe('leaving presenting any other way exits fullscreen', () => {
  const leaves: readonly (readonly [string, (page: Page) => Promise<void>])[] = [
    ['Overview', (page) => page.getByTestId('exit-presenting').click()],
    ['Escape', (page) => page.keyboard.press('Escape')],
    [
      'the browser’s Back',
      async (page) => {
        await page.goBack();
      },
    ],
  ];

  for (const [name, leave] of leaves) {
    test(`by ${name}`, async ({ page }) => {
      await present(page);
      await expect.poll(() => fullscreenElement(page)).toBe('HTML');

      await leave(page);

      await expect(stage(page)).toHaveCount(0);
      await expect.poll(() => fullscreenElement(page)).toBeNull();
    });
  }
});

test('a refused request is tolerated and the Stage fills the window regardless', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new TypeError('Permissions check failed'));
  });
  await present(page);

  await page.keyboard.press('ArrowRight');
  await expect(presentedName(page)).toHaveText('B');
  expect(await fullscreenElement(page)).toBeNull();
  const viewport = page.viewportSize();
  const box = await stage(page).boundingBox();
  expect(box).toMatchObject({ x: 0, y: 0, width: viewport?.width, height: viewport?.height });
});

test('a presentation opened from a link does not request fullscreen and survives an unrelated one', async ({
  page,
}) => {
  const mapPath = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/maps/${encodeCompactUuid(FIRST_MAP_ID)}`;
  await page.goto(
    `${mapPath}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present/${encodeCompactUuid(RESOURCE_B_ID)}`,
  );
  await expect(presentedName(page)).toHaveText('B');
  expect(await fullscreenElement(page)).toBeNull();

  // Fullscreen entered and left by something other than Present.
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.evaluate(() => document.documentElement.requestFullscreen());
  await expect.poll(() => fullscreenElement(page)).toBe('HTML');
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => fullscreenElement(page)).toBeNull();

  await expect(stage(page)).toBeVisible();
  await expect(presentedName(page)).toHaveText('B');
});

/**
 * Leave fullscreen and wait until the page has handled it: the document's
 * `fullscreenchange` arrives after `exitFullscreen()` resolves, so an
 * assertion that presenting survived must wait for the event and a frame.
 */
const leaveFullscreenAndSettle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        document.addEventListener(
          'fullscreenchange',
          () => requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          { once: true },
        );
        void document.exitFullscreen();
      }),
  );

test('Present while already fullscreen leaves that fullscreen and a later one alone', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await settled(page);
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.evaluate(() => document.documentElement.requestFullscreen());
  await expect.poll(() => fullscreenElement(page)).toBe('HTML');

  await presentControl(page).click();
  await expect(stage(page)).toBeVisible();

  // That fullscreen is not the presentation's: leaving it leaves presenting
  // on, and neither is one something else turns on and off afterwards.
  await leaveFullscreenAndSettle(page);
  await expect(stage(page)).toBeVisible();
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.evaluate(() => document.documentElement.requestFullscreen());
  await expect.poll(() => fullscreenElement(page)).toBe('HTML');
  await leaveFullscreenAndSettle(page);

  await expect(stage(page)).toBeVisible();
});
