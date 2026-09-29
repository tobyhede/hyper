import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { nodeByTitle, resourceControls, selectedCanvas } from '../e2e/graph';

/**
 * Replacing an image over the production application: the story's Space holds
 * a Closed Image Resource, Figure, and an Open one, Missing, whose picture never
 * resolves.
 */

const story = '/?story=space--replace-image--default&mode=preview';
const FIGURE_URL = 'https://example.com/figure.png';
const THUMBNAIL_URL = 'https://example.com/thumbnail.png';
const NEW_URL = 'https://example.com/replacement.png';
const STORED_URL = '/images/LXEWQrcmsEQBYnyp-6wy9chTD7GQPMTbAiWHF5IaSIE';
const HARBOUR = readFileSync(new URL('../fixture-images/harbour-400x300.png', import.meta.url));

const open = async (page: Page): Promise<void> => {
  for (const url of [FIGURE_URL, THUMBNAIL_URL, NEW_URL, `**${STORED_URL}`]) {
    await page.route(url, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: HARBOUR }),
    );
  }
  await page.goto(story);
  await expect(nodeByTitle(page, 'Figure')).toBeVisible();
};

/** Begin replacing a Resource's image from its toolbar, answering its controls and target. */
const beginReplacing = async (page: Page, title: string) => {
  const node = nodeByTitle(page, title).first();
  const controls = await resourceControls(page, node);
  await controls.getByRole('button', { name: `Replace image of Resource ${title}` }).click();
  const resource = node.getByRole('article', { name: title });
  const target = resource.getByRole('group', { name: `Replace image of ${title}` });
  await expect(target).toBeVisible();
  return { controls, resource, target };
};

test(
  'Replace opens a Closed Image Resource, and a URL then a chosen file each replace its picture in one Edit',
  {
    tag: [
      '@parity:image-resource-replace-from-the-upload-target',
      '@parity:image-resource-replace-holds-navigation',
    ],
  },
  async ({ page }) => {
    await open(page);

    const { controls, resource, target } = await beginReplacing(page, 'Figure');
    await expect(resource).toHaveAttribute('data-open', 'true');
    await expect(target.getByRole('button', { name: 'Upload' })).toBeFocused();
    await page
      .locator('.react-flow__pane:visible')
      .first()
      .click({ position: { x: 20, y: 200 } });
    await expect(nodeByTitle(page, 'Figure')).not.toHaveClass(/selected/);
    await expect(
      controls.getByRole('button', { name: 'Cancel editing Resource Figure' }),
    ).toBeVisible();
    await expect(controls.getByRole('button', { name: 'Close Resource Figure' })).toBeDisabled();
    const revision = page.getByTestId('replacement-revision');
    await expect(revision).toHaveAttribute('data-persistence', 'settled');
    const before = BigInt(await revision.innerText());

    const field = target.getByRole('textbox', { name: 'Image URL' });
    await field.fill(NEW_URL);
    await field.press('Enter');

    await expect(target).toHaveCount(0);
    await expect(resource.getByRole('img', { name: 'Figure' })).toHaveAttribute('src', NEW_URL);
    await expect(resource.getByRole('heading', { name: 'Figure' })).toBeVisible();
    await expect(nodeByTitle(page, 'Figure')).toBeFocused();
    await expect(revision).toHaveText((before + 1n).toString());
    await expect(revision).toHaveAttribute('data-persistence', 'settled');
    await expect(revision).toHaveAttribute('data-url', NEW_URL);

    const next = await beginReplacing(page, 'Figure');
    await page.clock.install({ time: new Date('2026-09-29T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-09-29T00:00:01Z'));
    const chooser = page.waitForEvent('filechooser');
    await next.target.getByRole('button', { name: 'Upload' }).click();
    await (await chooser).setFiles({ name: 'harbour.png', mimeType: 'image/png', buffer: HARBOUR });
    await expect(next.target).toHaveAttribute('aria-busy', 'true');
    await expect(selectedCanvas(page)).toBeDisabled();
    await expect(next.target.getByRole('button', { name: 'Upload' })).toBeDisabled();
    await page.clock.runFor(1000);

    await expect(next.target).toHaveCount(0);
    await expect(selectedCanvas(page)).toBeEnabled();
    const picture = next.resource.getByRole('img', { name: 'Figure' });
    await expect(picture).toHaveAttribute('src', STORED_URL);
    await expect
      .poll(() => picture.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBe(400);
    await expect(next.resource.getByRole('heading', { name: 'Figure' })).toBeVisible();
    // Replaced from a selected Resource, the caret returns to the Replace that began it.
    await expect(
      next.controls.getByRole('button', { name: 'Replace image of Resource Figure' }),
    ).toBeFocused();
    await expect(revision).toHaveText((before + 2n).toString());
    await expect(revision).toHaveAttribute('data-persistence', 'settled');
    await expect(revision).toHaveAttribute('data-url', STORED_URL);
  },
);

test(
  'a refused URL, a dropped non-image or multiple dropped images are said in the upload target, which stays up',
  { tag: '@parity:image-resource-replace-refuses-in-the-target' },
  async ({ page }) => {
    await open(page);
    const { resource, target } = await beginReplacing(page, 'Figure');
    const revision = page.getByTestId('replacement-revision');
    await expect(revision).toHaveAttribute('data-persistence', 'settled');
    const before = await revision.innerText();

    const field = target.getByRole('textbox', { name: 'Image URL' });
    await field.fill('data:image/png;base64,AAAA');
    await field.press('Enter');
    await expect(target.getByRole('alert')).toHaveText(
      'An image URL must start with https: or http:.',
    );
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    // The caret stays where the author submitted from, so the next keystroke
    // corrects the URL and Escape still reaches the target.
    await expect(field).toBeFocused();

    const upload = target.getByRole('button', { name: 'Upload' });
    const chooser = page.waitForEvent('filechooser');
    await upload.click();
    await (
      await chooser
    ).setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') });
    await expect(target.getByRole('alert')).toHaveText(
      'notes.txt is not a PNG, JPEG, WebP or GIF image.',
    );
    await expect(upload).toBeFocused();

    await target.evaluate((element) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['not a picture'], 'notes.txt', { type: 'text/plain' }));
      const init = { dataTransfer: transfer, bubbles: true, cancelable: true };
      element.dispatchEvent(new DragEvent('dragover', init));
      element.dispatchEvent(new DragEvent('drop', init));
    });
    await expect(target.getByRole('alert')).toHaveText(
      'notes.txt is not a PNG, JPEG, WebP or GIF image.',
    );
    await expect(target).toBeVisible();

    await target.evaluate((element, base64) => {
      const transfer = new DataTransfer();
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      for (const name of ['first.png', 'second.png']) {
        transfer.items.add(new File([bytes], name, { type: 'image/png' }));
      }
      const init = { dataTransfer: transfer, bubbles: true, cancelable: true };
      element.dispatchEvent(new DragEvent('dragover', init));
      element.dispatchEvent(new DragEvent('drop', init));
    }, HARBOUR.toString('base64'));
    await expect(target.getByRole('alert')).toHaveText('Use one image at a time.');
    await expect(target).toBeVisible();
    await expect(revision).toHaveText(before);
    await expect(revision).toHaveAttribute('data-persistence', 'settled');
    await expect(revision).toHaveAttribute('data-url', FIGURE_URL);

    await expect(upload).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(target).toHaveCount(0);
    await expect(resource.getByRole('img', { name: 'Figure' })).toHaveAttribute('src', FIGURE_URL);
  },
);

test(
  'the failed-image state offers Replace, which shows the same upload target',
  { tag: '@parity:image-resource-failed-state-offers-replace' },
  async ({ page }) => {
    await open(page);
    const resource = nodeByTitle(page, 'Missing').getByRole('article', { name: 'Missing' });
    await expect(nodeByTitle(page, 'Missing')).not.toHaveClass(/selected/);
    await expect(resource.getByText('Image did not load')).toBeVisible();

    await resource.getByRole('button', { name: 'Replace image' }).click();

    const target = resource.getByRole('group', { name: 'Replace image of Missing' });
    await expect(target).toBeVisible();
    await expect(target.getByRole('button', { name: 'Upload' })).toBeVisible();
    await expect(target.getByRole('textbox', { name: 'Image URL' })).toBeVisible();
    const cancel = page.getByRole('button', {
      name: 'Cancel editing Resource Missing',
      exact: true,
    });
    await expect(cancel).toBeVisible();
    await cancel.click();
    await expect(target).toHaveCount(0);
  },
);

/** Every part of `part` is drawn inside the content area it belongs to, which clips nothing it holds. */
const expectWithin = async (part: Locator, content: Locator): Promise<void> => {
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
};

test(
  'at the minimum Open Size the upload target keeps Upload, the URL field and a refusal inside the content area',
  { tag: '@parity:image-resource-replace-fits-the-minimum-open-size' },
  async ({ page }) => {
    await open(page);
    const { resource, target } = await beginReplacing(page, 'Thumbnail');
    // A 64×64 picture first Opens at the Closed size, which is the minimum Open Size.
    const node = nodeByTitle(page, 'Thumbnail').first();
    await expect(node).toHaveCSS('width', '260px');
    await expect(node).toHaveCSS('height', '146px');
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

    await field.fill(NEW_URL);
    await field.press('Enter');
    await expect(target).toHaveCount(0);
    await expect(resource.getByRole('img', { name: 'Thumbnail' })).toHaveAttribute('src', NEW_URL);
  },
);
