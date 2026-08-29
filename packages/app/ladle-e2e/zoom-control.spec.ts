import { expect, test, type Page } from '@playwright/test';

const story = (name: string): string => `/?story=${name}&mode=preview`;

const viewportZoom = (page: Page): Promise<number> =>
  page.locator('.react-flow__viewport').evaluate((viewport) => {
    const match = /scale\(([\d.]+)\)/.exec(viewport.getAttribute('style') ?? '');
    return Number(match?.[1] ?? Number.NaN);
  });

/**
 * The zoom once the camera has stopped moving.
 *
 * Every control here animates over `CAMERA_MOVE_DURATION`, so a single read can
 * land mid-flight. Two matching reads in a row is the cheapest proof it has
 * settled, and it needs no knowledge of the duration.
 */
const stableZoom = async (page: Page): Promise<number> => {
  let previous = Number.NaN;
  await expect
    .poll(async () => {
      const current = await viewportZoom(page);
      const settledHere = current === previous;
      previous = current;
      return settledHere;
    })
    .toBe(true);
  return previous;
};

test(
  'the themed zoom control operates the real canvas viewport',
  { tag: '@parity:canvas-zoom-control-operates-the-real-viewport' },
  async ({ page }) => {
    await page.goto(story('components--zoom-control--canvas'));
    await expect(page.locator('.react-flow__viewport')).toBeVisible();

    const zoomOut = page.getByRole('button', { name: 'Zoom out' });
    const zoomIn = page.getByRole('button', { name: 'Zoom in' });
    const zoomSlider = page.getByRole('slider', { name: 'Zoom' });
    const fitView = page.getByRole('button', { name: 'Fit view' });
    await expect(zoomOut).toBeVisible();
    await expect(zoomIn).toBeVisible();
    await expect(fitView).toBeVisible();

    const opening = await viewportZoom(page);
    await zoomSlider.press('ArrowRight');
    await expect.poll(() => viewportZoom(page)).toBeGreaterThan(opening);
    const sliderZoom = await viewportZoom(page);

    await zoomOut.click();
    await expect.poll(() => viewportZoom(page)).toBeLessThan(sliderZoom);
    const zoomedOut = await viewportZoom(page);

    await zoomIn.click();
    await expect.poll(() => viewportZoom(page)).toBeGreaterThan(zoomedOut);

    // Fit view frames the Cards, so what it owes is one framing reached from
    // either side — not a direction. A direction held only by arithmetic
    // accident here: the fit zoom sits inside the range these clicks walk
    // through, so a run ending just below it read as a zoom *out*, and the
    // opening zoom is a different fit again (the camera's own overview options).
    await fitView.click();
    const fitted = await stableZoom(page);

    await zoomIn.click();
    await expect.poll(() => viewportZoom(page)).toBeGreaterThan(fitted);

    await fitView.click();
    await expect.poll(() => viewportZoom(page)).toBeCloseTo(fitted, 2);
  },
);
