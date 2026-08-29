import { expect, test, type Page } from './fixtures';
import { nodeByTitle, settled } from './graph';

const viewportZoom = (page: Page): Promise<number> =>
  page.locator('.react-flow__viewport').evaluate((viewport) => {
    const match = /scale\(([\d.]+)\)/.exec(viewport.getAttribute('style') ?? '');
    return Number(match?.[1] ?? Number.NaN);
  });

test(
  'the themed zoom control operates the application canvas viewport',
  { tag: '@parity:canvas-zoom-control-operates-the-real-viewport' },
  async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'Card 1')).toBeVisible();
    await settled(page);

    const zoomOut = page.getByRole('button', { name: 'Zoom out' });
    const zoomIn = page.getByRole('button', { name: 'Zoom in' });
    const zoomSlider = page.getByRole('slider', { name: 'Zoom' });
    const fitView = page.getByRole('button', { name: 'Fit view' });
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
