// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// gate that fails a test if React Flow logged a warning while it ran.
import { expect, test, type Page } from './fixtures';
import { activeCard, nodeByTitle, settled, viewportTransform } from './graph';

// Presenting is the graph canvas under camera control (ADR 0027): the same
// cards, the same coordinates, drawn close enough that one fills the screen.
// These tests assert that — that the space is still there, that the camera
// moved, and that the walk follows edges rather than an index.
//
// The fixture's routes are all lines (see fixture/README.md), which is the
// degenerate graph rather than a second kind, so a fork is asserted in unit
// tests over a purpose-built space and here only via the chrome's shape.

/** The camera, read off React Flow's viewport transform. */
async function camera(page: Page): Promise<{ x: number; y: number; zoom: number }> {
  const transform = await viewportTransform(page);
  const [, x, y, zoom] = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(
    transform,
  ) ?? ['', '0', '0', '1'];
  return { x: Number(x), y: Number(y), zoom: Number(zoom) };
}

async function present(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await settled(page);
  await page.getByTestId('present-button').click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
}

test('walks the route, and the space is still what you are looking at', async ({ page }) => {
  await present(page);

  // No second surface (ADR 0027): every card is still drawn, on the same canvas.
  await expect(page.locator('.react-flow__node')).toHaveCount(10);
  await expect(page.locator('.react-flow__edge')).toHaveCount(13);

  // Long starts at A — the card no edge arrives at, not the first in any list.
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000002');

  await page.keyboard.press('ArrowRight');
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000003');

  await page.keyboard.press('ArrowLeft');
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000002');
});

test('the active card draws its content rendered, and only that card does', async ({ page }) => {
  await present(page);

  // Opening shows Markdown source (ADR 0011); presenting is the other half of
  // that distinction and is where a card is drawn *rendered*. A's body carries
  // `**A**`, so the markers must be gone and the emphasis present.
  const content = page.getByTestId('card-content');
  await expect(content).toHaveCount(1);
  await expect(content).not.toContainText('**A**');
  await expect(content.locator('strong')).toHaveText('A');

  // Content is not embedded in every node (ADR 0006) — the other nine still draw
  // their titles.
  await expect(page.getByTestId('card')).toHaveCount(9);
});

test('a body heading is just a heading, drawn once alongside the title (ADR 0020)', async ({
  page,
}) => {
  await present(page);

  // C's body opens with `# Where Short ends`. A card is one file, so its title
  // and its body live together and a leading heading cannot repeat a title held
  // elsewhere. Walk A → B → C.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000005');

  const content = page.getByTestId('card-content');
  await expect(content.locator('.card__title')).toHaveText('C');
  await expect(content.locator('h1')).toHaveText('Where Short ends');
  await expect(content.locator('h1')).toHaveCount(1);
});

test('the camera closes in on the active card, and pulls back on exit', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await settled(page);

  const overview = await camera(page);
  await page.getByTestId('present-button').click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await settled(page);

  // One card filling the screen is a much closer zoom than the whole space
  // fitted — the camera is the entire difference between the two views.
  const presenting = await camera(page);
  expect(presenting.zoom).toBeGreaterThan(overview.zoom * 2);

  // Walking moves the camera without changing how close it is.
  await page.keyboard.press('ArrowRight');
  await settled(page);
  const next = await camera(page);
  expect(next.zoom).toBeCloseTo(presenting.zoom, 1);
  expect(Math.abs(next.x - presenting.x)).toBeGreaterThan(10);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('presenting-chrome')).toBeHidden();
  await settled(page);
  expect((await camera(page)).zoom).toBeCloseTo(overview.zoom, 1);
});

test('the chrome names the moves available, and says when the route ends', async ({ page }) => {
  await present(page);

  // A line gives a one-member choice at each card — the degenerate fork, not a
  // second mode (ADR 0024).
  const moves = page.getByTestId('presenting-moves').getByRole('button');
  await expect(moves).toHaveCount(1);
  await expect(moves).toHaveText('B');

  // Long is A → B → C → D → A′: four moves, then a sink.
  for (const _ of [0, 1, 2, 3]) await page.keyboard.press('ArrowRight');
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-00000000000c');
  await expect(page.getByTestId('presenting-end')).toBeVisible();

  // Advancing past the end stays put rather than wrapping to the start, which is
  // what a sequence would do.
  await page.keyboard.press('ArrowRight');
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-00000000000c');
});

test('clicking a card while presenting does not open a reading panel', async ({ page }) => {
  await present(page);
  await nodeByTitle(page, 'E').click({ force: true });
  await expect(page.getByTestId('open-card')).toHaveCount(0);
});

test('returning to the overview restores the space and its gestures', async ({ page }) => {
  await present(page);
  await page.getByTestId('exit-presenting-button').click();

  await expect(page.getByTestId('presenting-chrome')).toHaveCount(0);
  // No card is active, so every node is back to drawing its title.
  await expect(activeCard(page)).toHaveCount(0);
  await expect(page.getByTestId('card')).toHaveCount(10);

  // Opening works again — through the Card's own control, which is the only
  // pointer route to it (ADR 0036, 0037).
  const b = nodeByTitle(page, 'B');
  await b.hover();
  await b.getByRole('button', { name: 'Edit Card B' }).click();
  await expect(page.getByTestId('open-card')).toBeVisible();
});
