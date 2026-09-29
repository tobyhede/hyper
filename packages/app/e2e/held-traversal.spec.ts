// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// gate that fails a test if React Flow logged a warning while it ran.
import { readFileSync } from 'node:fs';
import { encodeCompactUuid, uuidSchema } from '@project/core';
import { expect, test, type Page } from './fixtures';
import { newMap, resourceControls, selectCanvas, selectedCanvas, settled } from './graph';
import { HARBOUR_SIZE } from './image';
import { seedPositionedMap } from './seed';

const IMAGE_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a1');
const FIGURE_URL = 'https://example.com/figure.png';
const HARBOUR = readFileSync(new URL('../fixture-images/harbour-400x300.png', import.meta.url));

/** Open a Space holding a Closed Image Resource on the Map `Pictures`, and a second Map `Elsewhere`. */
async function openPicturesAndElsewhere(page: Page): Promise<void> {
  await page.route(FIGURE_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: HARBOUR }),
  );
  const seeded = await seedPositionedMap(
    page,
    'Pictures',
    () => ({ [IMAGE_ID]: { x: 400, y: 0, open: false } }),
    [
      {
        id: IMAGE_ID,
        document: { title: 'Figure', kind: 'image', url: FIGURE_URL, naturalSize: HARBOUR_SIZE },
      },
    ],
  );
  await page.goto(`/spaces/${encodeCompactUuid(seeded.snapshot.id)}`);
  await expect(selectedCanvas(page)).toContainText('Pictures');
  await settled(page);
  await newMap(page);
  const mapName = page.getByRole('textbox', { name: 'Map name' });
  await mapName.fill('Elsewhere');
  await mapName.press('Enter');
}

/**
 * Begin replacing the Image Resource's picture with a file, and hold the host's
 * answer so the replacement stays in flight and refuses every traversal.
 */
async function holdReplacement(page: Page): Promise<void> {
  const node = page.locator(`.react-flow__node[data-id="${IMAGE_ID}"]`);
  const controls = await resourceControls(page, node);
  await controls.getByRole('button', { name: 'Replace image of Resource Figure' }).click();
  const target = node.getByRole('group', { name: 'Replace image of Figure' });
  await expect(target).toBeVisible();
  await settled(page);
  const never = Promise.withResolvers<undefined>();
  await page.route(
    (url) => url.pathname === '/images',
    async (route) => {
      await never.promise;
      await route.continue();
    },
  );
  const chooser = page.waitForEvent('filechooser');
  await target.getByRole('button', { name: 'Upload' }).click();
  await (
    await chooser
  ).setFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') });
  await expect(target).toHaveAttribute('aria-busy', 'true');
}

/**
 * Before the application listens, listen for `popstate` so that each arrival
 * issues the reader's next planned traversal ahead of any return the
 * application issues from the same arrival, and record where each arrived.
 */
const traverseAheadOfTheApplication = (page: Page) =>
  page.addInitScript(() => {
    window.addEventListener('popstate', () => {
      const { dataset } = document.documentElement;
      const at = String(window.navigation.currentEntry?.index);
      dataset['trail'] = dataset['trail'] === undefined ? at : `${dataset['trail']} ${at}`;
      const [next, ...rest] = (dataset['plan'] ?? '').split(' ').filter(Boolean);
      dataset['plan'] = rest.join(' ');
      if (next !== undefined) window.history.go(Number(next));
    });
  });

test('a held traversal returns to the entry it left when the reader jumps on from each arrival', async ({
  page,
}) => {
  await traverseAheadOfTheApplication(page);
  await openPicturesAndElsewhere(page);
  for (const title of ['Pictures', 'Elsewhere', 'Pictures', 'Elsewhere', 'Pictures']) {
    await selectCanvas(page, title);
  }
  await page.goBack();
  await expect(selectedCanvas(page)).toHaveText('Elsewhere');
  await page.goBack();
  await expect(selectedCanvas(page)).toHaveText('Pictures');
  const heldUrl = page.url();
  await holdReplacement(page);

  // The application's six entries follow the page's first, and the reader
  // stands on the fourth. The reader jumps to the last, and from each of the
  // next two arrivals to the application's first entry and then two on, each
  // ahead of the return the application issues from that arrival. A relative
  // return from the first entry is then pushed past the last by the jump
  // queued ahead of it, and the browser drops it.
  const start = await page.evaluate(() => {
    const { dataset } = document.documentElement;
    delete dataset['trail'];
    dataset['plan'] = '-5 2';
    const entries = window.navigation.entries().length;
    const held = window.navigation.currentEntry?.index;
    window.history.go(2);
    return { entries, held };
  });
  expect(start).toEqual({ entries: 6, held: 3 });

  const where = () =>
    page.evaluate(() => ({
      trail: document.documentElement.dataset['trail'],
      at: window.navigation.currentEntry?.index,
      url: window.location.href,
    }));
  // Each of the reader's arrivals is refused, and each return lands on the held entry.
  const returned = { trail: '5 0 3 5 3', at: 3, url: heldUrl };
  await expect.poll(where).toEqual(returned);
  await settled(page);
  expect(await where()).toEqual(returned);
  await expect(selectedCanvas(page)).toHaveText('Pictures');
});
