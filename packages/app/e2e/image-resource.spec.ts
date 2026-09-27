// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// gate that fails a test if React Flow logged a warning while it ran.
import { readFileSync } from 'node:fs';
import { encodeCompactUuid, OPEN_RESOURCE_CHROME, uuidSchema } from '@project/core';
import type { Locator } from '@playwright/test';
import { expect, test, type Page } from './fixtures';
import {
  activeResource,
  boxOf,
  openResource,
  presentControl,
  selectedCanvas,
  settled,
} from './graph';
import { seedPositionedMap } from './seed';

const IMAGE_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a1');
const FIGURE_URL = 'https://example.com/figure.png';
/** A tracked 400×300 picture, served in place of the external URL so nothing reaches the network. */
const HARBOUR = readFileSync(
  new URL('../stories/support/images/harbour-400x300.png', import.meta.url),
);

interface Pictures {
  /** The Image Resource's Title. */
  readonly title?: string;
  /** Give the seeded Graph an Edge from the Image Resource to itself, so presenting starts there. */
  readonly presentable?: boolean;
}

/**
 * Open a Space holding one Markdown Resource and a Closed Image Resource beside
 * it, whose recorded natural size is 400×300. No gesture creates an Image
 * Resource yet, so it joins through the same HTTP commit the browser makes.
 */
async function openPictures(
  page: Page,
  { title = 'Figure', presentable = false }: Pictures = {},
): Promise<void> {
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
          title,
          kind: 'image',
          url: FIGURE_URL,
          naturalSize: { width: 400, height: 300 },
        },
      },
    ],
    presentable ? [{ from: IMAGE_ID, to: IMAGE_ID }] : [],
  );
  await page.goto(`/spaces/${encodeCompactUuid(seeded.snapshot.id)}`);
  await expect(selectedCanvas(page)).toContainText('Pictures');
  await settled(page);
}

/** Serve the tracked 400×300 picture at the Image Resource's URL. */
const serveFigure = (page: Page) =>
  page.route(FIGURE_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: HARBOUR }),
  );

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
 * An Open Image Resource's picture in canvas units: the room the content area
 * gives it, and its natural size, which `object-fit: scale-down` draws it at
 * whenever the room holds it and scales down to fit otherwise, never up. Screen
 * pixels are divided by the camera's zoom, read off the node's authored width.
 */
async function pictureIn(node: Locator, picture: Locator) {
  await expect(picture).toHaveCSS('object-fit', 'scale-down');
  const authored = await authoredSize(node);
  if (authored === null) throw new Error('The Image Resource has no authored size.');
  const nodeBox = await boxOf(node, 'the Image Resource');
  const pictureBox = await boxOf(picture, 'the picture');
  const zoom = nodeBox.width / authored.width;
  const natural = await picture.evaluate((image) =>
    image instanceof HTMLImageElement
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : { width: 0, height: 0 },
  );
  return {
    authored,
    room: { width: pictureBox.width / zoom, height: pictureBox.height / zoom },
    natural,
    bottom: pictureBox.y + pictureBox.height,
  };
}

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
 * content. Its first Open is one Edit that writes the recorded natural size plus
 * the front's chrome, and the picture is then drawn at its own size, above the
 * Title footer and named by the Resource.
 *
 * The chrome is measured here as the application draws it, host theme
 * included: exactly `OPEN_RESOURCE_CHROME` across, and down within the one unit
 * the constant rounds the Title line up by — so the content area is at least the
 * picture and less than one unit taller, and the picture draws at exactly
 * 400×300.
 */
test(
  'an Open Image Resource draws its picture at its own size in the Markdown front',
  { tag: '@parity:open-image-resource-draws-its-image' },
  async ({ page }) => {
    await serveFigure(page);
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

    await settled(page);
    const { authored, room, natural, bottom } = await pictureIn(node, picture);
    expect(natural).toEqual({ width: 400, height: 300 });
    const chrome = { width: authored.width - room.width, height: authored.height - room.height };
    expect(chrome.width).toBeCloseTo(OPEN_RESOURCE_CHROME.width, 1);
    expect(chrome.height).toBeLessThanOrEqual(OPEN_RESOURCE_CHROME.height + 0.05);
    expect(chrome.height).toBeGreaterThan(OPEN_RESOURCE_CHROME.height - 1);
    // The room holds the picture, so it is drawn at exactly its natural size.
    expect(room.width).toBeCloseTo(natural.width, 1);
    expect(room.height).toBeGreaterThanOrEqual(natural.height - 0.05);
    const titleBox = await boxOf(resource.locator('.canvas-resource__body'), 'the Title footer');
    expect(bottom).toBeLessThanOrEqual(titleBox.y + 1);
  },
);

/**
 * The first Open's size reads one Title line, and a longer Title takes its room
 * from the picture: the Open Size is the same, the Title footer is taller, and
 * the picture is scaled down to fit what is left rather than overflowing it.
 */
test('a longer Title takes its room from the picture, not from the Open Size', async ({ page }) => {
  await serveFigure(page);
  await openPictures(page, { title: 'Figure\nThe harbour wall, looking east' });
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
  await expect
    .poll(() =>
      picture.evaluate((image) =>
        image instanceof HTMLImageElement && image.complete ? image.naturalWidth : 0,
      ),
    )
    .toBe(400);

  await settled(page);
  const { room, natural, bottom } = await pictureIn(node, picture);
  // The second Title line comes out of the room above it, so the picture no
  // longer fits at its own size and is drawn scaled down, whole.
  expect(room.width).toBeCloseTo(natural.width, 1);
  expect(room.height).toBeLessThan(natural.height - 10);
  const titleBox = await boxOf(resource.locator('.canvas-resource__body'), 'the Title footer');
  expect(bottom).toBeLessThanOrEqual(titleBox.y + 1);
});

/** Presenting an Image Resource draws its picture, named by the Resource. */
test('presenting an Image Resource draws its picture', async ({ page }) => {
  await serveFigure(page);
  await openPictures(page, { presentable: true });
  await presentControl(page).click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(activeResource(page)).toHaveAttribute('data-id', IMAGE_ID);

  const content = activeResource(page).getByTestId('resource-content');
  await expect(content.locator('.resource__title')).toHaveText('Figure');
  const picture = content.getByRole('img', { name: 'Figure' });
  await expect(picture).toHaveAttribute('src', FIGURE_URL);
  await expect
    .poll(() =>
      picture.evaluate((image) =>
        image instanceof HTMLImageElement && image.complete ? image.naturalWidth : 0,
      ),
    )
    .toBe(400);
  await expect(picture).toBeVisible();
});

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
