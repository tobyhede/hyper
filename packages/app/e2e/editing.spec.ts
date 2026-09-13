import {
  COLLAPSED_THING_SIZE,
  DEFAULT_OPEN_SIZE,
  encodeCompactUuid,
  uuidSchema,
  type ThingPlacement,
} from '@project/core';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { markdownSource, PRIMARY_MODIFIER } from './markdown-source';
import {
  AUTHORING_HANDLE_SIDES,
  activateGraph,
  activeThing,
  activeGraph,
  allPositions,
  authoringHandle,
  boxOf,
  connectHandles,
  connectToEmptyWithAlt,
  createThing,
  createThingControl,
  dock,
  dragBy,
  expectThingFillsNode,
  diagramChoices,
  diagramMenu,
  newDiagram,
  settleNewDiagramName,
  nodeByTitle,
  openThing,
  positionOf,
  presentControl,
  selectCanvas,
  selectedCanvas,
  settled,
  spaceName,
  viewportTransform,
} from './graph';
import { seedPositionedDiagram } from './seed';

/**
 * The barrier a *negative* assertion needs.
 *
 * `toHaveAttribute` and `toHaveText` retry, but they succeed on their first poll
 * when the value already matches — so "the revision did not move" passes
 * instantly and cannot see an edit that arrives a moment later. Only elapsed
 * time makes it mean anything. `settled` is not that: it gates the camera, and
 * the delay it happens to take is incidental to what it promises.
 *
 * A completed edit installs its snapshot synchronously and reaches the DOM
 * within a frame or two, so this is generous against the case being ruled out.
 */
async function quiescent(page: Page): Promise<void> {
  await settled(page);
  await page.waitForTimeout(250);
}

async function addExistingThing(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Things', exact: true }).click();
  await page.getByRole('button', { name: `Add ${title} to Diagram` }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Things' })).toHaveCount(0);
}

function sameEdgeGeometry(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  const numbers = (path: string) => (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const leftNumbers = numbers(left);
  const rightNumbers = numbers(right);
  return (
    leftNumbers.length === rightNumbers.length &&
    leftNumbers.every((value, index) => Math.abs(value - (rightNumbers[index] ?? Infinity)) < 0.01)
  );
}

/**
 * A point on the pane far enough from every handle that React Flow resolves no
 * connection target — `connectionRadius` is 20 at the pinned 12.11.2, so a
 * release nearer than that reads as aiming at a handle rather than at canvas.
 */
async function emptyCanvasPoint(page: Page): Promise<{ x: number; y: number }> {
  const pane = await boxOf(page.locator('.react-flow__pane'), 'the React Flow pane');
  const point = { x: pane.x + 24, y: pane.y + 24 };
  const clear = await page.evaluate((at) => {
    // Optional chaining would turn a null hit into `undefined`, which is neither
    // `=== null` nor `!== null` in the way either check reads — so the element is
    // required first and only then asked what it is under.
    const hit = document.elementFromPoint(at.x, at.y);
    return hit !== null && hit.closest('.react-flow__node') === null;
  }, point);
  expect(clear, 'the chosen point is over a Thing rather than empty canvas').toBe(true);
  return point;
}

/**
 * Drag one endpoint of a selected Edge to a screen point.
 *
 * The anchors are transparent circles React Flow draws only on a reconnectable
 * Edge, so the press is asserted to land on one — a Thing handle drawn over it
 * would otherwise read as a reconnection that silently never began. React Flow
 * starts the connection on the first move after mousedown and can swallow a
 * single jump, which is why the move is stepped, as in `connectHandles`.
 */
async function dragEndpointTo(
  page: Page,
  edge: Locator,
  end: 'source' | 'target',
  to: { x: number; y: number },
): Promise<void> {
  const anchor = await boxOf(edge.locator(`.react-flow__edgeupdater-${end}`), `the ${end} anchor`);
  const from = { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 };
  const onAnchor = await page.evaluate((at) => {
    const hit = document.elementFromPoint(at.x, at.y);
    return hit !== null && hit.closest('.react-flow__edgeupdater') !== null;
  }, from);
  expect(onAnchor, `the ${end} reconnect anchor is covered at its own centre`).toBe(true);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  try {
    await page.mouse.move(from.x + 12, from.y, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 6 });
  } finally {
    await page.mouse.up();
  }
}

/** Drag one endpoint onto a Thing's seeking-end authoring handle. */
async function reconnectOnto(
  page: Page,
  edge: Locator,
  end: 'source' | 'target',
  targetHandle: Locator,
): Promise<void> {
  const anchor = await boxOf(edge.locator(`.react-flow__edgeupdater-${end}`), `the ${end} anchor`);
  const from = { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  try {
    await page.mouse.move(from.x + 12, from.y, { steps: 3 });
    // Eligibility arms `connectableend` once the reconnect drag has begun;
    // seeking-end *visibility* waits until the pointer is within product
    // proximity of the Thing (connection-handle-proximity/01). Hidden handles
    // keep `pointer-events: none`, so Playwright `hover` cannot arm them —
    // move by coordinates onto the drop handle first (same as `connectHandles`).
    await expect(targetHandle).toHaveClass(/connectableend/);
    const drop = await boxOf(targetHandle, 'the reconnect drop handle');
    await page.mouse.move(drop.x + drop.width / 2, drop.y + drop.height / 2, { steps: 6 });
    await expect(targetHandle).toHaveCSS('opacity', '1');
    expect(await targetHandle.evaluate((element) => element.matches(':hover'))).toBe(true);
  } finally {
    await page.mouse.up();
  }
}

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

/**
 * Click one focusable Edge, and answer the accessible name it carries.
 *
 * Only the Active Graph's Edges are selectable, and an Edge is an SVG path a few
 * pixels wide, so the point is found by walking the geometry and hit-testing:
 * `elementFromPoint` answers null outside the viewport and `closest` answers null
 * off an Edge, so both are checked rather than assumed.
 */
async function selectAnEdge(page: Page): Promise<string> {
  const point = await page
    .locator('.react-flow__edge[tabindex] .react-flow__edge-path')
    .evaluateAll((paths) => {
      for (const path of paths) {
        // SAFETY: `.react-flow__edge-path` only ever matches the `<path>`
        // element React Flow's SVG edge renderer draws, so it's always an
        // `SVGPathElement`.
        const geometry = path as SVGPathElement;
        const transform = geometry.getScreenCTM();
        if (transform === null) continue;
        const length = geometry.getTotalLength();
        for (const fraction of [0.5, 0.25, 0.75, 0.4, 0.6]) {
          const at = geometry.getPointAtLength(length * fraction).matrixTransform(transform);
          const hit = document.elementFromPoint(at.x, at.y)?.closest('.react-flow__edge');
          if (hit) return { x: at.x, y: at.y };
        }
      }
      throw new Error('No focusable Edge has a clickable point.');
    });
  await page.mouse.click(point.x, point.y);
  const selected = page.locator('.react-flow__edge.selected');
  await expect(selected).toHaveCount(1);
  return (await selected.getAttribute('aria-label')) ?? '';
}

test(
  'inline title editing persists without moving or opening the Thing',
  { tag: '@parity:canvas-thing-owns-title-editing-and-refusal' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    const thing = nodeByTitle(page, 'A').first();
    await expect(thing).toBeVisible();
    await settled(page);
    const before = await allPositions(page);

    const actions = thing.getByTestId('canvas-thing-actions');
    // Asserted on the container, not on the button: the reveal is
    // `opacity`/`pointer-events` on `.canvas-thing__actions`, and `opacity` does
    // not inherit — a computed `opacity` read off the button is `1` whether the
    // Thing is hovered or not, so the same assertion there cannot fail.
    await expect(actions).toHaveCSS('opacity', '0');
    await thing.hover();
    await expect(actions).toHaveCSS('opacity', '1');
    const edit = thing.getByRole('button', { name: 'Open Thing A' });
    // The affordance draws a glyph, so nothing about its own content keeps it in
    // shape or in place. Sized square in CSS and parked in the corner, clear of
    // the title — a name is what a screen reader gets, and the box is all a
    // pointer gets.
    const editBox = await boxOf(edit, 'the Thing affordance');
    const thingBox = await boxOf(thing, 'Thing A');
    const titleBox = await boxOf(thing.getByRole('heading', { name: 'A' }), "Thing A's title");
    expect(Math.abs(editBox.width - editBox.height)).toBeLessThanOrEqual(1);
    expect(editBox.x).toBeGreaterThanOrEqual(thingBox.x);
    expect(editBox.x + editBox.width).toBeLessThanOrEqual(thingBox.x + thingBox.width);
    expect(editBox.y).toBeGreaterThanOrEqual(thingBox.y);
    expect(editBox.y + editBox.height).toBeLessThanOrEqual(titleBox.y);

    // The displayed Title is its own control (ADR 0065): activating it neither
    // selects nor opens the Thing around it.
    await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
    await thing.getByRole('button', { name: 'Edit Title A' }).click();
    await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
    await expect(page.locator('.canvas-thing[data-expanded="true"]')).toHaveCount(0);
    const title = page.getByRole('textbox', { name: 'Thing title' });
    await title.fill('Renamed A');
    await title.press('Enter');

    const renamed = nodeByTitle(page, 'Renamed A').first();
    await expect(renamed).toBeVisible();
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
    await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
    expect(await allPositions(page)).toEqual(before);

    await openThing(renamed, 'Renamed A');
    await renamed.getByRole('button', { name: 'Close Thing Renamed A' }).click();
    await renamed.click();
    await page.keyboard.press('F2');
    const keyboardTitle = page.getByRole('textbox', { name: 'Thing title' });
    await expect(keyboardTitle).toBeVisible();
    await keyboardTitle.fill('');
    await nodeByTitle(page, 'B').first().click();
    await expect(keyboardTitle).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.canvas-thing[data-expanded="true"]')).toHaveCount(0);
    await quiescent(page);
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '3');
    await keyboardTitle.focus();
    await page.keyboard.press('Escape');

    await page.reload();
    await expect(nodeByTitle(page, 'Renamed A').first()).toBeVisible();
  },
);

test("a short Title control's hit-area hugs its text, not the whole Thing body", async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const thing = nodeByTitle(page, 'A').first();
  await expect(thing).toBeVisible();
  await settled(page);

  const thingBox = await boxOf(thing, 'Thing A');
  const titleBox = await boxOf(
    thing.getByRole('button', { name: 'Edit Title A' }),
    "Thing A's Title",
  );

  // Editing is the Title's own activation (ADR 0065), so its target
  // must claim only the pixels it draws — a one-letter title next to a much
  // wider thing is the case that tells a shrunk-to-fit title apart from one
  // stretched to the thing's full width.
  expect(titleBox.width).toBeLessThan(thingBox.width - 40);

  // A point in the blank band to the title's right, still inside the thing body
  // and at the title's own height — over the thing, but off its text.
  const blankSpace = {
    x: (titleBox.x + titleBox.width + thingBox.x + thingBox.width) / 2,
    y: titleBox.y + titleBox.height / 2,
  };
  await page.mouse.click(blankSpace.x, blankSpace.y);
  await expect(page.getByRole('textbox', { name: 'Thing title' })).toHaveCount(0);
  await expect(page.locator('.canvas-thing[data-expanded="true"]')).toHaveCount(0);
});

test('a click selects a Thing, and no pointer gesture on its body opens it', async ({ page }) => {
  await page.goto('/');
  const thing = nodeByTitle(page, 'A').first();
  await expect(thing).toBeVisible();
  await settled(page);
  const transform = await viewportTransform(page);

  await thing.click();
  await expect(thing).toHaveClass(/selected/);
  await expect(page.locator('.canvas-thing[data-expanded="true"]')).toHaveCount(0);

  // Off the Title, which has its own control. React Flow zooms on a double click
  // by default and its filter exempts only `.nopan`, which a Thing is not.
  await thing.dblclick({ position: { x: 24, y: 12 } });
  await expect(page.locator('.canvas-thing[data-expanded="true"]')).toHaveCount(0);
  expect(await viewportTransform(page)).toEqual(transform);
});

test('the Thing affordance opens rendered Markdown and edits it in place', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const thing = nodeByTitle(page, 'A').first();
  await expect(thing).toBeVisible();
  await settled(page);

  await openThing(thing, 'A');

  await expect(thing).toContainText('entry point');
  await thing.getByRole('button', { name: 'Edit Thing A' }).click();
  const source = page.getByRole('textbox', { name: 'Markdown source of A' });
  await source.fill('Authored from the graph');
  await thing.getByRole('button', { name: 'Save Thing A' }).click();
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  await page.reload();
  const reopened = nodeByTitle(page, 'A').first();
  await expect(reopened).toContainText('Authored from the graph');
});

test(
  'the open Markdown Thing owns exact source, cancellation and commit',
  { tag: '@parity:open-markdown-thing-owns-its-editing-lifecycle' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    const thingA = nodeByTitle(page, 'A').first();
    await settled(page);
    await openThing(thingA, 'A');
    await thingA.hover();
    const bodyTarget = thingA.getByTestId('markdown-thing-body-edit-target');
    await expect(bodyTarget).toHaveCSS('opacity', '0');
    await expect(bodyTarget.locator('svg')).toHaveCount(0);
    expect(
      await thingA
        .getByTestId('canvas-thing-actions')
        .getByRole('button')
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
      // The rail carries the Thing's own actions menu between Edit and Close now:
      // a Thing's addresses and its deletion belong to the Thing (ADR 0073), and
      // the Space's command surface does not draw them at all (ADR 0082). The
      // list is asserted whole rather than by presence, so a control appearing
      // here is a decision rather than a drift.
    ).toEqual(['Edit Thing A', 'Actions for Thing A', 'Close Thing A']);
    await bodyTarget.click();
    const source = page.getByRole('textbox', { name: 'Markdown source of A' });
    await expect(source).toBeFocused();
    const lineNumbers = page.locator('[data-slot="markdown-source-line-numbers"]');
    await expect(lineNumbers).toBeVisible();
    const originalLineNumbers = await lineNumbers.elementHandle();
    expect(originalLineNumbers).not.toBeNull();

    // A quarter of `--canvas-thing-muted-color`, as Chrome serialises the
    // `color-mix` in `markdown-thing-body.css` — the Thing's own muted ink,
    // washed. It was `--accent`, the chrome's highlighted-row fill, which on the
    // light theme is a near-white and would leave a selection nobody could see
    // on cream.
    expect(
      await source.evaluate((element) =>
        getComputedStyle(element.firstElementChild ?? element, '::selection').getPropertyValue(
          'background-color',
        ),
      ),
    ).toBe('color(srgb 0.290196 0.313726 0.360784 / 0.25)');

    const exact = '# Exact\n\n  two spaces and `code`';
    await source.fill(exact);
    expect(await originalLineNumbers?.evaluate((element) => element.isConnected)).toBe(true);
    await expect(lineNumbers).toBeVisible();
    await expect(source).toContainText('two spaces and `code`');
    await source.press(`${PRIMARY_MODIFIER}+z`);
    await expect(source).toContainText('entry point');
    await source.press(`${PRIMARY_MODIFIER}+Shift+z`);
    await expect(source).toContainText('two spaces and `code`');

    await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
    await expect(source).toBeVisible();
    await source.press('Escape');
    await expect(source).toHaveCount(0);
    await expect(thingA).toContainText('entry point');

    // Hovered first: the click on the pane above took the pointer off the Thing,
    // and a rail nobody is pointing at takes no pointer events — which is what
    // the reload branch below already spells out.
    await thingA.hover();
    await thingA.getByRole('button', { name: 'Edit Thing A' }).click();
    const committedSource = page.getByRole('textbox', { name: 'Markdown source of A' });
    await committedSource.fill(exact);
    await committedSource.press(`${PRIMARY_MODIFIER}+Enter`);
    await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
    await page.reload();
    const persisted = nodeByTitle(page, 'A').first();
    await expect(persisted).toContainText('two spaces and code');
    await persisted.hover();
    await persisted.getByRole('button', { name: 'Edit Thing A' }).click();
    await expect(page.getByRole('textbox', { name: 'Markdown source of A' })).toContainText(
      'two spaces and `code`',
    );
  },
);

/**
 * The two things Done and Escape do not cover.
 *
 * Cancel is a *discard*, and every other Cancel in this suite is clicked on a pane
 * whose source was never touched — so nothing failed if Cancel committed. And the
 * pane's commit shortcut is a key CodeMirror also binds (`insertBlankLine`): withheld
 * from its keymap, it must reach the form having changed nothing. Pressed with the
 * real platform modifier, which is the half a jsdom test cannot prove.
 */
test('the rail Cancel discards edited source', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const thingA = nodeByTitle(page, 'A').first();
  await settled(page);

  await openThing(thingA, 'A');
  await thingA.getByRole('button', { name: 'Edit Thing A' }).click();
  const source = page.getByRole('textbox', { name: 'Markdown source of A' });
  await expect(source).toContainText('entry point');
  await source.fill('Discarded rewrite');
  expect(await markdownSource(source)).toBe('Discarded rewrite');
  await thingA.getByRole('button', { name: 'Cancel editing Thing A' }).click();
  await expect(thingA).toContainText('entry point');
  await thingA.getByRole('button', { name: 'Edit Thing A' }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source of A' })).toContainText(
    'entry point',
  );
});

test('the Markdown editor code loads only when a Markdown Thing opens', async ({ page }) => {
  const editorRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('MarkdownSourceEditor')) editorRequests.push(request.url());
  });

  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const thing = nodeByTitle(page, 'A').first();
  await expect(thing).toBeVisible();
  await settled(page);
  expect(editorRequests).toEqual([]);

  const alias = nodeByTitle(page, 'A′').first();
  await openThing(alias, 'A′');
  await expect(alias).toContainText('entry point');
  await expect(alias.getByRole('textbox')).toHaveCount(0);
  expect(editorRequests).toEqual([]);
  await alias.getByRole('button', { name: 'Close Thing A′' }).click();

  await openThing(thing, 'A');
  expect(editorRequests).toEqual([]);
  await thing.getByRole('button', { name: 'Edit Thing A' }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source of A' })).toBeVisible();
  expect(editorRequests).toHaveLength(1);
});

/**
 * The flat paper treatment ADR 0051 settled: cream face, heavy ink rule, and a
 * mono body that is the writing surface rather than a form control.
 *
 * Pinned because nothing else asserts it. The treatment's rules and the general
 * `.thing--full` rules they override have equal specificity, so only source
 * order separates them — the same cascade trap `presenting.spec.ts` pins for
 * `.thing--full`. With the treatment colocated in its own stylesheet, that order
 * is now a fact about the module graph rather than about one file's line
 * numbers, and a reordered import would silently return the editor to the
 * generic dark pane with every other assertion still green.
 */
test('the opened Thing draws Markdown and its editor on the same paper surface', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const thing = nodeByTitle(page, 'A').first();
  await expect(thing).toBeVisible();
  await settled(page);

  await openThing(thing, 'A');

  await expect(thing.getByTestId('thing')).toHaveCSS('background-color', 'rgb(255, 250, 240)');
  await thing.getByRole('button', { name: 'Edit Thing A' }).click();

  const source = page.locator('[data-slot="markdown-source-editor"]');
  await expect(source).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(source).toHaveCSS('color', 'rgb(18, 22, 28)');

  // The gutter remains legible through the Markdown body component's own theme;
  // application CSS does not reach through to CodeMirror classes (ADR 0063).
  // `#4a505c` is `--canvas-thing-muted-color`, the Thing's own muted ink: this is
  // drawn on cream, so it takes the role held to AA against both Thing faces
  // rather than the chrome's `--muted-foreground`, which is measured on paper.
  await expect(page.locator('[data-slot="markdown-source-line-numbers"]')).toHaveCSS(
    'color',
    'rgb(74, 80, 92)',
  );
});

test('opened Markdown editing persists source while expansion displaces and restores Things', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const thing = nodeByTitle(page, 'A').first();
  await expect(thing).toBeVisible();
  await settled(page);
  const before = await allPositions(page);
  const openedId = await thing.getAttribute('data-id');

  await openThing(thing, 'A');
  const expanded = await allPositions(page);
  expect(expanded[openedId ?? '']).toEqual(before[openedId ?? '']);
  expect(
    Object.entries(before).some(
      ([id, position]) =>
        id !== openedId && JSON.stringify(expanded[id]) !== JSON.stringify(position),
    ),
  ).toBe(true);
  await thing.getByRole('button', { name: 'Edit Thing A' }).click();
  await page.getByRole('textbox', { name: 'Markdown source of A' }).fill('# Edited\n\nNew source');
  await thing.getByRole('button', { name: 'Save Thing A' }).click();

  await expect(page.getByRole('textbox', { name: 'Markdown source of A' })).toHaveCount(0);
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  expect(await allPositions(page)).toEqual(expanded);

  await thing.getByRole('button', { name: 'Close Thing A' }).click();
  expect(await allPositions(page)).toEqual(before);

  await page.reload();
  const persisted = nodeByTitle(page, 'A').first();
  await persisted.hover();
  await persisted.getByRole('button', { name: 'Edit Thing A' }).click();
  const persistedSource = page.getByRole('textbox', { name: 'Markdown source of A' });
  await expect(persistedSource).toContainText('# Edited');
  await expect(persistedSource).toContainText('New source');
});

/**
 * Dragging a thing writes its placement into the Diagram.
 *
 * The fixture opens in its declared default Diagram. A Thing goes where the
 * author puts it and nothing else moves.
 */

test('a dragged thing stays where it is dropped, and nothing else moves', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();

  // Wait for the placement to resolve — before it does, the space is not yet
  // draggable and every thing sits at the origin.
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /./);

  await settled(page);
  const before = await allPositions(page);
  const from = await positionOf(a);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');

  await dragBy(page, a, 0, 260);

  await expect(persistence).toHaveAttribute('data-revision', '1');
  await expect(persistence).toHaveText('Persisted');
  await expect(selectedCanvas(page)).toContainText('Collection 1');

  const to = await positionOf(a);
  expect(to.y).toBeGreaterThan(from.y + 100);

  // Every other thing is exactly where it was. Not "roughly" — a global
  // optimiser is what this rules out, and it moves things by pixels as readily
  // as by hundreds.
  const after = await allPositions(page);
  const draggedId = await a.getAttribute('data-id');
  for (const [id, position] of Object.entries(before)) {
    if (id === draggedId) continue;
    expect(after[id], `thing ${id} moved`).toEqual(position);
  }
});

/* -------------------------------------------------------------------------- */
/* Displacement is applied by the Edit that causes it (ADR 0084)               */
/* -------------------------------------------------------------------------- */

/**
 * The room an Open Thing makes for itself: its Open rect less the Closed one.
 *
 * Arithmetic over the domain's own two constants rather than the numbers they
 * currently are, so a change to either size moves these tests with it instead of
 * leaving them asserting a stale offset.
 */
const OPEN_GROWTH = {
  width: DEFAULT_OPEN_SIZE.width - COLLAPSED_THING_SIZE.width,
  height: DEFAULT_OPEN_SIZE.height - COLLAPSED_THING_SIZE.height,
} as const;

/**
 * The fixture Things the three geometries below place, by id and by title.
 *
 * Placed by id and read back by id, so none of this depends on the order
 * `snapshot.things` happens to arrive in; the titles are the fixture's own, and
 * are what a Thing's own controls are named for.
 */
const SUBJECT = { id: uuidSchema.parse('00000000-0000-4000-8000-000000000002'), title: 'A' };
const NEIGHBOUR = { id: uuidSchema.parse('00000000-0000-4000-8000-000000000003'), title: 'B' };
const BEHIND = { id: uuidSchema.parse('00000000-0000-4000-8000-000000000005'), title: 'C' };

/**
 * Open the Space in a Diagram whose geometry the test states.
 *
 * The tracked fixture's Diagram is a hand-set grid in the space file, so a test written against it would
 * be reverse-engineering coordinates it never chose — and every claim below is
 * about a distance between two Things. Seeding goes through the same HTTP
 * boundary the browser uses, so the Diagram the app opens is the one written
 * here.
 */
async function seedGeometry(
  page: Page,
  title: string,
  positions: Record<string, ThingPlacement>,
): Promise<void> {
  const seeded = await seedPositionedDiagram(page, title, () => positions);
  await page.goto(`/spaces/${encodeCompactUuid(seeded.snapshot.id)}`);
  await expect(selectedCanvas(page)).toContainText(title);
  await settled(page);
}

/** The node React Flow drew for one seeded Thing. */
const seededNode = (page: Page, thing: { readonly id: string }): Locator =>
  page.locator(`.react-flow__node[data-id="${thing.id}"]`);

/**
 * One seeded Thing's position out of a frame `allPositions` read.
 *
 * Required rather than optional: a Thing that is not on the canvas is a broken
 * seed, and saying so here beats an assertion against `undefined` several lines
 * later.
 */
function at(
  positions: Record<string, { x: number; y: number }>,
  thing: { readonly id: string; readonly title: string },
): { x: number; y: number } {
  const position = positions[thing.id];
  if (position === undefined) throw new Error(`Thing ${thing.title} is not on the canvas.`);
  return position;
}

/**
 * The first of ADR 0084's two reported defects: an Open Thing's size deciding
 * where its neighbours are drawn.
 *
 * The neighbour is before the subject on both axes, so opening the subject
 * displaces nothing and what follows is about the drag alone. The rule is
 * per-axis, so the geometry only has to cross one: the Things are a hundred and
 * twenty apart on `x` and far enough apart on `y` never to overlap, and a short
 * drag leftwards carries the subject across the neighbour's `x` and nothing
 * else. That is the discontinuity ADR 0084 measured — the derived rule answered
 * the crossing by moving the neighbour a whole growth-step sideways, and moved
 * it back on the return. `whileDragging` is what makes the mid-gesture frame visible at
 * all, and the delta is chosen so the halfway move is already past the crossing.
 */
test('dragging an Open Thing across a neighbour moves nothing but the dragged Thing', async ({
  page,
}) => {
  // Apart on `y` by more than a Thing's height, so the two never overlap and
  // the drag below crosses `x` alone.
  await seedGeometry(page, 'Drag Geometry', {
    [SUBJECT.id]: { x: 120, y: 400, open: false },
    [NEIGHBOUR.id]: { x: 0, y: 0, open: false },
  });
  const subject = seededNode(page, SUBJECT);

  await openThing(subject, SUBJECT.title);
  await expect(subject.getByRole('button', { name: `Close Thing ${SUBJECT.title}` })).toBeVisible();
  await settled(page);

  // The resting frame, read before any pointer goes down. Everything below is
  // measured against it, including whether the drag started at all.
  const resting = await allPositions(page);
  expect(at(resting, SUBJECT)).toEqual({ x: 120, y: 400 });
  expect(at(resting, NEIGHBOUR)).toEqual({ x: 0, y: 0 });

  const neighbourStill = async (): Promise<void> => {
    const midGesture = await allPositions(page);
    expect(at(midGesture, NEIGHBOUR), 'the neighbour moved mid-drag').toEqual(
      at(resting, NEIGHBOUR),
    );
  };

  // 280 puts the halfway move at x = -20, already past the neighbour's origin,
  // which is where the derived rule used to fire.
  await dragBy(page, subject, -280, 0, neighbourStill);
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  const crossed = await allPositions(page);
  expect(at(crossed, SUBJECT).x, 'the drag never started').toBeCloseTo(
    at(resting, SUBJECT).x - 280,
    -1,
  );
  expect(at(crossed, SUBJECT).y).toBeCloseTo(at(resting, SUBJECT).y, -1);
  expect(at(crossed, NEIGHBOUR), 'the neighbour moved at release').toEqual(at(resting, NEIGHBOUR));

  // And back. The return crosses the same origin the other way, so a rule that
  // fired on the way out fires again here.
  await dragBy(page, subject, 280, 0, neighbourStill);

  const returned = await allPositions(page);
  expect(at(returned, SUBJECT).x).toBeCloseTo(at(resting, SUBJECT).x, -1);
  expect(at(returned, NEIGHBOUR), 'the neighbour moved on the return').toEqual(
    at(resting, NEIGHBOUR),
  );
});

/**
 * The second reported defect: a drop the old inverse could not answer for.
 *
 * `Placement.authoredPoint` inverted a derivation that is not onto — no authored
 * coordinate drew inside an Open Thing's growth — so a drop that landed in that
 * band was answered with the near side, and the Thing settled on the Open Thing's
 * origin instead of where the author released it. The band was one growth-step
 * wide beginning at that origin, so this drops half a step into it on both axes.
 */
test('a closed Thing released inside an Open Thing lands at the drop point', async ({ page }) => {
  await seedGeometry(page, 'Drop Geometry', {
    [SUBJECT.id]: { x: 150, y: 150, open: false },
    [NEIGHBOUR.id]: { x: 0, y: 0, open: false },
  });
  const subject = seededNode(page, SUBJECT);
  const mover = seededNode(page, NEIGHBOUR);

  await openThing(subject, SUBJECT.title);
  await expect(subject.getByRole('button', { name: `Close Thing ${SUBJECT.title}` })).toBeVisible();
  await settled(page);

  // The resting frame, before the pointer goes down.
  const resting = await allPositions(page);
  const open = at(resting, SUBJECT);
  const from = at(resting, NEIGHBOUR);
  expect(open).toEqual({ x: 150, y: 150 });
  expect(from).toEqual({ x: 0, y: 0 });

  // Inside the Open Thing's drawn box, and inside the band: half a growth-step
  // beyond its origin on each axis.
  const dropAt = { x: open.x + OPEN_GROWTH.width / 2, y: open.y + OPEN_GROWTH.height / 2 };
  const openBox = await boxOf(subject, 'the Open Thing');
  await dragBy(page, mover, dropAt.x - from.x, dropAt.y - from.y);
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  // Drawn inside the Open Thing, which is the premise the flow-space assertions
  // below rest on — and the thing the clamp made unreachable, since a Thing it
  // answered for came to rest on the Open Thing's own top-left corner.
  const moverBox = await boxOf(mover, 'the dropped Thing');
  expect(moverBox.x).toBeGreaterThan(openBox.x);
  expect(moverBox.y).toBeGreaterThan(openBox.y);
  expect(moverBox.x).toBeLessThan(openBox.x + openBox.width);
  expect(moverBox.y).toBeLessThan(openBox.y + openBox.height);

  const landed = await allPositions(page);
  expect(at(landed, NEIGHBOUR).x - from.x, 'the drag never started').toBeGreaterThan(
    OPEN_GROWTH.width / 4,
  );
  // Where it was released, not the Open Thing's origin.
  expect(at(landed, NEIGHBOUR).x).toBeCloseTo(dropAt.x, -1);
  expect(at(landed, NEIGHBOUR).y).toBeCloseTo(dropAt.y, -1);
  expect(at(landed, SUBJECT), 'the Open Thing moved').toEqual(open);
});

/**
 * Once, and then not again (ADR 0084).
 *
 * Opening writes the room it takes into the Diagram, so the neighbour beyond the
 * subject on both axes moves by the growth and the Thing behind it on both axes
 * does not move at all. From then on those are authored positions like any
 * other: dragging the Open Thing past the neighbour is not a second Open, and the
 * room stays where the Open Edit put it. Under the derived rule the neighbour
 * came back to its authored point the moment the subject was dragged beyond it.
 */
test('opening a Thing displaces its neighbours once, and dragging it never displaces them again', async ({
  page,
}) => {
  await seedGeometry(page, 'Open Geometry', {
    [SUBJECT.id]: { x: 0, y: 0, open: false },
    [NEIGHBOUR.id]: { x: 300, y: 250, open: false },
    [BEHIND.id]: { x: -200, y: -150, open: false },
  });
  const subject = seededNode(page, SUBJECT);
  const closed = await allPositions(page);

  await openThing(subject, SUBJECT.title);
  await expect(subject.getByRole('button', { name: `Close Thing ${SUBJECT.title}` })).toBeVisible();
  await settled(page);

  const opened = await allPositions(page);
  expect(at(opened, SUBJECT), 'the opening Thing moved').toEqual(at(closed, SUBJECT));
  expect(at(opened, NEIGHBOUR)).toEqual({
    x: at(closed, NEIGHBOUR).x + OPEN_GROWTH.width,
    y: at(closed, NEIGHBOUR).y + OPEN_GROWTH.height,
  });
  // Strictly before the subject on both axes, so it takes no room at all.
  expect(at(opened, BEHIND)).toEqual(at(closed, BEHIND));

  const roomKept = async (): Promise<void> => {
    const midGesture = await allPositions(page);
    expect(at(midGesture, NEIGHBOUR), 'the neighbour moved mid-drag').toEqual(
      at(opened, NEIGHBOUR),
    );
    expect(at(midGesture, BEHIND), 'the Thing behind moved mid-drag').toEqual(at(opened, BEHIND));
  };

  // Past the neighbour's *authored* origin on both axes, which is the crossing
  // the derived rule reversed at.
  await dragBy(page, subject, 340, 280, roomKept);

  const dragged = await allPositions(page);
  expect(at(dragged, SUBJECT).x, 'the drag never started').toBeCloseTo(
    at(opened, SUBJECT).x + 340,
    -1,
  );
  expect(at(dragged, SUBJECT).y, 'the drag never started').toBeCloseTo(
    at(opened, SUBJECT).y + 280,
    -1,
  );
  expect(at(dragged, NEIGHBOUR), 'the neighbour moved at release').toEqual(at(opened, NEIGHBOUR));
  expect(at(dragged, BEHIND), 'the Thing behind moved at release').toEqual(at(opened, BEHIND));

  await dragBy(page, subject, -340, -280, roomKept);

  const returned = await allPositions(page);
  expect(at(returned, SUBJECT).x).toBeCloseTo(at(opened, SUBJECT).x, -1);
  expect(at(returned, NEIGHBOUR)).toEqual(at(opened, NEIGHBOUR));
  expect(at(returned, BEHIND)).toEqual(at(opened, BEHIND));
});

test(
  'selecting Diagrams is navigation and does not persist',
  { tag: '@parity:command-dock-marks-one-current-diagram' },
  async ({ page }) => {
    await page.goto('/');
    const a = nodeByTitle(page, 'A').first();
    await expect(a).toBeVisible();
    await settled(page);
    const persistence = page.getByTestId('persistence-status');
    await expect(persistence).toHaveAttribute('data-revision', '0');

    // One list over the authored Diagrams with exactly one checked item, and the
    // cluster outside it naming the same one (ADR 0053's surviving clause, kept
    // verbatim by ADR 0082; ADR 0079).
    const choices = await diagramChoices(page);
    await expect(choices).toHaveCount(3);
    await expect(choices.and(page.locator('[aria-checked="true"]'))).toHaveCount(1);
    await expect(choices.and(page.locator('[aria-checked="true"]'))).toHaveText('Collection 1');
    await page.keyboard.press('Escape');
    await expect(selectedCanvas(page)).toContainText('Collection 1');
    await expect(activeGraph(page)).toContainText('Long');

    await selectCanvas(page, 'Collection 2');
    const afterSwitch = await diagramChoices(page);
    await expect(afterSwitch.and(page.locator('[aria-checked="true"]'))).toHaveText('Collection 2');
    await page.keyboard.press('Escape');
    await expect(persistence).toHaveAttribute('data-revision', '0');

    await selectCanvas(page, 'Collection 1');
    const afterReturn = await diagramChoices(page);
    await expect(afterReturn.and(page.locator('[aria-checked="true"]'))).toHaveText('Collection 1');
    await page.keyboard.press('Escape');
    await expect(persistence).toHaveAttribute('data-revision', '0');
  },
);

test(
  'New Diagram creates an empty selected Diagram and persists it through reload',
  { tag: '@parity:command-dock-adds-an-empty-diagram' },
  async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);
    const persistence = page.getByTestId('persistence-status');
    await expect(persistence).toHaveAttribute('data-revision', '0');

    // In the Diagram menu, beside the list it adds to — the Sidebar had room for
    // a permanent control and the Dock finds room by disclosure (ADR 0082).
    // What the command does is unchanged: an *empty* Diagram, created and
    // selected in one Edit (ADR 0079, ADR 0080).
    await newDiagram(page);

    // The command opens nothing and continues in the new Diagram's name
    // (`.scratch/command-dock/issues/13`). It used to reveal the Things list
    // instead, which is why there is no dialog to dismiss here any more.
    await settleNewDiagramName(page, 'Diagram 1');
    await expect(selectedCanvas(page)).toContainText('Diagram 1');
    await expect(persistence).toHaveAttribute('data-revision', '1');
    expect(await allPositions(page)).toEqual({});

    await page.reload();
    await expect(selectedCanvas(page)).toContainText('Diagram 1');
    expect(await allPositions(page)).toEqual({});

    // Rename is the name itself rather than a row menu: the Dock draws each
    // name once, so the control the reader presses is the word they are
    // changing.
    await selectedCanvas(page).click();
    const title = page.getByRole('textbox', { name: 'Diagram name' });
    await title.fill('Workshop');
    await title.press('Enter');
    await expect(selectedCanvas(page)).toContainText('Workshop');
    await expect(persistence).toHaveAttribute('data-revision', '2');

    await page.reload();
    await expect(selectedCanvas(page)).toContainText('Workshop');
    const menu = await diagramMenu(page);
    await menu.getByRole('menuitem', { name: 'Delete Workshop' }).click();
    await expect(selectedCanvas(page)).toContainText('Collection 1');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await expect(persistence).toHaveAttribute('data-revision', '3');

    await page.reload();
    await expect(selectedCanvas(page)).toContainText('Collection 1');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  },
);

test(
  'resizing an open Thing persists its authored rect through reload',
  {
    tag: '@parity:canvas-thing-fills-authored-node-rect',
  },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    const thing = nodeByTitle(page, 'A').first();
    await expect(thing).toBeVisible();
    await openThing(thing, 'A');
    await expectThingFillsNode(thing);
    await thing.click({ position: { x: 8, y: 8 } });

    const size = async () =>
      thing.evaluate((element) => ({
        width: Number.parseFloat(getComputedStyle(element).width),
        height: Number.parseFloat(getComputedStyle(element).height),
      }));
    const beforeSize = await size();
    const beforePosition = await positionOf(thing);
    const handle = thing.locator('.react-flow__resize-control.handle.bottom.right');
    await expect(handle).toBeVisible();
    const box = await boxOf(handle, 'the bottom-right Thing resize handle');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, { steps: 6 });
    await expectThingFillsNode(thing);
    await page.mouse.up();

    await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
    await thing.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    await expectThingFillsNode(thing);
    const resized = await size();
    expect(resized.width).toBeGreaterThan(beforeSize.width);
    expect(resized.height).toBeGreaterThan(beforeSize.height);
    expect(await positionOf(thing)).toEqual(beforePosition);

    await page.reload();
    await selectCanvas(page, 'Collection 1');
    const persisted = nodeByTitle(page, 'A').first();
    await expect(persisted.getByRole('button', { name: 'Close Thing A' })).toBeVisible();
    const persistedSize = await persisted.evaluate((element) => ({
      width: Number.parseFloat(getComputedStyle(element).width),
      height: Number.parseFloat(getComputedStyle(element).height),
    }));
    await expectThingFillsNode(persisted);
    expect(persistedSize).toEqual(resized);
    await persisted.hover();
    await persisted.getByRole('button', { name: 'Close Thing A', exact: true }).click();
    await expect(persisted).toHaveCSS('width', '260px');
    await expectThingFillsNode(persisted);
    await persisted.hover();
    await persisted.getByRole('button', { name: 'Edit Thing A', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Markdown source of A' })).toBeVisible();
    await expectThingFillsNode(persisted);
    expect(await size()).toEqual(resized);
    expect(await positionOf(persisted)).toEqual(beforePosition);
  },
);

test(
  'an Open Thing offers one resize control, revealed on hover, that selects the Thing and clears a Selected Edge without a second Edit',
  { tag: '@parity:open-thing-offers-one-resize-control' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    const thing = nodeByTitle(page, 'A').first();
    const closed = nodeByTitle(page, 'B').first();
    await expect(thing).toBeVisible();
    await openThing(thing, 'A');
    const persistence = page.getByTestId('persistence-status');
    await expect(persistence).toHaveText('Persisted');
    const openedRevision = await persistence.getAttribute('data-revision');
    const beforePosition = await positionOf(thing);
    // Opening grows the Thing through a CSS transition, so its rect is still
    // moving for a moment after the Edit persists. Settling it first is what
    // makes the mid-gesture growth below evidence of the drag rather than of
    // an animation that had not finished.
    await thing.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const beforeSize = await thing.evaluate((element) => ({
      width: Number.parseFloat(getComputedStyle(element).width),
      height: Number.parseFloat(getComputedStyle(element).height),
    }));
    const neighbour = nodeByTitle(page, 'B').first();
    const beforeNeighbourPosition = await positionOf(neighbour);
    const edgePath = page.locator('.react-flow__edge-path').first();
    const beforeEdgePath = await edgePath.getAttribute('d');

    // A Closed Thing offers no control at all.
    await expect(closed.locator('.react-flow__resize-control')).toHaveCount(0);

    // The Open Thing offers exactly one, at its bottom-right corner, and it is
    // not visible until hovered — the actual reveal mechanism. `openThing` left
    // keyboard focus on its own control, which is *also* a reveal condition
    // (Thing focus), so that focus is moved off the Thing first to observe rest.
    const control = thing.locator('.react-flow__resize-control.handle.bottom.right');
    await expect(thing.locator('.react-flow__resize-control')).toHaveCount(1);
    await page.evaluate(() => {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement) focused.blur();
    });
    await page.mouse.move(0, 0);
    await expect(control).toHaveCSS('opacity', '0');
    await thing.hover();
    await expect(control).toHaveCSS('opacity', '1');

    // Select an Edge first, and leave the Thing unselected, so the gesture below
    // is proven to move both — not merely to arrive with the Thing already
    // Selected from an earlier click.
    await selectAnEdge(page);
    await expect(page.locator('.react-flow__edge.selected')).toHaveCount(1);
    await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);

    const box = await boxOf(control, "Thing A's resize control");
    // A hit target a hand can find. React Flow's own two-class `.handle` rule
    // declares a 5px box and outranks a rule naming one class, so this is
    // asserted as a size rather than inferred from the drag below succeeding:
    // a pointer driven by test code hits 5px exactly, and a person does not.
    // Browser geometry may carry a fractional-pixel rounding remainder, but
    // the rendered hit target must stay within 0.01 CSS pixels of 48px.
    const hitTargetTolerance = 0.01;
    expect(Math.abs(box.width - 48)).toBeLessThanOrEqual(hitTargetTolerance);
    expect(Math.abs(box.height - 48)).toBeLessThanOrEqual(hitTargetTolerance);
    const markLocator = thing.locator('.rf-thing-node__resize-mark');
    await expect.poll(async () => (await markLocator.boundingBox())?.width).toBeCloseTo(20, 1);
    const mark = await markLocator.boundingBox();
    if (mark === null) throw new Error("Thing A's resize control draws no mark");
    expect(mark.height).toBeCloseTo(20, 1);
    const innerBox = await boxOf(thing.locator('.rf-thing-node__inner'), "Thing A's inner box");
    expect(mark.x + mark.width).toBeGreaterThan(innerBox.x + innerBox.width);
    expect(mark.y + mark.height).toBeGreaterThan(innerBox.y + innerBox.height);
    await expect(markLocator).toHaveCSS('translate', '1px 1px');
    await expect(markLocator).toHaveCSS('background-color', 'rgb(0, 0, 0)');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, { steps: 6 });
    // Mid-gesture, before release: the Thing is already following the pointer.
    // Beginning a resize Selects the Thing, and the selected Thing is an input to
    // the projection, so a reprojection lands mid-drag — the render adapter has
    // to hold the live rect through it or every frame redraws the Thing at the
    // size it had before the gesture and nothing moves until release. Polled
    // rather than sampled once: the last pointer move and the frame that paints
    // it are not the same tick, and a single read races that.
    await expect
      .poll(async () =>
        thing.evaluate((element) => Number.parseFloat(getComputedStyle(element).width)),
      )
      .toBeGreaterThan(beforeSize.width);
    // The neighbour does **not** move while the pointer is down (ADR 0084).
    // The draft previews the resizing Thing's own rect and nothing else, so
    // every other Thing is drawn from the authored placement until the Edit
    // lands. This read alone would also pass if the Thing were simply at rest,
    // so it is the pair with the assertion after release — where the neighbour
    // is required to have moved — that says the room is taken at the Edit and
    // not at the frame.
    await expect.poll(async () => positionOf(neighbour)).toEqual(beforeNeighbourPosition);
    // The Edge does move, and it is the resizing Thing's own growth that moves
    // it: A's handles travel with its rect, so the curve is redrawn from the
    // live draft while B stays exactly where it was authored.
    await expect.poll(async () => edgePath.getAttribute('d')).not.toBe(beforeEdgePath);
    await expect(thing.locator('.canvas-thing__rail')).toHaveCSS('opacity', '0');
    await expect(thing.locator('.rf-thing-node__authoring-handle--source').first()).toHaveCSS(
      'opacity',
      '0',
    );
    // Pointer movement owns only the canvas draft. Persistence sees nothing
    // until the gesture releases.
    await expect(persistence).toHaveAttribute('data-revision', openedRevision ?? '');

    await page.mouse.up();

    // One drag both Selected the Thing and cleared the Selected Edge — no
    // separate click, and Selection was never a second Edit.
    await expect(thing).toHaveClass(/selected/);
    await expect(page.locator('.react-flow__edge.selected')).toHaveCount(0);
    await expect(persistence).toHaveText('Persisted');
    await expect(persistence).toHaveAttribute('data-revision', String(Number(openedRevision) + 1));

    await thing.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const afterSize = await thing.evaluate((element) => ({
      width: Number.parseFloat(getComputedStyle(element).width),
      height: Number.parseFloat(getComputedStyle(element).height),
    }));
    expect(afterSize.width).toBeGreaterThan(beforeSize.width);
    expect(afterSize.height).toBeGreaterThan(beforeSize.height);
    // The authored top-left origin is unchanged: only the box grew.
    expect(await positionOf(thing)).toEqual(beforePosition);

    // Released, and only now does the neighbour take the room: the completed
    // Resize applied the difference between the old growth and the new one and
    // wrote B's position into the Diagram (ADR 0084). This is the other half of
    // the mid-gesture assertion above — together they place the movement at the
    // Edit rather than at the frame.
    const afterNeighbourPosition = await positionOf(neighbour);
    expect(afterNeighbourPosition).not.toEqual(beforeNeighbourPosition);
    const afterEdgePath = await edgePath.getAttribute('d');
    const completedRevision = await persistence.getAttribute('data-revision');
    const secondBox = await boxOf(control, "Thing A's resize control after completion");
    await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      secondBox.x + secondBox.width / 2 + 90,
      secondBox.y + secondBox.height / 2 + 60,
      { steps: 4 },
    );
    await expect
      .poll(async () =>
        thing.evaluate((element) => Number.parseFloat(getComputedStyle(element).width)),
      )
      .toBeGreaterThan(afterSize.width);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel')));
    await page.mouse.up();

    await expect
      .poll(async () =>
        thing.evaluate((element) => Number.parseFloat(getComputedStyle(element).width)),
      )
      .toBe(afterSize.width);
    await expect.poll(async () => positionOf(neighbour)).toEqual(afterNeighbourPosition);
    await expect
      .poll(async () => sameEdgeGeometry(await edgePath.getAttribute('d'), afterEdgePath))
      .toBe(true);
    await quiescent(page);
    await expect(persistence).toHaveAttribute('data-revision', completedRevision ?? '');
  },
);

/**
 * Resizing is pointer *and* touch (ADR 0066), and touch is the half that only a
 * real browser can answer.
 *
 * `NodeResizeControl` lists its resize callbacks among an effect's dependencies
 * and that effect's cleanup is `selection.on('.drag', null)`, which strips every
 * `.drag` listener the control element carries. d3-drag leaves a touch gesture's
 * `touchmove`/`touchend` on that element for the whole gesture and relocates
 * only the mouse's pair to the window at `mousedown` — so a callback rebuilt
 * mid-drag takes a touch resize down with it while a mouse resize survives by
 * accident. This node re-renders mid-drag by construction: the render adapter
 * republishes the projection on every preview frame.
 *
 * `SpaceCanvas.test.tsx` asserts the same thing in jsdom, where `TouchEvent` is
 * a synthetic object with none of the browser's `touch-action` or passivity
 * semantics and no compatibility `pointer*` events at all — which is precisely
 * why the release cannot be proven there. Here it is Chromium's own input
 * pipeline, so both halves are real.
 */
test.describe('resizing by touch', () => {
  test.use({ hasTouch: true });

  /** A touch gesture already under way: one finger, moved and then ended. */
  interface TouchGesture {
    moveTo(x: number, y: number): Promise<void>;
    release(): Promise<void>;
    /** End the gesture the way the platform takes it away, rather than the way a hand does. */
    cancel(): Promise<void>;
  }

  /**
   * Press one finger, through CDP.
   *
   * `page.touchscreen` offers `tap()` and nothing else, and a `TouchEvent`
   * constructed inside `page.evaluate` arrives untrusted: Chromium derives no
   * `pointerdown`/`pointerup` from it, so the release — the thing `ThingNode`'s
   * window listener answers with `finishResize` — would never happen. CDP's
   * `Input.dispatchTouchEvent` is what `touchscreen.tap()` uses underneath and
   * produces the real thing, compatibility pointer events included.
   *
   * `id` is what d3-drag tracks the gesture by. `touchEnd` carries no points:
   * the array is the fingers still down, so an empty one releases the gesture
   * and leaves Chromium to fill `changedTouches` with what it lifted.
   */
  async function beginTouchGesture(page: Page, x: number, y: number): Promise<TouchGesture> {
    const session = await page.context().newCDPSession(page);
    const point = { id: 0, radiusX: 8, radiusY: 8, force: 1 };
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...point, x, y }],
    });
    return {
      async moveTo(nextX, nextY) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ ...point, x: nextX, y: nextY }],
        });
      },
      async release() {
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await session.detach();
      },
      async cancel() {
        await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await session.detach();
      },
    };
  }

  // No `@parity` tag: the reporter wants exactly one test per claim, and the
  // mouse tests above already carry the two this Thing's resize control owns.
  test('a touch drag resizes an Open Thing to the rect it dragged and commits one Edit on release', async ({
    page,
  }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    const thing = nodeByTitle(page, 'A').first();
    await expect(thing).toBeVisible();
    await openThing(thing, 'A');
    const persistence = page.getByTestId('persistence-status');
    await expect(persistence).toHaveText('Persisted');
    const openedRevision = await persistence.getAttribute('data-revision');
    const beforePosition = await positionOf(thing);
    // Opening grows the Thing through a CSS transition, so its rect is still
    // moving for a moment after the Edit persists — settling it first is what
    // makes the growth below evidence of the drag.
    await thing.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const width = async () =>
      thing.evaluate((element) => Number.parseFloat(getComputedStyle(element).width));
    const size = async () =>
      thing.evaluate((element) => ({
        width: Number.parseFloat(getComputedStyle(element).width),
        height: Number.parseFloat(getComputedStyle(element).height),
      }));
    const beforeSize = await size();

    await thing.hover();
    const control = thing.locator('.react-flow__resize-control.handle.bottom.right');
    const box = await boxOf(control, "Thing A's resize control");
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    // The drag is expressed in screen pixels and the Thing's rect is in flow
    // units, so the expected rect is the one the pointer described, divided
    // through the camera. Asserting the whole delta — not merely "bigger" —
    // is what makes every frame after the first load-bearing.
    const dragX = 140;
    const dragY = 90;
    const zoom = Number(/scale\(([\d.]+)\)/.exec(await viewportTransform(page))?.[1] ?? 1);
    const expected = {
      width: beforeSize.width + dragX / zoom,
      height: beforeSize.height + dragY / zoom,
    };

    const gesture = await beginTouchGesture(page, from.x, from.y);
    // The first frame is already the regression: against inline callbacks this
    // poll never moves off the Thing's opened width, because the re-render the
    // gesture's own start schedules — `setResizeActive(true)`, before any
    // preview — lands before the browser delivers the next touch. The later
    // frames are not redundant, though: the rect asserted after release is
    // absolute rather than accumulated, so a gesture that dies part-way through
    // would still finish at whatever frame it last saw.
    await gesture.moveTo(from.x + dragX / 2, from.y + dragY / 2);
    await expect.poll(width).toBeGreaterThan(beforeSize.width);
    await gesture.moveTo(from.x + dragX * 0.8, from.y + dragY * 0.8);
    await gesture.moveTo(from.x + dragX, from.y + dragY);
    // Pointer movement owns only the canvas draft; persistence sees nothing
    // until the gesture releases.
    await expect(persistence).toHaveAttribute('data-revision', openedRevision ?? '');

    await gesture.release();

    // Chromium raises `pointerup` from the touch release, which is the signal
    // `ThingNode` turns into the one completing Edit.
    await expect(persistence).toHaveText('Persisted');
    await expect(persistence).toHaveAttribute('data-revision', String(Number(openedRevision) + 1));

    await thing.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const resized = await size();
    expect(resized.width).toBeCloseTo(expected.width, 0);
    expect(resized.height).toBeCloseTo(expected.height, 0);
    // The authored top-left origin is unchanged: only the box grew.
    expect(await positionOf(thing)).toEqual(beforePosition);
    // Exactly one Edit, not one-so-far: the revision assertion above succeeds on
    // its first poll, so only elapsed time can rule out a second arriving behind
    // it — and touch is the path where a stray `pointerup`/`touchend` pair could
    // plausibly complete the same gesture twice.
    await quiescent(page);
    await expect(persistence).toHaveAttribute('data-revision', String(Number(openedRevision) + 1));

    await page.reload();
    await selectCanvas(page, 'Collection 1');
    const persisted = nodeByTitle(page, 'A').first();
    await expect(persisted.getByRole('button', { name: 'Close Thing A' })).toBeVisible();
    await persisted.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    expect(
      await persisted.evaluate((element) => ({
        width: Number.parseFloat(getComputedStyle(element).width),
        height: Number.parseFloat(getComputedStyle(element).height),
      })),
    ).toEqual(resized);
    expect(await positionOf(persisted)).toEqual(beforePosition);
  });

  /**
   * Cancellation, on the one signal touch actually delivers.
   *
   * d3-drag sets `touch-action: none` on the control, which takes away the
   * browser's usual reason to seize a touch gesture — but the platform can
   * still take one (a call arriving, a system gesture, the page backgrounded),
   * and a probe written before this test confirmed CDP `touchCancel` raises a
   * real `pointercancel` on `window` in this Chromium. What that probe also
   * showed is that `pointercancel` is the *whole* of what reaches `window`
   * here: `touchstart`, `touchmove`, `touchend` and `touchcancel` never arrive,
   * because d3-drag calls `stopImmediatePropagation` on each and leaves the
   * compatibility `pointer*` pair alone. The observed sequence for a cancelled
   * gesture is `pointerdown, pointermove, pointercancel` and nothing after it.
   *
   * Nothing underneath answers that signal either. `shouldResize` always
   * returns false, so `XYResizer` never sets `resizeDetected` and its `end`
   * handler returns early every time — React Flow never calls `onResizeEnd`,
   * and d3-drag contributes nothing to ending or cancelling. `ThingNode`'s three
   * `window` listeners are the entire lifecycle. Miss the cancellation and
   * `resizing.current` stays true with the draft still live, so the *next*
   * `pointerup` anywhere on the page finishes a gesture the author abandoned
   * and authors a rect they never released. The last assertion here is that
   * one, and nothing else in the stack would catch it.
   */
  test('a cancelled touch resize discards the draft and leaves no gesture armed for the next pointerup', async ({
    page,
  }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    const thing = nodeByTitle(page, 'A').first();
    await expect(thing).toBeVisible();
    await openThing(thing, 'A');
    const persistence = page.getByTestId('persistence-status');
    await expect(persistence).toHaveText('Persisted');
    const openedRevision = await persistence.getAttribute('data-revision');
    const beforePosition = await positionOf(thing);
    // Opening grows the Thing through a CSS transition, so its rect is still
    // moving for a moment after the Edit persists — settling it first is what
    // makes this the authored rect the cancellation has to restore.
    await thing.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const size = async () =>
      thing.evaluate((element) => ({
        width: Number.parseFloat(getComputedStyle(element).width),
        height: Number.parseFloat(getComputedStyle(element).height),
      }));
    const authored = await size();

    await thing.hover();
    const control = thing.locator('.react-flow__resize-control.handle.bottom.right');
    const box = await boxOf(control, "Thing A's resize control");
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    const gesture = await beginTouchGesture(page, from.x, from.y);
    await gesture.moveTo(from.x + 70, from.y + 45);
    await gesture.moveTo(from.x + 140, from.y + 90);
    // The draft has to be live before it can be discarded: a cancellation of a
    // gesture that never grew the Thing would restore the authored rect by
    // having never left it, and prove nothing.
    await expect.poll(async () => (await size()).width).toBeGreaterThan(authored.width);
    await expect(persistence).toHaveAttribute('data-revision', openedRevision ?? '');

    await gesture.cancel();

    // The draft is discarded: the Thing is the rect it was authored at, not the
    // rect the finger dragged to, and its origin never moved either.
    await expect.poll(size).toEqual(authored);
    expect(await positionOf(thing)).toEqual(beforePosition);
    await quiescent(page);
    await expect(persistence).toHaveAttribute('data-revision', openedRevision ?? '');

    // And the gesture is disarmed. A later, unrelated press anywhere on the
    // page raises the `pointerup` that `finish()` answers, so a cancellation
    // that only *looked* like one — draft discarded but `resizing.current` left
    // true — commits the abandoned rect here, one click after the author
    // stopped thinking about it.
    const elsewhere = await emptyCanvasPoint(page);
    await page.mouse.click(elsewhere.x, elsewhere.y);
    await quiescent(page);
    await expect(persistence).toHaveAttribute('data-revision', openedRevision ?? '');
    expect(await size()).toEqual(authored);
  });
});

test(
  'resizing into the complete Close range previews Closed geometry, completes one Close Edit and preserves Open Size through reload',
  { tag: '@parity:resize-preview-snaps-to-closed-rect' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    const thing = nodeByTitle(page, 'A').first();
    await expect(thing).toBeVisible();
    await openThing(thing, 'A');
    const persistence = page.getByTestId('persistence-status');
    await expect(persistence).toHaveText('Persisted');
    await thing.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });

    const size = async (subject: Locator) =>
      subject.evaluate((element) => ({
        width: Number.parseFloat(getComputedStyle(element).width),
        height: Number.parseFloat(getComputedStyle(element).height),
      }));
    const initialSize = await size(thing);
    const control = thing.locator('.react-flow__resize-control.handle.bottom.right');
    await thing.hover();
    const growBox = await boxOf(control, "Thing A's resize control before growing");
    await page.mouse.move(growBox.x + growBox.width / 2, growBox.y + growBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      growBox.x + growBox.width / 2 + 100,
      growBox.y + growBox.height / 2 + 60,
      { steps: 6 },
    );
    await page.mouse.up();
    await expect(persistence).toHaveText('Persisted');
    await thing.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const rememberedSize = await size(thing);
    expect(rememberedSize.width).toBeGreaterThan(initialSize.width);
    expect(rememberedSize.height).toBeGreaterThan(initialSize.height);

    const beforeCloseRevision = await persistence.getAttribute('data-revision');
    const zoom = Number(/scale\(([\d.]+)\)/.exec(await viewportTransform(page))?.[1] ?? 1);
    const closeBox = await boxOf(control, "Thing A's resize control before Closing");
    await page.mouse.move(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      closeBox.x + closeBox.width / 2 + (280 - rememberedSize.width) * zoom,
      closeBox.y + closeBox.height / 2 + (166 - rememberedSize.height) * zoom,
      { steps: 8 },
    );

    await expect.poll(async () => size(thing)).toEqual({ width: 260, height: 146 });
    await expect(thing.locator('.rf-thing-node__inner')).toHaveAttribute('data-expanded', 'true');
    await expect(persistence).toHaveAttribute('data-revision', beforeCloseRevision ?? '');

    await page.mouse.up();

    await expect(thing.locator('.rf-thing-node__inner')).toHaveAttribute('data-expanded', 'false');
    await expect(thing.locator('.react-flow__resize-control')).toHaveCount(0);
    await expect(persistence).toHaveText('Persisted');
    await expect(persistence).toHaveAttribute(
      'data-revision',
      String(Number(beforeCloseRevision) + 1),
    );

    await page.reload();
    await selectCanvas(page, 'Collection 1');
    const persisted = nodeByTitle(page, 'A').first();
    await expect(persisted.getByRole('button', { name: 'Open Thing A' })).toBeVisible();
    await openThing(persisted, 'A');
    await persisted.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    expect(await size(persisted)).toEqual(rememberedSize);
  },
);

test(
  'an active Thing resize does not animate its dimensions behind the pointer',
  { tag: '@parity:active-thing-resize-tracks-pointer-without-dimension-animation' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    const thing = nodeByTitle(page, 'A').first();
    await expect(thing).toBeVisible();
    await openThing(thing, 'A');
    await thing.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });

    const control = thing.locator('.react-flow__resize-control.handle.bottom.right');
    await thing.hover();
    const box = await boxOf(control, "Thing A's resize control");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 35, {
      steps: 2,
    });
    await expect(thing.locator('.rf-thing-node__inner')).toHaveAttribute('data-resizing', 'true');

    const dimensionAnimationRunning = await thing.evaluate((element) =>
      element.getAnimations().some((animation) => {
        if (!(animation instanceof CSSTransition) || animation.playState !== 'running') {
          return false;
        }
        return (
          animation.transitionProperty === 'width' || animation.transitionProperty === 'height'
        );
      }),
    );
    expect(dimensionAnimationRunning).toBe(false);
    await page.mouse.up();
  },
);

test('opening animates the Thing wrapper and displaced neighbours from one duration token', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await page.addStyleTag({
    content: '.graph-area { --thing-placement-duration: 10s !important; }',
  });
  const thing = nodeByTitle(page, 'A').first();
  await openThing(thing, 'A');

  const animatedProperties = async () =>
    page.locator('.react-flow__node').evaluateAll((nodes) =>
      nodes.map((node) => ({
        id: node.getAttribute('data-id'),
        properties: node.getAnimations().flatMap((animation) => {
          animation.pause();
          return animation.effect instanceof KeyframeEffect
            ? animation.effect.getKeyframes().flatMap((frame) => Object.keys(frame))
            : [];
        }),
      })),
    );
  const openedId = await thing.getAttribute('data-id');
  await expect
    .poll(async () => (await animatedProperties()).some(({ properties }) => properties.length > 0))
    .toBe(true);
  const animations = await animatedProperties();
  expect(animations.find(({ id }) => id === openedId)?.properties).toEqual(
    expect.arrayContaining(['width', 'height']),
  );
  expect(
    animations.some(({ id, properties }) => id !== openedId && properties.includes('transform')),
  ).toBe(true);
});

/**
 * **It opens nothing, and the author continues in the name.**
 *
 * This test used to be named for the Things View it revealed. New Diagram no
 * longer discloses anything — the Edit creates and selects an empty Diagram and
 * the caret lands in its name (`.scratch/command-dock/issues/13`) — so what is
 * left to hold is that the canvas really is empty, that the Space's existing
 * Things are still there to be placed on it, and that the empty Diagram is
 * durable. The Things are read from the list the author opens themselves, which
 * is the half the old disclosure was standing in for.
 */
test('New Diagram creates an empty Diagram, continues in its name, and persists', async ({
  page,
}) => {
  await page.goto('/');
  await newDiagram(page);

  await settleNewDiagramName(page, 'Diagram 1');
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Things' })).toHaveCount(0);
  await expect(selectedCanvas(page)).toContainText('Diagram 1');

  // The Space kept its Things; only this Diagram is empty. Opened by hand,
  // because that is now the only way the list opens.
  await page.getByRole('button', { name: 'Things' }).click();
  await expect(page.getByRole('button', { name: 'Add A to Diagram' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Things' })).toHaveCount(0);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  // `Persisted` says the commit was acknowledged, not that this Diagram reopens.
  // Reload against the same repository to prove the empty Diagram is durable.
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await expect(selectedCanvas(page)).toContainText('Diagram 1');
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
});

test(
  'adding an existing Thing from the Things list authors Diagram membership',
  { tag: '@parity:things-popover-adds-existing-diagram-members' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await settled(page);

    await page.getByRole('button', { name: 'Things' }).click();
    const source = page.getByRole('button', { name: 'Add E to Diagram' });
    await expect(source).toBeVisible();
    await source.click();

    await expect(source).not.toBeVisible();
    await expect(nodeByTitle(page, 'E')).toBeVisible();
    await expect(nodeByTitle(page, 'E')).toHaveClass(/selected/);
  },
);

test(
  'the Things list names an empty Diagram after every absent Thing is added',
  { tag: '@parity:things-popover-distinguishes-an-empty-diagram' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await settled(page);

    await page.getByRole('button', { name: 'Things' }).click();
    // Spaces stay offered after a press — placing one authors another Space
    // Thing, it does not take the Space away — so the loop that empties the
    // list has to stop looking at that source first. The fixture already
    // holds ordinary Spaces; leaving them on would never reach the empty
    // sentence this claim is about.
    await page.getByRole('button', { name: /^Spaces in this Meta Space, \d+$/ }).click();
    const choices = page.getByRole('button', { name: /^Add .* to Diagram$/ });
    while ((await choices.count()) > 0) {
      const before = await choices.count();
      await choices.first().click();
      await expect(choices).toHaveCount(before - 1);
    }

    await expect(page.getByText('All Things are in this Diagram.')).toBeVisible();
  },
);

test(
  'the Things filter counts what each switch contributes under the current search',
  { tag: '@parity:things-popover-counts-what-each-filter-contributes' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await settled(page);

    await page.getByRole('button', { name: 'Things' }).click();
    const markdown = page.getByRole('button', { name: /^Markdown Things, \d+$/ });
    await expect(markdown).toBeVisible();

    // Narrowed to the one kind the count is read against, because the claim is
    // that the number agrees with the rows *under it* — and the rows are four
    // sources interleaved, this Space leaving an Alias unplaced beside its
    // Markdown Things. Turning the other three off is also the gesture that
    // proves a switch narrows the list at all.
    for (const other of ['Aliases', 'Space Things in this Space', 'Spaces in this Meta Space']) {
      await page.getByRole('button', { name: new RegExp(`^${other}, \\d+$`) }).click();
    }

    const rows = page.getByRole('button', { name: /^Add .* to Diagram$/ });
    const before = await rows.count();
    expect(before, 'this Diagram leaves Markdown Things unplaced').toBeGreaterThan(0);
    await expect(markdown).toHaveAccessibleName(`Markdown Things, ${String(before)}`);

    // The count answers the search rather than the Space, which is the whole of
    // why it is worth drawing — a number that disagreed with the rows under it
    // would be a second claim about the same set
    // (`.scratch/command-dock/issues/10-decide-the-cards-surface.md`).
    await page.getByRole('textbox', { name: 'Search things' }).fill('zzzz');
    await expect(rows).toHaveCount(0);
    await expect(markdown).toHaveAccessibleName('Markdown Things, 0');

    // And a switch the reader turns off goes on counting, because the number is
    // what says whether turning it back on is worth the press.
    await page.getByRole('textbox', { name: 'Search things' }).fill('');
    await markdown.click();
    await expect(markdown).toHaveAttribute('aria-pressed', 'false');
    await expect(markdown).toHaveAccessibleName(`Markdown Things, ${String(before)}`);
  },
);

test(
  'a long Things list scrolls independently on a narrow screen',
  { tag: '@parity:things-popover-scrolls-a-long-list-on-a-narrow-screen' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await settled(page);
    await page.setViewportSize({ width: 480, height: 360 });

    await page.getByRole('button', { name: 'Things' }).click();
    await expect(page.getByRole('textbox', { name: 'Search things' })).toBeVisible();
    // **The application half proves containment; the Ladle half proves the
    // scrolling.** This Space's selected Diagram leaves five Things unplaced, and
    // five rows do not overflow any sane bound — the drawer this replaced
    // scrolled here only because its rows were whole 146px Thing fronts. What is
    // provable against the real Space is the invariant that actually bites on a
    // short screen: an anchored popover is bounded by the room it has and stays
    // inside the viewport, where a fixed height would put the last rows under
    // the edge with no way to reach them. `things-popover.spec.ts` mounts
    // eighteen rows against the same bound and asserts it scrolls.
    const list = page.locator('.things-popover__list');
    const box = await boxOf(list, 'the Things list');
    const viewport = page.viewportSize();
    expect(viewport, 'the viewport was sized above').not.toBeNull();
    expect(box.y + box.height, 'the list ends inside the viewport').toBeLessThanOrEqual(
      viewport?.height ?? 0,
    );
    expect(
      await list.evaluate((element) => getComputedStyle(element).overflowY),
      'the list scrolls rather than clipping what the bound cuts off',
    ).toBe('auto');
  },
);

test(
  'the Things list dismisses on Escape and survives working on the canvas behind it',
  { tag: '@parity:things-popover-opens-and-dismisses-without-locking-the-canvas' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await settled(page);

    const trigger = page.getByRole('button', { name: 'Things' });
    const list = page.getByRole('dialog', { name: 'Things' });

    await expect(list).toHaveCount(0);
    await trigger.click();
    await expect(list).toBeVisible();

    // Selecting a Thing on the canvas is the ordinary press this list has to
    // live through: it is how a Thing is dropped, and a surface that closed on
    // it could only ever add one Thing per opening. That is the comparison's own
    // reason for anchoring the list rather than drawing it from the screen edge
    // (`.scratch/command-dock/issues/10-decide-the-cards-surface.md`).
    await nodeByTitle(page, 'A').click();
    await expect(nodeByTitle(page, 'A')).toHaveClass(/selected/);
    await expect(list).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(trigger).toBeFocused();
  },
);

test('the open Things list takes no width from the canvas it feeds', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await settled(page);

  const legend = page.getByTestId('graph-legend');
  const overview = page.getByRole('img', { name: 'Graph overview' });
  const canvas = page.getByTestId('selected-canvas');
  await expect(legend).toBeVisible();
  const before = await boxOf(canvas, 'the canvas');

  await page.getByRole('button', { name: 'Things' }).click();
  const list = page.getByRole('dialog', { name: 'Things' });
  await expect(list).toBeVisible();

  // **The obligation ADR 0082 binds, and the one the drawer this replaced could
  // not keep.** A drawer from the screen edge occludes the edge you are
  // dropping onto, so the shell had to yield its width and the canvas got
  // narrower every time the reader opened it. An anchored popover floats: the
  // canvas is the same box open or closed, and the Graph key and the pannable
  // overview stay where they were.
  const after = await boxOf(canvas, 'the canvas');
  expect(after.width, 'the canvas keeps its width while the list is open').toBe(before.width);
  expect(after.x, 'the canvas keeps its position while the list is open').toBe(before.x);

  // And they are still the reader's to operate, not just to look at.
  await expect(legend).toContainText('Graph');
  await overview.click({ position: { x: 4, y: 4 } });
  await expect(list).toBeVisible();
});

test('leaving a presentation closes the Things list rather than reopening it over the canvas', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await settled(page);

  const list = page.getByRole('dialog', { name: 'Things' });
  await page.getByRole('button', { name: 'Things' }).click();
  await expect(list).toBeVisible();

  await presentControl(page).click();
  await expect(page.getByTestId('exit-presenting')).toBeVisible();
  await expect(list).toHaveCount(0);

  // A list that sprang back would also take focus with it — a popover moves
  // focus in on every open, however that open was caused — landing the reader
  // in the Things instead of on the canvas they returned to. What the Dock drops
  // on the way into presenting is the *request* that opened it, so there is
  // nothing left to reopen from.
  await page.getByTestId('exit-presenting').click();
  await expect(presentControl(page)).toBeVisible();
  await expect(list).toHaveCount(0);
});

test(
  'a keyboard Add keeps the reader in the Things list, on the filter',
  { tag: '@parity:things-popover-keeps-the-reader-in-the-list-after-a-keyboard-add' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await settled(page);

    await page.getByRole('button', { name: 'Things' }).click();
    const source = page.getByRole('button', { name: 'Add E to Diagram' });
    await source.focus();
    await source.press('Enter');

    // The Thing is placed, and the reader has not been taken anywhere: an anchored
    // list is a surface you spend repeatedly, which is what the surface
    // comparison bought and what a screen-edge drawer, taken away by the Thing it
    // placed, could not offer
    // (`.scratch/command-dock/issues/10-decide-the-cards-surface.md`).
    await expect(nodeByTitle(page, 'E')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Things' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add E to Diagram' })).toHaveCount(0);

    // On the filter rather than on the popup Base UI would otherwise park it on:
    // the reader's next move is to name the next Thing.
    await expect(page.getByRole('textbox', { name: 'Search things' })).toBeFocused();

    // And Escape is the way out to the canvas, returning focus to the control the
    // list hangs off rather than dropping it on the document.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Things' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Things' })).toBeFocused();
  },
);

/**
 * Deleting a Thing is the Thing rail's now (ADR 0073), so its withdrawal is read
 * there.
 *
 * The Sidebar drew a standing `Delete Thing <title>` button for the selected
 * Thing, and these tests read its presence. The Command Dock has no Thing
 * commands at all — that is its organising rule — so the command lives in the
 * Thing's own actions menu, and "withdrawn" means the row is absent from that
 * menu rather than a button absent from the chrome.
 */
const thingActions = async (page: Page, title: string): Promise<Locator> => {
  const thing = nodeByTitle(page, title).first();
  await thing.hover();
  await thing.getByRole('button', { name: `Actions for Thing ${title}` }).click({ delay: 120 });
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
};

test('Delete Thing confirms before removing the Thing from the whole Space', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await settled(page);

  const thing = nodeByTitle(page, 'B');
  await thing.click();
  await (await thingActions(page, 'B')).getByRole('menuitem', { name: 'Delete Thing' }).click();

  // The dialog is drawn at the App root rather than in the menu that armed it:
  // the menu closes on the press and would take the question with it.
  const confirmation = page.getByRole('alertdialog', { name: 'Delete Thing B?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(thing).toBeVisible();

  await (await thingActions(page, 'B')).getByRole('menuitem', { name: 'Delete Thing' }).click();
  await confirmation.getByRole('button', { name: 'Delete Thing' }).click();

  await expect(nodeByTitle(page, 'B')).toHaveCount(0);
  await page.getByRole('button', { name: 'Things' }).click();
  await expect(page.getByRole('button', { name: 'Add B to Diagram' })).toHaveCount(0);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});

test('Delete Thing is withdrawn while presenting', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await settled(page);

  await expect(
    (await thingActions(page, 'B')).getByRole('menuitem', { name: 'Delete Thing' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  await presentControl(page).click();
  await expect(page.getByTestId('exit-presenting')).toBeVisible();

  // The rail itself is withdrawn while presenting, so there is no menu to open:
  // the audience is looking at the Space, not at the tools. Asserted without
  // hovering the Thing, because the camera has closed in on the presented one and
  // `B` is off frame — which is the same reason the rail would be unreachable
  // even if it were drawn.
  await expect(page.getByRole('button', { name: 'Actions for Thing B' })).toHaveCount(0);
});

test('Delete Thing is withdrawn while the selected Thing is Open', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await settled(page);

  await expect(
    (await thingActions(page, 'B')).getByRole('menuitem', { name: 'Delete Thing' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  await nodeByTitle(page, 'B').first().click();
  await page.getByRole('button', { name: 'Open Thing B' }).click();
  await expect(nodeByTitle(page, 'B').getByRole('button', { name: 'Close Thing B' })).toBeVisible();

  await expect(
    (await thingActions(page, 'B')).getByRole('menuitem', { name: 'Delete Thing' }),
  ).toHaveCount(0);
});

test('dragging from the Things list uses transformed canvas coordinates then ordinary Thing dragging', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await settled(page);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await settled(page);

  await page.getByRole('button', { name: 'Things' }).click();
  const source = page.getByRole('button', { name: 'Add E to Diagram' });
  const pane = page.locator('.react-flow__pane');
  const paneBox = await boxOf(pane, 'the React Flow pane');
  const targetPosition = { x: paneBox.width * 0.5, y: paneBox.height * 0.8 };
  const dropPoint = { x: paneBox.x + targetPosition.x, y: paneBox.y + targetPosition.y };
  await source.dragTo(pane, { targetPosition });

  const added = nodeByTitle(page, 'E');
  await expect(added).toBeVisible();
  // Zoomed in, so a screen pixel is a fraction of a flow unit — sub-pixel
  // rounding through that scale is expected, not evidence of a wrong drop.
  const addedBox = await boxOf(added, 'the added Thing');
  expect(addedBox.x + addedBox.width / 2).toBeCloseTo(dropPoint.x, -1);
  expect(addedBox.y + addedBox.height / 2).toBeCloseTo(dropPoint.y, -1);

  const dropped = await positionOf(added);
  await dragBy(page, added, 48, 32);
  await expect
    .poll(async () => {
      const moved = await positionOf(added);
      return moved.x > dropped.x + 30 && moved.y > dropped.y + 20;
    })
    .toBe(true);
});

test(
  'the Things toggle is withdrawn while presenting, matching the list it controls',
  {
    tag: '@parity:things-popover-withdraws-while-authoring-is-unavailable',
  },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await settled(page);

    const toggle = dock(page).getByRole('button', { name: 'Things' });
    await expect(toggle).not.toHaveAttribute('aria-disabled', 'true');

    await presentControl(page).click();
    await expect(page.getByTestId('exit-presenting')).toBeVisible();

    // **Withdrawn by the surface being hidden, not by the toggle greying out.**
    // Presenting hides the Dock's commands (ADR 0082) — it does not remove the
    // Dock, which stays mounted at `data-presenting='true'` so the persistence
    // report keeps its slot (`command-dock.css:86-91`). `visibility: hidden`
    // takes the toolbar out of the accessibility tree, so `toggle` is scoped
    // inside a locator matching nothing and its `toHaveCount(0)` would be
    // satisfied by a Dock that had never rendered at all. The trigger is
    // therefore addressed through the frame, which is still there, and the
    // list it controls is closed rather than left hidden behind a still-true
    // `open` — the half of the claim that outlived the Sidebar.
    const surface = page.locator('.command-dock__surface');
    await expect(surface).toBeAttached();
    await expect(surface).toBeHidden();
    await expect(
      page.getByTestId('command-dock').locator('.command-dock__things-trigger'),
    ).toHaveCount(1);
    await expect(toggle).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Things' })).toHaveCount(0);
  },
);

test('editing an existing Diagram updates it instead of creating another one', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await settled(page);

  await dragBy(page, a, 0, 220);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(selectedCanvas(page)).toContainText('Collection 1');

  await selectCanvas(page, 'Collection 2');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await selectCanvas(page, 'Collection 1');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await settled(page);

  await dragBy(page, a, 0, 160);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await expect(selectedCanvas(page)).toContainText('Collection 1');
});

test(
  'Space, Diagram and Graph names edit from the Dock and survive reload',
  { tag: '@parity:command-dock-edits-identity-names' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await settled(page);

    // **One name, one control, one draft.** The Sidebar shared a draft between
    // an active row and a canvas header, begun from either and returning the
    // caret to whichever began it — which is where `continuation.ts`'s
    // `sidebar-row` target came from and why it is gone with the surface. The
    // Dock draws each name once, so the editor replaces the control it began
    // from and there is no second surface to keep in step.
    await selectedCanvas(page).click();
    const diagramName = page.getByRole('textbox', { name: 'Diagram name' });
    await expect(diagramName).toBeFocused();
    await diagramName.fill('');
    await diagramName.press('Enter');
    // Refused and still open, with the author's words still theirs.
    await expect(page.getByText('A Diagram needs a name.')).toBeVisible();
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
    await diagramName.fill('Workshop');
    await diagramName.press('Enter');
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
    await expect(selectedCanvas(page)).toContainText('Workshop');

    // Begun again from the same control, and cancelled: Escape drops the draft
    // rather than committing it.
    await selectedCanvas(page).click();
    const cancelled = page.getByRole('textbox', { name: 'Diagram name' });
    await cancelled.fill('Studio');
    await cancelled.press('Escape');
    await expect(selectedCanvas(page)).toContainText('Workshop');
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');

    await activeGraph(page).click();
    const graphName = page.getByRole('textbox', { name: 'Graph name' });
    await graphName.fill('Journey');
    await graphName.press('Enter');
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
    await expect(activeGraph(page)).toContainText('Journey');

    // **The Space's own name, from inside the Space, as one Edit on its session.**
    // It writes `document.title` and nothing else: no Space Thing pointing here
    // moves with it, and ADR 0083 keeps this name off any Thing's front, so the
    // reload below is reading the stored document rather than a Thing that
    // happened to agree with it.
    await spaceName(page).click();
    const spaceTitle = page.getByRole('textbox', { name: 'Space name' });
    await expect(spaceTitle).toBeFocused();
    // Whitespace rather than nothing, because that is the case the schema cannot
    // refuse — `z.string().min(1)` counts characters — and the surface refuses it
    // on the trim before the Edit is asked, exactly as it does for a Diagram.
    await spaceTitle.fill('   ');
    await spaceTitle.press('Enter');
    await expect(page.getByText('A Space needs a name.')).toBeVisible();
    // Refused and still open, with the author's words still theirs.
    await expect(spaceTitle).toBeVisible();
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
    await spaceTitle.fill('Atlas');
    await spaceTitle.press('Enter');
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '3');
    await expect(spaceName(page)).toContainText('Atlas');

    // Begun again from the same control and cancelled: Escape drops the draft,
    // and the caret goes back to the name it was begun from rather than falling
    // to the body the unmounted editor left it on.
    await spaceName(page).click();
    const cancelledSpace = page.getByRole('textbox', { name: 'Space name' });
    await cancelledSpace.fill('Ledger');
    await cancelledSpace.press('Escape');
    await expect(spaceName(page)).toContainText('Atlas');
    await expect(spaceName(page)).toBeFocused();
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '3');

    await page.reload();
    await selectCanvas(page, 'Workshop');
    await expect(activeGraph(page)).toContainText('Journey');
    await expect(spaceName(page)).toContainText('Atlas');
  },
);

/**
 * Dragged in an authored Diagram, because that is where a Thing and the Edges
 * around it stay together.
 *
 * The fixture's own `Collection 1` owns Long,
 * Mid and Short over
 * the spine, so dragging A there updates that Diagram in place and its Edges are
 * still drawn around the Thing that moved.
 */
test('edges follow a thing that has been dragged', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /./);
  await selectCanvas(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();

  const edgePath = () =>
    page
      .locator('.react-flow__edge-path')
      .first()
      .evaluate((el) => el.getAttribute('d') ?? '');
  await settled(page);
  const before = await edgePath();
  const from = await positionOf(a);

  await dragBy(page, a, 0, 260);
  // Assert the drag landed, so a silent no-drag fails here rather than
  // masquerading as an edge that did not redraw.
  expect((await positionOf(a)).y).toBeGreaterThan(from.y + 100);

  // Whatever geometry the placement computed described where the things were,
  // so it is stale the moment one leaves it. The edge is redrawn between where
  // the things now are.
  await expect.poll(edgePath).not.toBe(before);
});

test('a completed drag persists automatically', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /./);
  await settled(page);

  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  await dragBy(page, a, 0, 260);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  // Automatic means automatic: the status is the whole indicator and there is
  // nothing to press (ADR 0030). A reintroduced Save would still let every
  // assertion above pass.
  await expect(page.getByRole('button', { name: /save/i })).toHaveCount(0);
});

test('a selected Thing exposes four circular handles coloured as the active Graph', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /./);
  await settled(page);
  // Selecting is all this needs, and it keeps the Active Graph the fixture's
  // own first one — a drag here would convert the View and activate the empty
  // Graph the conversion mints, leaving no Edge to read a colour from.
  await a.click();
  await expect(a).toHaveClass(/selected/);

  const handles = a.locator('.rf-thing-node__authoring-handle--source');
  await expect(handles).toHaveCount(4);
  await expect(handles.first()).toHaveCSS('width', '24px');
  await expect(handles.first()).toHaveCSS('height', '24px');
  const graphStroke = await page
    .locator('.rf-graph-edge')
    .filter({ has: page.locator('.react-flow__edge-path') })
    .first()
    .locator('.react-flow__edge-path')
    .evaluate((edge) => getComputedStyle(edge).stroke);
  const handleColors = await handles.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).backgroundColor),
  );
  expect(handleColors).toEqual(Array(4).fill(graphStroke));
  expect(
    await handles.evaluateAll((elements) =>
      elements.every((element) => getComputedStyle(element).borderRadius === '50%'),
    ),
  ).toBe(true);
  // The target anchors on the same Thing stay hidden: no drag is in flight, so
  // the Thing is offering where an Edge may start and nothing else.
  await expect(a.locator('.rf-thing-node__authoring-handle--target').first()).toHaveCSS(
    'opacity',
    '0',
  );
});

test('drawing between existing Things persists one active-Graph Edge and selects the target', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await addExistingThing(page, 'E');
  const source = nodeByTitle(page, 'A').first();
  const target = nodeByTitle(page, 'E').first();
  const initialEdgeCount = await page.locator('.react-flow__edge').count();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();

  // Explicit creation captures the computed placement into the authored Diagram.
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await settled(page);
  await source.hover();

  const sourceHandle = authoringHandle(source, 'source', 'right');
  const targetHandle = authoringHandle(target, 'target', 'top');
  await expect(sourceHandle).toHaveCSS('opacity', '1');
  await expect(targetHandle).toHaveCSS('opacity', '0');
  // The Graph this Edge will join is the one conversion minted, and it is what
  // colours both the handle and the preview (ADR 0033). Read off the handle
  // rather than written down, so the assertion below is that the two agree
  // rather than that either matches a palette entry a test knows by heart.
  const activeGraphColor = await sourceHandle.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  await connectHandles(page, sourceHandle, targetHandle, async () => {
    // Seeking handles show only on near, eligible Things — here the drop target
    // under the pointer — not on every Thing in the Diagram (ADR 0090). A neighbour inside the
    // proximity magnet may also seek; lighting *every* Thing is the regression.
    await expect(target.locator('.rf-thing-node__inner')).toHaveAttribute(
      'data-connection-seeking',
      'target',
    );
    await expect(target.locator('.rf-thing-node__authoring-handle--target').first()).toHaveCSS(
      'opacity',
      '1',
    );
    await expect(target.locator('.rf-thing-node__authoring-handle--target')).toHaveCount(
      AUTHORING_HANDLE_SIDES,
    );
    await expect(source.locator('.rf-thing-node__authoring-handle--target').first()).toHaveCSS(
      'opacity',
      '0',
    );
    const thingCount = await page.locator('.rf-thing-node__inner').count();
    expect(
      await page.locator('.rf-thing-node__inner[data-connection-seeking="target"]').count(),
    ).toBeLessThan(thingCount);
    const preview = page.locator('.react-flow__connection-path');
    // `toBeAttached`, not `toBeVisible`: a connection drawn between two Things
    // whose centres share a row is a horizontal `path`, and a zero-height
    // bounding box is what Playwright calls hidden. What the assertion is about
    // is the line's colour and its arrow, both read below.
    await expect(preview).toBeAttached();
    await expect(preview).toHaveCSS('stroke', activeGraphColor);
    await expect(preview).toHaveAttribute('marker-end', /url/);
  });

  await expect(page.locator('.react-flow__edge')).toHaveCount(initialEdgeCount + 1);
  // An Edge names its Things and its Graph for a screen reader. Matched loosely
  // on the Graph, whose neutral title depends on how many the Space already had.
  await expect(page.getByLabel(/^Edge from A to E in /)).toBeVisible();
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  await expect(target.locator('.rf-thing-node__authoring-handle--source').first()).toHaveCSS(
    'opacity',
    '1',
  );
  await expect(page.locator('.canvas-thing[data-expanded="true"]')).toHaveCount(0);
});

test('an authored Edge is immediately available when presenting the Graph', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await addExistingThing(page, 'E');
  const source = nodeByTitle(page, 'E').first();
  const target = nodeByTitle(page, 'A').first();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();

  // Create a Diagram explicitly, then author E → A into its empty Graph. It is that
  // Graph's only Edge, so E is where presenting it begins.
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '1');
  await settled(page);

  await connectHandles(
    page,
    authoringHandle(source, 'source', 'right'),
    authoringHandle(target, 'target', 'top'),
  );

  await expect(page.getByLabel(/^Edge from E to A in /)).toBeAttached();
  await expect(persistence).toHaveAttribute('data-revision', '2');
  await expect(persistence).toHaveText('Persisted');

  await presentControl(page).click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(activeThing(page)).toHaveAttribute(
    'data-id',
    '00000000-0000-4000-8000-000000000008',
  );
  await expect(page.getByTestId('presenting-moves').getByRole('button')).toHaveText('A');

  await page.keyboard.press('ArrowRight');
  await expect(activeThing(page)).toHaveAttribute(
    'data-id',
    '00000000-0000-4000-8000-000000000002',
  );
  await page.keyboard.press('ArrowLeft');
  await expect(activeThing(page)).toHaveAttribute(
    'data-id',
    '00000000-0000-4000-8000-000000000008',
  );
});

test('an Edge drawn from the presented Thing is a move the presenter can take now', async ({
  page,
}) => {
  const A = '00000000-0000-4000-8000-000000000002';
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await addExistingThing(page, 'E');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();

  // Explicit creation preserves Long, whose A → B move is immediately
  // presentable; the gesture below adds a second move while presenting.
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '1');
  await settled(page);
  // The gesture below is made from the presented Thing, so A has to be selected
  // going in.
  await a.click();
  await expect(a).toHaveClass(/selected/);

  await presentControl(page).click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(activeThing(page)).toHaveAttribute('data-id', A);
  const moves = page.getByTestId('presenting-moves').getByRole('button');
  await expect(moves).toHaveText(['B']);
  // The presenting camera closes in over two animated moves; a handle box read
  // during them is stale by the time the mouse arrives.
  await settled(page);

  // A self-Edge is valid authored structure (ADR 0032), and it is the Edge this
  // gesture can reach: at a zoom where the active Thing is legible every other
  // Thing is provably off frame (ADR 0027), so the presented Thing's own handles
  // are the only ones on screen.
  await connectHandles(
    page,
    authoringHandle(activeThing(page), 'source', 'right'),
    authoringHandle(activeThing(page), 'target', 'left'),
  );

  // Attached rather than visible: with one Graph on the Thing its inbound and
  // outbound handles sit at the same height, so a self-Edge is a flat line whose
  // box has no height — which Playwright reads as hidden. The moves below are
  // what prove it was authored.
  await expect(page.getByLabel(new RegExp(`^Edge from A to A in `))).toBeAttached();
  await expect(persistence).toHaveAttribute('data-revision', '2');
  await expect(persistence).toHaveText('Persisted');

  // The chrome enumerates the active Thing's outgoing Edges, so the Edge just
  // drawn is available without leaving and re-entering presentation.
  await expect(moves).toHaveText(['B', 'A']);
});

/**
 * Explicit creation preserves the active Graph. A → E is absent from it, so the
 * first is accepted and repeating it is the duplicate refusal asserted below.
 */
test('drawing an Edge into an explicitly created Diagram then refuses its duplicate', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await addExistingThing(page, 'E');
  await addExistingThing(page, 'F');
  const source = nodeByTitle(page, 'A').first();
  const target = nodeByTitle(page, 'E').first();
  const initialEdgeCount = await page.locator('.react-flow__edge').count();
  await settled(page);
  const before = await allPositions(page);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '2');

  await source.hover();
  await connectHandles(
    page,
    authoringHandle(source, 'source', 'right'),
    authoringHandle(target, 'target', 'left'),
  );

  // Attached rather than visible: A and B are on the same hand-set row, so this Edge
  // is a dead-horizontal line with a zero-height box, which Playwright reads as
  // hidden.
  await expect(page.getByLabel(new RegExp(`^Edge from A to E in `))).toBeAttached();
  await expect(page.locator('.react-flow__edge')).toHaveCount(initialEdgeCount + 1);
  await expect(persistence).toHaveAttribute('data-revision', '3');
  await expect(persistence).toHaveText('Persisted');
  await expect(selectedCanvas(page)).toContainText('Collection 1');
  // Adding an Edge moves nothing.
  expect(await allPositions(page)).toEqual(before);

  // Drawn a second time, in the Diagram that now owns the Graph holding it, it is
  // the duplicate the rule is about — refused, with nothing persisted. Asserted
  // live mid-drag: eligibility withholds seeking handles on a refused target
  // (`edge-already-exists`), so `connectHandles` cannot gate on them here.
  // Neighbours inside the proximity magnet may still seek; E itself must not.
  await source.hover();
  const duplicateFrom = authoringHandle(source, 'source', 'right');
  const refused = authoringHandle(target, 'target', 'left');
  const from = await boxOf(duplicateFrom, "Thing A's source handle");
  const drop = await boxOf(refused, "Thing E's refused target handle");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  try {
    await page.mouse.move(from.x + from.width / 2 + 30, from.y + from.height / 2, { steps: 4 });
    await page.mouse.move(drop.x + drop.width / 2, drop.y + drop.height / 2, { steps: 8 });
    await expect(target.locator('.rf-thing-node__inner')).toHaveAttribute(
      'data-connection-seeking',
      'none',
    );
    await expect(refused).toHaveCSS('opacity', '0');
  } finally {
    await page.mouse.up();
  }
  await quiescent(page);
  await expect(page.locator('.react-flow__edge')).toHaveCount(initialEdgeCount + 1);
  await expect(persistence).toHaveAttribute('data-revision', '3');
  await expect(persistence).toHaveText('Persisted');
});

/**
 * Two connections in one session, chained so the second starts from the Thing the
 * first selected.
 *
 * The second one is the whole point. A Thing's declared handles (`projection.ts`)
 * include every Graph id, not only the ones incident to it, so a completed
 * connection resolves in the same render that first makes its target incident.
 * Forcing React Flow to re-measure from the DOM replaces those declarations with
 * only the anchors actually rendered, which drops the not-yet-incident ones — and
 * the *next* connection then fails to resolve its source handle. One connection
 * cannot see it; the damage is done to the gesture after.
 *
 * Verified both ways against the fixture: with a forced remeasure in `ThingNode`
 * this fails with six React Flow #008 warnings on the second connection, and
 * without one it passes.
 */
test('a second connection drawn in the same session resolves its handles', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await addExistingThing(page, 'E');
  await addExistingThing(page, 'F');
  const a = nodeByTitle(page, 'A').first();
  const e = nodeByTitle(page, 'E').first();
  const f = nodeByTitle(page, 'F').first();
  const initialEdgeCount = await page.locator('.react-flow__edge').count();
  await expect(a).toBeVisible();

  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  // Newly added Things use the same initial placement. Separate F so its target
  // handle is not covered by E during the chained gesture.
  await dragBy(page, f, 260, 0);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '3');
  await settled(page);

  // The drag above left the pointer on `F`, and a handle reveals with the Thing
  // it belongs to — an unrevealed handle takes no pointer events, so the press
  // that starts the connection would land on the pane instead.
  await a.hover();
  await connectHandles(
    page,
    authoringHandle(a, 'source', 'right'),
    authoringHandle(e, 'target', 'top'),
  );
  await expect(page.locator('.react-flow__edge')).toHaveCount(initialEdgeCount + 1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '4');
  await settled(page);
  // The Thing the connection reached is the selected one, which is what the
  // chain above is named for and what the continuation `endPointerDrag`
  // requests is owed. Asserted rather than assumed, and *after* the barrier:
  // the deferral that used to hold this selection past React Flow's own
  // release handling is gone, so a selection installed and then undone by the
  // release is exactly the failure this has to catch — which it cannot do
  // while React Flow is still settling the gesture that would undo it.
  await expect(e).toHaveClass(/selected/);

  await e.hover();
  await connectHandles(
    page,
    authoringHandle(e, 'source', 'right'),
    authoringHandle(f, 'target', 'top'),
  );
  await expect(page.locator('.react-flow__edge')).toHaveCount(initialEdgeCount + 2);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '5');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
});

test('changing the active Graph recolours authoring handles without persisting or filtering', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const source = nodeByTitle(page, 'A').first();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /./);
  await settled(page);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');
  // Collection 1 owns several Graphs, so changing the active one recolours the
  // authored handles without changing which overview Edges are drawn.
  await source.hover();
  const handle = source.locator('.rf-thing-node__authoring-handle--source').first();
  const longColour = await handle.evaluate((element) => getComputedStyle(element).backgroundColor);
  const drawn = await page.locator('.react-flow__edge').count();

  await activateGraph(page, 'Mid');

  await source.hover();
  await expect(handle).not.toHaveCSS('background-color', longColour);
  await expect(page.locator('.react-flow__edge')).toHaveCount(drawn);
  await expect(persistence).toHaveAttribute('data-revision', '0');
  await expect(persistence).toHaveText('Persisted');
});

/**
 * The authoring handle is a drag affordance, and a click is not a drag.
 *
 * A press and release inside React Flow's drag threshold never starts a
 * connection, so the click reached the Thing underneath and opened it to read —
 * from a control whose whole purpose is to begin an Edge.
 */
test('clicking a Thing authoring handle neither opens the Thing nor draws an Edge', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const thing = nodeByTitle(page, 'A').first();
  await expect(thing).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /./);
  await settled(page);
  await thing.hover();
  const drawn = await page.locator('.react-flow__edge').count();

  const handleBox = (await authoringHandle(thing, 'source', 'right').boundingBox())!;
  await page.mouse.click(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);

  await expect(page.locator('.canvas-thing[data-expanded="true"]')).toHaveCount(0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(drawn);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

/**
 * The app-owned canvas key routes the selected Edge through its authoring
 * operation. React Flow receives `deleteKeyCode={null}` and installs no
 * document-level delete listener of its own.
 */
for (const key of ['Backspace', 'Delete'] as const) {
  test(`${key} removes the selected Edge from its Graph and nothing else`, async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    // An Edge belongs to a Diagram's Graph, so an Edge Edit needs one selected.
    await selectCanvas(page, 'Collection 1');
    await settled(page);
    const drawnThings = await page.locator('.react-flow__node').count();
    const drawn = await page.locator('.react-flow__edge').count();
    const persistence = page.getByTestId('persistence-status');
    await expect(persistence).toHaveAttribute('data-revision', '0');

    await selectAnEdge(page);
    await page.keyboard.press(key);

    await expect(page.locator('.react-flow__edge')).toHaveCount(drawn - 1);
    await expect(page.locator('.react-flow__node')).toHaveCount(drawnThings);
    await expect(persistence).toHaveAttribute('data-revision', '1');
    await expect(persistence).toHaveText('Persisted');
  });
}

/**
 * The app-owned canvas key removes a selected Thing from this Diagram through the
 * completed Space Edit lifecycle. The Thing still belongs to the Space; the
 * projection loses it and the Diagram-owned Edges incident to it together.
 */
for (const key of ['Backspace', 'Delete'] as const) {
  test(`${key} with a Thing selected removes it and its Edges from this Diagram`, async ({
    page,
  }) => {
    await page.goto('/');
    const thing = nodeByTitle(page, 'A').first();
    await expect(thing).toBeVisible();
    await selectCanvas(page, 'Collection 1');
    await settled(page);
    const drawnThings = await page.locator('.react-flow__node').count();
    const drawn = await page.locator('.react-flow__edge').count();
    // Every Edge this Thing is an endpoint of, counted before the Edit, so the
    // assertion below is an exact remainder rather than "fewer than before" —
    // which passed while a single incident Edge went and the rest stayed.
    const incident = await page.getByLabel(/^Edge (from A to|from .* to A) /).count();
    expect(incident).toBeGreaterThan(0);

    const thingBox = (await thing.boundingBox())!;
    await page.mouse.click(thingBox.x + thingBox.width / 2, thingBox.y + thingBox.height / 2);
    await expect(thing).toHaveClass(/selected/);

    await page.keyboard.press(key);
    await quiescent(page);

    await expect(page.locator('.react-flow__node')).toHaveCount(drawnThings - 1);
    await expect(page.locator('.react-flow__edge')).toHaveCount(drawn - incident);
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');

    await page.getByRole('button', { name: 'Things' }).click();
    const restoreMembership = page.getByRole('button', { name: 'Add A to Diagram' });
    await expect(restoreMembership).toBeVisible();
    await restoreMembership.click();

    await expect(page.locator('.react-flow__node')).toHaveCount(drawnThings);
    await expect(page.locator('.react-flow__edge')).toHaveCount(drawn - incident);
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  });
}

/**
 * The assistive description names the keys that actually do something.
 *
 * Both descriptions name the application-owned operations rather than React
 * Flow's disabled local deletion.
 */
test('the graph advertises its Thing and Edge delete commands', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();

  await expect(page.locator('[id^="react-flow__node-desc"]')).toContainText(/open a Thing/i);
  await expect(page.locator('[id^="react-flow__node-desc"]')).toContainText(/remove.*Diagram/i);
  await expect(page.locator('[id^="react-flow__edge-desc"]')).toContainText(/delete/i);
});

/**
 * Only the Active Graph's Edges are tab stops, and each is named for a reader.
 *
 * An Edge belonging to another Graph the Diagram draws is there to be seen —
 * putting every Edge in the graph into the tab order would place inert stops
 * between a keyboard author and the ones they can act on.
 */
test('only Active Graph Edges are focusable, and focus selects the one reached', async ({
  page,
}) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await selectCanvas(page, 'Collection 1');
  await settled(page);

  const activeTitle = ((await activeGraph(page).textContent()) ?? '').trim();
  const focusable = page.locator('.react-flow__edge[tabindex]');
  await expect(focusable.first()).toBeAttached();
  const names = await focusable.evaluateAll((edges) =>
    edges.map((edge) => edge.getAttribute('aria-label') ?? ''),
  );
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) {
    expect(name).toMatch(/^Edge from .+ to .+ in .+$/);
    expect(name.endsWith(` in ${activeTitle}`), `${name} is not in ${activeTitle}`).toBe(true);
  }
  // Every other Edge the Diagram draws is out of the tab order entirely.
  expect(await page.locator('.react-flow__edge:not([tabindex])').count()).toBeGreaterThan(0);

  // React Flow does not select an Edge that receives focus; Hyper bridges that,
  // so the Delete key acts on the Edge a keyboard author reached.
  await focusable.first().focus();
  await expect(focusable.first()).toHaveClass(/selected/);
});

/**
 * React Flow's native Edge Escape clears the selection and calls `blur()`, which
 * can leave focus on `body` — not an authoring context, and not somewhere a
 * canvas command can be issued from. Hyper repairs that and only that: focus
 * already taken by another control is left alone.
 */
test('Escape on a focused Edge leaves focus on the canvas rather than the document', async ({
  page,
}) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await selectCanvas(page, 'Collection 1');
  await settled(page);

  const edge = page.locator('.react-flow__edge[tabindex]').first();
  await edge.focus();
  await expect(edge).toHaveClass(/selected/);

  await page.keyboard.press('Escape');

  await expect(page.locator('.react-flow__edge.selected')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName ?? 'NONE'))
    .not.toBe('BODY');
});

/**
 * The controls a selected Edge draws for itself, and the two commands on them.
 *
 * `SelectedEdgeControls` is rendered through `EdgeLabelRenderer`, so it is
 * ordinary DOM over the canvas rather than SVG, and it appears on the selected
 * Edge alone. This is the spatial half of the story evidence: the catalogue
 * proves the control semantics, and this proves they arrive over the real routed
 * Edge, gated on selection, and that a completion redraws from the Space.
 */
test(
  'a selected Edge offers controls that delete it and open its endpoint editor',
  { tag: '@parity:selected-edge-controls-offer-edit-and-delete' },
  async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await selectCanvas(page, 'Collection 1');
    await settled(page);
    const drawn = await page.locator('.react-flow__edge').count();
    await expect(page.getByRole('button', { name: 'Delete this Edge' })).toHaveCount(0);

    await selectAnEdge(page);
    await expect(page.getByRole('button', { name: 'Delete this Edge' })).toBeVisible();

    // The endpoints, as the keyboard reaches them: two pickers over this Diagram's
    // Things, each showing the Thing the Edge currently names.
    await page.getByRole('button', { name: 'Edit this Edge' }).click();
    await expect(page.getByRole('combobox', { name: 'From' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'To' })).toBeVisible();
    await page.keyboard.press('Escape');

    // **Where they are drawn**, not merely that they exist: the controls are
    // portalled into `EdgeLabelRenderer` at the point `routedEdgeGeometry`
    // calls the routed polyline's middle, so they pan and zoom with the canvas
    // and sit on the Edge they act on. Read off the drawn path rather than
    // recomputed, which is the disagreement the shared geometry exists to stop.
    const middle = await page
      .locator('.react-flow__edge.selected .react-flow__edge-path')
      .evaluate((path) => {
        // SAFETY: `.react-flow__edge-path` only ever matches the `<path>`
        // React Flow's SVG edge renderer draws.
        const geometry = path as SVGPathElement;
        const transform = geometry.getScreenCTM();
        if (transform === null) throw new Error('The selected Edge has no screen transform.');
        const at = geometry
          .getPointAtLength(geometry.getTotalLength() / 2)
          .matrixTransform(transform);
        return { x: at.x, y: at.y };
      });
    const controls = await boxOf(page.getByTestId('edge-edit'), 'the Edit control');
    expect(Math.abs(controls.y + controls.height / 2 - middle.y)).toBeLessThan(8);
    expect(Math.abs(controls.x + controls.width / 2 - middle.x)).toBeLessThan(controls.width + 8);

    // **Gated on the Active Graph, not on selection alone.** Activating another
    // Graph is not an Edit and moves no Edge, but an Edge outside the Active
    // Graph cannot remain selected (CONTEXT.md) — so the controls go with it,
    // rather than leaving Delete live on an Edge the canvas has stopped
    // offering.
    await activateGraph(page, 'Mid');
    await expect(page.getByRole('button', { name: 'Delete this Edge' })).toHaveCount(0);
    await expect(page.locator('.react-flow__edge.selected')).toHaveCount(0);
    await activateGraph(page, 'Long');

    await selectAnEdge(page);
    await page.getByRole('button', { name: 'Delete this Edge' }).click();

    await expect(page.locator('.react-flow__edge')).toHaveCount(drawn - 1);
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
    await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  },
);

test(
  "a selected Edge's Edit trigger reads as open while its editor is",
  { tag: '@parity:selected-edge-edit-trigger-reads-as-open' },
  async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await selectCanvas(page, 'Collection 1');
    await settled(page);

    await selectAnEdge(page);
    const edit = page.getByRole('button', { name: 'Edit this Edge' });
    const del = page.getByRole('button', { name: 'Delete this Edge' });
    const restingFill = await resolveToken(edit, '--secondary');
    await expect(edit).toHaveAttribute('aria-expanded', 'false');
    await expect(edit).not.toHaveCSS('background-color', restingFill);

    await edit.click();
    await expect(page.getByTestId('edge-editor')).toBeVisible();
    await expect(edit).toHaveAttribute('aria-expanded', 'true');
    // Leave Edit before reading fill: the quiet recipe also paints hover, and
    // click leaves the pointer over the trigger (@parity:selected-edge-edit-trigger-reads-as-open).
    await page.mouse.move(0, 0);
    expect(await edit.evaluate((element) => element.matches(':hover'))).toBe(false);
    const openFill = await resolveToken(edit, '--secondary');
    await expect(edit).toHaveCSS('background-color', openFill);
    await expect(del).not.toHaveCSS('background-color', openFill);
  },
);

/**
 * Moving an endpoint from the keyboard, through the same picker the pointer drag
 * has no use for.
 *
 * The completion is Space Authoring's and the Edge keeps its Graph — what this
 * proves is that the picker reaches it and the projection redraws from the
 * completed Space rather than from a local React Flow change.
 */
test(
  'the Edge editor moves an endpoint and keeps the Edge in its Graph',
  { tag: '@parity:selected-edge-editor-shows-both-endpoints' },
  async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await selectCanvas(page, 'Collection 1');
    await settled(page);
    const drawn = await page.locator('.react-flow__edge').count();

    const selected = await selectAnEdge(page);
    await page.getByRole('button', { name: 'Edit this Edge' }).click();
    await page.getByRole('combobox', { name: 'To' }).press('ArrowDown');
    //
    // Here the filter excludes nothing, and that is the fixture rather than the
    // rule: every Graph in it is a line, so no endpoint this list offers would
    // duplicate an existing Edge, and self-Edges, cycles and the endpoint the Edge
    // already names are all eligible (ADR 0032, ADR 0042). It is load-bearing at
    // the endpoint picker below, where B is disabled as a duplicate.
    const option = page.locator('[role="option"]:not([data-disabled])');
    // Read before the click, because the list goes with the completion: this is
    // the only moment the chosen Thing's title is on screen to be observed rather
    // than derived from the code under test.
    const chosen = (await option.last().innerText()).trim();
    await option.last().click();

    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
    await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
    // Replaced, not removed: the Graph still draws as many Edges as before.
    await expect(page.locator('.react-flow__edge')).toHaveCount(drawn);
    await expect(page.getByLabel(selected, { exact: true })).toHaveCount(0);

    // **Focus after the reprojection**, which is a move nothing else supplies:
    // the popover that held focus unmounts with the Edge the completion
    // replaced, and React Flow moves focus only for elements it still draws.
    // Edge Authoring's focus request names the Edge by domain subject, and the
    // projection carrying it arrives a strategy later — so the request has to
    // outlive the render that made it, and this is what proves it does.
    const focusedEdgeLabel = () =>
      page.evaluate(() => {
        const active = document.activeElement;
        return active instanceof Element
          ? (active.closest('.react-flow__edge')?.getAttribute('aria-label') ?? null)
          : null;
      });
    // **The reconnected Edge by name, not merely "some other Edge".** A
    // Diagram overview draws every Graph at once, so "focus moved" is satisfied
    // by any of a dozen Edges — including one with these very endpoints in
    // another Graph. The decorated label carries all three facts the request is
    // made of (`edge-authoring-react.tsx`: `Edge from X to Y in G`), so naming
    // the expected one pins the unmoved endpoint, the chosen Thing and the Graph
    // together. `selected` and `chosen` are both read off the page, so this
    // asserts against observed values rather than recomputed ones.
    const reconnected = selected.replace(/ to .* in /, ` to ${chosen} in `);
    expect(reconnected).not.toBe(selected);
    await expect.poll(focusedEdgeLabel).toBe(reconnected);
  },
);

/**
 * A selected Edge's reconnect anchors sit over the Thing's four authoring handles
 * where they overlap, and the anchors have to win.
 *
 * Reconnection is per-Edge and narrowed to the *selected* one for exactly this
 * reason: `edgesReconnectable` left globally true would put two transparent
 * anchors permanently live on every Edge, over every Thing's handles.
 */
test('reconnect anchors exist only on the selected Edge', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await selectCanvas(page, 'Collection 1');
  await settled(page);
  const anchors = page.locator('.react-flow__edgeupdater');
  await expect(anchors).toHaveCount(0);

  await selectAnEdge(page);

  // Two per Edge, source and target, and on one Edge only.
  await expect(anchors).toHaveCount(2);
});

/**
 * Pointer reconnection, end to end through all three native callbacks.
 *
 * The unit tests drive `beginPointerReconnect` directly, so nothing there sees
 * what React Flow actually does around a reconnect drag: it calls
 * `onReconnectStart` and then the *store's* `onConnectStart`, and on release the
 * store's `onConnectEnd` before `onReconnectEnd`. Only a real drag proves the
 * Edge lifecycle survives being handed those pairs.
 *
 * `Long` is A→B→C→D→A′, so moving A→B's target onto D makes A→D, which is no
 * duplicate.
 */
test('dragging an endpoint onto another Thing moves it and keeps the Edge in its Graph', async ({
  page,
}) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await selectCanvas(page, 'Collection 1');
  await settled(page);
  const drawn = await page.locator('.react-flow__edge').count();
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');

  const edge = page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]');
  await edge.focus();
  await expect(edge).toHaveClass(/selected/);

  await reconnectOnto(
    page,
    edge,
    'target',
    authoringHandle(nodeByTitle(page, 'D').first(), 'target', 'left'),
  );

  await expect(
    page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('.react-flow__edge[aria-label="Edge from A to D in Long"]'),
  ).toHaveCount(1);
  // Replaced, not added or dropped: the Graph draws exactly as many Edges.
  await expect(page.locator('.react-flow__edge')).toHaveCount(drawn);
  await expect(persistence).toHaveAttribute('data-revision', '1');
  await expect(persistence).toHaveText('Persisted');
});

/**
 * The gestures that follow a reconnection, which one-gesture tests cannot see.
 *
 * React Flow drives a reconnect drag through the connection callbacks too, so
 * Edge Authoring stands them down for its duration — and a flag left raised
 * disables the Alt empty-drop and the continue-at-the-target selection for as
 * long as the canvas is mounted. **A plain connection is the wrong probe**:
 * `onConnect` is not among the handlers stood down, so an Edge still authors
 * and the damage hides. The empty-drop is the one that goes dark, because it
 * needs the preview state the stood-down handlers maintain.
 */
test('an Alt empty-drop still works after a reconnection', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await selectCanvas(page, 'Collection 1');
  await settled(page);

  const edge = page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]');
  await edge.focus();
  await reconnectOnto(
    page,
    edge,
    'target',
    authoringHandle(nodeByTitle(page, 'D').first(), 'target', 'left'),
  );
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await settled(page);

  // `connectToEmptyWithAlt` gates on the preview appearing, which is exactly the
  // state a raised flag starves — so a leak fails inside the helper rather than
  // as a Thing that mysteriously never arrived.
  const source = nodeByTitle(page, 'B').first();
  await source.hover();
  await connectToEmptyWithAlt(page, authoringHandle(source, 'source', 'right'));

  await expect(nodeByTitle(page, 'Thing 1')).toBeVisible();
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
});

/**
 * The *source* anchor, which React Flow reports through the **opposite** handle's
 * type — so a mapping read straight off `handleType` names the wrong endpoint.
 *
 * `Short` is A→B→C, so moving A→B's source onto C makes C→B, which is no
 * duplicate of anything Short holds.
 */
test('dragging the source endpoint moves the end the author took hold of', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await selectCanvas(page, 'Collection 1');
  await activateGraph(page, 'Short');
  await settled(page);

  const edge = page.locator('.react-flow__edge[aria-label="Edge from A to B in Short"]');
  await edge.focus();
  await expect(edge).toHaveClass(/selected/);

  // A source-endpoint drag anchors at the Edge's target and looks for a new
  // *source*, so the Thing offers its source handles for this gesture alone.
  await reconnectOnto(
    page,
    edge,
    'source',
    authoringHandle(nodeByTitle(page, 'C').first(), 'source', 'right'),
  );

  await expect(
    page.locator('.react-flow__edge[aria-label="Edge from C to B in Short"]'),
  ).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});

/**
 * An endpoint dragged back where it came from is offered, not marked invalid.
 *
 * React Flow consults its one global validator during a reconnect too, so a
 * validator that always asks the connect rule reads this as the duplicate Edge
 * it textually is — the anchor shows invalid for the whole drag even though the
 * Edit would accept it as `unchanged`. Asserted live, mid-drag, because that is
 * where the wrong answer is visible; the release then changes nothing.
 */
test('an endpoint dropped back where it came from stays valid throughout', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await selectCanvas(page, 'Collection 1');
  await settled(page);
  const drawn = await page.locator('.react-flow__edge').count();

  const edge = page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]');
  await edge.focus();
  const anchor = await boxOf(edge.locator('.react-flow__edgeupdater-target'), 'the target anchor');
  const back = authoringHandle(nodeByTitle(page, 'B').first(), 'target', 'left');

  await page.mouse.move(anchor.x + anchor.width / 2, anchor.y + anchor.height / 2);
  await page.mouse.down();
  try {
    await page.mouse.move(anchor.x + anchor.width / 2 + 12, anchor.y + anchor.height / 2, {
      steps: 3,
    });
    await expect(back).toHaveCSS('opacity', '1');
    await back.hover();
    // React Flow marks the handle it is over, then whether the drop is allowed.
    // Waiting for the first is what stops the second passing vacuously.
    await expect(back).toHaveClass(/connectingto/);
    await expect(back).toHaveClass(/valid/);
  } finally {
    await page.mouse.up();
  }

  await quiescent(page);
  await expect(page.locator('.react-flow__edge')).toHaveCount(drawn);
  await expect(
    page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]'),
  ).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

/**
 * The one pointer gesture that deletes an Edge: an endpoint released on empty
 * canvas. A release that merely *missed* a handle cancels instead, which is what
 * the off-canvas case below is for.
 */
test('dragging an endpoint onto empty canvas deletes the Edge', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await selectCanvas(page, 'Collection 1');
  await settled(page);
  const drawn = await page.locator('.react-flow__edge').count();

  const edge = page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]');
  await edge.focus();
  await dragEndpointTo(page, edge, 'target', await emptyCanvasPoint(page));

  await expect(page.locator('.react-flow__edge')).toHaveCount(drawn - 1);
  await expect(
    page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]'),
  ).toHaveCount(0);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});

test('dragging an endpoint off the canvas restores the Edge', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await selectCanvas(page, 'Collection 1');
  await settled(page);
  const drawn = await page.locator('.react-flow__edge').count();

  const edge = page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]');
  await edge.focus();
  // Chrome, not canvas: the header that used to stand outside the flow went
  // with the Sidebar (ADR 0082), and the Command Dock is the surface over the
  // canvas now — a DOM sibling of the flow container, so a release on it is the
  // same "no target at all" classification the header gave.
  const chrome = await boxOf(page.getByTestId('command-dock'), 'the Command Dock');
  await dragEndpointTo(page, edge, 'target', {
    x: chrome.x + chrome.width / 2,
    y: chrome.y + chrome.height / 2,
  });

  await quiescent(page);
  await expect(page.locator('.react-flow__edge')).toHaveCount(drawn);
  await expect(
    page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]'),
  ).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

/**
 * The third `DropTarget` classification, and the reason the DOM half of the
 * empty-drop rule exists: a release over a Thing's *body* is far enough from any
 * handle that React Flow resolves no target, so without the hit-test an Alt-drop
 * there would author a Thing on top of the one underneath.
 */
test('an Alt-drop released over a Thing body creates no Thing', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const source = nodeByTitle(page, 'A').first();
  await expect(source).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /./);
  await settled(page);
  await source.hover();
  const drawnThings = await page.locator('.react-flow__node').count();

  const from = await boxOf(authoringHandle(source, 'source', 'right'), 'the source handle');
  const over = await boxOf(nodeByTitle(page, 'C').first(), 'Thing C');
  try {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 30, from.y + from.height / 2, { steps: 4 });
    await page.keyboard.down('Alt');
    // The centre of a 260x146 Thing is some 73px from its nearest handle, well
    // outside React Flow's connection radius of 20 — so `toNode` is null here
    // and only the DOM says this is a Thing.
    await page.mouse.move(over.x + over.width / 2, over.y + over.height / 2, { steps: 4 });
    await expect(page.getByTestId('new-thing-preview')).toHaveCount(0);
  } finally {
    await page.mouse.up();
    await page.keyboard.up('Alt');
  }

  await quiescent(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(drawnThings);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

/**
 * A duplicate Edge is refused before release, not silently after it.
 *
 * The rule already existed — Edit completion drops a duplicate — but it ran only
 * once the author let go, so a target that could not accept the Edge advertised
 * itself as valid for the whole drag. React Flow asks `isValidConnection` during
 * the gesture for exactly this, and drives the handle's own `valid` state from
 * the answer.
 *
 * It is a rule about the Active Graph of a selected Diagram. Explicit creation
 * preserves its Graphs; the first A → E connection below establishes the duplicate.
 */
test('a duplicate Edge is marked invalid while the drag is still live', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await addExistingThing(page, 'E');
  const source = nodeByTitle(page, 'A').first();
  const initialEdgeCount = await page.locator('.react-flow__edge').count();
  await expect(source).toBeVisible();
  await settled(page);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await settled(page);

  const startDrag = async () => {
    await source.hover();
    const from = (await authoringHandle(source, 'source', 'right').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 30, from.y + from.height / 2, { steps: 3 });
  };
  const dragOnto = async (title: string) => {
    const handle = authoringHandle(nodeByTitle(page, title).first(), 'target', 'left');
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    return handle;
  };

  // Author A→E into the Diagram's own Graph, so the Active Graph now holds it.
  await startDrag();
  await expect(await dragOnto('E')).toHaveClass(/valid/);
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(initialEdgeCount + 1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await settled(page);

  // A→E is now an Edge of the Active Graph.
  await startDrag();
  const overDuplicate = await dragOnto('E');
  // Wait for React Flow to mark the handle as the drag's current target before
  // asserting what it did *not* mark. Asserting the absence of `valid` straight
  // after the move can pass because no connection class has landed yet, which
  // would make this test green even if `isValidConnection` were never consulted.
  await expect(overDuplicate).toHaveClass(/connectingto/);
  await expect(overDuplicate).not.toHaveClass(/valid/);
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(initialEdgeCount + 1);

  await startDrag();
  await expect(await dragOnto('C')).toHaveClass(/valid/);
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(initialEdgeCount + 2);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '3');
});

/**
 * Add Thing after explicit Diagram creation, and the naming that follows it.
 *
 * Explicit creation happens exactly once and the created Thing really is under
 * the caret, in a browser where focus is the browser's to give.
 */
test('Add Thing names the new Thing in place in the selected Diagram', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const before = await allPositions(page);
  await expect(createThingControl(page)).not.toHaveAttribute('aria-disabled', 'true');

  await createThing(page, 'Markdown Thing');

  const title = page.getByRole('textbox', { name: 'Thing title' });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue('Thing 1');
  await expect(selectedCanvas(page)).toContainText('Collection 1');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  const after = await allPositions(page);
  expect(after).not.toEqual(before);

  await title.fill('Consequences');
  await title.press('Enter');

  await expect(nodeByTitle(page, 'Consequences')).toBeVisible();
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await expect(await diagramChoices(page)).toHaveCount(3);
});

/**
 * Create Alias is a command on the Thing it points at (ADR 0089).
 *
 * The gesture supplies the Target, so there is no picker, no pane and nothing to
 * cancel: one row, one press, and the Alias exists. The Title is the Target's,
 * copied once, with the caret in it — which is the only thing on the canvas that
 * says what the Alias points at, ADR 0083 keeping the Target's name off the
 * Thing front.
 */
test('Create Alias on a Thing makes an Alias of it and names it after its Target', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const nodes = await page.locator('.react-flow__node').count();

  const menu = await thingActions(page, 'B');
  await menu.getByRole('menuitem', { name: 'Create Alias' }).click();

  const title = page.getByRole('textbox', { name: 'Thing title' });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue('B');
  await title.press('Escape');

  // Two Things called B now, and the second is the Alias: the Title is copied
  // once and the two are independent afterwards, so nothing here is a link.
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes + 1);
  await expect(nodeByTitle(page, 'B')).toHaveCount(2);
  await expect(selectedCanvas(page)).toContainText('Collection 1');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});

/**
 * The whole gesture: the Alias is renamed by the editor its creation opens, and
 * the Target keeps its own name.
 *
 * The Titles agree at creation and diverge freely afterwards, which is the same
 * rule the Space and Space Thing pair follows.
 */
test('an Alias is renamed by the shared Title editor creation begins', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  const menu = await thingActions(page, 'B');
  await menu.getByRole('menuitem', { name: 'Create Alias' }).click();

  const title = page.getByRole('textbox', { name: 'Thing title' });
  await expect(title).toHaveValue('B');
  await expect(title).toBeFocused();
  await title.fill('Recap');
  await title.press('Enter');

  await expect(nodeByTitle(page, 'Recap')).toHaveCount(1);
  // The Target keeps its own: one Thing called B, the one that was always there.
  await expect(nodeByTitle(page, 'B')).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  // And the rename outlives the editor rather than being held by it.
  await quiescent(page);
  await expect(nodeByTitle(page, 'Recap')).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
});

/**
 * The rename is a pending field, so Escape discards it — one press, no field
 * intercepting it (ADR 0048).
 *
 * The Alias itself is *not* a pending field and does not go with it: it was
 * created on the press, one revision earlier, and Escape here discards a draft
 * rather than undoing an Edit. That is the whole point of the test — the two are
 * told apart, and only one of them is a draft.
 */
test('Escape discards an Alias rename without undoing the Alias', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  const menu = await thingActions(page, 'B');
  await menu.getByRole('menuitem', { name: 'Create Alias' }).click();
  const title = page.getByRole('textbox', { name: 'Thing title' });
  await title.fill('Recap');

  await title.press('Escape');

  await quiescent(page);
  await expect(nodeByTitle(page, 'Recap')).toHaveCount(0);
  await expect(nodeByTitle(page, 'B')).toHaveCount(2);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});

/**
 * **Present and unavailable on an Alias, not absent.**
 *
 * ADR 0070 forbids an Alias of an Alias, and an Alias is otherwise a regular
 * Thing — so the menu stays consistent with every other Thing's, and the greyed
 * row is where the product says that aliasing terminates.
 */
test('Create Alias is drawn unavailable on an Alias', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  const first = await thingActions(page, 'B');
  await first.getByRole('menuitem', { name: 'Create Alias' }).click();
  const title = page.getByRole('textbox', { name: 'Thing title' });
  await title.fill('Alias of B');
  await title.press('Enter');
  await settled(page);

  const menu = await thingActions(page, 'Alias of B');
  const row = menu.getByRole('menuitem', { name: /^Create Alias/ });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('aria-disabled', 'true');
});
