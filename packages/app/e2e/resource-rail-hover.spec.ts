import { expect, test, type Page } from './fixtures';
import {
  boxOf,
  nodeByTitle,
  resourceToolbar,
  selectResource,
  settled,
  viewportTransform,
} from './graph';

/**
 * A Resource's commands float in React Flow's `NodeToolbar`, outside the Resource,
 * drawn while it is the one selected Resource (ADR 0102). Hovering reveals the
 * Resource's Edge handles and nothing else.
 */

test(
  'Open and Close keep the Resource selected and its toolbar drawn, by pointer or keyboard',
  { tag: '@parity:resource-toolbar-survives-open-and-close' },
  async ({ page }) => {
    await page.goto('/');
    const resource = nodeByTitle(page, 'A');
    await expect(resource).toBeVisible();
    await settled(page);
    const toolbar = await resourceToolbar(page, resource);
    const actions = toolbar.getByTestId('canvas-resource-actions');
    const resize = resource.locator('.rf-resource-node__resize-control');
    await selectResource(resource);

    for (const operation of ['Open', 'Close']) {
      await toolbar.getByRole('button', { name: `${operation} Resource A`, exact: true }).click();
      await page.mouse.move(1, 1);
      await expect(resource).toHaveClass(/\bselected\b/);
      await expect(actions).toBeVisible();
      if (operation === 'Open') await expect(resize).toHaveCount(1);
      else await expect(resize).toHaveCount(0);
    }

    // The same toolbar from the keyboard: activation keeps focus on the command,
    // which swaps its name, across both transitions.
    const open = toolbar.getByRole('button', { name: 'Open Resource A', exact: true });
    await open.focus();
    await open.press('Enter');
    const close = toolbar.getByRole('button', { name: 'Close Resource A', exact: true });
    await expect(close).toBeFocused();
    await expect(resource).toHaveClass(/\bselected\b/);
    await expect(actions).toBeVisible();
    await expect(resize).toHaveCount(1);
    await close.press('Enter');
    await expect(open).toBeFocused();
    await expect(resource).toHaveClass(/\bselected\b/);
    await expect(actions).toBeVisible();
    await expect(resize).toHaveCount(0);
  },
);

test(
  'a Resource at rest draws no toolbar; selected, its commands end with Open, and its kind glyph stays at its top-right corner',
  { tag: '@parity:resource-toolbar-draws-on-selection-with-open-last' },
  async ({ page }) => {
    await page.goto('/');
    const resource = nodeByTitle(page, 'A');
    await expect(resource).toBeVisible();
    await settled(page);
    const toolbar = await resourceToolbar(page, resource);
    const glyph = resource.getByRole('img', { name: 'Markdown Resource', exact: true });

    await page.mouse.move(1, 1);
    await expect(toolbar).toHaveCount(0);
    await expect(glyph).toBeVisible();

    await selectResource(resource);
    const commands = toolbar.getByRole('toolbar', { name: 'Resource A', exact: true });
    await expect(commands).toBeVisible();
    const labels = await commands
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
    expect(labels.at(-1)).toBe('Open Resource A');
    await expect(commands.getByRole('img', { name: 'Markdown Resource' })).toHaveCount(0);

    // The glyph is the Resource's own, in the top-right quarter of its face.
    const face = await boxOf(resource.locator('.canvas-resource'), 'the Resource face');
    const mark = await boxOf(glyph, 'the kind glyph');
    expect(mark.x).toBeGreaterThan(face.x + face.width / 2);
    expect(mark.x + mark.width).toBeLessThanOrEqual(face.x + face.width);
    expect(mark.y).toBeGreaterThanOrEqual(face.y);
    expect(mark.y + mark.height).toBeLessThan(face.y + face.height / 2);
  },
);

test(
  "hovering a Resource reveals its Edge handles and no commands; selecting it draws them in React Flow's NodeToolbar",
  { tag: '@parity:canvas-resource-hover-reveals-handles-and-selection-draws-commands' },
  async ({ page }) => {
    await page.goto('/');
    const resource = nodeByTitle(page, 'A');
    await expect(resource).toBeVisible();
    await settled(page);
    const toolbar = await resourceToolbar(page, resource);
    const handle = resource.locator('.rf-resource-node__authoring-handle--source').first();

    await page.mouse.move(1, 1);
    await expect(handle).toHaveCSS('opacity', '0');
    await expect(toolbar).toHaveCount(0);

    await resource.hover();
    await expect(handle).toHaveCSS('opacity', '1');
    await expect(toolbar).toHaveCount(0);
    await expect(resource.getByTestId('canvas-resource-actions')).toHaveCount(0);

    await selectResource(resource);
    const commands = toolbar.getByTestId('canvas-resource-actions');
    await expect(commands).toBeVisible();
    // Drawn by React Flow's NodeToolbar, outside the Resource's own element.
    await expect(toolbar).toHaveClass(/\breact-flow__node-toolbar\b/);
    await expect(resource.getByTestId('canvas-resource-actions')).toHaveCount(0);
  },
);

/** The canvas's zoom, read off React Flow's viewport transform. */
async function zoomOf(page: Page): Promise<number> {
  const transform = await viewportTransform(page);
  const scale = /scale\(([^)]+)\)/.exec(transform)?.[1];
  if (scale === undefined) throw new Error(`No scale in the viewport transform: ${transform}`);
  return Number.parseFloat(scale);
}

/** Press a Dock zoom control and wait for the canvas to reach its new zoom. */
async function zoom(page: Page, control: 'Zoom in' | 'Zoom out'): Promise<void> {
  const before = await viewportTransform(page);
  await page.getByRole('button', { name: control }).click();
  await expect.poll(() => viewportTransform(page)).not.toBe(before);
  await settled(page);
}

/**
 * Where the toolbar is drawn: above the Resource's top-right corner, outside the
 * Resource, clear of its top anchor, and at the Command Dock's 28px control size
 * whatever the canvas's zoom (ADR 0102). Read Closed, Open, zoomed out and zoomed
 * in, because each changes either the Resource's rect or the canvas's scale.
 */
test('the toolbar floats above its Resource’s top-right corner at a constant size', async ({
  page,
}) => {
  await page.goto('/');
  const resource = nodeByTitle(page, 'A');
  await expect(resource).toBeVisible();
  await settled(page);
  const toolbar = await resourceToolbar(page, resource);
  const commands = toolbar.getByTestId('canvas-resource-actions');
  await selectResource(resource);

  const floats = async (): Promise<void> => {
    const face = await boxOf(resource, 'the Resource');
    const strip = await boxOf(commands, 'the toolbar');
    const anchor = await boxOf(
      resource.locator('[data-handleid="authoring-source-top"]'),
      'the top anchor',
    );
    // Outside the Resource, above it and above its top anchor.
    expect(strip.y + strip.height).toBeLessThanOrEqual(face.y);
    expect(strip.y + strip.height).toBeLessThanOrEqual(anchor.y);
    // Aligned to the Resource's right edge.
    expect(strip.x + strip.width).toBeCloseTo(face.x + face.width, 0);
    // Every control at the Dock's size, on screen, whatever the zoom.
    const sizes = await commands.getByRole('button').evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return `${Math.round(box.width)}x${Math.round(box.height)}`;
      }),
    );
    expect(sizes.length).toBeGreaterThan(0);
    expect(new Set(sizes)).toEqual(new Set(['28x28']));
  };

  await floats();

  await toolbar.getByRole('button', { name: 'Open Resource A', exact: true }).click();
  await settled(page);
  await floats();

  await zoom(page, 'Zoom out');
  expect(await zoomOf(page)).toBeLessThan(1);
  await floats();

  for (let presses = 0; presses < 6 && (await zoomOf(page)) <= 1; presses += 1) {
    await zoom(page, 'Zoom in');
  }
  expect(await zoomOf(page)).toBeGreaterThan(1);
  await floats();
});
