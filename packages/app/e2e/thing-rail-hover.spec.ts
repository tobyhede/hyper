import { expect, test } from './fixtures';
import { boxOf, nodeByTitle, settled, viewportTransform } from './graph';

test(
  'Open and Close release pointer-revealed controls while preserving keyboard access',
  { tag: '@parity:thing-rail-reveal-distinguishes-pointer-and-keyboard' },
  async ({ page }) => {
    await page.goto('/');
    const thing = nodeByTitle(page, 'A');
    const actions = thing.getByRole('toolbar', { name: 'Thing A', exact: true });
    const resize = thing.locator('.rf-thing-node__resize-control');
    for (const operation of ['Open', 'Close']) {
      await thing.hover();
      await thing.getByRole('button', { name: `${operation} Thing A`, exact: true }).click();
      await page.mouse.move(1, 1);
      await expect(actions).toHaveCSS('opacity', '0');
      await expect(actions).toHaveCSS('pointer-events', 'none');
      if (operation === 'Open') {
        await expect(resize).toHaveCSS('opacity', '0');
        await expect(thing.locator('.rf-thing-node__resize-mark')).toHaveCSS('opacity', '0');
      } else {
        await expect(resize).toHaveCount(0);
      }
    }
    // Switch to keyboard modality, then reach and operate the same toolbar.
    await page.keyboard.press('Tab');
    const open = thing.getByRole('button', { name: 'Open Thing A', exact: true });
    await open.focus();
    await expect(actions).toHaveCSS('opacity', '1');
    await open.press('Enter');
    const close = thing.getByRole('button', { name: 'Close Thing A', exact: true });
    await expect(close).toBeFocused();
    await expect(actions).toHaveCSS('opacity', '1');
    await expect(resize).toHaveCSS('opacity', '1');
    await close.press('Enter');
    await expect(open).toBeFocused();
    await expect(actions).toHaveCSS('opacity', '1');
    await expect(resize).toHaveCount(0);
  },
);

/**
 * The shared surface has to *fit* the room a Thing gives it — which is the one
 * thing about mounting the Dock's strip on a Thing that could go wrong quietly.
 *
 * A Thing is 260 canvas units wide with `overflow: hidden`, and its rail is
 * exactly as tall as the strip: 28px of control inside 4px of padding inside a
 * hairline. So there is no slack, and anything that clips is clipped invisibly.
 * Three states are read because the room differs in each: Closed, Open (a
 * larger rect and a Markdown body under the strip) and zoomed out (every box
 * scaled, including the strip's).
 *
 * The focus ring is measured rather than eyeballed. `outline-offset` puts it
 * outside the control's own border box, so a ring is not part of any bounding
 * box a test could compare — it is reconstructed from the computed values and
 * checked against the surface it is drawn inside.
 */
test('the revealed commands fit inside their Thing, Closed, Open and zoomed out', async ({
  page,
}) => {
  await page.goto('/');
  const thing = nodeByTitle(page, 'A');
  await expect(thing).toBeVisible();
  await settled(page);

  /** The strip's box, its ring-inclusive focused control's box, and the Thing's. */
  const fits = async (): Promise<void> => {
    const commands = thing.getByTestId('canvas-thing-actions');
    await expect(commands).toHaveCSS('opacity', '1');
    const face = await boxOf(thing.locator('.canvas-thing'), 'the Thing face');
    const strip = await boxOf(commands, 'the revealed commands');
    expect(strip.x).toBeGreaterThanOrEqual(face.x);
    expect(strip.y).toBeGreaterThanOrEqual(face.y);
    expect(strip.x + strip.width).toBeLessThanOrEqual(face.x + face.width);
    expect(strip.y + strip.height).toBeLessThanOrEqual(face.y + face.height);

    // The focus ring of a control inside it, reconstructed from what draws it.
    //
    // The ring's own values are CSS pixels and every box here is a client
    // rectangle, so the canvas's scale has to be put into one of them: at a
    // zoomed-out canvas a 4px offset is not 4px on screen. The control's own two
    // heights are that scale, read where it is measured rather than parsed back
    // out of a transform.
    const ring = await commands.evaluate((surface) => {
      const control = surface.querySelector('button');
      if (control === null) throw new Error('the commands carry no control');
      control.focus();
      const style = getComputedStyle(control);
      const box = control.getBoundingClientRect();
      const scale = control.offsetHeight === 0 ? 1 : box.height / control.offsetHeight;
      const spread =
        (Number.parseFloat(style.outlineOffset || '0') +
          Number.parseFloat(style.outlineWidth || '0')) *
        scale;
      const around = surface.getBoundingClientRect();
      return {
        spread,
        top: box.top - spread - around.top,
        left: box.left - spread - around.left,
        bottom: around.bottom - (box.bottom + spread),
        right: around.right - (box.right + spread),
      };
    });
    // A ring with no width would make the four comparisons below vacuous.
    expect(ring.spread).toBeGreaterThan(0);
    expect(ring.top).toBeGreaterThanOrEqual(0);
    expect(ring.left).toBeGreaterThanOrEqual(0);
    expect(ring.bottom).toBeGreaterThanOrEqual(0);
    expect(ring.right).toBeGreaterThanOrEqual(0);
  };

  await thing.hover();
  await fits();

  await thing.getByRole('button', { name: 'Open Thing A', exact: true }).click();
  await settled(page);
  await thing.hover();
  await fits();

  // Against the transform as it was, not against emptiness: the canvas already
  // carries one from the Open above, so a poll for "not empty" resolves at once
  // on the pre-zoom value and `fits()` then measures the rail against a
  // viewport the zoom never reached.
  const beforeZoom = await viewportTransform(page);
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(() => viewportTransform(page)).not.toBe(beforeZoom);
  await settled(page);
  await thing.hover();
  await fits();
});
