import { expect, test, type Page } from '@playwright/test';

const story = (name: string): string => `/?story=${name}&mode=preview`;

const viewportZoom = (page: Page): Promise<number> =>
  page.locator('.react-flow__viewport').evaluate((viewport) => {
    const match = /scale\(([\d.]+)\)/.exec(viewport.getAttribute('style') ?? '');
    return Number(match?.[1] ?? Number.NaN);
  });

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

    const beforeSecondZoomOut = await viewportZoom(page);
    await zoomOut.click();
    await expect.poll(() => viewportZoom(page)).toBeLessThan(beforeSecondZoomOut);
    const beforeFit = await viewportZoom(page);
    await fitView.click();
    await expect.poll(() => viewportZoom(page)).toBeGreaterThan(beforeFit);
  },
);
