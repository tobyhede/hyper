import { expect, test, type Page } from '@playwright/test';
import {
  canvasZoom,
  edgeChrome,
  edgeTitleCeiling,
  edgeNamed,
  edgeSpan,
  edgeToolbar,
  isEllipsed,
  pointOnEdge,
  restingTitle,
  topmostIsWithin,
} from '../e2e/edge-chrome';
import { EDGE_TITLES } from '../stories/support/spaces';

/**
 * The story's Space draws `EDGE_TITLES` across a short gap and long ones, so
 * the fitting rules are pressed against the span React Flow actually draws.
 */

const story = (name: string): string => `/?story=space--edge-toolbar--${name}&mode=preview`;

/** The story's Active Graph Edges, by accessible name. */
const EDGE = {
  short: 'Edge from Resource 1 to Resource 2 in Pitch',
  fits: 'Edge from Resource 2 to Resource 3 in Pitch',
  untitled: 'Edge from Resource 1 to Resource 4 in Pitch',
  long: 'Edge from Resource 4 to Resource 5 in Pitch',
  hidden: 'Edge from Resource 5 to Resource 6 in Pitch',
} as const;

const open = async (page: Page, name = 'default'): Promise<void> => {
  await page.goto(story(name));
  await expect(page.locator('.react-flow__edge[tabindex]')).toHaveCount(5);
};

test(
  'selecting an Edge reveals its toolbar of Edit, the Title eye and Delete',
  { tag: '@parity:edge-toolbar-offers-edit-title-and-delete' },
  async ({ page }) => {
    await open(page);
    await expect(page.getByRole('toolbar', { name: /^Edge / })).toHaveCount(0);

    await edgeNamed(page, EDGE.untitled).focus();

    // Named for its endpoints while it has no Title, and one group of three.
    const toolbar = edgeToolbar(page, 'Resource 1 → Resource 4');
    await expect(toolbar).toBeVisible();
    const group = toolbar.getByRole('group', { name: 'Edge commands' });
    await expect(group.getByRole('button')).toHaveCount(3);
    await expect(group.getByRole('button').nth(0)).toHaveAccessibleName(
      'Edit Edge Resource 1 → Resource 4',
    );
    await expect(group.getByRole('button').nth(1)).toHaveAccessibleName(
      'Hide Title Resource 1 → Resource 4',
    );
    await expect(group.getByRole('button').nth(2)).toHaveAccessibleName(
      'Delete Edge Resource 1 → Resource 4',
    );
    // A titled Edge's toolbar is named for its Title instead.
    await edgeNamed(page, EDGE.fits).focus();
    await expect(edgeToolbar(page, EDGE_TITLES.fits)).toBeVisible();
    await expect(edgeToolbar(page, 'Resource 1 → Resource 4')).toHaveCount(0);

    await edgeToolbar(page, EDGE_TITLES.fits)
      .getByRole('button', { name: `Delete Edge ${EDGE_TITLES.fits}` })
      .click();

    await expect(edgeNamed(page, EDGE.fits)).toHaveCount(0);
    await expect(page.locator('.react-flow__edge[tabindex]')).toHaveCount(4);
  },
);

test("an untitled Edge's toolbar sits centred on its line, and a titled Edge's floats above its Title", async ({
  page,
}) => {
  await open(page);

  // Nothing is drawn on an untitled Edge's midpoint, so the toolbar takes it.
  const untitledEdge = edgeNamed(page, EDGE.untitled);
  await untitledEdge.focus();
  const untitled = edgeToolbar(page, 'Resource 1 → Resource 4');
  await expect(untitled).toBeVisible();
  const midpoint = await pointOnEdge(untitledEdge, 0.5);
  const onLine = await untitled.boundingBox();
  if (onLine === null) throw new Error('The toolbar has no box.');
  expect(midpoint.x).toBeGreaterThan(onLine.x);
  expect(midpoint.x).toBeLessThan(onLine.x + onLine.width);
  expect(midpoint.y).toBeGreaterThan(onLine.y);
  expect(midpoint.y).toBeLessThan(onLine.y + onLine.height);

  // A titled Edge's midpoint is its Title's, and the toolbar sits above it.
  await edgeNamed(page, EDGE.fits).focus();
  const titled = edgeToolbar(page, EDGE_TITLES.fits);
  await expect(titled).toBeVisible();
  const title = page.getByRole('button', { name: `Edit Title ${EDGE_TITLES.fits}` });
  const above = await titled.boundingBox();
  const titleBox = await title.boundingBox();
  if (above === null || titleBox === null) throw new Error('No box to compare.');
  expect(above.y + above.height).toBeLessThanOrEqual(titleBox.y + 1);
});

test('a Title being written is drawn as tall as the toolbar above it', async ({ page }) => {
  await open(page);
  await edgeNamed(page, EDGE.fits).focus();
  const toolbar = edgeToolbar(page, EDGE_TITLES.fits);
  await page.getByRole('button', { name: `Edit Title ${EDGE_TITLES.fits}` }).click();
  const field = page.getByRole('textbox', { name: 'Edge Title' });
  await expect(field).toBeFocused();

  // While written, the Title's box matches the toolbar's height, so the two read as one set.
  const box = await page.locator('.edge-title--editing').boundingBox();
  const bar = await toolbar.boundingBox();
  if (box === null || bar === null) throw new Error('No box to compare.');
  expect(Math.abs(box.height - bar.height)).toBeLessThanOrEqual(1);
});

test(
  "hovering an Edge's line reveals its toolbar, held across the gap and released after it",
  { tag: '@parity:edge-toolbar-reveals-on-hover' },
  async ({ page }) => {
    await open(page);
    const edge = edgeNamed(page, EDGE.fits);
    const toolbar = edgeToolbar(page, EDGE_TITLES.fits);

    // The line, off the midpoint the Title sits on.
    const onLine = await pointOnEdge(edge, 0.25);
    await page.mouse.move(onLine.x, onLine.y);
    await expect(toolbar).toBeVisible();

    // Across onto the toolbar floating above the line: still there.
    const box = await toolbar.boundingBox();
    if (box === null) throw new Error('The toolbar has no box.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await expect(toolbar).toBeVisible();
    await page.waitForTimeout(400);
    await expect(toolbar).toBeVisible();

    // Away, onto empty canvas: released a moment later.
    await page.mouse.move(onLine.x, onLine.y + 160);
    await expect(toolbar).toHaveCount(0);
  },
);

test(
  "an Edge's Title is written in place, from Edit or from the Title itself",
  { tag: '@parity:edge-title-is-written-in-place' },
  async ({ page }) => {
    await open(page);

    // From Edit, on an Edge with no Title: Enter completes, and focus returns to
    // the Title the Edit wrote.
    await edgeNamed(page, EDGE.untitled).focus();
    await page.getByRole('button', { name: 'Edit Edge Resource 1 → Resource 4' }).click();
    const field = page.getByRole('textbox', { name: 'Edge Title' });
    await expect(field).toBeFocused();
    await field.fill('Background');
    await field.press('Enter');
    await expect(page.getByRole('button', { name: 'Edit Title Background' })).toBeFocused();
    await expect(edgeToolbar(page, 'Background')).toBeVisible();

    // From the Title itself: Escape cancels, writing nothing, and focus returns
    // to the Title it replaced.
    await page.getByRole('button', { name: 'Edit Title Background' }).click();
    await expect(field).toHaveValue('Background');
    await field.fill('Discarded');
    await field.press('Escape');
    await expect(field).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit Title Background' })).toBeFocused();
  },
);

test(
  'the eye hides a Title at rest and shows it again',
  { tag: '@parity:edge-title-hides-at-rest' },
  async ({ page }) => {
    await open(page);
    const hidden = edgeNamed(page, EDGE.hidden);
    const chrome = await edgeChrome(page, hidden);

    // Hidden at rest: nothing is drawn.
    await expect(restingTitle(chrome, EDGE_TITLES.hidden)).toHaveCount(0);
    await expect(chrome.locator('.edge-title')).toHaveCount(0);

    // Revealed, it is drawn dimmed, and the eye offers to show it.
    await hidden.focus();
    const control = page.getByRole('button', { name: `Edit Title ${EDGE_TITLES.hidden}` });
    await expect(control).toBeVisible();
    await expect(control).toHaveCSS('opacity', '0.55');
    await page.getByRole('button', { name: `Show Title ${EDGE_TITLES.hidden}` }).click();
    await expect(control).toHaveCSS('opacity', '1');

    // Shown, it is drawn at rest.
    await page.keyboard.press('Escape');
    await page.mouse.click(8, 400);
    await expect(restingTitle(chrome, EDGE_TITLES.hidden)).toBeVisible();

    // And an Edge with no Title has nothing to hide.
    await edgeNamed(page, EDGE.untitled).focus();
    await expect(
      page.getByRole('button', { name: 'Hide Title Resource 1 → Resource 4' }),
    ).toHaveAttribute('aria-disabled', 'true');

    // Nor, while its Title is written, does an Edge with one: the eye draws the
    // Title last projected, not the draft, and pressing it keeps the caret.
    await edgeNamed(page, EDGE.short).focus();
    await page.getByRole('button', { name: `Edit Edge ${EDGE_TITLES.short}` }).click();
    const field = page.getByRole('textbox', { name: 'Edge Title' });
    await field.fill('');
    const eye = page.getByRole('button', { name: `Hide Title ${EDGE_TITLES.short}` });
    await expect(eye).toHaveAttribute('aria-disabled', 'true');
    // `force`: a pointer can press a disabled control, and this asks what that does.
    await eye.click({ force: true });
    await expect(field).toBeFocused();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await field.press('Escape');
    await expect(
      page.getByRole('button', { name: `Edit Title ${EDGE_TITLES.short}` }),
    ).toBeFocused();
  },
);

test(
  'a Title fits its Edge at rest, draws whole while revealed, and only the Active Graph draws one',
  { tag: '@parity:edge-title-fits-its-edge' },
  async ({ page }) => {
    await open(page);
    const zoom = await canvasZoom(page);

    // The long Title on a long Edge: fitted and ellipsed, whole in its tooltip.
    const long = edgeNamed(page, EDGE.long);
    const longTitle = restingTitle(await edgeChrome(page, long), EDGE_TITLES.long);
    await expect(longTitle).toBeVisible();
    await expect(longTitle).toHaveText(EDGE_TITLES.long);
    expect(await isEllipsed(longTitle.locator('.edge-title__text'))).toBe(true);
    const longBox = await longTitle.boundingBox();
    if (longBox === null) throw new Error('The long Title has no box.');
    // Inside the Edge it sits on, and no wider than the ceiling.
    expect(longBox.width / zoom).toBeLessThan(await edgeSpan(page, long));
    expect(longBox.width / zoom).toBeLessThanOrEqual((await edgeTitleCeiling(longTitle)) + 1);

    // A Title that fits is drawn whole.
    const fits = restingTitle(await edgeChrome(page, edgeNamed(page, EDGE.fits)), EDGE_TITLES.fits);
    expect(await isEllipsed(fits.locator('.edge-title__text'))).toBe(false);

    // `Why` on the short gap draws nothing at rest...
    const short = edgeNamed(page, EDGE.short);
    const shortChrome = await edgeChrome(page, short);
    await expect(shortChrome.locator('.edge-title')).toHaveCount(0);

    // ...and all of itself while revealed, raised over the Resources.
    await short.focus();
    const whole = page.getByRole('button', { name: `Edit Title ${EDGE_TITLES.short}` });
    await expect(whole).toBeVisible();
    expect(await isEllipsed(whole.locator('.edge-title__text'))).toBe(false);
    await expect(shortChrome).toHaveCSS('z-index', '2000');
    const del = page.getByRole('button', { name: `Delete Edge ${EDGE_TITLES.short}` });
    expect(await topmostIsWithin(page, del)).toBe(true);

    // Another Graph's Title is not drawn at all.
    await expect(page.getByText(EDGE_TITLES.aside)).toHaveCount(0);
  },
);

test(
  'the keyboard reaches an Edge, enters its toolbar, and leaves it',
  { tag: '@parity:edge-toolbar-keyboard' },
  async ({ page }) => {
    await open(page);
    const short = edgeNamed(page, EDGE.short);
    await short.focus();

    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: `Edit Edge ${EDGE_TITLES.short}` }),
    ).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(
      page.getByRole('button', { name: `Hide Title ${EDGE_TITLES.short}` }),
    ).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(
      page.getByRole('button', { name: `Delete Edge ${EDGE_TITLES.short}` }),
    ).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(short).toBeFocused();

    // Tab goes from one Edge to the next, not through the toolbar.
    await page.keyboard.press('Tab');
    await expect(page.locator('.react-flow__edge[tabindex]:focus')).toHaveCount(1);
    await expect(short).not.toBeFocused();
  },
);

test(
  "a refused command is reported in one alert region under the Edge's toolbar",
  { tag: '@parity:edge-toolbar-reports-refusals' },
  async ({ page }) => {
    await open(page, 'refused');

    const toolbar = edgeToolbar(page, 'Resource 1 → Resource 4');
    await expect(toolbar).toBeVisible();
    const alert = page.getByRole('alert');
    await expect(alert).toHaveCount(1);
    await expect(alert).toHaveText('Give this Edge a title before hiding it.');
    const toolbarBox = await toolbar.boundingBox();
    const alertBox = await alert.boundingBox();
    if (toolbarBox === null || alertBox === null) throw new Error('No box to compare.');
    expect(alertBox.y).toBeGreaterThanOrEqual(toolbarBox.y + toolbarBox.height - 1);

    // The alert hangs below without moving the toolbar: an untitled Edge's
    // toolbar stays centred on its line while the refusal is shown.
    const midpoint = await pointOnEdge(edgeNamed(page, EDGE.untitled), 0.5);
    expect(Math.abs(toolbarBox.x + toolbarBox.width / 2 - midpoint.x)).toBeLessThan(4);
    expect(Math.abs(toolbarBox.y + toolbarBox.height / 2 - midpoint.y)).toBeLessThan(4);

    // It goes when the selection moves.
    await edgeNamed(page, EDGE.fits).focus();
    await expect(page.getByRole('alert')).toHaveCount(0);
  },
);
