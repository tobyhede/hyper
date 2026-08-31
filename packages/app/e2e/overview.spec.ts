// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// gate that fails a test if React Flow logged a warning while it ran.
import { expect, test, type Locator, type Page } from './fixtures';
import {
  activateGraph,
  activeGraph,
  graphLegendSwatchColor,
  openCard,
  selectCanvas,
  selectedCanvas,
  sidebar,
} from './graph';

// The app loads the abstract layout fixture (packages/app/fixture) — two
// disconnected collections sharing no cards, laid out by ELK as separate bands:
//   1. Long (A→B→C→D→A′), Mid (A→B→C→D), Short (A→B→C) — graphs over one spine
//   2. Echo (E→F→G→H→E′) — a plain linear collection
// Each collection is a Layout, because a Graph is a nested owned value of one
// (ADR 0040) and these two share no cards. The fixture names no `defaultRenderer`,
// so it opens in Flow — whose subject is the Space's cards, and which therefore
// draws the flatten across both Layouts (ADR 0045). That flatten crossing a
// Layout boundary is what this file exercises and nothing else in the tree does.
// Each returns to its start via an alias, so this particular fixture is acyclic
// and lays out as clean forward paths even though Graphs may contain cycles
// (ADR 0032). These tests assert *behaviour* against that shape; none read card prose. See
// packages/app/README.md for why each case is there.
//
// This file is the **overview**: the space drawn whole, every graph at once.
// Presenting is absent — the deck it used to be went with the step sequence (ADR
// 0023, 0024) and returns as a traversal on this same canvas (ADR 0027), with
// its own spec. The deck's tests are not adapted here; they asserted against a
// surface that no longer exists.

/** A graph node located by its exact card title, so single-letter titles don't
 *  collide (an alias node names its target, so "A" appears on more than one). */
function nodeByTitle(page: Page, title: string): Locator {
  return page
    .locator('.react-flow__node')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

test('offers more than one named graph', async ({ page }) => {
  await page.goto('/');
  // The sidebar's Graphs group lists every Graph the canvas draws.
  await expect(sidebar(page).getByTestId('graph-choice')).toHaveCount(4);
});

test('draws every graph at once, each in its own color', async ({ page }) => {
  await page.goto('/');

  // Four graphs across two Layouts: the Algorithmic View's subject is the
  // Space's cards, so what it draws is the flatten (ADR 0045) rather than the
  // graphs of any one Layout. A legend maps each to a color.
  await expect(page.getByTestId('graph-legend').locator('.legend__item')).toHaveCount(4);

  // Two collections: 5 + 5 = 10 cards, and one drawn edge per authored edge:
  // Long 4 + Mid 3 + Short 2 + Echo 4 = 13. Handles per (graph, direction)
  // through a card sum to 18 (collection 1) + 8 (collection 2) = 26.
  await expect(page.locator('.react-flow__node')).toHaveCount(10);
  await expect(page.locator('.react-flow__edge')).toHaveCount(13);
  await expect(page.locator('.rf-card-node__port')).toHaveCount(26);

  // Distinct colors, so the graphs can be told apart.
  const strokes = await page
    .locator('.react-flow__edge-path')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
  expect(strokes.every((s) => s && s !== 'none' && s !== 'rgb(0, 0, 0)')).toBe(true);
  expect(new Set(strokes).size).toBe(4);
});

test(
  'production Canvas Cards expose Alias identity and a keyboard Open action',
  {
    tag: [
      '@parity:canvas-card-exposes-kind-and-keyboard-actions',
      '@parity:canvas-card-shows-kind-treatment',
      '@parity:markdown-card-opens-and-closes-in-place',
    ],
  },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');

    const alias = nodeByTitle(page, 'A′').first();
    await expect(alias.getByRole('img', { name: 'Alias' })).toBeVisible();
    await expect(alias.getByTestId('alias-marker')).toHaveText('A');

    const markdown = nodeByTitle(page, 'A').first();
    await markdown.click();
    const open = markdown.getByRole('button', { name: 'Open Card A' });
    await open.focus();
    await expect(open).toBeFocused();
    await open.press('Enter');
    await expect(markdown.getByRole('heading', { name: 'A', exact: true })).toBeVisible();
    await expect(markdown.getByText('entry point')).toBeVisible();
    await markdown.getByRole('button', { name: 'Edit Card A' }).click();
    const source = markdown.getByRole('textbox', { name: 'Markdown source of A' });
    await expect(source).toBeFocused();
    await markdown.getByRole('heading', { name: 'A', exact: true }).click();
    await expect(source).toBeVisible();
    await expect(markdown.getByRole('button', { name: 'Close Card A' })).toBeDisabled();
    await source.press('Escape');
    await expect(markdown.getByRole('button', { name: 'Edit Card A' })).toBeFocused();
  },
);

test(
  "a selected Card's rail carries the Active Graph's own colour",
  { tag: '@parity:canvas-card-shows-active-graph-colour' },
  async ({ page }) => {
    await page.goto('/');
    await activateGraph(page, 'Long');
    const graphColor = await graphLegendSwatchColor(page, 'Long');

    const card = nodeByTitle(page, 'A').first();
    await card.click();
    await expect(card.locator('.canvas-card__rail')).toHaveCSS('background-color', graphColor);
  },
);

/**
 * A Layout draws the Graphs it owns, and the flatten is what crosses them.
 *
 * The Algorithmic View above draws all four; selecting either Layout narrows to
 * that Layout's own — which is the difference between a Graph belonging to the
 * Space and a Graph belonging to one Layout (ADR 0040). Selecting is navigation
 * and writes nothing (ADR 0031), so the revision is unmoved throughout.
 */
test('selecting a Layout draws the Graphs it owns and only those', async ({ page }) => {
  await page.goto('/');
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');
  const legendItems = page.getByTestId('graph-legend').locator('.legend__item');

  // Declaring Layouts is not naming one to open in: `defaultRenderer` is absent, so
  // the fixture arrives in Flow with no Layout selected.
  await expect(selectedCanvas(page)).toContainText('Flow');
  await expect(sidebar(page).getByTestId('canvas-renderer')).toHaveCount(4);

  // Collection 1 owns Long, Mid and Short over the shared spine: 4 + 3 + 2.
  await selectCanvas(page, 'Collection 1');
  await expect(page.locator('.react-flow__edge')).toHaveCount(9);
  await expect(legendItems).toHaveCount(3);
  await expect(sidebar(page).getByTestId('graph-choice')).toHaveCount(3);
  await expect(sidebar(page).getByRole('button', { name: 'Echo', exact: true })).toHaveCount(0);

  // Collection 2 owns Echo alone.
  await selectCanvas(page, 'Collection 2');
  await expect(page.locator('.react-flow__edge')).toHaveCount(4);
  await expect(legendItems).toHaveCount(1);
  await expect(activeGraph(page)).toHaveText('Echo');

  await expect(persistence).toHaveAttribute('data-revision', '0');
});

/**
 * The two surfaces that name a Graph, held to the same answer.
 *
 * ADR 0053 gave the Space Sidebar a Graphs group carrying every Graph's
 * title, colour and active state — which is what the canvas HUD's key already
 * said. Issue 06 keeps the key: it is the on-canvas colour reference beside the
 * Edges being read, and it is the only one of the two still on screen once the
 * Sidebar is collapsed. What the decision costs is this test — the two must
 * never disagree, which is why both resolve a colour through the one shared
 * `graphColor` seam rather than each deriving its own.
 */
test(
  'the Sidebar and the canvas HUD agree about every Graph, collapsed or not',
  { tag: '@parity:graph-hud-and-sidebar-agree-on-the-active-graph' },
  async ({ page }) => {
    await page.goto('/');
    const legendItems = page.getByTestId('graph-legend').locator('.legend__item');
    await expect(legendItems).toHaveCount(4);

    // Titles, in the same order: the flatten across Layouts, which both read
    // off the renderer's subject.
    expect(await legendItems.allInnerTexts()).toEqual(
      await sidebar(page).getByTestId('graph-choice').allInnerTexts(),
    );

    // Colours. Lucide paints the Sidebar's glyph by `stroke`, the HUD paints its
    // stripe as a background — two properties, one resolved value each.
    const sidebarColors = await sidebar(page)
      .getByTestId('graph-choice')
      .locator('svg')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
    const hudColors = await legendItems
      .locator('[aria-hidden="true"]')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
    expect(hudColors).toEqual(sidebarColors);
    expect(new Set(hudColors).size).toBe(4);

    // Emphasis, through an activation neither surface owns — and asserted on
    // **both** surfaces, because agreement is the claim. Reading only the HUD
    // would leave the Sidebar free to stop marking the Active Graph entirely
    // while the one test named for the two agreeing stayed green.
    await activateGraph(page, 'Mid');
    const emphasised = page.getByTestId('graph-legend').locator('li[data-active="true"]');
    await expect(emphasised).toHaveCount(1);
    await expect(emphasised).toHaveText('Mid');
    const pressed = sidebar(page).locator('[data-testid="graph-choice"][aria-pressed="true"]');
    await expect(pressed).toHaveCount(1);
    await expect(pressed).toHaveText('Mid');

    // And with the Sidebar gone, which is the whole reason the key was kept.
    await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
    await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute('data-state', 'collapsed');
    await expect(emphasised).toHaveText('Mid');
    await expect(legendItems).toHaveCount(4);
  },
);

test('handles stay measurable, so edges attach where the layout put them', async ({ page }) => {
  await page.goto('/');

  // React Flow measures every handle's box to work out where an edge attaches,
  // so a handle hidden with `display: none` reports 0x0 and its edges land
  // somewhere else — silently, with no warning to catch. `CardNode` dims
  // receding graphs with `opacity`, which keeps the box; that reads as an
  // ordinary styling choice, and this is what stops a later CSS tidy-up from
  // reaching for `display: none`. See react-flow-guidance/issues/03.
  const ports = page.locator('.rf-card-node__port');
  await expect(ports.first()).toBeAttached();

  const boxes = await ports.evaluateAll((els) =>
    els.map((el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );

  // Asserted against whatever the fixture currently draws — its graph/card
  // shape is free to change (fixture/README.md).
  expect(boxes.length).toBeGreaterThan(0);
  expect(boxes.every((box) => box.width > 0 && box.height > 0)).toBe(true);
});

test("edges are drawn along ELK's routing, not default beziers", async ({ page }) => {
  await page.goto('/');

  // Retries until the async ELK layout resolves and replaces the first-paint
  // bezier fallback with the routed polyline (a single layout pass routes them
  // all, so once one has an `L` command they all do). No visibility check — a
  // dead-horizontal SVG line has a zero-height box, which Playwright reads as
  // hidden.
  const first = page.locator('.react-flow__edge-path').first();
  await expect(first).toHaveAttribute('d', /L/);

  // Every graph edge is a polyline along ELK's routed points (issue 03) — none
  // is a React Flow cubic bezier, which would carry a `C` command.
  const paths = await page
    .locator('.react-flow__edge-path')
    .evaluateAll((els) => els.map((el) => el.getAttribute('d') ?? ''));
  expect(paths).toHaveLength(13);
  expect(paths.every((d) => d.startsWith('M') && !d.includes('C'))).toBe(true);
});

test('selecting a graph keeps the others on screen', async ({ page }) => {
  await page.goto('/');
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');

  // Selection is emphasis: it never hides the rest of the space.
  await activateGraph(page, 'Echo');
  await expect(page.locator('.react-flow__node')).toHaveCount(10);
  await expect(page.locator('.react-flow__edge')).toHaveCount(13);
  // Activating a graph changes emphasis, not the persisted document.
  await page.waitForTimeout(50);
  await expect(persistence).toHaveAttribute('data-revision', '0');
});

test('selecting a graph emphasises it without hiding the others', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__edge')).toHaveCount(13);

  const opacities = async () =>
    page
      .locator('.react-flow__edge-path')
      .evaluateAll((els) => els.map((el) => Number(getComputedStyle(el).opacity)));

  // "Long" is the flatten's first graph, so it is active on load and every
  // other graph recedes — Mid 3 + Short 2 + Echo 4 = 9 edges. Echo is owned by
  // the *other* Layout and recedes exactly like the two beside Long: emphasis
  // is over what the view draws, and this view draws across both.
  const faded = (await opacities()).filter((o) => o < 1);
  expect(faded).toHaveLength(9);
  expect(faded[0]!).toBeGreaterThan(0);

  // Every graph stays drawn.
  await expect(page.locator('.react-flow__edge')).toHaveCount(13);
});

test('a card shows its title in the graph, and opens to show rendered Markdown', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();

  // The graph draws the title, never the card's body (ADR 0051). "entry point"
  // is A's body text, which must not appear.
  const a = nodeByTitle(page, 'A');
  await expect(a).toBeVisible();
  await expect(a).not.toContainText('entry point');
  await expect(a.getByRole('button', { name: 'Open Card A' })).toBeVisible();

  // Opening renders the Markdown in the existing Card and keeps Close reachable.
  await openCard(a, 'A');
  await expect(a.getByText('A', { exact: true }).last()).toHaveCSS('font-weight', '700');

  await a.getByRole('button', { name: 'Close Card A' }).click();
  await expect(a.getByRole('button', { name: 'Open Card A' })).toBeVisible();
});

/** The two attributes of a Card's content as one commit left them. */
interface PresenceCommit {
  readonly presence: string | null;
  readonly inert: string | null;
}

test('the Close action closes an opened card', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const card = nodeByTitle(page, 'A').first();
  await openCard(card, 'A');
  await expect(card.locator('.canvas-card__content')).toHaveAttribute('data-presence', 'present');

  // Installed ahead of the Close click, because leaving is over before anything
  // out here can ask about it. `usePresence` keeps the leaving content mounted
  // for the duration the element itself declares — `--card-placement-duration
  // * 0.4`, 80ms — and then unmounts it, so an `expect.poll` from the test
  // process is spending a CDP round trip on a window that is already closing;
  // on a loaded runner the first sample lands after the unmount and sees an
  // empty list. Shortening the intervals only narrows the odds, and widening
  // the timeout or accepting `[]` would pin nothing. Recording inside the page
  // has no round trip to lose: the observer runs on the commit itself, and the
  // record is read back afterwards at leisure.
  //
  // Both attributes are read together in the one callback, which is what makes
  // this one observation of one commit — `CanvasCard`'s `inert` layout effect
  // runs in the commit that writes `data-presence`, and a MutationObserver is
  // delivered after that whole commit rather than between its two writes. The
  // observer then stops, so `inert` arriving a commit later would be recorded
  // here as the `null` it was when `leaving` appeared, and fail. An empty
  // record is a failure too, and a different one: the content never entered
  // `leaving` at all.
  const leaving = await card.evaluateHandle((node) => {
    const commits: PresenceCommit[] = [];
    new MutationObserver((_mutations, observer) => {
      const content = node.querySelector('.canvas-card__content');
      if (content === null) return;
      const presence = content.getAttribute('data-presence');
      if (presence !== 'leaving') return;
      commits.push({ presence, inert: content.getAttribute('inert') });
      observer.disconnect();
    }).observe(node, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-presence', 'inert'],
    });
    return commits;
  });

  await card.getByRole('button', { name: 'Close Card A' }).click();
  // The unmount is a fact worth asserting on its own and also the proof that
  // the leaving window has closed, so what the observer caught is read once
  // after it rather than polled for.
  await expect(card.locator('.canvas-card__content')).toHaveCount(0);
  expect(await leaving.jsonValue()).toEqual([{ presence: 'leaving', inert: '' }]);
  await expect(card.getByRole('button', { name: 'Open Card A' })).toBeVisible();
});

test('cards are drawn at exactly the size the layout placed them at', async ({ page }) => {
  await page.goto('/');
  const inner = page.locator('.rf-card-node__inner').first();
  await expect(inner).toBeVisible();

  // The layout arranges cards at `card.ts`'s size and the stylesheet draws them
  // from the same numbers. If these drift, handles land where the card isn't —
  // silently, and looking like a layout bug.
  const declared = await page.evaluate(() => {
    const el = document.querySelector('.graph-area')!;
    const s = getComputedStyle(el);
    return {
      w: s.getPropertyValue('--card-width').trim(),
      h: s.getPropertyValue('--card-height').trim(),
    };
  });
  expect(declared.w).toBe('260px');

  const drawn = await inner.evaluate((el) => {
    const s = getComputedStyle(el);
    const card = el.querySelector('.canvas-card')!;
    return { w: s.width, h: getComputedStyle(card).height };
  });
  expect(drawn.w).toBe(declared.w);
  expect(drawn.h).toBe(declared.h);

  // 16:9, matching the presentation surface — wider than tall.
  expect(parseFloat(drawn.w)).toBeGreaterThan(parseFloat(drawn.h));
});

test(
  'an Alias Opens on its Target Markdown read-only with click, Enter and Space',
  { tag: '@parity:open-alias-shows-target-markdown-read-only' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');

    const recap = nodeByTitle(page, 'A′');
    await expect(recap).toBeVisible();
    await expect(recap.getByTestId('alias-marker')).toHaveText('A');

    await openCard(recap, 'A′');
    await expect(recap.getByText('entry point')).toBeVisible();
    await expect(recap.getByRole('heading', { name: 'A′', exact: true })).toBeVisible();
    await expect(recap.getByRole('textbox')).toHaveCount(0);
    await expect(recap.getByRole('button', { name: /Edit Card/ })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Target' })).toHaveCount(0);
    await recap.getByRole('button', { name: 'Close Card A′' }).click();

    await recap.focus();
    await page.keyboard.press('Enter');
    await expect(recap.getByRole('button', { name: 'Close Card A′' })).toBeVisible();
    await recap.getByRole('button', { name: 'Close Card A′' }).click();

    await recap.focus();
    await page.keyboard.press('Space');
    await expect(recap.getByText('entry point')).toBeVisible();
    await expect(recap.locator('.react-flow__resize-control')).toHaveCount(1);
    await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

    await page.reload();
    await selectCanvas(page, 'Collection 1');
    const persisted = nodeByTitle(page, 'A′');
    await expect(persisted.getByText('entry point')).toBeVisible();
    await expect(persisted.getByRole('button', { name: 'Close Card A′' })).toBeVisible();
    await expect(persisted.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Target' })).toHaveCount(0);

    await persisted.getByRole('button', { name: 'Edit Title A′', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Card title' })).toHaveValue('A′');
  },
);
