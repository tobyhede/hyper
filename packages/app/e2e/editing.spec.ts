import type { Locator, Page } from '@playwright/test';
import { FLOW_SPACE_VIEW_ID, encodeCompactUuid, uuidSchema } from '@project/core';
import { expect, test } from './fixtures';
import { markdownSource, PRIMARY_MODIFIER } from './markdown-source';
import {
  activateGraph,
  activeCard,
  activeGraph,
  allPositions,
  authoringHandle,
  AUTHORING_HANDLE_SIDES,
  boxOf,
  connectHandles,
  connectToEmptyWithAlt,
  dragBy,
  FIXTURE_CARD_COUNT,
  FIXTURE_EDGE_COUNT,
  nodeByTitle,
  openCard,
  positionOf,
  selectCanvas,
  selectedCanvas,
  settled,
  sidebar,
  viewportTransform,
} from './graph';

const FIXTURE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000040');

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
  expect(clear, 'the chosen point is over a Card rather than empty canvas').toBe(true);
  return point;
}

/**
 * Drag one endpoint of a selected Edge to a screen point.
 *
 * The anchors are transparent circles React Flow draws only on a reconnectable
 * Edge, so the press is asserted to land on one — a Card handle drawn over it
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

/** Drag one endpoint onto a Card's authoring target handle. */
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
    // Target handles appear only once React Flow has really started the
    // connection, so this gate is what stops a release that ends a drag which
    // never began being reported as a missing Edit later.
    await expect(targetHandle).toHaveCSS('opacity', '1');
    await expect(targetHandle).toHaveClass(/connectableend/);
    await targetHandle.hover();
    expect(await targetHandle.evaluate((element) => element.matches(':hover'))).toBe(true);
  } finally {
    await page.mouse.up();
  }
}

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
  'inline title editing persists without moving or opening the Card',
  { tag: '@parity:canvas-card-owns-title-editing-and-refusal' },
  async ({ page }) => {
    await page.goto('/');
    const card = nodeByTitle(page, 'A').first();
    await expect(card).toBeVisible();
    await settled(page);
    const before = await allPositions(page);

    const actions = card.getByTestId('canvas-card-actions');
    // Asserted on the container, not on the button: the reveal is
    // `opacity`/`pointer-events` on `.canvas-card__actions`, and `opacity` does
    // not inherit — a computed `opacity` read off the button is `1` whether the
    // Card is hovered or not, so the same assertion there cannot fail.
    await expect(actions).toHaveCSS('opacity', '0');
    await card.hover();
    await expect(actions).toHaveCSS('opacity', '1');
    const edit = card.getByRole('button', { name: 'Open Card A' });
    // The affordance draws a glyph, so nothing about its own content keeps it in
    // shape or in place. Sized square in CSS and parked in the corner, clear of
    // the title — a name is what a screen reader gets, and the box is all a
    // pointer gets.
    const editBox = await boxOf(edit, 'the Card affordance');
    const cardBox = await boxOf(card, 'Card A');
    const titleBox = await boxOf(card.getByRole('heading', { name: 'A' }), "Card A's title");
    expect(Math.abs(editBox.width - editBox.height)).toBeLessThanOrEqual(1);
    expect(editBox.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(editBox.x + editBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
    expect(editBox.y).toBeGreaterThanOrEqual(cardBox.y);
    expect(editBox.y + editBox.height).toBeLessThanOrEqual(titleBox.y);

    // The displayed Title is its own control (ADR 0065): activating it neither
    // selects nor opens the Card around it.
    await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
    await card.getByRole('button', { name: 'Edit Title A' }).click();
    await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
    await expect(page.locator('.canvas-card[data-expanded="true"]')).toHaveCount(0);
    const title = page.getByRole('textbox', { name: 'Card title' });
    await title.fill('Renamed A');
    await title.press('Enter');

    const renamed = nodeByTitle(page, 'Renamed A').first();
    await expect(renamed).toBeVisible();
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
    await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
    expect(await allPositions(page)).toEqual(before);

    await openCard(renamed, 'Renamed A');
    await renamed.getByRole('button', { name: 'Close Card Renamed A' }).click();
    await renamed.click();
    await page.keyboard.press('F2');
    const keyboardTitle = page.getByRole('textbox', { name: 'Card title' });
    await expect(keyboardTitle).toBeVisible();
    await keyboardTitle.fill('');
    await nodeByTitle(page, 'B').first().click();
    await expect(keyboardTitle).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.canvas-card[data-expanded="true"]')).toHaveCount(0);
    await quiescent(page);
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '3');
    await keyboardTitle.focus();
    await page.keyboard.press('Escape');

    await page.reload();
    await expect(nodeByTitle(page, 'Renamed A').first()).toBeVisible();
  },
);

test("a short Title control's hit-area hugs its text, not the whole Card body", async ({
  page,
}) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await settled(page);

  const cardBox = await boxOf(card, 'Card A');
  const titleBox = await boxOf(
    card.getByRole('button', { name: 'Edit Title A' }),
    "Card A's Title",
  );

  // Editing is the Title's own activation (ADR 0065), so its target
  // must claim only the pixels it draws — a one-letter title next to a much
  // wider card is the case that tells a shrunk-to-fit title apart from one
  // stretched to the card's full width.
  expect(titleBox.width).toBeLessThan(cardBox.width - 40);

  // A point in the blank band to the title's right, still inside the card body
  // and at the title's own height — over the card, but off its text.
  const blankSpace = {
    x: (titleBox.x + titleBox.width + cardBox.x + cardBox.width) / 2,
    y: titleBox.y + titleBox.height / 2,
  };
  await page.mouse.click(blankSpace.x, blankSpace.y);
  await expect(page.getByRole('textbox', { name: 'Card title' })).toHaveCount(0);
  await expect(page.locator('.canvas-card[data-expanded="true"]')).toHaveCount(0);
});

test('a click selects a Card, and no pointer gesture on its body opens it', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await settled(page);
  const transform = await viewportTransform(page);

  await card.click();
  await expect(card).toHaveClass(/selected/);
  await expect(page.locator('.canvas-card[data-expanded="true"]')).toHaveCount(0);

  // Off the Title, which has its own control. React Flow zooms on a double click
  // by default and its filter exempts only `.nopan`, which a Card is not.
  await card.dblclick({ position: { x: 24, y: 12 } });
  await expect(page.locator('.canvas-card[data-expanded="true"]')).toHaveCount(0);
  expect(await viewportTransform(page)).toEqual(transform);
});

test('the Card affordance opens rendered Markdown and edits it in place', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await settled(page);

  await openCard(card, 'A');

  await expect(card).toContainText('entry point');
  await card.getByRole('button', { name: 'Edit Card A' }).click();
  const source = page.getByRole('textbox', { name: 'Markdown source of A' });
  await source.fill('Authored from the graph');
  await card.getByRole('button', { name: 'Save Card A' }).click();
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  await page.reload();
  const reopened = nodeByTitle(page, 'A').first();
  await expect(reopened).toContainText('Authored from the graph');
});

test(
  'the open Markdown Card owns exact source, cancellation and commit',
  { tag: '@parity:open-markdown-card-owns-its-editing-lifecycle' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    const cardA = nodeByTitle(page, 'A').first();
    await settled(page);
    await openCard(cardA, 'A');
    await cardA.hover();
    const bodyTarget = cardA.getByTestId('markdown-card-body-edit-target');
    await expect(bodyTarget).toHaveCSS('opacity', '0');
    await expect(bodyTarget.locator('svg')).toHaveCount(0);
    expect(
      await cardA
        .getByTestId('canvas-card-actions')
        .getByRole('button')
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
    ).toEqual(['Edit Card A', 'Close Card A']);
    await bodyTarget.click();
    const source = page.getByRole('textbox', { name: 'Markdown source of A' });
    await expect(source).toBeFocused();
    const lineNumbers = page.locator('[data-slot="markdown-source-line-numbers"]');
    await expect(lineNumbers).toBeVisible();
    const originalLineNumbers = await lineNumbers.elementHandle();
    expect(originalLineNumbers).not.toBeNull();

    expect(
      await source.evaluate((element) =>
        getComputedStyle(element.firstElementChild ?? element, '::selection').getPropertyValue(
          'background-color',
        ),
      ),
    ).toBe('rgb(110, 168, 254)');

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
    await expect(cardA).toContainText('entry point');

    await cardA.getByRole('button', { name: 'Edit Card A' }).click();
    const committedSource = page.getByRole('textbox', { name: 'Markdown source of A' });
    await committedSource.fill(exact);
    await committedSource.press(`${PRIMARY_MODIFIER}+Enter`);
    await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
    await page.reload();
    const persisted = nodeByTitle(page, 'A').first();
    await expect(persisted).toContainText('two spaces and code');
    await persisted.hover();
    await persisted.getByRole('button', { name: 'Edit Card A' }).click();
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
  const cardA = nodeByTitle(page, 'A').first();
  await settled(page);

  await openCard(cardA, 'A');
  await cardA.getByRole('button', { name: 'Edit Card A' }).click();
  const source = page.getByRole('textbox', { name: 'Markdown source of A' });
  await expect(source).toContainText('entry point');
  await source.fill('Discarded rewrite');
  expect(await markdownSource(source)).toBe('Discarded rewrite');
  await cardA.getByRole('button', { name: 'Cancel editing Card A' }).click();
  await expect(cardA).toContainText('entry point');
  await cardA.getByRole('button', { name: 'Edit Card A' }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source of A' })).toContainText(
    'entry point',
  );
});

test('the Markdown editor code loads only when a Markdown Card opens', async ({ page }) => {
  const editorRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('MarkdownSourceEditor')) editorRequests.push(request.url());
  });

  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await settled(page);
  expect(editorRequests).toEqual([]);

  const alias = nodeByTitle(page, 'A′').first();
  await openCard(alias, 'A′');
  await expect(alias).toContainText('entry point');
  await expect(alias.getByRole('textbox')).toHaveCount(0);
  expect(editorRequests).toEqual([]);
  await alias.getByRole('button', { name: 'Close Card A′' }).click();

  await openCard(card, 'A');
  expect(editorRequests).toEqual([]);
  await card.getByRole('button', { name: 'Edit Card A' }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source of A' })).toBeVisible();
  expect(editorRequests).toHaveLength(1);
});

/**
 * The flat paper treatment ADR 0051 settled: cream face, heavy ink rule, and a
 * mono body that is the writing surface rather than a form control.
 *
 * Pinned because nothing else asserts it. The treatment's rules and the general
 * `.card-pane__panel` rules they override have equal specificity, so only source
 * order separates them — the same cascade trap `presenting.spec.ts` pins for
 * `.card--full`. With the treatment colocated in its own stylesheet, that order
 * is now a fact about the module graph rather than about one file's line
 * numbers, and a reordered import would silently return the editor to the
 * generic dark pane with every other assertion still green.
 */
test('the opened Card draws Markdown and its editor on the same paper surface', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await settled(page);

  await openCard(card, 'A');

  await expect(card.getByTestId('card')).toHaveCSS('background-color', 'rgb(255, 250, 240)');
  await card.getByRole('button', { name: 'Edit Card A' }).click();

  const source = page.locator('[data-slot="markdown-source-editor"]');
  await expect(source).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(source).toHaveCSS('color', 'rgb(18, 22, 28)');

  // The gutter remains legible through the Markdown body component's own theme;
  // application CSS does not reach through to CodeMirror classes (ADR 0063).
  await expect(page.locator('[data-slot="markdown-source-line-numbers"]')).toHaveCSS(
    'color',
    'rgb(152, 162, 179)',
  );
});

test('opened Markdown editing persists source while expansion displaces and restores Cards', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await settled(page);
  const before = await allPositions(page);
  const openedId = await card.getAttribute('data-id');

  await openCard(card, 'A');
  const expanded = await allPositions(page);
  expect(expanded[openedId ?? '']).toEqual(before[openedId ?? '']);
  expect(
    Object.entries(before).some(
      ([id, position]) =>
        id !== openedId && JSON.stringify(expanded[id]) !== JSON.stringify(position),
    ),
  ).toBe(true);
  await card.getByRole('button', { name: 'Edit Card A' }).click();
  await page.getByRole('textbox', { name: 'Markdown source of A' }).fill('# Edited\n\nNew source');
  await card.getByRole('button', { name: 'Save Card A' }).click();

  await expect(page.getByRole('textbox', { name: 'Markdown source of A' })).toHaveCount(0);
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  expect(await allPositions(page)).toEqual(expanded);

  await card.getByRole('button', { name: 'Close Card A' }).click();
  expect(await allPositions(page)).toEqual(before);

  await page.reload();
  const persisted = nodeByTitle(page, 'A').first();
  await persisted.hover();
  await persisted.getByRole('button', { name: 'Edit Card A' }).click();
  const persistedSource = page.getByRole('textbox', { name: 'Markdown source of A' });
  await expect(persistedSource).toContainText('# Edited');
  await expect(persistedSource).toContainText('New source');
});

/**
 * Dragging a card writes its placement into the Layout.
 *
 * The fixture names no `defaultRenderer`, so it opens in Flow however many Layouts
 * it declares, and this first edit converts the resolved automatic placement
 * into a Layout of its own (ADR 0025). What this asserts is the point of
 * the whole pivot: a card goes where you put it and *nothing else moves*. Three
 * spike increments failed exactly here — a global optimiser reshuffled the rest
 * of the graph on every edit, so a drop landed somewhere arbitrary.
 */

test('a dragged card stays where it is dropped, and nothing else moves', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();

  // Wait for the placement to resolve — before it does, the space is not yet
  // draggable and every card sits at the origin.
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);

  await settled(page);
  const before = await allPositions(page);
  const from = await positionOf(a);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');

  await dragBy(page, a, 0, 260);

  await expect(persistence).toHaveAttribute('data-revision', '1');
  await expect(persistence).toHaveText('Persisted');
  await expect(selectedCanvas(page)).toContainText('Layout 1');

  const to = await positionOf(a);
  expect(to.y).toBeGreaterThan(from.y + 100);

  // Every other card is exactly where it was. Not "roughly" — a global
  // optimiser is what this rules out, and it moves things by pixels as readily
  // as by hundreds.
  const after = await allPositions(page);
  const draggedId = await a.getAttribute('data-id');
  for (const [id, position] of Object.entries(before)) {
    if (id === draggedId) continue;
    expect(after[id], `card ${id} moved`).toEqual(position);
  }
});

test('an edit conversion addresses the minted Layout and reload does not convert again', async ({
  page,
}) => {
  await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FLOW_SPACE_VIEW_ID)}`,
  );
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);

  await dragBy(page, a, 0, 220);
  await expect(selectedCanvas(page)).toContainText('Layout 1');
  const convertedUrl = page.url();
  expect(convertedUrl).toMatch(/\/views\/[A-Za-z0-9_-]{22}$/);
  expect(convertedUrl).not.toContain(encodeCompactUuid(FLOW_SPACE_VIEW_ID));

  await page.reload();
  await expect(page).toHaveURL(convertedUrl);
  await expect(selectedCanvas(page)).toContainText('Layout 1');
  await expect(sidebar(page).getByRole('button', { name: 'Layout 1', exact: true })).toHaveCount(1);
});

test(
  'selecting Flow or Grid is navigation and does not persist',
  { tag: '@parity:space-sidebar-marks-one-current-renderer' },
  async ({ page }) => {
    await page.goto('/');
    const a = nodeByTitle(page, 'A').first();
    await expect(a).toBeVisible();
    await settled(page);
    const persistence = page.getByTestId('persistence-status');
    await expect(persistence).toHaveAttribute('data-revision', '0');

    // One list over both, so the fixture's Layouts and the built-in Views are
    // rows of the same menu and only one of them is pressed (ADR 0053).
    await expect(
      sidebar(page).getByRole('button', { name: 'Collection 1', exact: true }),
    ).toBeVisible();
    await expect(sidebar(page).getByRole('button', { name: 'Long', exact: true })).toBeVisible();
    await expect(
      sidebar(page).locator('[data-testid="canvas-renderer"][aria-pressed="true"]'),
    ).toHaveCount(1);

    await selectCanvas(page, 'Grid');
    await expect(sidebar(page).getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      sidebar(page).locator('[data-testid="canvas-renderer"][aria-pressed="true"]'),
    ).toHaveCount(1);
    await expect(persistence).toHaveAttribute('data-revision', '0');

    await selectCanvas(page, 'Flow');
    await expect(sidebar(page).getByRole('button', { name: 'Flow' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      sidebar(page).locator('[data-testid="canvas-renderer"][aria-pressed="true"]'),
    ).toHaveCount(1);
    await expect(persistence).toHaveAttribute('data-revision', '0');
  },
);

test('opening from Flow is refused without converting or moving Cards', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await settled(page);
  const before = await allPositions(page);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');

  await openCard(card, 'A');

  await expect(selectedCanvas(page)).toContainText('Flow');
  await expect(persistence).toHaveAttribute('data-revision', '0');
  expect(await allPositions(page)).toEqual(before);
  await expect(card).not.toContainText('entry point');
});

test(
  'resizing an open Card persists its authored rect through reload',
  {
    tag: '@parity:canvas-card-fills-authored-node-rect',
  },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    const card = nodeByTitle(page, 'A').first();
    await expect(card).toBeVisible();
    await openCard(card, 'A');
    await card.click({ position: { x: 8, y: 8 } });

    const size = async () =>
      card.evaluate((element) => ({
        width: Number.parseFloat(getComputedStyle(element).width),
        height: Number.parseFloat(getComputedStyle(element).height),
      }));
    const beforeSize = await size();
    const beforePosition = await positionOf(card);
    const handle = card.locator('.react-flow__resize-control.handle.bottom.right');
    await expect(handle).toBeVisible();
    const box = await boxOf(handle, 'the bottom-right Card resize handle');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, { steps: 6 });
    await page.mouse.up();

    await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
    await card.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const resized = await size();
    expect(resized.width).toBeGreaterThan(beforeSize.width);
    expect(resized.height).toBeGreaterThan(beforeSize.height);
    expect(await positionOf(card)).toEqual(beforePosition);

    await page.reload();
    await selectCanvas(page, 'Collection 1');
    const persisted = nodeByTitle(page, 'A').first();
    await expect(persisted.getByRole('button', { name: 'Close Card A' })).toBeVisible();
    const persistedSize = await persisted.evaluate((element) => ({
      width: Number.parseFloat(getComputedStyle(element).width),
      height: Number.parseFloat(getComputedStyle(element).height),
    }));
    expect(persistedSize).toEqual(resized);
    expect(await positionOf(persisted)).toEqual(beforePosition);
  },
);

test(
  'an Open Card offers one resize control, revealed on hover, that selects the Card and clears a Selected Edge without a second Edit',
  { tag: '@parity:open-card-offers-one-resize-control' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    const card = nodeByTitle(page, 'A').first();
    const closed = nodeByTitle(page, 'B').first();
    await expect(card).toBeVisible();
    await openCard(card, 'A');
    const persistence = page.getByTestId('persistence-status');
    await expect(persistence).toHaveText('Persisted');
    const openedRevision = await persistence.getAttribute('data-revision');
    const beforePosition = await positionOf(card);
    // Opening grows the Card through a CSS transition, so its rect is still
    // moving for a moment after the Edit persists. Settling it first is what
    // makes the mid-gesture growth below evidence of the drag rather than of
    // an animation that had not finished.
    await card.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const beforeSize = await card.evaluate((element) => ({
      width: Number.parseFloat(getComputedStyle(element).width),
      height: Number.parseFloat(getComputedStyle(element).height),
    }));
    const neighbour = nodeByTitle(page, 'B').first();
    const beforeNeighbourPosition = await positionOf(neighbour);
    const edgePath = page.locator('.react-flow__edge-path').first();
    const beforeEdgePath = await edgePath.getAttribute('d');

    // A Closed Card offers no control at all.
    await expect(closed.locator('.react-flow__resize-control')).toHaveCount(0);

    // The Open Card offers exactly one, at its bottom-right corner, and it is
    // not visible until hovered — the actual reveal mechanism. `openCard` left
    // keyboard focus on its own control, which is *also* a reveal condition
    // (Card focus), so that focus is moved off the Card first to observe rest.
    const control = card.locator('.react-flow__resize-control.handle.bottom.right');
    await expect(card.locator('.react-flow__resize-control')).toHaveCount(1);
    await page.evaluate(() => {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement) focused.blur();
    });
    await page.mouse.move(0, 0);
    await expect(control).toHaveCSS('opacity', '0');
    await card.hover();
    await expect(control).toHaveCSS('opacity', '1');

    // Select an Edge first, and leave the Card unselected, so the gesture below
    // is proven to move both — not merely to arrive with the Card already
    // Selected from an earlier click.
    await selectAnEdge(page);
    await expect(page.locator('.react-flow__edge.selected')).toHaveCount(1);
    await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);

    const box = await boxOf(control, "Card A's resize control");
    // A hit target a hand can find. React Flow's own two-class `.handle` rule
    // declares a 5px box and outranks a rule naming one class, so this is
    // asserted as a size rather than inferred from the drag below succeeding:
    // a pointer driven by test code hits 5px exactly, and a person does not.
    // Browser geometry may carry a fractional-pixel rounding remainder, but
    // the rendered hit target must stay within 0.01 CSS pixels of 48px.
    const hitTargetTolerance = 0.01;
    expect(Math.abs(box.width - 48)).toBeLessThanOrEqual(hitTargetTolerance);
    expect(Math.abs(box.height - 48)).toBeLessThanOrEqual(hitTargetTolerance);
    const markLocator = card.locator('.rf-card-node__resize-mark');
    await expect.poll(async () => (await markLocator.boundingBox())?.width).toBeCloseTo(20, 1);
    const mark = await markLocator.boundingBox();
    if (mark === null) throw new Error("Card A's resize control draws no mark");
    expect(mark.height).toBeCloseTo(20, 1);
    const innerBox = await boxOf(card.locator('.rf-card-node__inner'), "Card A's inner box");
    expect(mark.x + mark.width).toBeGreaterThan(innerBox.x + innerBox.width);
    expect(mark.y + mark.height).toBeGreaterThan(innerBox.y + innerBox.height);
    await expect(markLocator).toHaveCSS('translate', '1px 1px');
    await expect(markLocator).toHaveCSS('background-color', 'rgb(0, 0, 0)');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, { steps: 6 });
    // Mid-gesture, before release: the Card is already following the pointer.
    // Beginning a resize Selects the Card, and the selected Card is an input to
    // the projection, so a reprojection lands mid-drag — the render adapter has
    // to hold the live rect through it or every frame redraws the Card at the
    // size it had before the gesture and nothing moves until release. Polled
    // rather than sampled once: the last pointer move and the frame that paints
    // it are not the same tick, and a single read races that.
    await expect
      .poll(async () =>
        card.evaluate((element) => Number.parseFloat(getComputedStyle(element).width)),
      )
      .toBeGreaterThan(beforeSize.width);
    await expect.poll(async () => positionOf(neighbour)).not.toEqual(beforeNeighbourPosition);
    await expect.poll(async () => edgePath.getAttribute('d')).not.toBe(beforeEdgePath);
    await expect(card.locator('.canvas-card__rail')).toHaveCSS('opacity', '0');
    await expect(card.locator('.rf-card-node__authoring-handle--source').first()).toHaveCSS(
      'opacity',
      '0',
    );
    // Pointer movement owns only the canvas draft. Persistence sees nothing
    // until the gesture releases.
    await expect(persistence).toHaveAttribute('data-revision', openedRevision ?? '');

    await page.mouse.up();

    // One drag both Selected the Card and cleared the Selected Edge — no
    // separate click, and Selection was never a second Edit.
    await expect(card).toHaveClass(/selected/);
    await expect(page.locator('.react-flow__edge.selected')).toHaveCount(0);
    await expect(persistence).toHaveText('Persisted');
    await expect(persistence).toHaveAttribute('data-revision', String(Number(openedRevision) + 1));

    await card.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const afterSize = await card.evaluate((element) => ({
      width: Number.parseFloat(getComputedStyle(element).width),
      height: Number.parseFloat(getComputedStyle(element).height),
    }));
    expect(afterSize.width).toBeGreaterThan(beforeSize.width);
    expect(afterSize.height).toBeGreaterThan(beforeSize.height);
    // The authored top-left origin is unchanged: only the box grew.
    expect(await positionOf(card)).toEqual(beforePosition);

    const afterNeighbourPosition = await positionOf(neighbour);
    const afterEdgePath = await edgePath.getAttribute('d');
    const completedRevision = await persistence.getAttribute('data-revision');
    const secondBox = await boxOf(control, "Card A's resize control after completion");
    await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      secondBox.x + secondBox.width / 2 + 90,
      secondBox.y + secondBox.height / 2 + 60,
      { steps: 4 },
    );
    await expect
      .poll(async () =>
        card.evaluate((element) => Number.parseFloat(getComputedStyle(element).width)),
      )
      .toBeGreaterThan(afterSize.width);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel')));
    await page.mouse.up();

    await expect
      .poll(async () =>
        card.evaluate((element) => Number.parseFloat(getComputedStyle(element).width)),
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
   * `pointerdown`/`pointerup` from it, so the release — the thing `CardNode`'s
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
  // mouse tests above already carry the two this Card's resize control owns.
  test('a touch drag resizes an Open Card to the rect it dragged and commits one Edit on release', async ({
    page,
  }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    const card = nodeByTitle(page, 'A').first();
    await expect(card).toBeVisible();
    await openCard(card, 'A');
    const persistence = page.getByTestId('persistence-status');
    await expect(persistence).toHaveText('Persisted');
    const openedRevision = await persistence.getAttribute('data-revision');
    const beforePosition = await positionOf(card);
    // Opening grows the Card through a CSS transition, so its rect is still
    // moving for a moment after the Edit persists — settling it first is what
    // makes the growth below evidence of the drag.
    await card.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const width = async () =>
      card.evaluate((element) => Number.parseFloat(getComputedStyle(element).width));
    const size = async () =>
      card.evaluate((element) => ({
        width: Number.parseFloat(getComputedStyle(element).width),
        height: Number.parseFloat(getComputedStyle(element).height),
      }));
    const beforeSize = await size();

    await card.hover();
    const control = card.locator('.react-flow__resize-control.handle.bottom.right');
    const box = await boxOf(control, "Card A's resize control");
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    // The drag is expressed in screen pixels and the Card's rect is in flow
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
    // poll never moves off the Card's opened width, because the re-render the
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
    // `CardNode` turns into the one completing Edit.
    await expect(persistence).toHaveText('Persisted');
    await expect(persistence).toHaveAttribute('data-revision', String(Number(openedRevision) + 1));

    await card.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const resized = await size();
    expect(resized.width).toBeCloseTo(expected.width, 0);
    expect(resized.height).toBeCloseTo(expected.height, 0);
    // The authored top-left origin is unchanged: only the box grew.
    expect(await positionOf(card)).toEqual(beforePosition);
    // Exactly one Edit, not one-so-far: the revision assertion above succeeds on
    // its first poll, so only elapsed time can rule out a second arriving behind
    // it — and touch is the path where a stray `pointerup`/`touchend` pair could
    // plausibly complete the same gesture twice.
    await quiescent(page);
    await expect(persistence).toHaveAttribute('data-revision', String(Number(openedRevision) + 1));

    await page.reload();
    await selectCanvas(page, 'Collection 1');
    const persisted = nodeByTitle(page, 'A').first();
    await expect(persisted.getByRole('button', { name: 'Close Card A' })).toBeVisible();
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
   * and d3-drag contributes nothing to ending or cancelling. `CardNode`'s three
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
    const card = nodeByTitle(page, 'A').first();
    await expect(card).toBeVisible();
    await openCard(card, 'A');
    const persistence = page.getByTestId('persistence-status');
    await expect(persistence).toHaveText('Persisted');
    const openedRevision = await persistence.getAttribute('data-revision');
    const beforePosition = await positionOf(card);
    // Opening grows the Card through a CSS transition, so its rect is still
    // moving for a moment after the Edit persists — settling it first is what
    // makes this the authored rect the cancellation has to restore.
    await card.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const size = async () =>
      card.evaluate((element) => ({
        width: Number.parseFloat(getComputedStyle(element).width),
        height: Number.parseFloat(getComputedStyle(element).height),
      }));
    const authored = await size();

    await card.hover();
    const control = card.locator('.react-flow__resize-control.handle.bottom.right');
    const box = await boxOf(control, "Card A's resize control");
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    const gesture = await beginTouchGesture(page, from.x, from.y);
    await gesture.moveTo(from.x + 70, from.y + 45);
    await gesture.moveTo(from.x + 140, from.y + 90);
    // The draft has to be live before it can be discarded: a cancellation of a
    // gesture that never grew the Card would restore the authored rect by
    // having never left it, and prove nothing.
    await expect.poll(async () => (await size()).width).toBeGreaterThan(authored.width);
    await expect(persistence).toHaveAttribute('data-revision', openedRevision ?? '');

    await gesture.cancel();

    // The draft is discarded: the Card is the rect it was authored at, not the
    // rect the finger dragged to, and its origin never moved either.
    await expect.poll(size).toEqual(authored);
    expect(await positionOf(card)).toEqual(beforePosition);
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
    const card = nodeByTitle(page, 'A').first();
    await expect(card).toBeVisible();
    await openCard(card, 'A');
    const persistence = page.getByTestId('persistence-status');
    await expect(persistence).toHaveText('Persisted');
    await card.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });

    const size = async (subject: Locator) =>
      subject.evaluate((element) => ({
        width: Number.parseFloat(getComputedStyle(element).width),
        height: Number.parseFloat(getComputedStyle(element).height),
      }));
    const initialSize = await size(card);
    const control = card.locator('.react-flow__resize-control.handle.bottom.right');
    await card.hover();
    const growBox = await boxOf(control, "Card A's resize control before growing");
    await page.mouse.move(growBox.x + growBox.width / 2, growBox.y + growBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      growBox.x + growBox.width / 2 + 100,
      growBox.y + growBox.height / 2 + 60,
      { steps: 6 },
    );
    await page.mouse.up();
    await expect(persistence).toHaveText('Persisted');
    await card.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const rememberedSize = await size(card);
    expect(rememberedSize.width).toBeGreaterThan(initialSize.width);
    expect(rememberedSize.height).toBeGreaterThan(initialSize.height);

    const beforeCloseRevision = await persistence.getAttribute('data-revision');
    const zoom = Number(/scale\(([\d.]+)\)/.exec(await viewportTransform(page))?.[1] ?? 1);
    const closeBox = await boxOf(control, "Card A's resize control before Closing");
    await page.mouse.move(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      closeBox.x + closeBox.width / 2 + (280 - rememberedSize.width) * zoom,
      closeBox.y + closeBox.height / 2 + (166 - rememberedSize.height) * zoom,
      { steps: 8 },
    );

    await expect.poll(async () => size(card)).toEqual({ width: 260, height: 146 });
    await expect(card.locator('.rf-card-node__inner')).toHaveAttribute('data-expanded', 'true');
    await expect(persistence).toHaveAttribute('data-revision', beforeCloseRevision ?? '');

    await page.mouse.up();

    await expect(card.locator('.rf-card-node__inner')).toHaveAttribute('data-expanded', 'false');
    await expect(card.locator('.react-flow__resize-control')).toHaveCount(0);
    await expect(persistence).toHaveText('Persisted');
    await expect(persistence).toHaveAttribute(
      'data-revision',
      String(Number(beforeCloseRevision) + 1),
    );

    await page.reload();
    await selectCanvas(page, 'Collection 1');
    const persisted = nodeByTitle(page, 'A').first();
    await expect(persisted.getByRole('button', { name: 'Open Card A' })).toBeVisible();
    await openCard(persisted, 'A');
    await persisted.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    expect(await size(persisted)).toEqual(rememberedSize);
  },
);

test(
  'an active Card resize does not animate its dimensions behind the pointer',
  { tag: '@parity:active-card-resize-tracks-pointer-without-dimension-animation' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    const card = nodeByTitle(page, 'A').first();
    await expect(card).toBeVisible();
    await openCard(card, 'A');
    await card.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });

    const control = card.locator('.react-flow__resize-control.handle.bottom.right');
    await card.hover();
    const box = await boxOf(control, "Card A's resize control");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 35, {
      steps: 2,
    });
    await expect(card.locator('.rf-card-node__inner')).toHaveAttribute('data-resizing', 'true');

    const dimensionAnimationRunning = await card.evaluate((element) =>
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

test('opening animates the Card wrapper and displaced neighbours from one duration token', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await page.addStyleTag({
    content: '.graph-area { --card-placement-duration: 10s !important; }',
  });
  const card = nodeByTitle(page, 'A').first();
  await openCard(card, 'A');

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
  const openedId = await card.getAttribute('data-id');
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

test('connecting from Flow and Grid converts atomically without moving Cards', async ({ page }) => {
  await page.goto('/');
  for (const [index, view, targetTitle] of [
    [0, 'Flow', 'E'],
    [1, 'Grid', 'F'],
  ] as const) {
    await test.step(view, async () => {
      if (view === 'Grid') await selectCanvas(page, view);

      const source = nodeByTitle(page, 'A').first();
      const target = nodeByTitle(page, targetTitle).first();
      await expect(source).toBeVisible();
      await source.hover();
      const sourceHandle = authoringHandle(source, 'source', 'right');
      const targetHandle = authoringHandle(target, 'target', 'top');
      await expect(sourceHandle).toHaveClass(/connectable/);
      await settled(page);
      const before = await allPositions(page);
      const persistence = page.getByTestId('persistence-status');
      await expect(persistence).toHaveAttribute('data-revision', String(index));

      await expect(sourceHandle).toHaveCSS('opacity', '1');
      const from = (await sourceHandle.boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2 + 30, from.y + from.height / 2, {
        steps: 4,
      });
      await expect(targetHandle).toHaveCSS('opacity', '1');
      const pane = (await page.locator('.react-flow__pane').boundingBox())!;
      await page.mouse.move(pane.x + 16, pane.y + 16);
      await page.mouse.up();

      await quiescent(page);
      await expect(persistence).toHaveAttribute('data-revision', String(index));
      await expect(persistence).toHaveText('Persisted');
      expect(await allPositions(page)).toEqual(before);

      await source.hover();
      await connectHandles(page, sourceHandle, targetHandle);

      // Conversion produces a Layout owning one fresh, empty Graph (ADR 0045),
      // and this Edge is what the same Edit puts in it. The renderer is now that
      // Layout, which draws the Graphs it owns and only those — so the fixture's
      // thirteen are off screen rather than lost, and one Edge is the whole of
      // what this view has to draw.
      await expect(page.locator('.react-flow__edge')).toHaveCount(1);
      await expect(persistence).toHaveAttribute('data-revision', String(index + 1));
      await expect(persistence).toHaveText('Persisted');
      await expect(selectedCanvas(page)).toContainText(`Layout ${index + 1}`);
      await settled(page);
      expect(await allPositions(page)).toEqual(before);
    });
  }
});

test('creating from an Algorithmic View freezes existing Cards and places Card 1', async ({
  page,
}) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  await expect(source).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);
  const before = await allPositions(page);
  await source.hover();

  await connectToEmptyWithAlt(page, authoringHandle(source, 'source', 'right'));

  const created = nodeByTitle(page, 'Card 1');
  await expect(created).toBeVisible();
  const after = await allPositions(page);
  for (const [id, position] of Object.entries(before)) {
    expect(after[id], `card ${id} moved`).toEqual(position);
  }
  // The converted Layout owns one fresh Graph and this Edge is all it holds, so
  // the Graphs the fixture's own two Layouts own are not drawn here.
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(selectedCanvas(page)).toContainText('Layout 1');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  // `Persisted` says the commit was acknowledged, not that the conversion is what
  // reopens. Reload against the same repository: the created Layout must still be
  // `defaultRenderer`, still hold the created Card and still carry its Edge — a
  // conversion that only lived in runtime state passes every assertion above.
  await page.reload();
  await expect(nodeByTitle(page, 'Card 1')).toBeVisible();
  await settled(page);
  await expect(selectedCanvas(page)).toContainText('Layout 1');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
});

test(
  'adding an existing Card from the Cards drawer authors Layout membership',
  { tag: '@parity:cards-drawer-adds-existing-layout-members' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await settled(page);

    await page.getByRole('button', { name: 'Cards' }).click();
    const source = page.getByRole('button', { name: 'Add E to Layout' });
    await expect(source).toBeVisible();
    await source.click();

    await expect(source).not.toBeVisible();
    await expect(nodeByTitle(page, 'E')).toBeVisible();
    await expect(nodeByTitle(page, 'E')).toHaveClass(/selected/);
  },
);

test(
  'the Cards drawer dismisses on Escape and survives working on the canvas behind it',
  { tag: '@parity:cards-drawer-opens-and-dismisses-without-locking-the-canvas' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await settled(page);

    const trigger = page.getByRole('button', { name: 'Cards' });
    const drawer = page.getByRole('dialog', { name: 'Cards' });

    await expect(drawer).toHaveCount(0);
    await trigger.click();
    await expect(drawer).toBeVisible();

    // Selecting a Card on the canvas is the ordinary press this drawer has to
    // live through: it is how a Card is dropped, and a drawer that closed on it
    // could only ever add one Card per opening.
    await nodeByTitle(page, 'A').click();
    await expect(nodeByTitle(page, 'A')).toHaveClass(/selected/);
    await expect(drawer).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(trigger).toBeFocused();
  },
);

test('the open Cards drawer leaves the Graph key and overview visible beside it', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await settled(page);

  const legend = page.getByTestId('graph-legend');
  const overview = page.getByRole('img', { name: 'Graph overview' });
  await expect(legend).toBeVisible();

  await page.getByRole('button', { name: 'Cards' }).click();
  const drawer = page.getByRole('dialog', { name: 'Cards' });
  await expect(drawer).toBeVisible();

  // The drawer overlays the end edge and the HUD is pinned to the same one, so
  // the shell yields the panel's width instead of letting it cover the Graph
  // key and the pannable overview. Geometry, because "visible" is true of an
  // element sitting underneath an opaque panel.
  const panel = await boxOf(drawer, 'the Cards drawer');
  for (const [what, locator] of [
    ['the Graph key', legend],
    ['the Graph overview', overview],
  ] as const) {
    const box = await boxOf(locator, what);
    expect(box.x + box.width, `${what} ends before the drawer begins`).toBeLessThanOrEqual(panel.x);
  }

  // And it is still the reader's to operate, not just to look at.
  await expect(legend).toContainText('Graph');
  await overview.click({ position: { x: 4, y: 4 } });
  await expect(drawer).toBeVisible();
});

test('leaving a presentation closes the Cards drawer rather than reopening it over the canvas', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await settled(page);

  const drawer = page.getByRole('dialog', { name: 'Cards' });
  await page.getByRole('button', { name: 'Cards' }).click();
  await expect(drawer).toBeVisible();

  await page.getByRole('button', { name: 'Present' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(drawer).toHaveCount(0);

  // A drawer that sprang back would also take focus with it — `Drawer.Popup`
  // moves focus in on every open, however that open was caused — landing the
  // reader in the Cards list instead of on the canvas they returned to.
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Present' })).toBeVisible();
  await expect(drawer).toHaveCount(0);
  await expect(page.locator('[data-slot="drawer-popup"]')).toHaveCount(0);
});

test('keyboard placement moves focus from the Cards drawer to the added canvas Card', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await settled(page);

  await page.getByRole('button', { name: 'Cards' }).click();
  const source = page.getByRole('button', { name: 'Add E to Layout' });
  await source.focus();
  await source.press('Enter');

  await expect(nodeByTitle(page, 'E')).toBeFocused();
});

test('dragging from the Cards drawer uses transformed canvas coordinates then ordinary Card dragging', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await settled(page);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await settled(page);

  await page.getByRole('button', { name: 'Cards' }).click();
  const source = page.getByRole('button', { name: 'Add E to Layout' });
  const pane = page.locator('.react-flow__pane');
  const paneBox = await boxOf(pane, 'the React Flow pane');
  const targetPosition = { x: paneBox.width * 0.5, y: paneBox.height * 0.8 };
  const dropPoint = { x: paneBox.x + targetPosition.x, y: paneBox.y + targetPosition.y };
  await source.dragTo(pane, { targetPosition });

  const added = nodeByTitle(page, 'E');
  await expect(added).toBeVisible();
  // Zoomed in, so a screen pixel is a fraction of a flow unit — sub-pixel
  // rounding through that scale is expected, not evidence of a wrong drop.
  const addedBox = await boxOf(added, 'the added Card');
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

test('the Cards toggle is withdrawn while presenting, matching the drawer it controls', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await settled(page);

  const toggle = page.getByRole('button', { name: 'Cards' });
  await expect(toggle).toBeEnabled();

  await page.getByRole('button', { name: 'Present' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();

  await expect(toggle).toBeDisabled();
});

test('editing an existing Layout updates it instead of creating another one', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await settled(page);

  await dragBy(page, a, 0, 220);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(selectedCanvas(page)).toContainText('Layout 1');

  await selectCanvas(page, 'Grid');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await selectCanvas(page, 'Layout 1');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await settled(page);

  await dragBy(page, a, 0, 160);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await expect(sidebar(page).getByRole('button', { name: 'Layout 1', exact: true })).toHaveCount(1);
});

test(
  'Layout and Graph names edit from Space chrome and survive reload',
  { tag: '@parity:space-chrome-edits-names' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await settled(page);

    await selectedCanvas(page)
      .getByRole('button', { name: 'Edit Space View Collection 1' })
      .click();
    const layoutName = page.getByRole('textbox', { name: 'Layout name' });
    await layoutName.fill('Workshop');
    await expect(
      sidebar(page).getByRole('button', { name: 'Workshop', pressed: true }),
    ).toBeVisible();
    await layoutName.press('Enter');
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
    await expect(selectedCanvas(page)).toContainText('Workshop');

    await sidebar(page).getByRole('button', { name: 'Workshop', pressed: true }).click();
    const sidebarLayoutName = page.getByRole('textbox', { name: 'Layout name' });
    await sidebarLayoutName.fill('Studio');
    await expect(selectedCanvas(page)).toContainText('Studio');
    await sidebarLayoutName.press('Enter');
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');

    await sidebar(page).getByRole('button', { name: 'Long', pressed: true }).click();
    const graphName = page.getByRole('textbox', { name: 'Graph name' });
    await graphName.fill('Journey');
    await graphName.press('Enter');
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '3');

    await page.reload();
    await selectCanvas(page, 'Studio');
    await expect(sidebar(page).getByRole('button', { name: 'Journey', exact: true })).toBeVisible();
  },
);

/**
 * Dragged in an authored Layout, because that is where a Card and the Edges
 * around it stay together.
 *
 * A drag on an Algorithmic View converts it, and Flow converts by returning one
 * fresh *empty* Graph (ADR 0045) — so the Layout the drag produces has no Edge
 * left to watch. The fixture's own `Collection 1` owns Long, Mid and Short over
 * the spine, so dragging A there updates that Layout in place and its Edges are
 * still drawn around the Card that moved.
 */
test('edges follow a card that has been dragged', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
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

  // Whatever geometry the placement computed described where the cards were,
  // so it is stale the moment one leaves it. The edge is redrawn between where
  // the cards now are.
  await expect.poll(edgePath).not.toBe(before);
});

test('a completed drag persists automatically', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
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

test('a selected Card exposes four circular handles coloured as the active Graph', async ({
  page,
}) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);
  // Selecting is all this needs, and it keeps the Active Graph the fixture's
  // own first one — a drag here would convert the View and activate the empty
  // Graph the conversion mints, leaving no Edge to read a colour from.
  await a.click();
  await expect(a).toHaveClass(/selected/);

  const handles = a.locator('.rf-card-node__authoring-handle--source');
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
  await expect(a.locator('.rf-card-node__port').first()).toHaveCSS('opacity', '0');
});

test('drawing between existing Cards persists one active-Graph Edge and selects the target', async ({
  page,
}) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  const target = nodeByTitle(page, 'E').first();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);

  // Issue 02 begins in a positioned Layout; placement supplies that state using
  // the already-public edit gesture rather than reaching into React Flow state.
  await dragBy(page, source, 0, -100);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await settled(page);

  const sourceHandle = authoringHandle(source, 'source', 'right');
  const targetHandle = authoringHandle(target, 'target', 'top');
  const targetHandles = page.locator('.rf-card-node__authoring-handle--target');
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
    // Every Card offers a target on every side while a connection is in flight,
    // so the drop is never blocked by which side the author aimed at.
    await expect(targetHandles.first()).toHaveCSS('opacity', '1');
    await expect(targetHandles).toHaveCount(FIXTURE_CARD_COUNT * AUTHORING_HANDLE_SIDES);
    const preview = page.locator('.react-flow__connection-path');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveCSS('stroke', activeGraphColor);
    await expect(preview).toHaveAttribute('marker-end', /url/);
  });

  // One Edge, because the selected Layout draws the Graphs it owns and the one
  // it owns is the empty Graph conversion minted a moment ago.
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  // An Edge names its Cards and its Graph for a screen reader. Matched loosely
  // on the Graph, whose neutral title depends on how many the Space already had.
  await expect(page.getByLabel(/^Edge from A to E in /)).toBeVisible();
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  await expect(target.locator('.rf-card-node__authoring-handle--source').first()).toHaveCSS(
    'opacity',
    '1',
  );
  await expect(page.locator('.canvas-card[data-expanded="true"]')).toHaveCount(0);
});

test('an authored Edge is immediately available when presenting the Graph', async ({ page }) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'E').first();
  const target = nodeByTitle(page, 'A').first();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);

  // Convert the Algorithmic View through the public placement gesture, then
  // author E → A into the empty Graph that conversion minted. It is that
  // Graph's only Edge, so E is where presenting it begins.
  await dragBy(page, source, 0, -100);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '1');
  await settled(page);

  await connectHandles(
    page,
    authoringHandle(source, 'source', 'right'),
    authoringHandle(target, 'target', 'top'),
  );

  await expect(page.getByLabel(/^Edge from E to A in /)).toBeVisible();
  await expect(persistence).toHaveAttribute('data-revision', '2');
  await expect(persistence).toHaveText('Persisted');

  await page.getByTestId('present-button').click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000008');
  await expect(page.getByTestId('presenting-moves').getByRole('button')).toHaveText('A');

  await page.keyboard.press('ArrowRight');
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000002');
  await page.keyboard.press('ArrowLeft');
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000008');
});

test('an Edge drawn from the presented Card is a move the presenter can take now', async ({
  page,
}) => {
  const A = '00000000-0000-4000-8000-000000000002';
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  const b = nodeByTitle(page, 'B').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);

  // Authoring completes an Edge only in a selected Layout, so convert the
  // Algorithmic View through the public placement gesture first. Conversion
  // mints an *empty* Graph (ADR 0045), which cannot be presented at all, so
  // A → B is what gives this Graph something to traverse.
  await dragBy(page, a, 0, -100);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '1');
  await settled(page);
  await connectHandles(
    page,
    authoringHandle(a, 'source', 'right'),
    authoringHandle(b, 'target', 'left'),
  );
  await expect(persistence).toHaveAttribute('data-revision', '2');
  await settled(page);
  // Drawing an Edge selects its target (B), and a Card's source handles are the
  // hovered or selected Card's. The gesture below is made from the presented
  // Card, so A has to be the selected one going in.
  await a.click();
  await expect(a).toHaveClass(/selected/);

  await page.getByTestId('present-button').click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(activeCard(page)).toHaveAttribute('data-id', A);
  const moves = page.getByTestId('presenting-moves').getByRole('button');
  await expect(moves).toHaveText(['B']);
  // The presenting camera closes in over two animated moves; a handle box read
  // during them is stale by the time the mouse arrives.
  await settled(page);

  // A self-Edge is valid authored structure (ADR 0032), and it is the Edge this
  // gesture can reach: at a zoom where the active Card is legible every other
  // Card is provably off frame (ADR 0027), so the presented Card's own handles
  // are the only ones on screen.
  await connectHandles(
    page,
    authoringHandle(activeCard(page), 'source', 'right'),
    authoringHandle(activeCard(page), 'target', 'left'),
  );

  // Attached rather than visible: with one Graph on the Card its inbound and
  // outbound handles sit at the same height, so a self-Edge is a flat line whose
  // box has no height — which Playwright reads as hidden. The moves below are
  // what prove it was authored.
  await expect(page.getByLabel(new RegExp(`^Edge from A to A in `))).toBeAttached();
  await expect(persistence).toHaveAttribute('data-revision', '3');
  await expect(persistence).toHaveText('Persisted');

  // The chrome enumerates the active Card's outgoing Edges, so the Edge just
  // drawn is available without leaving and re-entering presentation.
  await expect(moves).toHaveText(['B', 'A']);
});

/**
 * An Edge the emphasised Graph already holds is not a duplicate here.
 *
 * A → B is Long's first Edge and Long is emphasised on load, so this used to be
 * the refusal case. It is not one any more: on an Algorithmic View the Edge
 * joins the fresh, empty Graph conversion mints rather than the Graph being
 * emphasised (ADR 0045), so it is that Graph's *first* Edge and there is nothing
 * to duplicate. The refusal now belongs to a selected Layout, whose Active Graph
 * is one an Edit can genuinely repeat an Edge in — asserted below, live.
 */
test('drawing an Edge the emphasised Graph already holds converts rather than refusing', async ({
  page,
}) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  const target = nodeByTitle(page, 'B').first();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);
  const before = await allPositions(page);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');

  await source.hover();
  await connectHandles(
    page,
    authoringHandle(source, 'source', 'right'),
    authoringHandle(target, 'target', 'left'),
  );

  // Attached rather than visible: A and B are on the same ELK row, so this Edge
  // is a dead-horizontal line with a zero-height box, which Playwright reads as
  // hidden.
  await expect(page.getByLabel(new RegExp(`^Edge from A to B in `))).toBeAttached();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(persistence).toHaveAttribute('data-revision', '1');
  await expect(persistence).toHaveText('Persisted');
  await expect(selectedCanvas(page)).toContainText('Layout 1');
  // Conversion copies what is on screen; nothing moves at the moment of it.
  expect(await allPositions(page)).toEqual(before);

  // Drawn a second time, in the Layout that now owns the Graph holding it, it is
  // the duplicate the rule is about — refused, with nothing persisted. The
  // assertions are negative, so they need the barrier to mean anything.
  await source.hover();
  await connectHandles(
    page,
    authoringHandle(source, 'source', 'right'),
    authoringHandle(target, 'target', 'left'),
  );
  await quiescent(page);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(persistence).toHaveAttribute('data-revision', '1');
  await expect(persistence).toHaveText('Persisted');
});

/**
 * Two connections in one session, chained so the second starts from the Card the
 * first selected.
 *
 * The second one is the whole point. A Card's declared handles (`projection.ts`)
 * include every Graph id, not only the ones incident to it, so a completed
 * connection resolves in the same render that first makes its target incident.
 * Forcing React Flow to re-measure from the DOM replaces those declarations with
 * only the anchors actually rendered, which drops the not-yet-incident ones — and
 * the *next* connection then fails to resolve its source handle. One connection
 * cannot see it; the damage is done to the gesture after.
 *
 * Verified both ways against the fixture: with a forced remeasure in `CardNode`
 * this fails with six React Flow #008 warnings on the second connection, and
 * without one it passes.
 */
test('a second connection drawn in the same session resolves its handles', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  const e = nodeByTitle(page, 'E').first();
  const f = nodeByTitle(page, 'F').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);

  await dragBy(page, a, 0, -100);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await settled(page);

  await connectHandles(
    page,
    authoringHandle(a, 'source', 'right'),
    authoringHandle(e, 'target', 'top'),
  );
  // The renderer is the Layout this Edit converted into, so it draws its own
  // Graph and nothing else — one Edge, then two.
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await settled(page);

  await connectHandles(
    page,
    authoringHandle(e, 'source', 'right'),
    authoringHandle(f, 'target', 'top'),
  );
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '3');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
});

test('changing the active Graph recolours authoring handles without persisting or filtering', async ({
  page,
}) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');
  // On the Algorithmic View, whose subject is the Space's Cards, all four
  // Graphs are drawn and all four can be activated — a converted Layout owns
  // only the one Graph its conversion minted, so there would be nothing to
  // change to.
  await source.hover();
  const handle = source.locator('.rf-card-node__authoring-handle--source').first();
  const longColour = await handle.evaluate((element) => getComputedStyle(element).backgroundColor);

  await activateGraph(page, 'Mid');

  await source.hover();
  await expect(handle).not.toHaveCSS('background-color', longColour);
  await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT);
  await expect(persistence).toHaveAttribute('data-revision', '0');
  await expect(persistence).toHaveText('Persisted');
});

/**
 * The authoring handle is a drag affordance, and a click is not a drag.
 *
 * A press and release inside React Flow's drag threshold never starts a
 * connection, so the click reached the Card underneath and opened it to read —
 * from a control whose whole purpose is to begin an Edge.
 */
test('clicking a Card authoring handle neither opens the Card nor draws an Edge', async ({
  page,
}) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);
  await card.hover();

  const handleBox = (await authoringHandle(card, 'source', 'right').boundingBox())!;
  await page.mouse.click(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);

  await expect(page.locator('.canvas-card[data-expanded="true"]')).toHaveCount(0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT);
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
    await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
    // An Edge belongs to a Layout's Graph, so an Edge Edit needs one selected.
    await selectCanvas(page, 'Collection 1');
    await settled(page);
    const drawnCards = await page.locator('.react-flow__node').count();
    const drawn = await page.locator('.react-flow__edge').count();
    const persistence = page.getByTestId('persistence-status');
    await expect(persistence).toHaveAttribute('data-revision', '0');

    await selectAnEdge(page);
    await page.keyboard.press(key);

    await expect(page.locator('.react-flow__edge')).toHaveCount(drawn - 1);
    await expect(page.locator('.react-flow__node')).toHaveCount(drawnCards);
    await expect(persistence).toHaveAttribute('data-revision', '1');
    await expect(persistence).toHaveText('Persisted');
  });
}

/**
 * The app-owned canvas key removes a selected Card from this Layout through the
 * completed Space Edit lifecycle. The Card still belongs to the Space; the
 * projection loses it and the Layout-owned Edges incident to it together.
 */
for (const key of ['Backspace', 'Delete'] as const) {
  test(`${key} with a Card selected removes it and its Edges from this Layout`, async ({
    page,
  }) => {
    await page.goto('/');
    const card = nodeByTitle(page, 'A').first();
    await expect(card).toBeVisible();
    await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
    await selectCanvas(page, 'Collection 1');
    await settled(page);
    const drawnCards = await page.locator('.react-flow__node').count();
    const drawn = await page.locator('.react-flow__edge').count();
    // Every Edge this Card is an endpoint of, counted before the Edit, so the
    // assertion below is an exact remainder rather than "fewer than before" —
    // which passed while a single incident Edge went and the rest stayed.
    const incident = await page.getByLabel(/^Edge (from A to|from .* to A) /).count();
    expect(incident).toBeGreaterThan(0);

    const cardBox = (await card.boundingBox())!;
    await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await expect(card).toHaveClass(/selected/);

    await page.keyboard.press(key);
    await quiescent(page);

    await expect(page.locator('.react-flow__node')).toHaveCount(drawnCards - 1);
    await expect(page.locator('.react-flow__edge')).toHaveCount(drawn - incident);
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  });
}

/**
 * The assistive description names the keys that actually do something.
 *
 * Both descriptions name the application-owned operations rather than React
 * Flow's disabled local deletion.
 */
test('the graph advertises its Card and Edge delete commands', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();

  await expect(page.locator('[id^="react-flow__node-desc"]')).toContainText(/open a Card/i);
  await expect(page.locator('[id^="react-flow__node-desc"]')).toContainText(/remove.*Layout/i);
  await expect(page.locator('[id^="react-flow__edge-desc"]')).toContainText(/delete/i);
});

/**
 * Only the Active Graph's Edges are tab stops, and each is named for a reader.
 *
 * An Edge belonging to another Graph the Layout draws is there to be seen —
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
  // Every other Edge the Layout draws is out of the tab order entirely.
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
    await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
    await selectCanvas(page, 'Collection 1');
    await settled(page);
    const drawn = await page.locator('.react-flow__edge').count();
    await expect(page.getByRole('button', { name: 'Delete this Edge' })).toHaveCount(0);

    await selectAnEdge(page);
    await expect(page.getByRole('button', { name: 'Delete this Edge' })).toBeVisible();

    // The endpoints, as the keyboard reaches them: two pickers over this Layout's
    // Cards, each showing the Card the Edge currently names.
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
    await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
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
    // the only moment the chosen Card's title is on screen to be observed rather
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
    // Layout overview draws every Graph at once, so "focus moved" is satisfied
    // by any of a dozen Edges — including one with these very endpoints in
    // another Graph. The decorated label carries all three facts the request is
    // made of (`edge-authoring-react.tsx`: `Edge from X to Y in G`), so naming
    // the expected one pins the unmoved endpoint, the chosen Card and the Graph
    // together. `selected` and `chosen` are both read off the page, so this
    // asserts against observed values rather than recomputed ones.
    const reconnected = selected.replace(/ to .* in /, ` to ${chosen} in `);
    expect(reconnected).not.toBe(selected);
    await expect.poll(focusedEdgeLabel).toBe(reconnected);
  },
);

/**
 * An Algorithmic View owns no Edge to move an endpoint of, and says so on every
 * row rather than by offering a choice the Edit would then refuse.
 *
 * Reconnection is one of the seven **layout-required** actions
 * (`docs/agents/authoring-refusal-cascade.md`): a View has no Layout to write
 * into, and unlike a connection it cannot convert one, because there is no Edge
 * on a freshly minted Graph to move. Eligibility asks the same rule the
 * completion asks, so the whole list arrives disabled with the reason on each
 * row — which is the production-reachable shape of the catalogue's
 * disabled-choice state.
 */
test(
  'endpoint choices on a computed View are offered disabled, with their reason',
  { tag: '@parity:selected-edge-endpoint-refusal-disables-its-choice' },
  async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);
    // The tracked fixture names no `defaultRenderer`, so this opens in Flow.

    await selectAnEdge(page);
    await page.getByRole('button', { name: 'Edit this Edge' }).click();
    await page.getByRole('combobox', { name: 'To' }).press('ArrowDown');

    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible();
    // Every row, not merely the first: a partially disabled list would mean
    // eligibility and the completion were asking different questions.
    expect(await options.filter({ hasNotText: 'Select a Layout to edit its Edges.' }).count()).toBe(
      0,
    );
    await expect(options.first()).toHaveAttribute('aria-disabled', 'true');
  },
);

/**
 * A refused Delete stays on the controls that asked.
 *
 * Same rule, other command: `deleted-edge` is layout-required too, so pressing
 * Delete on a computed View refuses. The Edge survives, so its controls survive
 * with it — and the refusal belongs to them rather than to the endpoint fields
 * or to the canvas announcement a finished pointer gesture leaves behind.
 */
test(
  'a Delete a computed View refuses is reported on the selected Edge controls',
  { tag: '@parity:selected-edge-deletion-refusal-stays-on-its-controls' },
  async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);
    const drawn = await page.locator('.react-flow__edge').count();

    await selectAnEdge(page);
    await page.getByRole('button', { name: 'Delete this Edge' }).click();

    await expect(page.getByTestId('edge-delete-refusal')).toHaveText(
      'Select a Layout to edit its Edges.',
    );
    // Local to these controls: not the canvas announcement, and not an endpoint
    // error inside an editor that never opened.
    await expect(page.getByTestId('edge-gesture-refusal')).toHaveCount(0);
    await expect(page.getByTestId('edge-editor')).toHaveCount(0);
    await expect(page.locator('.react-flow__edge')).toHaveCount(drawn);
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
  },
);

/**
 * A selected Edge's reconnect anchors sit over the Card's four authoring handles
 * where they overlap, and the anchors have to win.
 *
 * Reconnection is per-Edge and narrowed to the *selected* one for exactly this
 * reason: `edgesReconnectable` left globally true would put two transparent
 * anchors permanently live on every Edge, over every Card's handles.
 */
test('reconnect anchors exist only on the selected Edge', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
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
test('dragging an endpoint onto another Card moves it and keeps the Edge in its Graph', async ({
  page,
}) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
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
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
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
  // as a Card that mysteriously never arrived.
  const source = nodeByTitle(page, 'B').first();
  await source.hover();
  await connectToEmptyWithAlt(page, authoringHandle(source, 'source', 'right'));

  await expect(nodeByTitle(page, 'Card 1')).toBeVisible();
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
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await selectCanvas(page, 'Collection 1');
  await activateGraph(page, 'Short');
  await settled(page);

  const edge = page.locator('.react-flow__edge[aria-label="Edge from A to B in Short"]');
  await edge.focus();
  await expect(edge).toHaveClass(/selected/);

  // A source-endpoint drag anchors at the Edge's target and looks for a new
  // *source*, so the Card offers its source handles for this gesture alone.
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
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
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
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
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
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await selectCanvas(page, 'Collection 1');
  await settled(page);
  const drawn = await page.locator('.react-flow__edge').count();

  const edge = page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]');
  await edge.focus();
  // The canvas header sits outside the flow container.
  const header = await boxOf(page.locator('.shell__header'), 'the canvas header');
  await dragEndpointTo(page, edge, 'target', {
    x: header.x + header.width / 2,
    y: header.y + header.height / 2,
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
 * empty-drop rule exists: a release over a Card's *body* is far enough from any
 * handle that React Flow resolves no target, so without the hit-test an Alt-drop
 * there would author a Card on top of the one underneath.
 */
test('an Alt-drop released over a Card body creates no Card', async ({ page }) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  await expect(source).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);
  await source.hover();

  const from = await boxOf(authoringHandle(source, 'source', 'right'), 'the source handle');
  const over = await boxOf(nodeByTitle(page, 'C').first(), 'Card C');
  try {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 30, from.y + from.height / 2, { steps: 4 });
    await page.keyboard.down('Alt');
    // The centre of a 260x146 Card is some 73px from its nearest handle, well
    // outside React Flow's connection radius of 20 — so `toNode` is null here
    // and only the DOM says this is a Card.
    await page.mouse.move(over.x + over.width / 2, over.y + over.height / 2, { steps: 4 });
    await expect(page.getByTestId('new-card-preview')).toHaveCount(0);
  } finally {
    await page.mouse.up();
    await page.keyboard.up('Alt');
  }

  await quiescent(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(FIXTURE_CARD_COUNT);
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
 * It is a rule about the Active Graph of a *selected Layout*: on an Algorithmic
 * View the Edge joins the Graph conversion mints, so no Edge drawn there can
 * duplicate anything (ADR 0045). The drag and the first connection below are
 * what put this Space in the state the rule is about.
 */
test('a duplicate Edge is marked invalid while the drag is still live', async ({ page }) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  await expect(source).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);
  await dragBy(page, source, 0, -100);
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

  // Author A→B into the Layout's own Graph, so the Active Graph now holds it.
  await startDrag();
  await expect(await dragOnto('B')).toHaveClass(/valid/);
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await settled(page);

  // A→B is now an Edge of the Active Graph; A→E is not.
  await startDrag();
  const overDuplicate = await dragOnto('B');
  // Wait for React Flow to mark the handle as the drag's current target before
  // asserting what it did *not* mark. Asserting the absence of `valid` straight
  // after the move can pass because no connection class has landed yet, which
  // would make this test green even if `isValidConnection` were never consulted.
  await expect(overDuplicate).toHaveClass(/connectingto/);
  await expect(overDuplicate).not.toHaveClass(/valid/);
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);

  await startDrag();
  await expect(await dragOnto('E')).toHaveClass(/valid/);
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '3');
});

/**
 * Add Card from an Algorithmic View: one conversion, and the naming that
 * follows it.
 *
 * The fixture opens in Flow because it declares no `defaultRenderer`, so this is the
 * ordinary first Edit an author makes. Two things are being watched that a unit
 * test cannot see: that the conversion happens exactly once — the fixture's own
 * two Layouts plus one, not two — and that the created Card really is under the
 * caret, in a browser where focus is the browser's to give.
 */
test('Add Card converts an Algorithmic View once and names the Card in place', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const before = await allPositions(page);
  const addCard = page.getByTestId('add-card');
  await expect(addCard).toBeEnabled();

  await addCard.click();

  const title = page.getByRole('textbox', { name: 'Card title' });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue('Card 1');
  await expect(selectedCanvas(page)).toContainText('Layout 1');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  // Converting moves nothing: the Cards on screen keep the positions the View
  // computed for them (ADR 0025).
  const after = await allPositions(page);
  for (const [id, position] of Object.entries(before)) {
    expect(after[id], `card ${id} moved`).toEqual(position);
  }

  await title.fill('Consequences');
  await title.press('Enter');

  await expect(nodeByTitle(page, 'Consequences')).toBeVisible();
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  // One conversion, so one new Layout beside the two the fixture declares —
  // five rows in the one canvas list, with the two built-in Views.
  await expect(sidebar(page).getByTestId('canvas-renderer')).toHaveCount(5);
});

/**
 * The Alias creation state is local and creates nothing (ADR 0042).
 *
 * Cancelling it must leave the Space exactly as it was — no Card, no conversion,
 * no commit — and must leave focus somewhere an author can carry on from. The
 * revision assertion needs `quiescent`: "still 0" passes instantly against a
 * commit that has not happened yet.
 *
 * An open combobox dismisses its popup first; the pane owns the next Escape.
 */
test('cancelling the Alias Target picker creates nothing', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const nodes = await page.locator('.react-flow__node').count();

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Alias' }).click();
  const search = page.getByRole('combobox', { name: 'Target' });
  await expect(search).toBeFocused();
  await search.fill('A');

  await search.press('Escape');
  await search.press('Escape');

  await expect(page.getByTestId('new-alias')).toHaveCount(0);
  await quiescent(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
  await expect(page.getByTestId('add-card-menu')).toBeFocused();
});

/**
 * The pane's controls stay reachable when the pane cannot fit its content.
 *
 * `.card-pane__panel` is a fixed 16/9 frame whose width is clamped by viewport
 * height. The Alias creation pane therefore has to keep its fixed controls in
 * reach when the viewport is short.
 *
 * 500px is below the ~620px where clipping begins, measured against this pane.
 */
test('keeps the Alias pane’s controls reachable on a short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Alias' }).click();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeInViewport();
});

/**
 * The same one-press rule, on the field beside that picker.
 *
 * The Title holds a draft exactly as the search does, and under ADR 0048 that
 * buys it nothing: Escape discards every pending field and closes, from
 * whichever field the author happened to be standing in. The half worth pinning
 * separately is that a *typed* title does not make the pane refuse to close —
 * this is the dirty-field case, and the surface still goes on the first press.
 */
test('Escape discards a typed Alias title and closes the pane', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const nodes = await page.locator('.react-flow__node').count();

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Alias' }).click();
  const title = page.getByTestId('new-alias-title');
  await title.fill('Recap');

  await title.press('Escape');

  await expect(page.getByTestId('new-alias')).toHaveCount(0);
  await quiescent(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes);
  await expect(nodeByTitle(page, 'Recap')).toHaveCount(0);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

/**
 * Choosing a Target is the creation, and shared Title editing begins on what it made.
 */
test(
  'choosing a Target creates the Alias and begins shared Title editing',
  { tag: '@parity:new-alias-completes-on-the-target-chosen' },
  async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);
    const nodes = await page.locator('.react-flow__node').count();

    await page.getByTestId('add-card-menu').click();
    await page.getByRole('menuitem', { name: 'Add Alias' }).click();
    // No create action beside Cancel — the Target chosen is the completion, and
    // a second activation would confirm a choice already made.
    const pane = page.getByTestId('new-alias');
    await expect(pane.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(pane.getByRole('button', { name: /create|add|done|save/i })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Target' }).fill('B');
    await page.getByRole('option', { name: 'Markdown Card B' }).click();

    await expect(page.getByTestId('new-alias')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Card title' })).toHaveValue('B');
    await expect(page.getByRole('combobox', { name: 'Target' })).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Card title' }).press('Escape');

    // An empty title takes the Target's, so the Alias is a second Card called B.
    await expect(page.locator('.react-flow__node')).toHaveCount(nodes + 1);
    await expect(nodeByTitle(page, 'B')).toHaveCount(2);
    await expect(selectedCanvas(page)).toContainText('Layout 1');
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  },
);

/**
 * The whole gesture, and the reason the Title field had to exist.
 *
 * An empty title takes the Target's, so creation leaves two Cards called `B` and
 * the author standing in a pane that has to tell them apart. Renaming has to be
 * reachable from where the author already is, has to reach the *Alias*, and has
 * to leave the Target's own title alone.
 *
 * The editor retains the pane contract: only its labelled Done action commits.
 */
test('an Alias is renamed by the shared Title editor creation begins', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Alias' }).click();
  await page.getByRole('combobox', { name: 'Target' }).fill('B');
  await page.getByRole('option', { name: 'Markdown Card B' }).click();

  const title = page.getByRole('textbox', { name: 'Card title' });
  await expect(title).toHaveValue('B');
  await expect(title).toBeFocused();
  await title.fill('Recap');
  await title.press('Enter');

  await expect(nodeByTitle(page, 'Recap')).toHaveCount(1);
  // The Target keeps its own: one Card called B, the one that was always there.
  await expect(nodeByTitle(page, 'B')).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  // And the rename outlives the pane rather than being held by it.
  await quiescent(page);
  await expect(nodeByTitle(page, 'Recap')).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
});

/**
 * And the rename is a pending field, so Escape discards it and closes — one
 * press, no field intercepting it (ADR 0048).
 *
 * The Alias itself is *not* a pending field and does not go with it: it was
 * created the moment the Target was chosen, one revision earlier, and Escape on
 * this pane discards a draft rather than undoing an Edit. That is the whole
 * point of the test — the two are told apart, and only one of them is a draft.
 */
test('Escape discards an Alias rename without undoing the Alias', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Alias' }).click();
  await page.getByRole('combobox', { name: 'Target' }).fill('B');
  await page.getByRole('option', { name: 'Markdown Card B' }).click();
  const title = page.getByRole('textbox', { name: 'Card title' });
  await title.fill('Recap');

  await title.press('Escape');

  await quiescent(page);
  await expect(nodeByTitle(page, 'Recap')).toHaveCount(0);
  await expect(nodeByTitle(page, 'B')).toHaveCount(2);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});
