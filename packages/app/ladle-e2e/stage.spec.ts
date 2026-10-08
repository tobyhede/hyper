import { expect, test, type Page } from '@playwright/test';
import { STAGE_PICTURE_URL } from '../stories/support/spaces';
import { boxOf } from '../e2e/graph';

/**
 * The Stage, rendered through the production `PresentingStage` over real
 * Navigation (ADR 0052, ADR 0123).
 *
 * These prove the Stage's own contract: the frame's geometry, how content that
 * does not fit is fitted or scrolled, and that the production Traversal keys
 * still reach the traversal from inside the frame. The canvas behind the Stage
 * is the application suite's to prove.
 */

const story = (name: string) => `/?story=components--stage--${name}&mode=preview`;

const stage = (page: Page) => page.getByTestId('stage');
const frame = (page: Page) => page.getByTestId('stage-frame');
const body = (page: Page) => stage(page).getByRole('region', { name: 'Presented Resource' });
const presentedName = (page: Page) =>
  stage(page).getByTestId('resource-content').locator('.resource__title');

/** A picture many times the size of any frame the Stage draws. */
const OVERSIZED = { width: 4000, height: 3000 } as const;

test(
  'the frame is the largest 16:9 box above the chrome, letterboxed',
  { tag: '@parity:stage-frames-the-largest-16-9-above-the-chrome' },
  async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 800, height: 900 },
      { width: 1600, height: 500 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(story('long-read'));
      const room = await boxOf(stage(page), 'the Stage');
      const chrome = await boxOf(page.getByTestId('presenting-chrome'), 'the chrome');
      const box = await boxOf(frame(page), 'the frame');
      const roomHeight = chrome.y - room.y;

      expect(box.width / box.height).toBeCloseTo(16 / 9, 2);
      expect(box.y + box.height).toBeLessThanOrEqual(chrome.y + 0.5);
      expect(
        Math.min(Math.abs(box.width - room.width), Math.abs(box.height - roomHeight)),
      ).toBeLessThan(1);
      expect(Math.abs(box.x + box.width / 2 - (room.x + room.width / 2))).toBeLessThan(1);
      expect(Math.abs(box.y + box.height / 2 - (room.y + roomHeight / 2))).toBeLessThan(1);
    }
  },
);

test(
  'overflowing content scrolls inside the frame, and the arrow keys still traverse',
  { tag: '@parity:stage-scrolls-overflow-and-arrows-still-traverse' },
  async ({ page }) => {
    await page.goto(story('long-read'));
    await expect(presentedName(page)).toHaveText('Long read');
    const scrollTop = () => body(page).evaluate((element) => element.scrollTop);
    expect(
      await body(page).evaluate((element) => element.scrollHeight > element.clientHeight),
    ).toBe(true);
    const before = await boxOf(frame(page), 'the frame');

    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.wheel(0, 200);
    await expect.poll(scrollTop).toBeGreaterThan(0);
    const wheeled = await scrollTop();

    await body(page).focus();
    await page.keyboard.press('PageDown');
    await expect.poll(scrollTop).toBeGreaterThan(wheeled);
    const paged = await scrollTop();
    await page.keyboard.press('PageUp');
    await expect.poll(scrollTop).toBeLessThan(paged);
    expect(await boxOf(frame(page), 'the frame')).toEqual(before);

    await expect(body(page)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(presentedName(page)).toHaveText('Picture');
    await expect.poll(scrollTop).toBe(0);
  },
);

test(
  'a picture larger than the frame is fitted inside it whole',
  { tag: '@parity:stage-fits-an-oversized-picture' },
  async ({ page }) => {
    await page.route(STAGE_PICTURE_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="${OVERSIZED.width}" height="${OVERSIZED.height}"><rect width="100%" height="100%" fill="#2a6f97"/></svg>`,
      }),
    );
    await page.goto(story('picture'));
    const picture = stage(page).getByRole('img', { name: 'Picture' });
    await expect
      .poll(() =>
        picture.evaluate((image) =>
          image instanceof HTMLImageElement && image.complete ? image.naturalWidth : 0,
        ),
      )
      .toBe(OVERSIZED.width);

    const box = await boxOf(frame(page), 'the frame');
    const room = await boxOf(picture, 'the picture');
    expect(room.x).toBeGreaterThanOrEqual(box.x - 0.5);
    expect(room.y).toBeGreaterThanOrEqual(box.y - 0.5);
    expect(room.x + room.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
    expect(room.y + room.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
    await expect(picture).toHaveCSS('object-fit', 'scale-down');
    expect(
      await body(page).evaluate((element) => element.scrollHeight <= element.clientHeight),
    ).toBe(true);
  },
);

test(
  'an Ur Resource is its name alone, centred in the frame',
  { tag: '@parity:stage-centres-a-title-slide' },
  async ({ page }) => {
    await page.goto(story('title-slide'));
    await expect(presentedName(page)).toHaveText('Title slide');
    const content = stage(page).getByTestId('resource-content');
    await expect(content).toHaveAttribute('data-content-kind', 'ur');
    await expect(content.locator('.resource__body')).toHaveCount(0);

    const box = await boxOf(frame(page), 'the frame');
    const name = await presentedName(page).evaluate((heading) => {
      const range = document.createRange();
      range.selectNodeContents(heading);
      const { x, y, width, height } = range.getBoundingClientRect();
      return { x, y, width, height };
    });
    const tolerance = Math.max(2, box.height / 100);
    expect(Math.abs(name.x + name.width / 2 - (box.x + box.width / 2))).toBeLessThanOrEqual(
      tolerance,
    );
    expect(Math.abs(name.y + name.height / 2 - (box.y + box.height / 2))).toBeLessThanOrEqual(
      tolerance,
    );
  },
);
