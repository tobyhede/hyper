// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// gate that fails a test if React Flow logged a warning while it ran.
import { readFileSync } from 'node:fs';
import { COLLAPSED_RESOURCE_SIZE, encodeCompactUuid, uuidSchema, type UUID } from '@project/core';
import { decodeLoadedSpace } from '@project/persistence';
import { expect, test, type Locator, type Page } from './fixtures';
import {
  boxOf,
  createResource,
  dock,
  dockNavigation,
  expectArrowOrder,
  expectAvailable,
  expectWithheld,
  nodeByTitle,
  openResource,
  presentControl,
  presentedName,
  presentedResource,
  resourceActions,
  resourceControls,
  selectedCanvas,
  selectCanvas,
  newMap,
  settled,
  stageBody,
  stageFrame,
} from './graph';
import { expectPictureLoaded, HARBOUR_SIZE } from './image';
import { SEEDED_MAP_ID, seedPositionedMap } from './seed';

const IMAGE_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a1');
const DEEP_DIVE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000070');
const HARBOUR_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000076');
const FIGURE_URL = 'https://example.com/figure.png';
/** A picture many times the size of any frame the Stage draws. */
const OVERSIZED = { width: 4000, height: 3000 } as const;
/**
 * The tracked fixture's 400×300 picture, served in place of the external URL so
 * nothing reaches the network.
 */
const HARBOUR = readFileSync(
  new URL('../fixture/images/fZoCiTSlSs9w9S87nrFeaOkPdKB4wvFrbWfaMn23ZOs.png', import.meta.url),
);

interface Pictures {
  /** The Image Resource's Title. */
  readonly title?: string;
  /** Give the seeded Graph an Edge from the Image Resource to itself, so presenting starts there. */
  readonly presentable?: boolean;
  /** The picture's recorded natural size. */
  readonly naturalSize?: { readonly width: number; readonly height: number };
  /** The Image Resource's size on the Map; absent, it is the Closed Size. */
  readonly size?: { readonly width: number; readonly height: number };
}

/**
 * Open a Space holding one Markdown Resource and a Closed Image Resource beside
 * it, whose recorded natural size is 400×300. It joins through the same HTTP
 * commit the browser makes, so its natural size is one no gesture measured.
 */
async function openPictures(
  page: Page,
  { title = 'Figure', presentable = false, naturalSize = HARBOUR_SIZE, size }: Pictures = {},
): Promise<UUID> {
  const seeded = await seedPositionedMap(
    page,
    'Pictures',
    (snapshot) => {
      const markdown = snapshot.resources.find(({ document }) => document.kind === 'markdown');
      if (markdown === undefined) throw new Error('The opened Space holds no Markdown Resource.');
      return {
        [markdown.id]: { x: 0, y: 0, open: false },
        [IMAGE_ID]:
          size === undefined ? { x: 400, y: 0, open: false } : { x: 400, y: 0, open: false, size },
      };
    },
    [
      {
        id: IMAGE_ID,
        document: {
          title,
          kind: 'image',
          url: FIGURE_URL,
          naturalSize,
        },
      },
    ],
    presentable ? [{ from: IMAGE_ID, to: IMAGE_ID }] : [],
  );
  await page.goto(`/spaces/${encodeCompactUuid(seeded.snapshot.id)}`);
  await expect(selectedCanvas(page)).toContainText('Pictures');
  await settled(page);
  return seeded.snapshot.id;
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

/** A Resource sized to hold the 400×300 picture above a one-line Title. */
const SIZED_TO_PICTURE = { width: 408, height: 359 } as const;

/**
 * An Open Image Resource is the Open Markdown front with its picture as the
 * content. Opening changes no size, so at the Closed Size the picture is drawn
 * contained and scaled down, never enlarged, above the Title footer and named by
 * the Resource.
 */
test(
  'an Open Image Resource draws its picture contained in the Markdown front, at the size it already had',
  { tag: '@parity:open-image-resource-draws-its-image' },
  async ({ page }) => {
    await serveFigure(page);
    await openPictures(page);
    const node = page.locator(`.react-flow__node[data-id="${IMAGE_ID}"]`);
    await openResource(node, 'Figure');

    const resource = node.getByRole('article', { name: 'Figure' });
    await expect(resource).toHaveAttribute('data-open', 'true');
    await expect.poll(() => authoredSize(node)).toEqual(COLLAPSED_RESOURCE_SIZE);

    const picture = resource.getByRole('img', { name: 'Figure' });
    await expect(picture).toHaveAttribute('src', FIGURE_URL);
    await expectPictureLoaded(picture, HARBOUR_SIZE.width);
    await expect(resource.locator('.canvas-resource__content img')).toHaveCount(1);
    await expect(resource.getByRole('heading', { name: 'Figure' })).toBeVisible();

    await settled(page);
    const { room, natural, bottom } = await pictureIn(node, picture);
    expect(natural).toEqual(HARBOUR_SIZE);
    // The room is smaller than the picture, which is scaled down to fit it.
    expect(room.width).toBeLessThan(natural.width);
    expect(room.height).toBeLessThan(natural.height);
    const titleBox = await boxOf(resource.locator('.canvas-resource__body'), 'the Title footer');
    expect(bottom).toBeLessThanOrEqual(titleBox.y + 1);
  },
);

/**
 * A longer Title takes its room from the picture: the Resource's size is the
 * same, the Title footer is taller, and the picture is scaled down to fit what
 * is left rather than overflowing it.
 */
test('a longer Title takes its room from the picture, not from the size', async ({ page }) => {
  await serveFigure(page);
  await openPictures(page, {
    title: 'Figure\nThe harbour wall, looking east',
    size: SIZED_TO_PICTURE,
  });
  const node = page.locator(`.react-flow__node[data-id="${IMAGE_ID}"]`);
  await openResource(node, 'Figure');

  const resource = node.getByRole('article', { name: 'Figure' });
  await expect(resource).toHaveAttribute('data-open', 'true');
  await expect.poll(() => authoredSize(node)).toEqual(SIZED_TO_PICTURE);
  const picture = resource.getByRole('img', { name: 'Figure' });
  await expectPictureLoaded(picture, HARBOUR_SIZE.width);

  await settled(page);
  const { room, natural, bottom } = await pictureIn(node, picture);
  // The second Title line comes out of the room above it, so the picture no
  // longer fits at its own size and is drawn scaled down, whole.
  expect(room.width).toBeCloseTo(natural.width, 1);
  expect(room.height).toBeLessThan(natural.height - 10);
  const titleBox = await boxOf(resource.locator('.canvas-resource__body'), 'the Title footer');
  expect(bottom).toBeLessThanOrEqual(titleBox.y + 1);
});

/** Presenting an Image Resource draws its picture on the Stage, named by the Resource. */
test('presenting an Image Resource draws its picture', async ({ page }) => {
  await serveFigure(page);
  await openPictures(page, { presentable: true });
  await presentControl(page).click();
  await expect(presentedName(page)).toHaveText('Figure');

  const picture = presentedResource(page).getByRole('img', { name: 'Figure' });
  await expect(picture).toHaveAttribute('src', FIGURE_URL);
  await expectPictureLoaded(picture, HARBOUR_SIZE.width);
  await expect(picture).toBeVisible();
});

/**
 * A picture far larger than the frame is fitted inside it, whole: the Stage
 * neither clips it nor scrolls to show the rest.
 */
test(
  'presenting an oversized picture fits it inside the frame',
  { tag: '@parity:stage-fits-an-oversized-picture' },
  async ({ page }) => {
    await page.route(FIGURE_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="${OVERSIZED.width}" height="${OVERSIZED.height}"><rect width="100%" height="100%" fill="#2a6f97"/></svg>`,
      }),
    );
    await openPictures(page, { presentable: true, naturalSize: OVERSIZED });
    await presentControl(page).click();
    await expect(presentedName(page)).toHaveText('Figure');

    const picture = presentedResource(page).getByRole('img', { name: 'Figure' });
    await expectPictureLoaded(picture, OVERSIZED.width);
    const frame = await boxOf(stageFrame(page), 'the Stage frame');
    const room = await boxOf(picture, 'the picture');
    expect(room.x).toBeGreaterThanOrEqual(frame.x - 0.5);
    expect(room.y).toBeGreaterThanOrEqual(frame.y - 0.5);
    expect(room.x + room.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    expect(room.y + room.height).toBeLessThanOrEqual(frame.y + frame.height + 0.5);
    // Fitted rather than clipped: the picture keeps its whole aspect inside the
    // room it is given, and the frame has nothing below it to scroll to.
    await expect(picture).toHaveCSS('object-fit', 'scale-down');
    expect(
      await stageBody(page).evaluate((body) => body.scrollHeight <= body.clientHeight),
      'the frame scrolls',
    ).toBe(true);
  },
);

/**
 * A picture that will not load is not a refusal (ADR 0106): the Space stays as it
 * was authored, the Resource keeps the size it had, and the content area says the image did not load and names its URL.
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
    await expect.poll(() => authoredSize(node)).toEqual(COLLAPSED_RESOURCE_SIZE);
  },
);

/** Three small PNGs, each a size the created Resource is expected to record. */
const PICTURES = [
  {
    name: 'diagram.png',
    size: { width: 3, height: 2 },
    base64:
      'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEElEQVR4nGP4z8AAQQxwFgBB0gX7h/C5SAAAAABJRU5ErkJggg==',
  },
  {
    name: 'square.png',
    size: { width: 4, height: 4 },
    base64:
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg==',
  },
  {
    name: 'strip.png',
    size: { width: 5, height: 1 },
    base64:
      'iVBORw0KGgoAAAANSUhEUgAAAAUAAAABCAIAAACZnPOkAAAADUlEQVR4nGP4z8CAjAAs4wT8bOOiaQAAAABJRU5ErkJggg==',
  },
] as const;

const [FIRST_PICTURE] = PICTURES;

/** A Space opened on a seeded Map holding one Markdown Resource, for a gesture to create beside. */
async function openForCreation(page: Page): Promise<UUID> {
  const seeded = await seedPositionedMap(page, 'Pictures', (snapshot) => {
    const markdown = snapshot.resources.find(({ document }) => document.kind === 'markdown');
    if (markdown === undefined) throw new Error('The opened Space holds no Markdown Resource.');
    return { [markdown.id]: { x: 0, y: 0, open: false } };
  });
  await page.goto(`/spaces/${encodeCompactUuid(seeded.snapshot.id)}`);
  await expect(selectedCanvas(page)).toContainText('Pictures');
  await settled(page);
  return seeded.snapshot.id;
}

/** The stored Space's Image Resources, with where the seeded Map places each. */
async function storedImages(page: Page, spaceId: UUID) {
  const response = await page.request.get(`/api/spaces/${spaceId}`);
  expect(response.ok()).toBe(true);
  const { snapshot } = decodeLoadedSpace(await response.json());
  const positions = snapshot.document.maps?.find(({ id }) => id === SEEDED_MAP_ID)?.positions;
  return snapshot.resources.flatMap(({ id, document }) =>
    document.kind === 'image' ? [{ document, at: positions?.[id] }] : [],
  );
}

/** The stored Space's revision, which any Edit a gesture completed would have moved. */
async function storedRevision(page: Page, spaceId: UUID): Promise<bigint> {
  const response = await page.request.get(`/api/spaces/${spaceId}`);
  expect(response.ok()).toBe(true);
  return decodeLoadedSpace(await response.json()).revision;
}

const titleNumber = (title: string): number => Number(/^Resource (\d+)$/u.exec(title)?.[1]);

/** The visible canvas's empty pane, where a drop or a paste is the canvas's own. */
const pane = (page: Page): Locator => page.locator('.react-flow__pane:visible').first();

test('choosing a file from the Dock creates an Image Resource titled Resource N at the stored URL', async ({
  page,
}) => {
  const spaceId = await openForCreation(page);

  const chooser = page.waitForEvent('filechooser');
  await createResource(page, 'Image Resource');
  await (
    await chooser
  ).setFiles({
    name: FIRST_PICTURE.name,
    mimeType: 'image/png',
    buffer: Buffer.from(FIRST_PICTURE.base64, 'base64'),
  });

  // The caret lands in the new Resource's Title, which is `Resource N` and
  // never the file's name.
  const title = page.getByRole('textbox', { name: 'Resource title' });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue(/^Resource \d+$/u);
  await title.press('Escape');

  await expect.poll(async () => (await storedImages(page, spaceId)).length).toBe(1);
  const [created] = await storedImages(page, spaceId);
  expect(created?.document).toMatchObject({
    kind: 'image',
    url: expect.stringMatching(/^\/images\/[A-Za-z0-9_-]{43}$/u),
    naturalSize: FIRST_PICTURE.size,
  });
  expect(created?.document.title).toMatch(/^Resource \d+$/u);
});

test('cancelling the file picker creates nothing', async ({ page }) => {
  const spaceId = await openForCreation(page);
  const before = await storedRevision(page, spaceId);
  const resources = page.locator('.react-flow__node:visible');
  const count = await resources.count();

  const chooser = page.waitForEvent('filechooser');
  await createResource(page, 'Image Resource');
  await (await chooser).setFiles([]);

  await expect(page.getByRole('textbox', { name: 'Resource title' })).toHaveCount(0);
  await expect(resources).toHaveCount(count);
  expect(await storedImages(page, spaceId)).toEqual([]);
  expect(await storedRevision(page, spaceId)).toBe(before);
});

test('dropping three images creates three Resources in one Edit, numbered in order, in a row', async ({
  page,
}) => {
  const spaceId = await openForCreation(page);
  const commits: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/spaces') {
      commits.push(request.url());
    }
  });

  const box = await boxOf(pane(page), 'the canvas pane');
  const dataTransfer = await page.evaluateHandle((pictures) => {
    const transfer = new DataTransfer();
    for (const { name, base64 } of pictures) {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      transfer.items.add(new File([bytes], name, { type: 'image/png' }));
    }
    return transfer;
  }, PICTURES);
  const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height * 0.75 };
  await pane(page).dispatchEvent('dragover', { dataTransfer, ...at });
  await pane(page).dispatchEvent('drop', { dataTransfer, ...at });

  const title = page.getByRole('textbox', { name: 'Resource title' });
  await expect(title).toBeFocused();
  await title.press('Escape');

  await expect.poll(async () => (await storedImages(page, spaceId)).length).toBe(3);
  // Read left to right: the store keeps Resources in its own order, and the row
  // is the order the files were dropped in.
  const created = (await storedImages(page, spaceId)).toSorted(
    (left, right) => (left.at?.x ?? 0) - (right.at?.x ?? 0),
  );
  // Titled with three successive numbers, in the order the files were dropped.
  const numbers = created.map(({ document }) => titleNumber(document.title));
  expect(numbers).toEqual([numbers[0], (numbers[0] ?? 0) + 1, (numbers[0] ?? 0) + 2]);
  expect(created.map(({ document }) => document.naturalSize)).toEqual(
    PICTURES.map(({ size }) => size),
  );
  // In a row from the drop point: one height, rising left to right.
  const [first, second, third] = created.map(({ at: placed }) => placed);
  expect(new Set([first?.y, second?.y, third?.y]).size).toBe(1);
  expect((second?.x ?? 0) - (first?.x ?? 0)).toBeGreaterThan(0);
  expect((third?.x ?? 0) - (second?.x ?? 0)).toBe((second?.x ?? 0) - (first?.x ?? 0));
  // One Edit: the three arrived in one commit. V1 has no Undo; one Edit is
  // what a single Undo would reverse.
  expect(commits).toHaveLength(1);
});

/**
 * Drag a picture over `target` and drop it there, answering whether the
 * `dragover` was taken and with which effect — a drag nothing takes is one the
 * browser answers by opening the file in place of the Space. `at` is where in
 * the target's box, as fractions of its width and height; its centre by default.
 */
async function dropPictureOn(
  target: Locator,
  picture: (typeof PICTURES)[number],
  at: { readonly x: number; readonly y: number } = { x: 0.5, y: 0.5 },
): Promise<{ readonly taken: boolean; readonly dropEffect: string }> {
  return target.evaluate(
    (element, { name, base64, at: within }) => {
      const transfer = new DataTransfer();
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      transfer.items.add(new File([bytes], name, { type: 'image/png' }));
      const box = element.getBoundingClientRect();
      const init = {
        dataTransfer: transfer,
        clientX: box.left + box.width * within.x,
        clientY: box.top + box.height * within.y,
        bubbles: true,
        cancelable: true,
      };
      const over = new DragEvent('dragover', init);
      element.dispatchEvent(over);
      const answer = { taken: over.defaultPrevented, dropEffect: transfer.dropEffect };
      element.dispatchEvent(new DragEvent('drop', init));
      return answer;
    },
    { ...picture, at },
  );
}

test('a picture dropped on a Resource, or on the Map an Open Space Resource draws, creates nothing', async ({
  page,
}) => {
  const spaceId = await openForCreation(page);
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/images')) {
      uploads.push(request.url());
    }
  });

  await createResource(page, 'Space Resource');
  const editor = page.getByRole('textbox', { name: 'Resource title' });
  await expect(editor).toBeFocused();
  const spaceTitle = await editor.inputValue();
  await editor.press('Enter');
  await settled(page);
  const spaceResource = page
    .locator('.react-flow__node:visible:not([data-id^="embedded:"])')
    .filter({ has: page.getByRole('heading', { name: spaceTitle }) });
  await spaceResource.focus();
  await spaceResource.press('Enter');
  const embedded = page.locator('.react-flow__node:visible[data-id^="embedded:"]');
  await expect(embedded).toHaveCount(1);
  await settled(page);
  const markdown = page
    .locator('.react-flow__node:visible:not([data-id^="embedded:"])')
    .filter({ has: page.locator('[data-kind="markdown"]') })
    .filter({ hasNot: page.getByRole('heading', { name: spaceTitle }) });

  const refusals = [
    await dropPictureOn(markdown, FIRST_PICTURE),
    await dropPictureOn(spaceResource, FIRST_PICTURE),
    await dropPictureOn(embedded, FIRST_PICTURE),
  ];

  // The empty canvas still takes a drop, which is what the refusals above are
  // measured against: once its Resource exists, any earlier drop that was
  // taken would already have started storing its picture. Aimed at a corner,
  // because the Open Space Resource's drawn Map covers the canvas's centre and
  // a drop on it is refused rather than falling through to the canvas.
  const [, square] = PICTURES;
  await dropPictureOn(pane(page), square, { x: 0.04, y: 0.96 });
  const title = page.getByRole('textbox', { name: 'Resource title' });
  await expect(title).toBeFocused();
  await title.press('Escape');
  await expect.poll(async () => (await storedImages(page, spaceId)).length).toBe(1);
  expect(uploads).toHaveLength(1);
  const [created] = await storedImages(page, spaceId);
  expect(created?.document.naturalSize).toEqual(square.size);
  // Each refusal still claims the drag, so the browser does not open the file.
  expect(refusals).toEqual([
    { taken: true, dropEffect: 'none' },
    { taken: true, dropEffect: 'none' },
    { taken: true, dropEffect: 'none' },
  ]);
});

/**
 * Paste text on the canvas the way an author does: the text on the system
 * clipboard, a click on the empty pane, and the paste shortcut.
 */
async function pasteOnCanvas(page: Page, text: string): Promise<void> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((copied) => navigator.clipboard.writeText(copied), text);
  const box = await boxOf(pane(page), 'the canvas pane');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.75);
  await page.keyboard.press('ControlOrMeta+V');
}

test('pasting an image URL on the canvas creates an Image Resource holding it, titled Resource N', async ({
  page,
}) => {
  await page.route('https://example.com/a.png', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(FIRST_PICTURE.base64, 'base64'),
    }),
  );
  const spaceId = await openForCreation(page);

  await pasteOnCanvas(page, 'https://example.com/a.png');

  const title = page.getByRole('textbox', { name: 'Resource title' });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue(/^Resource \d+$/u);
  await title.press('Escape');
  await expect.poll(async () => (await storedImages(page, spaceId)).length).toBe(1);
  const [created] = await storedImages(page, spaceId);
  expect(created?.document).toMatchObject({
    kind: 'image',
    url: 'https://example.com/a.png',
    naturalSize: FIRST_PICTURE.size,
  });
  expect(created?.document.title).toMatch(/^Resource \d+$/u);
});

test('pasting an unreachable image URL still creates the Resource, with no recorded size', async ({
  page,
}) => {
  await page.route('https://example.com/gone.png', (route) => route.abort());
  const spaceId = await openForCreation(page);

  await pasteOnCanvas(page, 'https://example.com/gone.png');

  await expect(page.getByRole('textbox', { name: 'Resource title' })).toBeFocused();
  await expect.poll(async () => (await storedImages(page, spaceId)).length).toBe(1);
  const [created] = await storedImages(page, spaceId);
  expect(created?.document).toEqual({
    title: expect.stringMatching(/^Resource \d+$/u),
    kind: 'image',
    url: 'https://example.com/gone.png',
  });
});

for (const refused of [
  {
    file: { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') },
    sentence: 'notes.txt is not a PNG, JPEG, WebP or GIF image.',
  },
  {
    file: {
      name: 'huge.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
    },
    sentence: 'huge.png is larger than 10 MB, the largest image that can be stored.',
  },
]) {
  test(`choosing ${refused.file.name} reports its refusal and creates nothing`, async ({
    page,
  }) => {
    const spaceId = await openForCreation(page);

    const chooser = page.waitForEvent('filechooser');
    await createResource(page, 'Image Resource');
    await (await chooser).setFiles(refused.file);

    const notice = page.getByRole('alert').filter({ hasText: 'Image not created' });
    await expect(notice).toContainText(refused.sentence);
    await expect(page.getByRole('textbox', { name: 'Resource title' })).toHaveCount(0);
    expect(await storedImages(page, spaceId)).toEqual([]);
  });
}

/** The node an Image Resource is drawn in, and everything it offers. */
async function imageControls(page: Page) {
  const node = page.locator(`.react-flow__node[data-id="${IMAGE_ID}"]`);
  return { node, controls: await resourceControls(page, node) };
}

test('Replace on a Closed Image Resource opens it on the upload target, and Cancel restores the picture with no Edit', async ({
  page,
}) => {
  await serveFigure(page);
  await openPictures(page);
  const { node, controls } = await imageControls(page);
  const commits: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/spaces') {
      commits.push(request.url());
    }
  });

  await controls.getByRole('button', { name: 'Replace image of Resource Figure' }).click();

  const resource = node.getByRole('article', { name: 'Figure' });
  await expect(resource).toHaveAttribute('data-open', 'true');
  const target = resource.getByRole('group', { name: 'Replace image of Figure' });
  await expect(target).toBeVisible();
  await expect(target.getByRole('button', { name: 'Upload' })).toBeFocused();
  await expect(target.getByRole('textbox', { name: 'Image URL' })).toBeVisible();
  await expect(
    controls.getByRole('button', { name: 'Replace image of Resource Figure' }),
  ).toHaveCount(0);
  await expect(controls.getByRole('button', { name: 'Close Resource Figure' })).toBeDisabled();
  // Opening was the one Edit; the target itself is not one.
  await expect.poll(() => commits.length).toBe(1);

  await controls.getByRole('button', { name: 'Cancel editing Resource Figure' }).click();
  await expect(target).toHaveCount(0);
  await expectPictureLoaded(resource.getByRole('img', { name: 'Figure' }), HARBOUR_SIZE.width);
  await expect(
    controls.getByRole('button', { name: 'Replace image of Resource Figure' }),
  ).toBeFocused();

  await controls.getByRole('button', { name: 'Replace image of Resource Figure' }).click();
  await target.getByRole('textbox', { name: 'Image URL' }).press('Escape');
  await expect(target).toHaveCount(0);
  await settled(page);
  expect(commits).toHaveLength(1);
});

/** The stored Space holding the seeded Image Resource, and where its document now points. */
async function storedFigure(page: Page, spaceId: UUID) {
  const response = await page.request.get(`/api/spaces/${spaceId}`);
  expect(response.ok()).toBe(true);
  const loaded = decodeLoadedSpace(await response.json());
  const figure = loaded.snapshot.resources.find(({ id }) => id === IMAGE_ID)?.document;
  return { revision: loaded.revision, figure, maps: loaded.snapshot.document.maps };
}

/** Every part of `part` is drawn inside `content`, the box the Resource does not clip. */
async function expectWithin(part: Locator, content: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const outer = await content.boundingBox();
      const inner = await part.boundingBox();
      if (outer === null || inner === null) return 'not drawn';
      const overflow = Math.max(
        outer.x - inner.x,
        outer.y - inner.y,
        inner.x + inner.width - (outer.x + outer.width),
        inner.y + inner.height - (outer.y + outer.height),
      );
      return overflow <= 0.5 ? 'within' : `overflows by ${overflow.toFixed(1)}px`;
    })
    .toBe('within');
}

test(
  'at the Closed Size the upload target keeps its controls and refusal in view and still replaces',
  { tag: '@parity:image-resource-replace-fits-the-closed-size' },
  async ({ page }) => {
    await serveFigure(page);
    const spaceId = await openPictures(page, { naturalSize: { width: 64, height: 64 } });
    const { node, controls } = await imageControls(page);
    await controls.getByRole('button', { name: 'Replace image of Resource Figure' }).click();
    const resource = node.getByRole('article', { name: 'Figure' });
    const target = resource.getByRole('group', { name: 'Replace image of Figure' });
    await expect(target).toBeVisible();
    await settled(page);
    const { maps } = await storedFigure(page, spaceId);
    // Opening for Replace wrote `open` and no size: the Closed Size is the
    // smallest any Resource is.
    expect(maps?.[0]?.positions[IMAGE_ID]).toEqual({ x: 400, y: 0, open: true });
    const content = resource.locator('.canvas-resource__content');
    const upload = target.getByRole('button', { name: 'Upload' });
    const field = target.getByRole('textbox', { name: 'Image URL' });
    await expect(upload).toBeFocused();
    await expectWithin(upload, content);
    await expectWithin(field, content);

    await field.fill('data:image/png;base64,AAAA');
    await field.press('Enter');
    const refusal = target.getByRole('alert');
    await expect(refusal).toHaveText('An image URL must start with https: or http:.');
    await expectWithin(upload, content);
    await expectWithin(field, content);
    await expectWithin(refusal, content);

    await page.route('https://example.com/new.png', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: HARBOUR }),
    );
    await field.fill('https://example.com/new.png');
    await field.press('Enter');
    await expect(target).toHaveCount(0);
    await expect(resource.getByRole('img', { name: 'Figure' })).toHaveAttribute(
      'src',
      'https://example.com/new.png',
    );
    await settled(page);
    expect((await storedFigure(page, spaceId)).figure).toMatchObject({
      url: 'https://example.com/new.png',
    });
  },
);

/** Commits the browser sends, counted from when this is called. */
function countCommits(page: Page) {
  let commits = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/spaces') {
      commits += 1;
    }
  });
  return { count: () => commits };
}

/** Open the Image Resource and begin replacing its image, answering the upload target. */
async function beginReplacing(page: Page) {
  const { node, controls } = await imageControls(page);
  await controls.getByRole('button', { name: 'Replace image of Resource Figure' }).click();
  const resource = node.getByRole('article', { name: 'Figure' });
  const target = resource.getByRole('group', { name: 'Replace image of Figure' });
  await expect(target).toBeVisible();
  await settled(page);
  return { resource, target, controls };
}

test(
  'uploading a file replaces the image with the stored one in one Edit, keeping the Resource',
  { tag: '@parity:image-resource-replace-from-the-upload-target' },
  async ({ page }) => {
    await serveFigure(page);
    const spaceId = await openPictures(page);
    const { resource, target } = await beginReplacing(page);
    const before = await storedFigure(page, spaceId);
    await pane(page).click({ position: { x: 20, y: 200 } });
    await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Cancel editing Resource Figure' }),
    ).toBeVisible();
    const commits = countCommits(page);

    const chooser = page.waitForEvent('filechooser');
    await target.getByRole('button', { name: 'Upload' }).click();
    await (
      await chooser
    ).setFiles({
      name: FIRST_PICTURE.name,
      mimeType: 'image/png',
      buffer: Buffer.from(FIRST_PICTURE.base64, 'base64'),
    });

    await expect(target).toHaveCount(0);
    const picture = resource.getByRole('img', { name: 'Figure' });
    await expect(picture).toHaveAttribute('src', /^\/images\/[A-Za-z0-9_-]{43}$/u);
    await expectPictureLoaded(picture, FIRST_PICTURE.size.width);
    await settled(page);
    const after = await storedFigure(page, spaceId);
    expect(after.figure).toEqual({
      title: 'Figure',
      kind: 'image',
      url: expect.stringMatching(/^\/images\/[A-Za-z0-9_-]{43}$/u),
      naturalSize: FIRST_PICTURE.size,
    });
    // Placement, size and Edges are the Map's, and the Map is untouched.
    expect(after.maps).toEqual(before.maps);
    // V1 has no Undo; one commit over the revision holding the old URL is the
    // one Edit an Undo would reverse.
    expect(commits.count()).toBe(1);
    expect(after.revision).toBe(before.revision + 1n);
  },
);

test(
  'dropping an image on the upload target replaces the image, and a dropped non-image is refused there',
  { tag: '@parity:image-resource-replace-refuses-in-the-target' },
  async ({ page }) => {
    await serveFigure(page);
    const spaceId = await openPictures(page);
    const { resource, target } = await beginReplacing(page);
    const before = await storedFigure(page, spaceId);

    const drop = (...files: { name: string; type: string; base64: string }[]) =>
      target.evaluate((element, dropped) => {
        const transfer = new DataTransfer();
        for (const { name, type, base64 } of dropped) {
          const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
          transfer.items.add(new File([bytes], name, { type }));
        }
        const init = { dataTransfer: transfer, bubbles: true, cancelable: true };
        const over = new DragEvent('dragover', init);
        element.dispatchEvent(over);
        element.dispatchEvent(new DragEvent('drop', init));
        return over.defaultPrevented;
      }, files);

    await drop(
      { name: 'one.png', type: 'image/png', base64: FIRST_PICTURE.base64 },
      { name: 'two.png', type: 'image/png', base64: FIRST_PICTURE.base64 },
    );
    await expect(target.getByRole('alert')).toHaveText('Use one image at a time.');
    expect((await storedFigure(page, spaceId)).revision).toBe(before.revision);

    expect(
      await drop({ name: 'notes.txt', type: 'text/plain', base64: btoa('not a picture') }),
    ).toBe(true);
    await expect(target.getByRole('alert')).toHaveText(
      'notes.txt is not a PNG, JPEG, WebP or GIF image.',
    );
    await expect(target).toBeVisible();
    expect((await storedFigure(page, spaceId)).revision).toBe(before.revision);

    await drop({ name: FIRST_PICTURE.name, type: 'image/png', base64: FIRST_PICTURE.base64 });
    await expect(target).toHaveCount(0);
    await expectPictureLoaded(
      resource.getByRole('img', { name: 'Figure' }),
      FIRST_PICTURE.size.width,
    );
    // The drop was the target's alone: the canvas created no Resource of its own.
    await expect(page.locator('.react-flow__node:visible')).toHaveCount(2);
  },
);

test('entering a new URL replaces the image in one Edit; a data: URL is refused and the same URL changes nothing', async ({
  page,
}) => {
  await serveFigure(page);
  await page.route('https://example.com/new.png', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(FIRST_PICTURE.base64, 'base64'),
    }),
  );
  const spaceId = await openPictures(page);
  const { resource, target, controls } = await beginReplacing(page);
  const before = await storedFigure(page, spaceId);
  const field = target.getByRole('textbox', { name: 'Image URL' });

  await field.fill('data:image/png;base64,AAAA');
  await field.press('Enter');
  await expect(target.getByRole('alert')).toHaveText(
    'An image URL must start with https: or http:.',
  );
  await expect(target).toBeVisible();

  await field.fill(FIGURE_URL);
  await field.press('Enter');
  await expect(target).toHaveCount(0);
  await settled(page);
  expect((await storedFigure(page, spaceId)).revision).toBe(before.revision);

  const commits = countCommits(page);
  await controls.getByRole('button', { name: 'Replace image of Resource Figure' }).click();
  await field.fill('https://example.com/new.png');
  await field.press('Enter');
  await expect(target).toHaveCount(0);
  await expect(resource.getByRole('img', { name: 'Figure' })).toHaveAttribute(
    'src',
    'https://example.com/new.png',
  );
  await settled(page);
  expect((await storedFigure(page, spaceId)).figure).toEqual({
    title: 'Figure',
    kind: 'image',
    url: 'https://example.com/new.png',
    naturalSize: FIRST_PICTURE.size,
  });
  expect(commits.count()).toBe(1);
});

test(
  'the failed-image state offers the same Replace',
  { tag: '@parity:image-resource-failed-state-offers-replace' },
  async ({ page }) => {
    await page.route(FIGURE_URL, (route) => route.abort());
    await openPictures(page);
    const { node, controls } = await imageControls(page);
    await openResource(node, 'Figure');
    await pane(page).click({ position: { x: 20, y: 200 } });
    await expect(node).not.toHaveClass(/selected/);
    const resource = node.getByRole('article', { name: 'Figure' });
    await expect(resource.getByText('Image did not load')).toBeVisible();

    await resource.getByRole('button', { name: 'Replace image' }).click();

    await expect(resource.getByRole('group', { name: 'Replace image of Figure' })).toBeVisible();
    await expect(
      controls.getByRole('button', { name: 'Cancel editing Resource Figure' }),
    ).toBeVisible();
    await controls.getByRole('button', { name: 'Cancel editing Resource Figure' }).click();
    await expect(resource.getByText('Image did not load')).toBeVisible();
  },
);

for (const failure of ['HTTP 500', 'network', 'timeout']) {
  test(`a replacement upload recovers from ${failure} in its target`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await serveFigure(page);
    const spaceId = await openPictures(page);
    const { resource, target } = await beginReplacing(page);
    const before = await storedFigure(page, spaceId);
    if (failure === 'timeout') await page.clock.install();
    await page.route('**/images', async (route) => {
      if (failure === 'network') await route.abort('failed');
      else if (failure === 'timeout') return;
      else await route.fulfill({ status: 500, body: 'Unavailable' });
    });
    const upload = async () => {
      const chooser = page.waitForEvent('filechooser');
      await target.getByRole('button', { name: 'Upload' }).click();
      await (
        await chooser
      ).setFiles({
        name: FIRST_PICTURE.name,
        mimeType: 'image/png',
        buffer: Buffer.from(FIRST_PICTURE.base64, 'base64'),
      });
    };
    await upload();
    if (failure === 'timeout') {
      await expectWithheld(dockNavigation(page));
      await page.clock.fastForward(120_000);
    }
    await expect(target.getByRole('alert')).toContainText('This image was not replaced:');
    await expectAvailable(dockNavigation(page));
    expect((await storedFigure(page, spaceId)).revision).toBe(before.revision);
    expect(errors).toEqual([]);
    await page.unroute('**/images');
    await upload();
    await expect(target).toHaveCount(0);
    await expectPictureLoaded(
      resource.getByRole('img', { name: 'Figure' }),
      FIRST_PICTURE.size.width,
    );
    expect(errors).toEqual([]);
  });
}

test('the same URL retries a failed picture without an Edit', async ({ page }) => {
  await page.route(FIGURE_URL, (route) => route.abort());
  const spaceId = await openPictures(page);
  const { node } = await imageControls(page);
  await openResource(node, 'Figure');
  const resource = node.getByRole('article', { name: 'Figure' });
  await expect(resource.getByText('Image did not load')).toBeVisible();
  await settled(page);
  const before = await storedFigure(page, spaceId);
  const commits = countCommits(page);
  await page.unroute(FIGURE_URL);
  await serveFigure(page);
  await resource.getByRole('button', { name: 'Replace image' }).click();
  const field = resource.getByRole('textbox', { name: 'Image URL' });
  await field.fill(FIGURE_URL);
  await field.press('Enter');
  // The URL already held is answered `unchanged`, which ends the target; the
  // picture mounted in its place loads afresh. A refusal would keep the target
  // up, and an Edit would move the revision.
  await expect(resource.getByRole('group', { name: 'Replace image of Figure' })).toHaveCount(0);
  await expectPictureLoaded(resource.getByRole('img', { name: 'Figure' }), HARBOUR_SIZE.width);
  expect((await storedFigure(page, spaceId)).revision).toBe(before.revision);
  expect(commits.count()).toBe(0);
});

/**
 * Send a file from the upload target and hold the host's answer until the
 * returned release is called, so the replacement stays in flight.
 */
async function uploadHeld(
  page: Page,
  target: Locator,
  // Declared a PNG, so it is sent, and refused by the host from its bytes.
  file = { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') },
): Promise<() => void> {
  const held = Promise.withResolvers<undefined>();
  // The host's image collection, which a chosen file is sent to.
  await page.route(
    (url) => url.pathname === '/images',
    async (route) => {
      await held.promise;
      await route.continue();
    },
  );
  const chooser = page.waitForEvent('filechooser');
  await target.getByRole('button', { name: 'Upload' }).click();
  await (await chooser).setFiles(file);
  await expect(target).toHaveAttribute('aria-busy', 'true');
  return () => held.resolve(undefined);
}

test(
  'a replacement in flight holds the target up and shows its answer there',
  {
    tag: [
      '@parity:image-resource-replace-holds-navigation',
      '@parity:command-dock-draws-its-menu-buttons-unavailable',
    ],
  },
  async ({ page }) => {
    await serveFigure(page);
    await openPictures(page);
    await newMap(page);
    const mapName = page.getByRole('textbox', { name: 'Map name' });
    await mapName.fill('Elsewhere');
    await mapName.press('Enter');
    await selectCanvas(page, 'Pictures');
    await selectCanvas(page, 'Elsewhere');
    const previousUrl = page.url();
    await selectCanvas(page, 'Pictures');
    const heldUrl = page.url();
    const { target, controls } = await beginReplacing(page);
    const release = await uploadHeld(page, target);

    const cancel = controls.getByRole('button', { name: 'Cancel editing Resource Figure' });
    await expect(cancel).toBeDisabled();
    // Close stays in its slot, unavailable and still reachable, for the whole
    // replacement rather than vanishing while it is in flight.
    const close = controls.getByRole('button', { name: 'Close Resource Figure' });
    await expect(close).toBeVisible();
    await expect(close).toHaveAttribute('aria-disabled', 'true');
    await close.focus();
    await expect(close).toBeFocused();
    await close.dispatchEvent('click');
    await expect(target).toBeVisible();
    await expect(target.getByRole('button', { name: 'Upload' })).toBeDisabled();
    await expect(target.getByRole('textbox', { name: 'Image URL' })).toBeDisabled();
    await expect(target).toHaveAttribute('aria-busy', 'true');
    // The Dock's navigation is drawn unavailable by `aria-disabled` and stays in
    // its arrow order, so each withheld command is reached from the keyboard.
    const menuButtons = dockNavigation(page);
    await expectWithheld(menuButtons);
    await expectArrowOrder(page, menuButtons);
    for (const control of menuButtons) {
      await control.click({ force: true, delay: 120 });
      await expect(page.getByRole('menu')).toHaveCount(0);
      await control.press('Enter');
      await expect(page.getByRole('menu')).toHaveCount(0);
    }
    // A withheld command is not a refused one, so nothing is reported.
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let pops = 0;
          const arrived = () => {
            if (++pops === 2) {
              window.removeEventListener('popstate', arrived);
              resolve();
            }
          };
          window.addEventListener('popstate', arrived);
          window.history.back();
        }),
    );
    await expect(page).toHaveURL(heldUrl);
    await expect(selectedCanvas(page)).toHaveText('Pictures');
    await target.press('Escape');
    await expect(target).toBeVisible();

    release();
    await expect(target.getByRole('alert')).toHaveText(
      'fake.png is not a PNG, JPEG, WebP or GIF image.',
    );
    await expect(cancel).toBeEnabled();
    await expectAvailable(menuButtons);
    await page.goBack();
    await expect(page).toHaveURL(previousUrl);
    await expect(selectedCanvas(page)).toHaveText('Elsewhere');
    await page.goForward();
    await expect(selectedCanvas(page)).toHaveText('Pictures');
  },
);

test('a failed save is retried while a replacement is held, and the replacement goes on', async ({
  page,
}) => {
  await serveFigure(page);
  await openPictures(page);
  const status = page.getByTestId('persistence-status');
  const before = BigInt((await status.getAttribute('data-revision')) ?? '');
  let failing = true;
  await page.route('**/api/spaces', async (route) => {
    const request = route.request();
    if (failing && request.method() === 'POST') return route.abort('failed');
    return route.continue();
  });
  // Opening the Image Resource on its target is the Edit whose save fails.
  const { target } = await beginReplacing(page);
  const failure = page.getByTestId('persistence-failure');
  await expect(failure).toBeVisible();

  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === '/images',
    async (route) => {
      await held;
      await route.continue();
    },
  );
  const chooser = page.waitForEvent('filechooser');
  await target.getByRole('button', { name: 'Upload' }).click();
  await (
    await chooser
  ).setFiles({
    name: FIRST_PICTURE.name,
    mimeType: 'image/png',
    buffer: Buffer.from(FIRST_PICTURE.base64, 'base64'),
  });
  await expect(target).toHaveAttribute('aria-busy', 'true');

  const retry = failure.getByRole('button', { name: 'Retry', exact: true });
  await expect(retry).toBeEnabled();
  failing = false;
  await retry.click();
  await expect(failure).toBeHidden();
  await expect(status).toHaveText('Persisted');
  await expect(status).toHaveAttribute('data-revision', (before + 1n).toString());
  // Retry re-committed the working Space and replaced nothing under the target.
  await expect(target).toHaveAttribute('aria-busy', 'true');
  await expectWithheld(dockNavigation(page));

  release();
  await expect(target).toHaveCount(0);
  await expectAvailable(dockNavigation(page));
});

const PRESENTATION_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000060');
const OVERVIEW_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000061');

/**
 * Add the Image Resource, Closed, to the fixture's Presentation Space on the
 * Overview Map that Meta's Space Resource enters it on, through the same HTTP
 * commit the browser makes.
 */
async function seedPresentationFigure(page: Page): Promise<void> {
  const response = await page.request.get(`/api/spaces/${PRESENTATION_ID}`);
  expect(response.ok()).toBe(true);
  const { snapshot, revision } = decodeLoadedSpace(await response.json());
  const maps = (snapshot.document.maps ?? []).map((authored) =>
    authored.id === OVERVIEW_MAP_ID
      ? {
          ...authored,
          positions: { ...authored.positions, [IMAGE_ID]: { x: 1272, y: 12, open: false } },
        }
      : authored,
  );
  const commit = await page.request.post('/api/spaces', {
    data: {
      changes: [
        {
          kind: 'update',
          spaceId: PRESENTATION_ID,
          snapshot: {
            ...snapshot,
            resources: [
              ...snapshot.resources,
              {
                id: IMAGE_ID,
                document: {
                  title: 'Figure',
                  kind: 'image',
                  url: FIGURE_URL,
                  naturalSize: HARBOUR_SIZE,
                },
              },
            ],
            document: { ...snapshot.document, maps },
          },
          expectedRevision: revision.toString(),
        },
      ],
    },
  });
  expect(commit.ok()).toBe(true);
}

/**
 * In an entered Space the opener's crumb is navigation too: it is withheld with
 * the rest and walked in the same arrow order, and when the replacement
 * completes every navigation command is available again, Exit included.
 */
test("a replacement in an entered Space withholds the opener's crumb, and completion makes every navigation command available", async ({
  page,
}) => {
  await serveFigure(page);
  await seedPresentationFigure(page);
  await page.goto('/');
  await selectCanvas(page, 'Linked Spaces');
  const presentation = nodeByTitle(page, 'Presentation');
  await expect(presentation).toBeVisible();
  await settled(page);
  await (
    await resourceControls(page, presentation)
  )
    .getByRole('button', { name: 'Actions for Resource Presentation' })
    .click();
  await page.getByRole('menuitem', { name: 'Enter', exact: true }).click();
  // Meta stays open behind the entered Space, so its Dock is in the page too.
  const bar = dock(page).filter({ visible: true });
  const shownSpace = bar.getByTestId('space-title');
  await expect(shownSpace).toContainText('Presentation');
  await expect(bar.getByTestId('selected-canvas')).toContainText('Overview');
  await settled(page);

  const { resource, target } = await beginReplacing(page);
  const release = await uploadHeld(page, target, {
    name: FIRST_PICTURE.name,
    mimeType: 'image/png',
    buffer: Buffer.from(FIRST_PICTURE.base64, 'base64'),
  });

  const goTo = page.getByRole('button', { name: 'Go to Map fixture' });
  const navigation = [goTo, ...dockNavigation(page)];
  await expectWithheld(navigation);
  await expectArrowOrder(page, navigation);
  await goTo.click({ force: true });
  await expect(shownSpace).toContainText('Presentation');
  await expect(page.getByRole('alert')).toHaveCount(0);

  release();
  await expect(target).toHaveCount(0);
  await expectPictureLoaded(
    resource.getByRole('img', { name: 'Figure' }),
    FIRST_PICTURE.size.width,
  );
  await expectAvailable(navigation);
  await shownSpace.click({ delay: 120 });
  const exit = page.getByRole('menu').getByRole('menuitem', { name: 'Exit Space' });
  await expect(exit).toBeEnabled();
  await exit.click();
  await expect(shownSpace).toContainText('Map fixture');
});

/**
 * Follow a fragment of the current location, answering whether the browser
 * fired `popstate` for it; the spec fires `popstate` before `hashchange`.
 */
const followFragment = (page: Page, fragment: string) =>
  page.evaluate(
    (hash) =>
      new Promise<boolean>((resolve) => {
        let popped = false;
        const heard = () => {
          popped = true;
        };
        window.addEventListener('popstate', heard);
        window.addEventListener(
          'hashchange',
          () => {
            window.removeEventListener('popstate', heard);
            resolve(popped);
          },
          { once: true },
        );
        window.location.hash = hash;
      }),
    fragment,
  );

/**
 * Traverse by `delta`, answering a read of how many `popstate`s have arrived
 * since and where the browser is. Each call counts on its own.
 */
async function traverseCounting(page: Page, delta: number) {
  await page.evaluate((by) => {
    const { dataset } = document.documentElement;
    const token = String(Number(dataset['popToken'] ?? 0) + 1);
    dataset['popToken'] = token;
    dataset['pops'] = '0';
    window.addEventListener('popstate', () => {
      if (dataset['popToken'] === token) dataset['pops'] = String(Number(dataset['pops']) + 1);
    });
    window.history.go(by);
  }, delta);
  return () =>
    page.evaluate(() => ({
      pops: Number(document.documentElement.dataset['pops']),
      url: window.location.href,
    }));
}

test('a replacement in flight holds a Back and a Forward across a fragment link', async ({
  page,
}) => {
  await serveFigure(page);
  await openPictures(page);
  await newMap(page);
  const mapName = page.getByRole('textbox', { name: 'Map name' });
  await mapName.fill('Elsewhere');
  await mapName.press('Enter');
  await selectCanvas(page, 'Pictures');
  await selectCanvas(page, 'Elsewhere');
  await selectCanvas(page, 'Pictures');
  const heldUrl = page.url();
  const fragmentUrl = `${heldUrl}#figure`;
  // A same-document entry the application did not write, arriving by `popstate`.
  expect(await followFragment(page, 'figure')).toBe(true);
  await expect(page).toHaveURL(fragmentUrl);
  const { target } = await beginReplacing(page);
  const release = await uploadHeld(page, target);

  // Back across the fragment's entry, to the Elsewhere entry, returns to the fragment's.
  const afterBack = await traverseCounting(page, -2);
  await expect.poll(afterBack).toEqual({ pops: 2, url: fragmentUrl });
  await expect(selectedCanvas(page)).toHaveText('Pictures');

  release();
  await expect(target.getByRole('alert')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(heldUrl);
  const releaseAgain = await uploadHeld(page, target);

  // Forward onto the fragment's entry returns to the entry it left.
  const afterForward = await traverseCounting(page, 1);
  await expect.poll(afterForward).toEqual({ pops: 2, url: heldUrl });
  releaseAgain();
});

/**
 * Stand a revision conflict up under a held replacement: another writer commits
 * first, the browser's Open of the Image Resource on its target is parked until
 * `file` has been chosen and its upload held, and the parked save then meets the
 * newer stored revision.
 */
async function conflictDuringReplacement(
  page: Page,
  spaceId: UUID,
  file: { readonly name: string; readonly mimeType: string; readonly buffer: Buffer },
) {
  const stored = await page.request.get(`/api/spaces/${spaceId}`);
  expect(stored.ok()).toBe(true);
  const loaded = decodeLoadedSpace(await stored.json());
  const remoteCommit = await page.request.post('/api/spaces', {
    data: {
      changes: [
        {
          kind: 'update',
          spaceId,
          snapshot: {
            ...loaded.snapshot,
            document: { ...loaded.snapshot.document, title: 'Renamed elsewhere' },
          },
          expectedRevision: loaded.revision.toString(),
        },
      ],
    },
  });
  expect(remoteCommit.ok()).toBe(true);

  let releaseSave: () => void = () => undefined;
  const saveHeld = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  let parked = false;
  await page.route('**/api/spaces', async (route) => {
    if (!parked && route.request().method() === 'POST') {
      parked = true;
      await saveHeld;
    }
    await route.continue();
  });
  let releaseUpload: () => void = () => undefined;
  const uploadHeld = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  await page.route(
    (url) => url.pathname === '/images',
    async (route) => {
      await uploadHeld;
      await route.continue();
    },
  );

  const { target } = await beginReplacing(page);
  const chooser = page.waitForEvent('filechooser');
  await target.getByRole('button', { name: 'Upload' }).click();
  await (await chooser).setFiles(file);
  await expect(target).toHaveAttribute('aria-busy', 'true');
  releaseSave();
  const conflict = page.getByRole('alertdialog', { name: 'Changes conflict' });
  await expect(conflict).toBeVisible();
  return {
    target,
    // The modal dialog hides the canvas from the accessibility tree, so what
    // stands behind it is read from the node itself.
    behindDialog: page.locator(`.react-flow__node[data-id="${IMAGE_ID}"]`),
    conflict,
    revision: loaded.revision + 1n,
    releaseUpload: () => releaseUpload(),
  };
}

test('keeping local work during a held replacement re-commits it, and the replacement goes on', async ({
  page,
}) => {
  await serveFigure(page);
  const spaceId = await openPictures(page);
  const { target, conflict, revision, releaseUpload } = await conflictDuringReplacement(
    page,
    spaceId,
    {
      name: FIRST_PICTURE.name,
      mimeType: 'image/png',
      buffer: Buffer.from(FIRST_PICTURE.base64, 'base64'),
    },
  );
  const status = page.getByTestId('persistence-status');
  const keepLocal = conflict.getByRole('button', { name: 'Keep local and retry' });
  await expect(keepLocal).not.toHaveAttribute('aria-disabled', 'true');
  await keepLocal.click();
  await expect(conflict).toBeHidden();
  await expect(status).toHaveText('Persisted');
  await expect(status).toHaveAttribute('data-revision', (revision + 1n).toString());
  // It re-committed the working Space and replaced nothing under the target.
  await expect(target).toHaveAttribute('aria-busy', 'true');

  releaseUpload();
  await expect(target).toHaveCount(0);
  await expect(status).toHaveAttribute('data-revision', (revision + 2n).toString());
  const { figure } = await storedFigure(page, spaceId);
  expect(figure?.kind === 'image' ? figure.url : undefined).not.toBe(FIGURE_URL);
});

test('Reload is withheld while a replacement is held and offered again once it answers', async ({
  page,
}) => {
  await serveFigure(page);
  const spaceId = await openPictures(page);
  const { behindDialog, conflict, revision, releaseUpload } = await conflictDuringReplacement(
    page,
    spaceId,
    {
      // Declared a PNG, so it is sent, and refused by the host from its bytes.
      name: 'fake.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not a picture'),
    },
  );
  const reload = conflict.getByRole('button', { name: 'Reload' });
  await expect(reload).toHaveAttribute('aria-disabled', 'true');
  await expect(reload).not.toHaveAttribute('disabled');
  await reload.focus();
  await expect(reload).toBeFocused();
  await reload.click({ force: true });
  await reload.press('Enter');
  await expect(conflict).toBeVisible();
  await expect(behindDialog.locator('[aria-busy="true"]')).toHaveCount(1);

  releaseUpload();
  await expect(
    behindDialog.getByText('fake.png is not a PNG, JPEG, WebP or GIF image.'),
  ).toBeVisible();
  await expect(behindDialog.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(reload).not.toHaveAttribute('aria-disabled', 'true');
  await reload.click();
  await expect(conflict).toBeHidden();
  await expect(page.getByTestId('space-title').filter({ visible: true })).toHaveText(
    'Renamed elsewhere',
  );
  await expect(page.getByTestId('persistence-status')).toHaveAttribute(
    'data-revision',
    revision.toString(),
  );
});

/**
 * The tracked fixture's Image Resource shows a stored image the host seeded from
 * a tracked file before serving (ADR 0106), so it draws with every request that
 * leaves the host refused.
 */
test('the tracked fixture draws its Open Image Resource with no network', async ({
  page,
  e2eServer,
}) => {
  const hostUrl = e2eServer.resolvedUrls?.local[0];
  if (hostUrl === undefined) throw new Error('Vite did not publish a loopback URL');
  const host = new URL(hostUrl).origin;
  const escaped: string[] = [];
  await page.route(
    (url) => url.origin !== host,
    (route) => {
      escaped.push(route.request().url());
      return route.abort();
    },
  );
  await page.goto(`/spaces/${encodeCompactUuid(DEEP_DIVE_ID)}`);
  await expect(selectedCanvas(page)).toContainText('Deep dive');
  await settled(page);

  const resource = page
    .locator(`.react-flow__node[data-id="${HARBOUR_ID}"]`)
    .getByRole('article', { name: 'Harbour' });
  await expect(resource).toHaveAttribute('data-open', 'true');
  const picture = resource.getByRole('img', { name: 'Harbour' });
  await expect(picture).toHaveAttribute('src', /^\/images\/[A-Za-z0-9_-]{43}$/u);
  await expectPictureLoaded(picture, HARBOUR_SIZE.width);
  expect(escaped).toEqual([]);
});

/**
 * A Reference Resource targets an Image Resource (ADR 0070, ADR 0106). Created
 * from the Image Resource's own menu, it is named after it with the caret in
 * its Title; Opening it changes no size; it draws that picture read-only, with Close and no Replace, not on its
 * rail and not in its failed-image state; and replacing the Target's image,
 * through the Target's own Replace, changes what it draws.
 */
test(
  "an Open Reference Resource draws its Image Resource Target's picture read-only",
  { tag: '@parity:open-reference-draws-target-image-read-only' },
  async ({ page }) => {
    const NEW_URL = 'https://example.com/replacement.png';
    await page.route(FIGURE_URL, (route) => route.abort());
    await page.route(NEW_URL, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: HARBOUR }),
    );
    const spaceId = await openPictures(page);

    const menu = await resourceActions(page, 'Figure');
    await menu.getByRole('menuitem', { name: 'Create Reference' }).click();
    const title = page.getByRole('textbox', { name: 'Resource title' });
    await expect(title).toBeFocused();
    await expect(title).toHaveValue('Figure');
    await title.press('Enter');
    await expect(title).toHaveCount(0);
    await settled(page);

    const node = page
      .locator('.react-flow__node')
      .filter({ has: page.locator('[data-kind="reference"]') });
    await expect(node).toHaveCount(1);
    const referenceId = await node.getAttribute('data-id');
    if (referenceId === null) throw new Error('The Reference Resource has no id.');
    const response = await page.request.get(`/api/spaces/${spaceId}`);
    const stored = decodeLoadedSpace(await response.json()).snapshot.resources.find(
      ({ id }) => id === referenceId,
    );
    expect(stored?.document).toEqual({ title: 'Figure', kind: 'reference', target: IMAGE_ID });

    const reference = page.locator(`.react-flow__node[data-id="${referenceId}"]`);
    await openResource(reference, 'Figure');
    const front = reference.getByRole('article', { name: 'Figure' });
    await expect(front).toHaveAttribute('data-open', 'true');
    await expect(front).toHaveAttribute('data-kind', 'reference');
    // Opening changes no size: the Reference Resource keeps the Closed Size.
    await expect.poll(() => authoredSize(reference)).toEqual(COLLAPSED_RESOURCE_SIZE);

    // The Target's picture did not load: the Reference Resource names its URL
    // and offers no Replace, which is the Image Resource's own command.
    await expect(front.getByText('Image did not load')).toBeVisible();
    await expect(front.getByText(FIGURE_URL)).toBeVisible();
    await expect(front.getByRole('button', { name: /Replace/ })).toHaveCount(0);
    const controls = await resourceControls(page, reference);
    await expect(controls.getByRole('button', { name: 'Close Resource Figure' })).toBeVisible();
    await expect(controls.getByRole('button', { name: /^Replace image of Resource/ })).toHaveCount(
      0,
    );
    await expect(controls.getByRole('button', { name: /^Edit Resource/ })).toHaveCount(0);

    // Replacing the Target's image is what changes the Reference Resource's picture.
    const { target } = await beginReplacing(page);
    const field = target.getByRole('textbox', { name: 'Image URL' });
    await field.fill(NEW_URL);
    await field.press('Enter');
    await expect(target).toHaveCount(0);
    const picture = front.getByRole('img', { name: 'Figure' });
    await expect(picture).toHaveAttribute('src', NEW_URL);
    await expectPictureLoaded(picture, HARBOUR_SIZE.width);
    await expect(front.getByText('Image did not load')).toHaveCount(0);
    await settled(page);
    expect((await storedFigure(page, spaceId)).figure).toMatchObject({ url: NEW_URL });
  },
);

test('replacing an image in an only-drawn Space holds Back and Forward and edits that Space', async ({
  page,
}) => {
  await serveFigure(page);
  const response = await page.request.get(`/api/spaces/${DEEP_DIVE_ID}`);
  expect(response.ok()).toBe(true);
  const loaded = decodeLoadedSpace(await response.json());
  const targetMap = loaded.snapshot.document.maps?.[0];
  if (targetMap === undefined) throw new Error('Deep dive must have a Map');
  const targetSnapshot = {
    ...loaded.snapshot,
    document: {
      ...loaded.snapshot.document,
      maps: [
        {
          ...targetMap,
          positions: {
            [HARBOUR_ID]: { x: 0, y: 0, open: true, size: { width: 408, height: 359 } },
          },
          graphs: targetMap.graphs.map((graph) => ({ ...graph, edges: [] })),
        },
      ],
    },
  };
  const committed = await page.request.post('/api/spaces', {
    data: {
      changes: [
        {
          kind: 'update',
          spaceId: DEEP_DIVE_ID,
          snapshot: targetSnapshot,
          expectedRevision: loaded.revision.toString(),
        },
      ],
    },
  });
  expect(committed.ok()).toBe(true);
  const drawingId = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
  const root = await seedPositionedMap(page, 'Embedded pictures', () => ({
    [drawingId]: { x: 0, y: 0, open: true, size: { width: 900, height: 700 } },
  }));
  await page.goto(`/spaces/${encodeCompactUuid(root.snapshot.id)}`);
  await expect(selectedCanvas(page)).toHaveText('Embedded pictures');
  const drawing = page.locator(`.react-flow__node[data-id="${drawingId}"]`);
  const picture = page.locator(`.react-flow__node[data-id="embedded:${drawingId}:${HARBOUR_ID}"]`);
  await expect(picture).toBeVisible();
  await expect(page.getByRole('button', { name: 'Spaces. 1 open.' })).toBeVisible();
  const edit = (await resourceControls(page, drawing)).getByRole('button', {
    name: 'Edit Resource Deep dive',
  });
  await edit.focus();
  await edit.press('Enter');
  const heldUrl = page.url();
  expect(await followFragment(page, 'embedded-image')).toBe(true);
  const fragmentUrl = page.url();
  const replace = (await resourceControls(page, picture)).getByRole('button', {
    name: 'Replace image of Resource Harbour',
  });
  await replace.focus();
  await replace.press('Enter');
  const target = picture.getByRole('group', { name: 'Replace image of Harbour' });
  const release = await uploadHeld(page, target);
  const beforeDrag = await boxOf(picture, 'the busy embedded picture');
  const parentBeforeDrag = await boxOf(drawing, 'the containing Space Resource');
  await page.mouse.move(beforeDrag.x + 5, beforeDrag.y + 5);
  await page.mouse.down();
  await page.mouse.move(beforeDrag.x + 45, beforeDrag.y + 25, { steps: 5 });
  await page.mouse.up();
  const afterDrag = await boxOf(picture, 'the busy embedded picture');
  const parentAfterDrag = await boxOf(drawing, 'the containing Space Resource');
  expect(afterDrag.x - parentAfterDrag.x).toBeCloseTo(beforeDrag.x - parentBeforeDrag.x);
  expect(afterDrag.y - parentAfterDrag.y).toBeCloseTo(beforeDrag.y - parentBeforeDrag.y);

  const afterBack = await traverseCounting(page, -1);
  await expect.poll(afterBack).toEqual({ pops: 2, url: fragmentUrl });
  await expect(target).toHaveAttribute('aria-busy', 'true');
  release();
  await expect(target.getByRole('alert')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(heldUrl);
  const releaseAgain = await uploadHeld(page, target);
  const afterForward = await traverseCounting(page, 1);
  await expect.poll(afterForward).toEqual({ pops: 2, url: heldUrl });
  releaseAgain();
  await expect(target.getByRole('alert')).toBeVisible();
  await target.getByRole('textbox', { name: 'Image URL' }).fill(FIGURE_URL);
  await target.getByRole('textbox', { name: 'Image URL' }).press('Enter');
  await expect(picture.getByRole('img', { name: 'Harbour' })).toHaveAttribute('src', FIGURE_URL);
  await expect
    .poll(async () => {
      const result = await page.request.get(`/api/spaces/${DEEP_DIVE_ID}`);
      return decodeLoadedSpace(await result.json()).snapshot.resources.find(
        ({ id }) => id === HARBOUR_ID,
      )?.document;
    })
    .toMatchObject({ kind: 'image', url: FIGURE_URL });
  await expect(page.getByRole('button', { name: 'Spaces. 1 open.' })).toBeVisible();
});

test('drop and paste create in an edited embedded Map and an inert drop is refused', async ({
  page,
}) => {
  await serveFigure(page);
  const rootId = await openForCreation(page);
  await createResource(page, 'Space Resource');
  const naming = page.getByRole('textbox', { name: 'Resource title' });
  const title = await naming.inputValue();
  await naming.press('Enter');
  await settled(page);
  const rootRead = await page.request.get(`/api/spaces/${rootId}`);
  const frame = decodeLoadedSpace(await rootRead.json()).snapshot.resources.find(
    ({ document }) => document.kind === 'space' && document.title === title,
  );
  if (frame?.document.kind !== 'space') throw new Error('Space Resource was not created');
  const targetId = frame.document.spaceId;
  const drawing = page.locator(`.react-flow__node[data-id="${frame.id}"]`);
  await drawing.focus();
  await drawing.press('Enter');
  const child = page.locator(`.react-flow__node[data-id^="embedded:${frame.id}:"]`).first();
  await expect(child).toBeVisible();
  expect(await dropPictureOn(child, FIRST_PICTURE)).toEqual({ taken: true, dropEffect: 'none' });
  await expect(page.getByTestId('canvas-command-refusal')).toHaveText(
    'Edit this Map before adding Resources.',
  );
  expect(await storedImages(page, targetId)).toHaveLength(0);
  const edit = (await resourceControls(page, drawing)).getByRole('button', {
    name: `Edit Resource ${title}`,
  });
  await edit.focus();
  await edit.press('Enter');
  await expect(child.locator('.rf-resource-node__inner')).toHaveAttribute(
    'data-connection-authoring',
    'true',
  );
  expect((await dropPictureOn(child, FIRST_PICTURE)).taken).toBe(true);
  const createdTitle = page.getByRole('textbox', { name: 'Resource title' });
  await expect(createdTitle).toBeFocused();
  await expect(
    createdTitle.locator('xpath=ancestor::*[contains(@class,"react-flow__node")][1]'),
  ).toHaveAttribute('data-id', /^embedded:/);
  await createdTitle.press('Escape');
  await expect.poll(async () => (await storedImages(page, targetId)).length).toBe(1);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((url) => navigator.clipboard.writeText(url), FIGURE_URL);
  await child.focus();
  const box = await boxOf(child, 'the embedded Resource');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press('ControlOrMeta+V');
  await expect(createdTitle).toBeFocused();
  await createdTitle.press('Escape');
  await expect.poll(async () => (await storedImages(page, targetId)).length).toBe(2);
  expect(await storedImages(page, rootId)).toHaveLength(0);
});

/** Create a Space Resource on the opened Space's Map and Open it, answering it and its target. */
async function openSpaceResource(
  page: Page,
  rootId: UUID,
): Promise<{
  readonly drawing: Locator;
  readonly id: UUID;
  readonly title: string;
  readonly targetId: UUID;
}> {
  await createResource(page, 'Space Resource');
  const naming = page.getByRole('textbox', { name: 'Resource title' });
  const title = await naming.inputValue();
  await naming.press('Enter');
  await settled(page);
  const rootRead = await page.request.get(`/api/spaces/${rootId}`);
  const frame = decodeLoadedSpace(await rootRead.json()).snapshot.resources.find(
    ({ document }) => document.kind === 'space' && document.title === title,
  );
  if (frame?.document.kind !== 'space') throw new Error('Space Resource was not created');
  const drawing = page.locator(`.react-flow__node[data-id="${frame.id}"]`);
  await drawing.focus();
  await drawing.press('Enter');
  await expect(
    page.locator(`.react-flow__node[data-id^="embedded:${frame.id}:"]`).first(),
  ).toBeVisible();
  return { drawing, id: frame.id, title, targetId: frame.document.spaceId };
}

test('a drop on the Map a Reference Resource draws is refused as read-only', async ({ page }) => {
  const rootId = await openForCreation(page);
  const { drawing, id, title, targetId } = await openSpaceResource(page, rootId);
  await (
    await resourceControls(page, drawing)
  )
    .getByRole('button', { name: `Actions for Resource ${title}` })
    .click();
  await page.getByRole('menuitem', { name: 'Create Reference' }).click();
  const naming = page.getByRole('textbox', { name: 'Resource title' });
  await expect(naming).toBeFocused();
  await naming.press('Enter');
  await settled(page);
  const rootRead = await page.request.get(`/api/spaces/${rootId}`);
  const reference = decodeLoadedSpace(await rootRead.json()).snapshot.resources.find(
    ({ document }) => document.kind === 'reference' && document.target === id,
  );
  if (reference === undefined) throw new Error('Reference Resource was not created');
  const referenceNode = page.locator(`.react-flow__node[data-id="${reference.id}"]`);
  await referenceNode.focus();
  await referenceNode.press('Enter');
  const child = page.locator(`.react-flow__node[data-id^="embedded:${reference.id}:"]`).first();
  await expect(child).toBeVisible();

  expect(await dropPictureOn(child, FIRST_PICTURE)).toEqual({ taken: true, dropEffect: 'none' });
  await expect(page.getByTestId('canvas-command-refusal')).toHaveText(
    'This Map is shown read-only, so nothing can be added to it.',
  );
  expect(await storedImages(page, targetId)).toHaveLength(0);
});

test('a Resource dragged from the Resources list onto an edited drawn Map is refused', async ({
  page,
}) => {
  const rootId = await openForCreation(page);
  const { drawing, title, targetId } = await openSpaceResource(page, rootId);
  const edit = (await resourceControls(page, drawing)).getByRole('button', {
    name: `Edit Resource ${title}`,
  });
  await edit.focus();
  await edit.press('Enter');
  const child = page.locator(`.react-flow__node[data-id^="embedded:"]`).first();
  await expect(child.locator('.rf-resource-node__inner')).toHaveAttribute(
    'data-connection-authoring',
    'true',
  );
  const before = await storedRevision(page, targetId);
  const rootRead = await page.request.get(`/api/spaces/${rootId}`);
  const canvasResource = decodeLoadedSpace(await rootRead.json()).snapshot.resources.find(
    ({ document }) => document.kind === 'markdown',
  );
  if (canvasResource === undefined) throw new Error('The opened Space holds no Markdown Resource.');

  // The Resources list carries one of the canvas's own Resources, which no Map
  // of another Space can place.
  await child.evaluate((element, resourceId) => {
    const transfer = new DataTransfer();
    transfer.setData('application/x-hyper-resource-id', resourceId);
    const box = element.getBoundingClientRect();
    const init = {
      dataTransfer: transfer,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
      bubbles: true,
      cancelable: true,
    };
    element.dispatchEvent(new DragEvent('dragover', init));
    element.dispatchEvent(new DragEvent('drop', init));
  }, canvasResource.id);

  await expect(page.getByTestId('canvas-command-refusal')).toHaveText(
    'A Resource can be placed only on a Map of its own Space.',
  );
  await settled(page);
  expect(await storedRevision(page, targetId)).toBe(before);
});
