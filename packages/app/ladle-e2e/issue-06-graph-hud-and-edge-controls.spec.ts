import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Map, Graph, SpaceSnapshot } from '@project/core';
import { authoredSnapshot, sparseAuthoredSnapshot } from '../stories/support/spaces';

/**
 * The selected Edge's controls and the canvas HUD, on the rendered stories.
 *
 * Ladle proves the control semantics: what the two buttons do, that Edit and
 * nothing else opens the editor, that a refused Resource keeps its place disabled,
 * that each refusal lands on the channel ADR 0057 assigns it, and that Edit
 * reads as open while the editor is. The spatial half — these controls over
 * the real routed Edge, gated on selection and the Active Graph — is the
 * application suite's, in `editing.spec.ts`.
 */

const story = (name: string): string => `/?story=${name}&mode=preview`;

/**
 * The Map a story's Space opens on, read the way the application reads it —
 * through `defaultMap`, never `maps[0]` (array order is not a
 * declaration). What the Graph HUD assertions below hold the rendered key to.
 */
const openingMapOf = (snapshot: SpaceSnapshot): Map => {
  const map = snapshot.document.maps?.find(
    (candidate) => candidate.id === snapshot.document.defaultMap,
  );
  if (map === undefined) throw new Error('Story Space declares no opening Map.');
  return map;
};

/** The Graph a Map is active on, falling back to its first (ADR 0026). */
const activeGraphOf = (map: Map): Graph => {
  const active = map.graphs.find((graph) => graph.id === map.activeGraph) ?? map.graphs[0];
  if (active === undefined) throw new Error('Map owns no Graph.');
  return active;
};

/** Resolve a theme token the way the page paints it, not the way the recipe names it. */
const resolveToken = (locator: Locator, token: string): Promise<string> =>
  locator.evaluate((element, name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    element.after(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);

/** Where the canvas is, read off the element React Flow writes the transform on. */
const canvasTransform = (page: Page): Promise<string> =>
  page.locator('.react-flow__viewport').evaluate((element) => getComputedStyle(element).transform);

/**
 * React Flow keeps every MiniMap mark finite and clipped at several canvas zooms.
 *
 * Ticket 01's original failure left the nodes and mask in the DOM, but wrote
 * `NaN` into their coordinate system. Checking every node against the SVG's
 * visible box holds both halves of "drawn to scale": none can become the old
 * full-size canvas rect, and none can escape the map while remaining smaller
 * than it.
 *
 * **The zoom the wheel asks for is asserted, not assumed.** The MiniMap's SVG
 * has d3-zoom called on it whether or not it is `zoomable`, and d3-zoom's wheel
 * handler `preventDefault`s either way — so a wheel here reaches nothing else on
 * the page, and against a map that is not `zoomable` this loop would check one
 * unmoved drawing three times over while its own name said "several canvas
 * zooms".
 */
const expectMinimapDrawnToScale = async (page: Page): Promise<void> => {
  const minimap = page.locator('.react-flow__minimap');
  const svg = page.locator('.react-flow__minimap-svg');
  const nodes = page.locator('.react-flow__minimap-node');
  const mask = page.locator('.react-flow__minimap-mask');

  const expectFiniteContainedDrawing = async (): Promise<void> => {
    const viewBoxAttribute = await svg.getAttribute('viewBox');
    if (viewBoxAttribute === null) throw new Error('The minimap SVG drew no viewBox.');
    const viewBoxNumbers = viewBoxAttribute.trim().split(/\s+/).map(Number);
    expect(viewBoxNumbers).toHaveLength(4);
    for (const value of viewBoxNumbers) {
      expect(Number.isFinite(value)).toBe(true);
    }

    await expect(mask).not.toHaveAttribute('d', /NaN/);

    const svgBox = await svg.boundingBox();
    if (svgBox === null) throw new Error('The minimap SVG drew no measurable box.');
    const nodeBoxes = await nodes.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      }),
    );
    expect(nodeBoxes.length).toBeGreaterThan(0);
    for (const box of nodeBoxes) {
      expect(box.width).toBeLessThan(svgBox.width);
      expect(box.height).toBeLessThan(svgBox.height);
      expect(box.x).toBeGreaterThanOrEqual(svgBox.x - 0.5);
      expect(box.y).toBeGreaterThanOrEqual(svgBox.y - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(svgBox.x + svgBox.width + 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(svgBox.y + svgBox.height + 0.5);
    }
  };

  await expect(minimap).toBeVisible();
  await expectFiniteContainedDrawing();

  for (const deltaY of [-300, 600]) {
    const before = await canvasTransform(page);
    await minimap.hover();
    await page.mouse.wheel(0, deltaY);
    await expect.poll(() => canvasTransform(page)).not.toBe(before);
    await expectFiniteContainedDrawing();
  }
};

test(
  'the selected Edge controls offer Edit and Delete, and open nothing on their own',
  { tag: '@parity:selected-edge-controls-offer-edit-and-delete' },
  async ({ page }) => {
    await page.goto(story('components--selected-edge-controls--closed'));

    const edit = page.getByRole('button', { name: 'Edit this Edge' });
    await expect(edit).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete this Edge' })).toBeVisible();
    await expect(edit).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('edge-editor')).toHaveCount(0);

    // Reachable and operable from the keyboard alone, in the order they read.
    await edit.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Delete this Edge' })).toBeFocused();

    await edit.click();

    await expect(page.getByTestId('edge-editor')).toBeVisible();
    await expect(edit).toHaveAttribute('aria-expanded', 'true');

    // **Edit toggles, and pressing it again is the close.** The control
    // advertises that with `aria-expanded`, so it has to be true: a button that
    // says it owns an expanded resource and cannot collapse it leaves Escape as the
    // only way out. It is the popup's registered trigger for exactly this
    // reason — an unregistered button counts as an *outside press*, which closes
    // the popup on pointerdown and lets the click that follows reopen it.
    await edit.click();

    await expect(page.getByTestId('edge-editor')).toHaveCount(0);
    await expect(edit).toHaveAttribute('aria-expanded', 'false');
  },
);

test(
  "a selected Edge's Edit trigger reads as open while its editor is",
  { tag: '@parity:selected-edge-edit-trigger-reads-as-open' },
  async ({ page }) => {
    await page.goto(story('components--selected-edge-controls--closed'));
    const closed = page.getByRole('button', { name: 'Edit this Edge' });
    const restingFill = await resolveToken(closed, '--secondary');
    await expect(closed).toHaveAttribute('aria-expanded', 'false');
    await expect(closed).not.toHaveCSS('background-color', restingFill);

    await page.goto(story('components--selected-edge-controls--endpoint-editor'));
    const edit = page.getByRole('button', { name: 'Edit this Edge' });
    const del = page.getByRole('button', { name: 'Delete this Edge' });
    const openFill = await resolveToken(edit, '--secondary');
    await expect(edit).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('edge-editor')).toBeVisible();
    // The fill, not only the attribute: `aria-expanded` already has a home in
    // the offer-edit-and-delete claim. This one holds that the quiet recipe
    // paints the open trigger with the secondary panel fill.
    await expect(edit).toHaveCSS('background-color', openFill);
    await expect(del).not.toHaveCSS('background-color', openFill);
  },
);

test(
  'the endpoint editor names both endpoints and dismisses on Escape',
  { tag: '@parity:selected-edge-editor-shows-both-endpoints' },
  async ({ page }) => {
    await page.goto(story('components--selected-edge-controls--endpoint-editor'));

    const from = page.getByRole('combobox', { name: 'From' });
    const to = page.getByRole('combobox', { name: 'To' });
    await expect(from).toHaveValue('Resource 1');
    await expect(to).toHaveValue('Resource 2');

    // Choosing a Resource is the completion, and it settles the editor.
    await to.press('ArrowDown');
    await page.getByRole('option', { name: /Resource 4/ }).click();

    await expect(page.getByTestId('edge-editor')).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit this Edge' }).click();
    await expect(page.getByRole('combobox', { name: 'To' })).toHaveValue('Resource 4');

    // Escape dismisses the open list first, then the editor above it — two
    // layers, one press each (ADR 0048).
    //
    // Each press waits on the state it is about to change. Without that the
    // sequence is a race the browser wins about one run in ten: `ArrowDown`
    // opens the list asynchronously, and both Base UI surfaces answer Escape
    // from a *document* keydown listener, so a second press issued before the
    // first has settled reaches a layer that has already gone.
    const reopened = page.getByRole('combobox', { name: 'To' });
    await reopened.press('ArrowDown');
    await expect(reopened).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');

    await expect(reopened).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('edge-editor')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('edge-editor')).toHaveCount(0);
  },
);

test(
  'an ineligible endpoint keeps its place in the list, disabled, with its reason',
  { tag: '@parity:selected-edge-endpoint-refusal-disables-its-choice' },
  async ({ page }) => {
    await page.goto(story('components--selected-edge-controls--disabled-choice'));

    await page.getByRole('combobox', { name: 'To' }).press('ArrowDown');

    const refused = page.getByRole('option', {
      name: /These Resources are already connected in this Graph/,
    });
    await expect(refused).toHaveAttribute('aria-disabled', 'true');
    await expect(refused).toContainText('Resource 3');
    // Still offered rather than filtered out: an author searching for it finds
    // it, and finds out why it cannot be taken.
    await expect(page.getByRole('option')).toHaveCount(5);
  },
);

/*
 * Written out twice rather than looped, and that is the catalogue check's rule
 * rather than a preference: `scripts/ui-catalog.ts` reads a test's title and its
 * `tag` as *literals* off the syntax tree, so a computed title or a ternary tag
 * is evidence it cannot see at all.
 */
test(
  'a refused From endpoint marks only that Field and describes it',
  { tag: '@parity:selected-edge-from-refusal-is-field-local' },
  async ({ page }) => {
    await page.goto(story('components--selected-edge-controls--from-refusal'));

    const attempted = page.getByRole('combobox', { name: 'From' });
    await expect(attempted).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('combobox', { name: 'To' })).toHaveAttribute(
      'aria-invalid',
      'false',
    );

    // The sentence is reachable from the Field rather than merely near it.
    const describedBy = await attempted.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    await expect(page.locator(`#${describedBy ?? ''}`)).toHaveText(
      'These Resources are already connected in this Graph.',
    );
    await expect(page.getByTestId('edge-endpoint-refusal')).toHaveCount(0);
  },
);

test(
  'a refused To endpoint marks only that Field and describes it',
  { tag: '@parity:selected-edge-to-refusal-is-field-local' },
  async ({ page }) => {
    await page.goto(story('components--selected-edge-controls--to-refusal'));

    const attempted = page.getByRole('combobox', { name: 'To' });
    await expect(attempted).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('combobox', { name: 'From' })).toHaveAttribute(
      'aria-invalid',
      'false',
    );

    const describedBy = await attempted.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    await expect(page.locator(`#${describedBy ?? ''}`)).toHaveText(
      'These Resources are already connected in this Graph.',
    );
    await expect(page.getByTestId('edge-endpoint-refusal')).toHaveCount(0);
  },
);

test(
  'a reconnection refusal no endpoint could correct uses the form channel',
  { tag: '@parity:selected-edge-stale-reconnection-uses-the-form-channel' },
  async ({ page }) => {
    await page.goto(story('components--selected-edge-controls--reconnection-refusal'));

    await expect(page.getByTestId('edge-endpoint-refusal')).toHaveText(
      'That Edge is no longer in this Graph.',
    );
    // Neither Field is marked, because neither list holds a row that would
    // answer a Graph that no longer has this Edge.
    await expect(page.getByRole('combobox', { name: 'From' })).toHaveAttribute(
      'aria-invalid',
      'false',
    );
    await expect(page.getByRole('combobox', { name: 'To' })).toHaveAttribute(
      'aria-invalid',
      'false',
    );
    await expect(page.getByRole('alert')).toBeVisible();
  },
);

test(
  'a refused Delete stays on the controls that asked',
  { tag: '@parity:selected-edge-deletion-refusal-stays-on-its-controls' },
  async ({ page }) => {
    await page.goto(story('components--selected-edge-controls--deletion-refusal'));

    await expect(page.getByTestId('edge-delete-refusal')).toHaveText(
      'Select a Map to edit its Edges.',
    );
    await expect(page.getByRole('alert')).toBeVisible();
    // Not an endpoint error in an editor nobody opened.
    await expect(page.getByTestId('edge-editor')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete this Edge' })).toBeVisible();
  },
);

/**
 * The HUD on a real canvas: React Flow's own MiniMap over nodes it measured.
 *
 * What the story fixes is the key beside it — the Graphs the open Map
 * owns, in authored order, each with its resolved colour, and exactly one
 * emphasised. **Emphasis is not filtering** (ADR 0040): the inactive Graphs
 * stay listed and stay coloured. The expectations are read off the Space the
 * story opens rather than written as a second literal list here — `Retained`
 * opens on `Collection 1`, which owns three of the Space's four Graphs, and a
 * literal `['Long', 'Mid', 'Short', 'Echo']` would be evidence of the flatten
 * ticket 02 removed rather than of the rule that replaced it. That the
 * emphasis *moves* with an activation, and that the Command Dock agrees when
 * it does, is the paired application evidence's claim — activation is the
 * Dock's command and a story-only button for it would prove nothing here.
 */
test(
  'the Graph HUD keys every Graph and emphasises the active one',
  { tag: '@parity:graph-hud-and-dock-agree-on-the-active-graph' },
  async ({ page }) => {
    await page.goto(story('surfaces--graph-hud--retained'));

    const map = openingMapOf(authoredSnapshot);
    const titles = map.graphs.map((graph) => graph.title);
    const active = activeGraphOf(map);

    await expect(page.getByTestId('hud-space')).toHaveText(authoredSnapshot.document.title);
    await expect(page.getByTestId('hud-map')).toHaveText(map.title);
    await expect(page.getByTestId('canvas-identity').getByRole('button')).toHaveCount(0);

    const key = page.getByTestId('graph-legend');
    const items = key.locator('.legend__item');
    await expect(items).toHaveCount(titles.length);
    expect(await items.allInnerTexts()).toEqual(titles);
    // The minimap is React Flow's own, drawing the nodes the flow measured —
    // the fixture supplies no substitute for it and no geometry of its own.
    const minimap = page.locator('.react-flow__minimap');
    await expect(minimap).toBeVisible();
    await expect(page.locator('.react-flow__minimap-node')).toHaveCount(
      Object.keys(map.positions).length,
    );

    // The key and MiniMap are sibling Panels meeting at one edge. This catches
    // both the old nested MiniMap and two bottom-right Panels overlapping.
    const keyPanel = page
      .locator('.react-flow__panel')
      .filter({ has: page.getByTestId('canvas-identity') });
    const keyBox = await keyPanel.boundingBox();
    const minimapBox = await minimap.boundingBox();
    if (keyBox === null || minimapBox === null) throw new Error('The HUD drew no measurable box.');
    expect(keyBox.y + keyBox.height).toBeCloseTo(minimapBox.y, 0);
    expect(minimapBox.width).toBe(200);
    expect(minimapBox.height).toBe(150);

    await expectMinimapDrawnToScale(page);

    // Exactly one, and the others are dimmed rather than dropped.
    await expect(key.locator('li[data-active="true"]')).toHaveCount(1);
    await expect(key.locator('li[data-active="true"]')).toHaveText(active.title);
    await expect(key.locator('li[data-active="false"]')).toHaveCount(titles.length - 1);
    const stripes = await items
      .locator('[aria-hidden="true"]')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
    expect(new Set(stripes).size).toBe(titles.length);
  },
);

/**
 * The key panel is a read-out, so the canvas keeps the pointers over it.
 *
 * A `.react-flow__panel` has no `pointer-events` rule of React Flow's own, so
 * a Panel swallows every gesture over its box — and this HUD stands in the
 * corner a Resource's bottom-right resize control lives in. The key holds no
 * control, so it hands them back; the two clipped names keep theirs, because
 * their `title` is the only place a truncated name can be read. The MiniMap
 * beside it is excluded on purpose: it pans and zooms, so it is *meant* to
 * take what lands on it.
 */
test(
  'the Graph HUD key hands the canvas back every pointer it does not need',
  { tag: '@parity:graph-hud-key-hands-back-the-pointers-it-does-not-need' },
  async ({ page }) => {
    await page.goto(story('surfaces--graph-hud--retained'));

    /** What a press at this point would land on. */
    const topmostAt = (x: number, y: number): Promise<string> =>
      page.evaluate(
        ([px, py]: readonly number[]) => {
          const element = document.elementFromPoint(px ?? 0, py ?? 0);
          if (element === null) return 'nothing';
          if (element.closest('[data-testid="hud-space"], [data-testid="hud-map"]') !== null)
            return 'name';
          if (element.closest('.react-flow__panel') !== null) return 'hud';
          return 'canvas';
        },
        [x, y],
      );

    const key = page.getByTestId('graph-legend');
    const keyBox = await key.boundingBox();
    const name = page.getByTestId('hud-space');
    const nameBox = await name.boundingBox();
    if (keyBox === null || nameBox === null) throw new Error('The HUD drew no measurable box.');

    // The key's own rows, which are the widest part of the panel.
    expect(await topmostAt(keyBox.x + keyBox.width / 2, keyBox.y + keyBox.height / 2)).toBe(
      'canvas',
    );
    expect(await topmostAt(keyBox.x + 4, keyBox.y + 4)).toBe('canvas');
    // The clipped name still answers, so its `title` can be read.
    expect(await topmostAt(nameBox.x + 4, nameBox.y + nameBox.height / 2)).toBe('name');
    await expect(name).toHaveAttribute('title', await name.innerText());
  },
);

/**
 * The key changes with the Map it opens on, not with the Space.
 *
 * `SparseMap` opens the tracked Space on `Collection 2` rather than
 * `Collection 1` — one Graph, `Echo`, instead of three. The expectation is
 * read off `sparseAuthoredSnapshot` the same way the `Retained` case reads
 * its own, so this is the same rule proven on a second Map rather than a
 * transcription of what today's fixture happens to draw.
 * `packages/app/e2e/overview.spec.ts`'s "selecting a Map draws the Graphs
 * it owns and only those" is the same claim in the browser, over the tracked
 * fixture rather than this catalogue's.
 */
test(
  'the Graph HUD key changes with the Map it opens on',
  { tag: '@parity:graph-hud-key-follows-the-open-map' },
  async ({ page }) => {
    await page.goto(story('surfaces--graph-hud--sparse-map'));

    const map = openingMapOf(sparseAuthoredSnapshot);
    const titles = map.graphs.map((graph) => graph.title);
    const active = activeGraphOf(map);

    const items = page.getByTestId('graph-legend').locator('.legend__item');
    await expect(items).toHaveCount(titles.length);
    expect(await items.allInnerTexts()).toEqual(titles);
    await expect(items.first()).toHaveAttribute('data-active', 'true');
    await expect(items.first()).toHaveText(active.title);
    await expect(page.locator('.react-flow__minimap-node')).toHaveCount(
      Object.keys(map.positions).length,
    );

    // Ticket 01 requires the scale proof at every catalogue Map. This
    // sparse second Map has a different authored extent, so it catches a
    // map that happens to be valid only for Collection 1's five-node spine.
    await expectMinimapDrawnToScale(page);
  },
);
