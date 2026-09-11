// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// gate that fails a test if React Flow logged a warning while it ran.
import { expect, test, type Locator, type Page } from './fixtures';
import {
  activateGraph,
  activeGraph,
  boxOf,
  graphChoices,
  graphLegendSwatchColor,
  diagramChoices,
  openThing,
  selectCanvas,
  selectedCanvas,
  settled,
} from './graph';

// The app loads the abstract layout fixture (packages/app/fixture) — two
// disconnected collections sharing no Things:
//   1. Long (A→B→C→D→A′), Mid (A→B→C→D), Short (A→B→C) — graphs over one spine,
//      plus T, a member of that Diagram no Edge reaches, whose Title is three
//      lines (ADR 0083)
//   2. Echo (E→F→G→H→E′) — a plain linear collection
// Each collection is a Diagram, because a Graph is a nested owned value of one
// (ADR 0040) and these two share no Things. The fixture opens in Collection 1,
// and each Diagram draws only the Things and Graphs it owns.
// Each returns to its start via an alias, so this particular fixture is acyclic
// and lays out as clean forward paths even though Graphs may contain cycles
// (ADR 0032). These tests assert *behaviour* against that shape; none read thing prose. See
// packages/app/README.md for why each case is there.
//
// This file is the **overview**: the space drawn whole, every graph at once.
// Presenting is absent — the deck it used to be went with the step sequence (ADR
// 0023, 0024) and returns as a traversal on this same canvas (ADR 0027), with
// its own spec. The deck's tests are not adapted here; they asserted against a
// surface that no longer exists.

/** A graph node located by its exact thing title, so single-letter titles don't
 *  collide (an alias node names its target, so "A" appears on more than one). */
function nodeByTitle(page: Page, title: string): Locator {
  return page
    .locator('.react-flow__node')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

test('offers more than one named graph', async ({ page }) => {
  await page.goto('/');
  // The Graph cluster's own list holds every Graph the selected Diagram owns.
  await expect(await graphChoices(page)).toHaveCount(3);
});

test('draws every Graph in the selected Diagram, each in its own color', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');

  // Collection 1 owns three Graphs. A legend maps each to a color.
  await expect(page.getByTestId('graph-legend').locator('.legend__item')).toHaveCount(3);

  // Six Things — the five on the spine plus T, which joins no Graph — Long's four
  // Edges plus Mid's three plus Short's two, and eight anchors on every Thing.
  // T draws its eight like the rest: an anchor is a Thing's and not a Graph's
  // since ADR 0087, so joining no Graph takes none of them away.
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await expect(page.locator('.react-flow__edge')).toHaveCount(9);
  await expect(page.locator('.rf-thing-node__authoring-handle')).toHaveCount(48);

  // Distinct colors, so the graphs can be told apart.
  const strokes = await page
    .locator('.react-flow__edge-path')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
  expect(strokes.every((s) => s && s !== 'none' && s !== 'rgb(0, 0, 0)')).toBe(true);
  expect(new Set(strokes).size).toBe(3);
});

test(
  'production Canvas Things expose Alias identity and a keyboard Open action',
  {
    tag: [
      '@parity:canvas-thing-exposes-kind-and-keyboard-actions',
      '@parity:canvas-thing-shows-kind-treatment',
      '@parity:markdown-thing-opens-and-closes-in-place',
    ],
  },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');

    const alias = nodeByTitle(page, 'A′').first();
    await expect(alias.getByRole('img', { name: 'Alias' })).toBeVisible();

    const markdown = nodeByTitle(page, 'A').first();
    await markdown.click();
    const open = markdown.getByRole('button', { name: 'Open Thing A' });
    await open.focus();
    await expect(open).toBeFocused();
    await open.press('Enter');
    await expect(markdown.getByRole('heading', { name: 'A', exact: true })).toBeVisible();
    await expect(markdown.getByText('entry point')).toBeVisible();
    await markdown.getByRole('button', { name: 'Edit Thing A' }).click();
    const source = markdown.getByRole('textbox', { name: 'Markdown source of A' });
    await expect(source).toBeFocused();
    await markdown.getByRole('heading', { name: 'A', exact: true }).click();
    await expect(source).toBeVisible();
    await expect(markdown.getByRole('button', { name: 'Close Thing A' })).toBeDisabled();
    await source.press('Escape');
    await expect(markdown.getByRole('button', { name: 'Edit Thing A' })).toBeFocused();
  },
);

/**
 * **The requested treatment change, read off the running application**
 * (`.scratch/command-dock/issues/12`).
 *
 * This test used to assert the opposite — that a selected Thing's rail painted
 * the Active Graph's colour. Three things replace it, and none of them is a
 * weaker version of the claim: the band paints nothing; the commands on it are
 * the *same* surface the Command Dock is drawn on, compared property by property
 * against the Dock actually on screen rather than against numbers copied out of
 * a stylesheet; and the Graph's colour is still on the Thing, on the handles an
 * Edge of that Graph leaves it from.
 */
test(
  "a selected Thing's commands are the Dock's own surface, and the Graph's colour stays on its handles",
  { tag: '@parity:canvas-thing-toolbar-is-neutral-and-graph-colour-stays-on-connections' },
  async ({ page }) => {
    await page.goto('/');
    await activateGraph(page, 'Long');
    const graphColor = await graphLegendSwatchColor(page, 'Long');

    const thing = nodeByTitle(page, 'A').first();
    await thing.click();

    // No band, at the one state that used to carry the loudest one.
    await expect(thing.locator('.canvas-thing__rail')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );

    // One surface, drawn twice. Read off both elements in the page, so a change
    // to either that the other did not follow fails here.
    const treatment = (locator: Locator) =>
      locator.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          background: style.backgroundColor,
          borderRadius: style.borderTopLeftRadius,
          borderColor: style.borderTopColor,
          borderWidth: style.borderTopWidth,
          padding: style.paddingTop,
          gap: style.columnGap,
        };
      });
    const commands = thing.getByTestId('canvas-thing-actions');
    await expect(commands).toHaveCSS('opacity', '1');
    expect(await treatment(commands)).toEqual(
      await treatment(page.locator('.command-dock__surface:visible')),
    );
    expect((await treatment(commands)).background).not.toBe(graphColor);

    // And the colour identifies the Graph where a Graph is: the points its Edges
    // leave the Thing from.
    const handle = thing.locator('.rf-thing-node__authoring-handle--source').first();
    await expect(handle).toHaveCSS('opacity', '1');
    await expect(handle).toHaveCSS('background-color', graphColor);
  },
);

/**
 * A Diagram draws the Graphs it owns. Selecting is navigation and writes
 * nothing (ADR 0031), so the revision is unmoved throughout.
 */
test('selecting a Diagram draws the Graphs it owns and only those', async ({ page }) => {
  await page.goto('/');
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');
  const legendItems = page.getByTestId('graph-legend').locator('.legend__item');

  await expect(selectedCanvas(page)).toContainText('Collection 1');
  await expect(await diagramChoices(page)).toHaveCount(2);
  await page.keyboard.press('Escape');

  // Collection 1 owns Long, Mid and Short over the shared spine: 4 + 3 + 2.
  await selectCanvas(page, 'Collection 1');
  await expect(page.locator('.react-flow__edge')).toHaveCount(9);
  await expect(legendItems).toHaveCount(3);
  const owned = await graphChoices(page);
  await expect(owned).toHaveCount(3);
  await expect(owned.filter({ hasText: 'Echo' })).toHaveCount(0);
  await page.keyboard.press('Escape');

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
 * The Command Dock's Graph cluster discloses every Graph the selected Diagram
 * owns, with its title, its colour and which one is active — which is what the
 * canvas HUD's key already said. Issue 06 keeps the key: it is the on-canvas
 * colour reference beside the Edges being read, and it is the one of the two
 * that is on screen without a menu being opened for it. What the decision costs
 * is this test — the two must never disagree, which is why both resolve a colour
 * through the one shared `graphColor` seam rather than each deriving its own.
 */
test(
  'the Dock and the canvas HUD agree about every Graph, disclosed or not',
  { tag: '@parity:graph-hud-and-dock-agree-on-the-active-graph' },
  async ({ page }) => {
    await page.goto('/');
    const legendItems = page.getByTestId('graph-legend').locator('.legend__item');
    await expect(legendItems).toHaveCount(3);

    // Titles, in the same order from the selected Diagram.
    const choices = await graphChoices(page);
    expect(await legendItems.allInnerTexts()).toEqual(await choices.allInnerTexts());

    // Colours. Lucide paints the menu row's glyph by `stroke`, the HUD paints
    // its stripe as a background — two properties, one resolved value each.
    // The Graph glyph and nothing else: a checked radio row also draws the
    // menu's own tick, and Lucide leaves that one on `currentColor` while
    // `GraphIcon` is given the Graph's resolved colour.
    const dockColors = await choices
      .locator('svg:not([stroke="currentColor"])')
      .evaluateAll((els: readonly Element[]) => els.map((el) => getComputedStyle(el).stroke));
    const hudColors = await legendItems
      .locator('[aria-hidden="true"]')
      .evaluateAll((els: readonly Element[]) =>
        els.map((el) => getComputedStyle(el).backgroundColor),
      );
    expect(hudColors).toEqual(dockColors);
    expect(new Set(hudColors).size).toBe(3);

    // Emphasis, through an activation neither surface owns — and asserted on
    // **both** surfaces, because agreement is the claim. Reading only the HUD
    // would leave the Dock free to stop marking the Active Graph entirely while
    // the one test named for the two agreeing stayed green.
    await page.keyboard.press('Escape');
    await activateGraph(page, 'Mid');
    const emphasised = page.getByTestId('graph-legend').locator('li[data-active="true"]');
    await expect(emphasised).toHaveCount(1);
    await expect(emphasised).toHaveText('Mid');
    await expect(activeGraph(page)).toContainText('Mid');
    const checked = (await graphChoices(page)).and(page.locator('[aria-checked="true"]'));
    await expect(checked).toHaveCount(1);
    await expect(checked).toHaveText('Mid');

    // And with the menu dismissed, which is the whole reason the key was kept:
    // the Dock names the Active Graph and nothing else without being opened,
    // while the key stays on the canvas beside the Edges it explains.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(emphasised).toHaveText('Mid');
    await expect(legendItems).toHaveCount(3);
  },
);

/**
 * The Title ladder, on the real canvas, against the space the app actually
 * loads.
 *
 * The Ladle story is where the front is reviewed whole; this is the half of that
 * evidence a browser owns — the projection carrying a stored multiline Title
 * through to a drawn Thing, clamped inside the Thing the author sized rather than
 * growing it. `T` is the fixture's one such Title, one line of each role
 * (packages/app/README.md), which is also why a regression here shows up in a
 * failure screenshot rather than only in a unit test.
 */
test(
  'a Thing whose author wrote more than one line draws its Title as Title Lines',
  { tag: '@parity:canvas-thing-front-draws-only-its-title-lines' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');

    const thing = page.locator('.react-flow__node[data-id="00000000-0000-4000-8000-00000000000e"]');
    await expect(thing).toBeVisible();

    const lines = thing.locator('.canvas-thing__title-line');
    await expect(lines).toHaveCount(3);
    expect(await lines.allInnerTexts()).toEqual(['T', 'a subtitle line', 'a caption line']);
    expect(
      await lines.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-role')),
      ),
    ).toEqual(['title', 'subtitle', 'caption']);

    // Descending, and nothing else drawn on the front: the Thing's own text is
    // its Title Lines, which is what the two undecided reference lines failed.
    const sizes = await lines.evaluateAll((elements) =>
      elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    );
    expect(sizes[0]! > sizes[1]!).toBe(true);
    expect(sizes[1]! > sizes[2]!).toBe(true);
    await expect(thing.locator('.canvas-thing__body > *')).toHaveCount(1);
    await expect(thing.locator('.canvas-thing__content')).toHaveCount(0);

    // A Title never resizes a Thing (ADR 0014, ADR 0083): three rungs draw in
    // the same box every other Thing on this Diagram has.
    const laddered = await boxOf(thing, 'the multiline-Title Thing');
    const plain = await boxOf(nodeByTitle(page, 'B'), 'Thing B');
    expect(laddered.height).toBeCloseTo(plain.height, 0);
    expect(laddered.width).toBeCloseTo(plain.width, 0);
  },
);

test('anchors stay measurable, so Edges attach where the Thing is', async ({ page }) => {
  await page.goto('/');

  // React Flow measures every handle's box to work out where an edge attaches,
  // so a handle hidden with `display: none` reports 0x0 and its edges land
  // somewhere else — silently, with no warning to catch. The four anchors sit at
  // `opacity: 0` until the reveal shows them, which keeps the box; that reads as
  // an ordinary styling choice, and this is what stops a later CSS tidy-up from
  // reaching for `display: none`. See react-flow-guidance/issues/03.
  const anchors = page.locator('.rf-thing-node__authoring-handle');
  await expect(anchors.first()).toBeAttached();

  const boxes = await anchors.evaluateAll((els) =>
    els.map((el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );

  // Asserted against whatever the fixture currently draws — its graph/thing
  // shape is free to change (fixture/README.md).
  expect(boxes.length).toBeGreaterThan(0);
  expect(boxes.every((box) => box.width > 0 && box.height > 0)).toBe(true);
});

test('selecting a graph keeps the others on screen', async ({ page }) => {
  await page.goto('/');
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');

  // Selection is emphasis: it never hides the rest of the space.
  await activateGraph(page, 'Mid');
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await expect(page.locator('.react-flow__edge')).toHaveCount(9);
  // Activating a graph changes emphasis, not the persisted document.
  await page.waitForTimeout(50);
  await expect(persistence).toHaveAttribute('data-revision', '0');
});

test('selecting a graph emphasises it without hiding the others', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__edge')).toHaveCount(9);

  const opacities = async () =>
    page
      .locator('.react-flow__edge-path')
      .evaluateAll((els) => els.map((el) => Number(getComputedStyle(el).opacity)));

  // Long is active on load, so Mid's three and Short's two Edges recede.
  const faded = (await opacities()).filter((o) => o < 1);
  expect(faded).toHaveLength(5);
  expect(faded[0]!).toBeGreaterThan(0);

  // Every graph stays drawn.
  await expect(page.locator('.react-flow__edge')).toHaveCount(9);
});

test('a thing shows its title in the graph, and opens to show rendered Markdown', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();

  // The graph draws the title, never the thing's body (ADR 0051). "entry point"
  // is A's body text, which must not appear.
  const a = nodeByTitle(page, 'A');
  await expect(a).toBeVisible();
  await expect(a).not.toContainText('entry point');
  await expect(a.getByRole('button', { name: 'Open Thing A' })).toBeVisible();

  // Opening renders the Markdown in the existing Thing and keeps Close reachable.
  await openThing(a, 'A');
  await expect(a.getByText('A', { exact: true }).last()).toHaveCSS('font-weight', '700');

  // Hovered again before the press: opening grows the Thing under the pointer, so
  // the rail the Open left revealed may already have faded by the time Close is
  // reached — and a faded rail takes no pointer events.
  await a.hover();
  await a.getByRole('button', { name: 'Close Thing A' }).click();
  await expect(a.getByRole('button', { name: 'Open Thing A' })).toBeVisible();
});

/** The two attributes of a Thing's content as one commit left them. */
interface PresenceCommit {
  readonly presence: string | null;
  readonly inert: string | null;
}

test('the Close action closes an opened thing', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const thing = nodeByTitle(page, 'A').first();
  await openThing(thing, 'A');
  await expect(thing.locator('.canvas-thing__content')).toHaveAttribute('data-presence', 'present');

  // Installed ahead of the Close click, because leaving is over before anything
  // out here can ask about it. `usePresence` keeps the leaving content mounted
  // for the duration the element itself declares — `--thing-placement-duration
  // * 0.4`, 80ms — and then unmounts it, so an `expect.poll` from the test
  // process is spending a CDP round trip on a window that is already closing;
  // on a loaded runner the first sample lands after the unmount and sees an
  // empty list. Shortening the intervals only narrows the odds, and widening
  // the timeout or accepting `[]` would pin nothing. Recording inside the page
  // has no round trip to lose: the observer runs on the commit itself, and the
  // record is read back afterwards at leisure.
  //
  // Both attributes are read together in the one callback, which is what makes
  // this one observation of one commit — `CanvasThing`'s `inert` layout effect
  // runs in the commit that writes `data-presence`, and a MutationObserver is
  // delivered after that whole commit rather than between its two writes. The
  // observer then stops, so `inert` arriving a commit later would be recorded
  // here as the `null` it was when `leaving` appeared, and fail. An empty
  // record is a failure too, and a different one: the content never entered
  // `leaving` at all.
  const leaving = await thing.evaluateHandle((node) => {
    const commits: PresenceCommit[] = [];
    new MutationObserver((_mutations, observer) => {
      const content = node.querySelector('.canvas-thing__content');
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

  await thing.getByRole('button', { name: 'Close Thing A' }).click();
  // The unmount is a fact worth asserting on its own and also the proof that
  // the leaving window has closed, so what the observer caught is read once
  // after it rather than polled for.
  await expect(thing.locator('.canvas-thing__content')).toHaveCount(0);
  expect(await leaving.jsonValue()).toEqual([{ presence: 'leaving', inert: '' }]);
  await expect(thing.getByRole('button', { name: 'Open Thing A' })).toBeVisible();
});

test('things are drawn at exactly the size the strategy placed them at', async ({ page }) => {
  await page.goto('/');
  const inner = page.locator('.rf-thing-node__inner').first();
  await expect(inner).toBeVisible();

  // The layout strategy arranges things at `thing.ts`'s size and the stylesheet draws them
  // from the same numbers. If these drift, handles land where the thing isn't —
  // silently, and looking like a strategy bug.
  const declared = await page.evaluate(() => {
    const el = document.querySelector('.graph-area')!;
    const s = getComputedStyle(el);
    return {
      w: s.getPropertyValue('--thing-width').trim(),
      h: s.getPropertyValue('--thing-height').trim(),
    };
  });
  expect(declared.w).toBe('260px');

  const drawn = await inner.evaluate((el) => {
    const s = getComputedStyle(el);
    const thing = el.querySelector('.canvas-thing')!;
    return { w: s.width, h: getComputedStyle(thing).height };
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

    await openThing(recap, 'A′');
    await expect(recap.getByText('entry point')).toBeVisible();
    await expect(recap.getByRole('heading', { name: 'A′', exact: true })).toBeVisible();
    await expect(recap.getByRole('textbox')).toHaveCount(0);
    await expect(recap.getByRole('button', { name: /Edit Thing/ })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Target' })).toHaveCount(0);
    await recap.getByRole('button', { name: 'Close Thing A′' }).click();

    await recap.focus();
    await page.keyboard.press('Enter');
    await expect(recap.getByRole('button', { name: 'Close Thing A′' })).toBeVisible();
    await recap.getByRole('button', { name: 'Close Thing A′' }).click();

    await recap.focus();
    await page.keyboard.press('Space');
    await expect(recap.getByText('entry point')).toBeVisible();
    await recap.click({ position: { x: 8, y: 8 } });
    const resizeControl = recap.locator('.react-flow__resize-control.handle.bottom.right');
    await expect(resizeControl).toBeVisible();
    await recap.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const persistence = page.getByTestId('persistence-status');
    await expect(persistence).toHaveText('Persisted');
    const beforeResizeRevisionValue = await persistence.getAttribute('data-revision');
    if (beforeResizeRevisionValue === null) {
      throw new Error('Persisted Alias A′ has no revision');
    }
    const beforeResizeRevision = Number(beforeResizeRevisionValue);
    const openSize = await recap.evaluate((element) => ({
      width: Number.parseFloat(getComputedStyle(element).width),
      height: Number.parseFloat(getComputedStyle(element).height),
    }));
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await settled(page);
    const resizeBox = await boxOf(resizeControl, "Alias A′'s resize control");
    // The drag has to end **inside the viewport**: a `mousemove` past the
    // window's edge is clamped, and the gesture then ends where it never went
    // and commits nothing. `A′` is the last Thing on the spine and sits near the
    // right edge, so the delta is what fits rather than what is round.
    const grabX = resizeBox.x + resizeBox.width / 2;
    const grabY = resizeBox.y + resizeBox.height / 2;
    const viewport = page.viewportSize();
    if (viewport === null) throw new Error('The resize drag needs a sized viewport.');
    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(Math.min(grabX + 120, viewport.width - 8), grabY + 80, { steps: 6 });
    await page.mouse.up();
    await expect(persistence).toHaveAttribute('data-revision', String(beforeResizeRevision + 1));
    await recap.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const resizedSize = await recap.evaluate((element) => ({
      width: Number.parseFloat(getComputedStyle(element).width),
      height: Number.parseFloat(getComputedStyle(element).height),
    }));
    expect(resizedSize.width).toBeGreaterThan(openSize.width);
    expect(resizedSize.height).toBeGreaterThan(openSize.height);

    await recap.getByRole('button', { name: 'Close Thing A′' }).click();
    await expect(persistence).toHaveAttribute('data-revision', String(beforeResizeRevision + 2));
    await openThing(recap, 'A′');
    await expect(persistence).toHaveAttribute('data-revision', String(beforeResizeRevision + 3));
    await recap.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const reopenedSize = await recap.evaluate((element) => ({
      width: Number.parseFloat(getComputedStyle(element).width),
      height: Number.parseFloat(getComputedStyle(element).height),
    }));
    expect(reopenedSize).toEqual(resizedSize);

    await page.reload();
    await selectCanvas(page, 'Collection 1');
    const persisted = nodeByTitle(page, 'A′');
    await expect(persisted.getByText('entry point')).toBeVisible();
    await expect(persisted.getByRole('button', { name: 'Close Thing A′' })).toBeVisible();
    const persistedSize = await persisted.evaluate((element) => ({
      width: Number.parseFloat(getComputedStyle(element).width),
      height: Number.parseFloat(getComputedStyle(element).height),
    }));
    expect(persistedSize).toEqual(resizedSize);
    await expect(persisted.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Target' })).toHaveCount(0);

    await persisted.getByRole('button', { name: 'Edit Title A′', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Thing title' })).toHaveValue('A′');
  },
);
