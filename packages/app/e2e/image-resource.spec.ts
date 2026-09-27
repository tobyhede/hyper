// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// gate that fails a test if React Flow logged a warning while it ran.
import { readFileSync } from 'node:fs';
import { encodeCompactUuid, OPEN_RESOURCE_CHROME, uuidSchema } from '@project/core';
import type { Locator } from '@playwright/test';
import { expect, test, type Page } from './fixtures';
import { boxOf, openResource, selectedCanvas, settled } from './graph';
import { seedPositionedMap } from './seed';

const IMAGE_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a1');
const FIGURE_URL = 'https://example.com/figure.png';
/** A tracked 400×300 picture, served in place of the external URL so nothing reaches the network. */
const HARBOUR = readFileSync(
  new URL('../stories/support/images/harbour-400x300.png', import.meta.url),
);

/**
 * Open a Space holding one Markdown Resource and a Closed Image Resource beside
 * it, whose recorded natural size is 400×300. No gesture creates an Image
 * Resource yet, so it joins through the same HTTP commit the browser makes.
 */
async function openPictures(page: Page): Promise<void> {
  const seeded = await seedPositionedMap(
    page,
    'Pictures',
    (snapshot) => {
      const markdown = snapshot.resources.find(({ document }) => document.kind === 'markdown');
      if (markdown === undefined) throw new Error('The opened Space holds no Markdown Resource.');
      return {
        [markdown.id]: { x: 0, y: 0, open: false },
        [IMAGE_ID]: { x: 400, y: 0, open: false },
      };
    },
    [
      {
        id: IMAGE_ID,
        document: {
          title: 'Figure',
          kind: 'image',
          url: FIGURE_URL,
          naturalSize: { width: 400, height: 300 },
        },
      },
    ],
  );
  await page.goto(`/spaces/${encodeCompactUuid(seeded.snapshot.id)}`);
  await expect(selectedCanvas(page)).toContainText('Pictures');
  await settled(page);
}

/** The node's authored rect in canvas units, as React Flow sizes its wrapper. */
const authoredSize = (node: Locator) =>
  node.evaluate((element) =>
    element instanceof HTMLElement
      ? {
          width: Number.parseFloat(element.style.width),
          height: Number.parseFloat(element.style.height),
        }
      : null,
  );

/**
 * A Closed Image Resource looks like any Resource (ADR 0106): its Title and its
 * kind glyph, at the one Closed size, and no thumbnail — the picture is not
 * fetched until the Resource Opens. It is measured against the Markdown Resource
 * beside it.
 */
test(
  'a Closed Image Resource draws its Title and kind at the Closed size, and no picture',
  { tag: '@parity:image-resource-closed-front-draws-title-and-kind' },
  async ({ page }) => {
    const pictureRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('figure.png')) pictureRequests.push(request.url());
    });
    await openPictures(page);

    const image = page.locator(`.react-flow__node[data-id="${IMAGE_ID}"]`);
    const resource = image.getByRole('article', { name: 'Figure' });
    await expect(resource).toHaveAttribute('data-kind', 'image');
    await expect(resource).toHaveAttribute('data-open', 'false');
    await expect(resource.getByRole('heading', { name: 'Figure' })).toBeVisible();
    await expect(resource.getByRole('img', { name: 'Image Resource' })).toBeVisible();
    await expect(resource.locator('img')).toHaveCount(0);
    await expect(resource.locator('.canvas-resource__content')).toHaveCount(0);
    expect(pictureRequests).toEqual([]);

    const markdown = page
      .locator('.react-flow__node')
      .filter({ has: page.locator('[data-kind="markdown"]') });
    const closed = await boxOf(markdown, 'the Markdown Resource');
    const pictured = await boxOf(image, 'the Image Resource');
    expect(pictured.width).toBeCloseTo(closed.width, 0);
    expect(pictured.height).toBeCloseTo(closed.height, 0);
  },
);

/**
 * An Open Image Resource is the Open Markdown front with its picture as the
 * content (ADR 0107). Its first Open is one Edit that writes the recorded natural
 * size plus the front's chrome, and the picture then fills the content area at
 * its own size, above the Title footer and named by the Resource.
 */
test(
  'an Open Image Resource draws its picture at its own size in the Markdown front',
  { tag: '@parity:open-image-resource-draws-its-image' },
  async ({ page }) => {
    await page.route(FIGURE_URL, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: HARBOUR }),
    );
    await openPictures(page);
    const node = page.locator(`.react-flow__node[data-id="${IMAGE_ID}"]`);
    await openResource(node, 'Figure');

    const resource = node.getByRole('article', { name: 'Figure' });
    await expect(resource).toHaveAttribute('data-open', 'true');
    await expect
      .poll(() => authoredSize(node))
      .toEqual({
        width: 400 + OPEN_RESOURCE_CHROME.width,
        height: 300 + OPEN_RESOURCE_CHROME.height,
      });

    const picture = resource.getByRole('img', { name: 'Figure' });
    await expect(picture).toHaveAttribute('src', FIGURE_URL);
    await expect
      .poll(() =>
        picture.evaluate((image) =>
          image instanceof HTMLImageElement && image.complete ? image.naturalWidth : 0,
        ),
      )
      .toBe(400);
    await expect(resource.locator('.canvas-resource__content img')).toHaveCount(1);
    await expect(resource.getByRole('heading', { name: 'Figure' })).toBeVisible();

    // The content area the chrome leaves is the picture's own size: measured in
    // screen pixels against the node, which carries the camera's zoom with it.
    await settled(page);
    const nodeBox = await boxOf(node, 'the Image Resource');
    const pictureBox = await boxOf(picture, 'the picture');
    const zoom = nodeBox.width / (400 + OPEN_RESOURCE_CHROME.width);
    expect(pictureBox.width / zoom).toBeCloseTo(400, 0);
    expect(pictureBox.height / zoom).toBeGreaterThanOrEqual(299.5);
    expect(pictureBox.height / zoom).toBeLessThanOrEqual(301);
    const titleBox = await boxOf(resource.locator('.canvas-resource__body'), 'the Title footer');
    expect(pictureBox.y + pictureBox.height).toBeLessThanOrEqual(titleBox.y + 1);
  },
);

/**
 * A picture that will not load is not a refusal (ADR 0106): the Space stays as it
 * was authored, the Open Size still follows the recorded natural size, and the
 * content area says the image did not load and names its URL.
 */
test(
  'an Open Image Resource whose picture does not load names its URL and keeps its Title',
  { tag: '@parity:open-image-resource-shows-failed-state' },
  async ({ page }) => {
    await page.route(FIGURE_URL, (route) => route.abort());
    await openPictures(page);
    const node = page.locator(`.react-flow__node[data-id="${IMAGE_ID}"]`);
    await openResource(node, 'Figure');

    const resource = node.getByRole('article', { name: 'Figure' });
    await expect(resource.getByText('Image did not load')).toBeVisible();
    await expect(resource.getByText(FIGURE_URL)).toBeVisible();
    await expect(resource.getByRole('img', { name: 'Figure' })).toHaveCount(0);
    await expect(resource.getByRole('heading', { name: 'Figure' })).toBeVisible();
    await expect
      .poll(() => authoredSize(node))
      .toEqual({
        width: 400 + OPEN_RESOURCE_CHROME.width,
        height: 300 + OPEN_RESOURCE_CHROME.height,
      });
  },
);
