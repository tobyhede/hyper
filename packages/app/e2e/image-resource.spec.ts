// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// gate that fails a test if React Flow logged a warning while it ran.
import { encodeCompactUuid, uuidSchema } from '@project/core';
import { expect, test } from './fixtures';
import { boxOf, selectedCanvas, settled } from './graph';
import { seedPositionedMap } from './seed';

const IMAGE_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a1');

/**
 * A Closed Image Resource looks like any Resource (ADR 0106): its Title and its
 * kind glyph, at the one Closed size, and no thumbnail — the picture is not
 * fetched until the Resource Opens.
 *
 * No gesture creates an Image Resource yet, so it joins the opened Space through
 * the same HTTP commit the browser makes, beside a Markdown Resource it is
 * measured against.
 */
test(
  'a Closed Image Resource draws its Title and kind at the Closed size, and no picture',
  { tag: '@parity:image-resource-closed-front-draws-title-and-kind' },
  async ({ page }) => {
    const pictureRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('figure.png')) pictureRequests.push(request.url());
    });
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
            url: 'https://example.com/figure.png',
            naturalSize: { width: 640, height: 480 },
          },
        },
      ],
    );
    await page.goto(`/spaces/${encodeCompactUuid(seeded.snapshot.id)}`);
    await expect(selectedCanvas(page)).toContainText('Pictures');
    await settled(page);

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
