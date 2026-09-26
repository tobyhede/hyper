import { expect, test, type Page } from '@playwright/test';
import type { Map, Graph, SpaceSnapshot } from '@project/core';
import { authoredSnapshot, sparseAuthoredSnapshot } from '../stories/support/spaces';

/** The canvas HUD, on the rendered stories. */

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

/** Where the canvas is, read off the element React Flow writes the transform on. */
const canvasTransform = (page: Page): Promise<string> =>
  page.locator('.react-flow__viewport').evaluate((element) => getComputedStyle(element).transform);

/**
 * React Flow keeps every MiniMap mark finite and clipped at several canvas zooms.
 *
 * A MiniMap can leave its nodes and mask in the DOM while writing `NaN` into
 * their coordinate system. Checking every node against the SVG's visible box
 * holds both halves of "drawn to scale": none can become a full-size canvas
 * rect, and none can escape the map while remaining smaller than it.
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

/**
 * The HUD on a real canvas: React Flow's own MiniMap over nodes it measured.
 *
 * What the story fixes is the key beside it — the Graphs the open Map
 * owns, in authored order, each with its resolved colour, and exactly one
 * emphasised. **Emphasis is not filtering** (ADR 0040): the inactive Graphs
 * stay listed and stay coloured. The expectations are read off the Space the
 * story opens rather than written as a second literal list here — `Retained`
 * opens on `Collection 1`, which owns three of the Space's four Graphs, and a
 * literal `['Long', 'Mid', 'Short', 'Echo']` would be evidence of a key
 * flattened across every Map rather than of the rule that each Map lists its
 * own Graphs. That the
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
    // both a MiniMap nested in the key and two bottom-right Panels overlapping.
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
    const lines = await items
      .locator('[data-slot="graph-legend-mark-line"]')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
    expect(new Set(lines).size).toBe(titles.length);
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

    // The scale proof holds at every catalogue Map. This
    // sparse second Map has a different authored extent, so it catches a
    // map that happens to be valid only for Collection 1's five-node spine.
    await expectMinimapDrawnToScale(page);
  },
);
