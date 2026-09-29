// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// gate that fails a test if React Flow logged a warning while it ran.
import { readFileSync } from 'node:fs';
import {
  COLLAPSED_RESOURCE_SIZE,
  encodeCompactUuid,
  OPEN_RESOURCE_CHROME,
  uuidSchema,
  type UUID,
} from '@project/core';
import { decodeLoadedSpace } from '@project/persistence';
import { expect, test, type Locator, type Page } from './fixtures';
import {
  activeResource,
  boxOf,
  createResource,
  openResource,
  presentControl,
  resourceControls,
  selectedCanvas,
  selectCanvas,
  newMap,
  settled,
} from './graph';
import { expectPictureLoaded, HARBOUR_SIZE } from './image';
import { SEEDED_MAP_ID, seedPositionedMap } from './seed';

const IMAGE_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a1');
const DEEP_DIVE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000070');
const HARBOUR_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000076');
const FIGURE_URL = 'https://example.com/figure.png';
/**
 * The tracked fixture's 400×300 picture, served in place of the external URL so
 * nothing reaches the network.
 */
const HARBOUR = readFileSync(new URL('../fixture-images/harbour-400x300.png', import.meta.url));

interface Pictures {
  /** The Image Resource's Title. */
  readonly title?: string;
  /** Give the seeded Graph an Edge from the Image Resource to itself, so presenting starts there. */
  readonly presentable?: boolean;
  /** The picture's recorded natural size, which its first Open is sized by. */
  readonly naturalSize?: { readonly width: number; readonly height: number };
}

/**
 * Open a Space holding one Markdown Resource and a Closed Image Resource beside
 * it, whose recorded natural size is 400×300. It joins through the same HTTP
 * commit the browser makes, so its natural size is one no gesture measured.
 */
async function openPictures(
  page: Page,
  { title = 'Figure', presentable = false, naturalSize = HARBOUR_SIZE }: Pictures = {},
): Promise<UUID> {
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
    await expectPictureLoaded(picture, HARBOUR_SIZE.width);
    await expect(resource.locator('.canvas-resource__content img')).toHaveCount(1);
    await expect(resource.getByRole('heading', { name: 'Figure' })).toBeVisible();

    await settled(page);
    const { authored, room, natural, bottom } = await pictureIn(node, picture);
    expect(natural).toEqual(HARBOUR_SIZE);
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
  await expectPictureLoaded(picture, HARBOUR_SIZE.width);
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
 * browser answers by opening the file in place of the Space.
 */
async function dropPictureOn(
  target: Locator,
  picture: (typeof PICTURES)[number],
): Promise<{ readonly taken: boolean; readonly dropEffect: string }> {
  return target.evaluate((element, { name, base64 }) => {
    const transfer = new DataTransfer();
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    transfer.items.add(new File([bytes], name, { type: 'image/png' }));
    const box = element.getBoundingClientRect();
    const init = {
      dataTransfer: transfer,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
      bubbles: true,
      cancelable: true,
    };
    const over = new DragEvent('dragover', init);
    element.dispatchEvent(over);
    const answer = { taken: over.defaultPrevented, dropEffect: transfer.dropEffect };
    element.dispatchEvent(new DragEvent('drop', init));
    return answer;
  }, picture);
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
  // taken would already have started storing its picture.
  const [, square] = PICTURES;
  await dropPictureOn(pane(page), square);
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
  'a 64×64 picture Opens at the minimum Open Size, where the upload target keeps its controls and refusal in view and still replaces',
  { tag: '@parity:image-resource-replace-fits-the-minimum-open-size' },
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
    expect(maps?.[0]?.positions[IMAGE_ID]).toMatchObject({
      open: true,
      openSize: COLLAPSED_RESOURCE_SIZE,
    });
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
    // Placement, Open Size and Edges are the Map's, and the Map is untouched.
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
      await expect(selectedCanvas(page)).toBeDisabled();
      await page.clock.fastForward(120_000);
    }
    await expect(target.getByRole('alert')).toContainText('This image was not replaced:');
    await expect(selectedCanvas(page)).toBeEnabled();
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
async function uploadHeld(page: Page, target: Locator): Promise<() => void> {
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
  await (
    await chooser
  ).setFiles({
    // Declared a PNG, so it is sent, and refused by the host from its bytes.
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a picture'),
  });
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
    await expect(selectedCanvas(page)).toBeDisabled();
    // The Dock's four menu buttons are drawn unavailable by `aria-disabled`,
    // which Playwright's `toBeDisabled` would also accept from a fieldset.
    const dockBar = page.getByRole('toolbar', { name: 'Command Dock' }).filter({ visible: true });
    const menuButtons = [
      dockBar.getByTestId('space-title'),
      selectedCanvas(page),
      dockBar.getByTestId('active-graph'),
      dockBar.getByRole('button', { name: /^Spaces\./ }),
    ];
    for (const control of menuButtons) {
      await expect(control).toHaveAttribute('aria-disabled', 'true');
      await control.click({ force: true, delay: 120 });
      await expect(page.getByRole('menu')).toHaveCount(0);
    }
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
    await expect(selectedCanvas(page)).toBeEnabled();
    for (const control of menuButtons) {
      await expect(control).not.toHaveAttribute('aria-disabled', 'true');
    }
    await page.goBack();
    await expect(page).toHaveURL(previousUrl);
    await expect(selectedCanvas(page)).toHaveText('Elsewhere');
    await page.goForward();
    await expect(selectedCanvas(page)).toHaveText('Pictures');
  },
);

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
