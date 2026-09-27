import { expect, type Locator } from '@playwright/test';
import { boxOf } from './graph';

/**
 * Reading an Image Resource's picture, shared by the application proofs in
 * `image-resource.spec` and the story proofs in `ladle-e2e/resource-open.spec`.
 */

/** The tracked picture both proofs draw, whose natural size is 400×300. */
export const HARBOUR_SIZE = { width: 400, height: 300 } as const;

/**
 * Wait until the picture has loaded and has the natural width given. An `<img>`
 * that is absent from the DOM, still loading or broken reads as zero, so this
 * fails unless the picture's own bytes were decoded.
 */
export async function expectPictureLoaded(picture: Locator, naturalWidth: number): Promise<void> {
  await expect
    .poll(() =>
      picture.evaluate((image) =>
        image instanceof HTMLImageElement && image.complete ? image.naturalWidth : 0,
      ),
    )
    .toBe(naturalWidth);
}

/**
 * The picture fills an Open Resource's content area at its own size, above the
 * Title footer. `zoom` is screen pixels per canvas unit; the height allows the
 * subpixel rounding of the content area's layout.
 */
export async function expectPictureAtOwnSize(
  resource: Locator,
  picture: Locator,
  natural: { readonly width: number; readonly height: number },
  zoom = 1,
): Promise<void> {
  const pictureBox = await boxOf(picture, 'the picture');
  const titleBox = await boxOf(resource.locator('.canvas-resource__body'), 'the Title footer');
  expect(pictureBox.width / zoom).toBeCloseTo(natural.width, 0);
  expect(pictureBox.height / zoom).toBeGreaterThanOrEqual(natural.height - 0.5);
  expect(pictureBox.height / zoom).toBeLessThanOrEqual(natural.height + 1);
  expect(pictureBox.y + pictureBox.height).toBeLessThanOrEqual(titleBox.y + 1);
}
