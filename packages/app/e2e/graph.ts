import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Reading and driving the React Flow graph from e2e.
 *
 * Shared rather than duplicated because several specs need it: `editing.spec`
 * drags cards around the fixture and draws Edges between them, `read-only.spec`
 * does the same to prove none of it reaches the imported files, and
 * `new-space.spec` drags the single card of a space the app minted. The
 * `settled` gate and the mid-connection waits in `connectHandles` are the
 * non-obvious parts, and the ones worth having in exactly one place.
 */

/* -------------------------------------------------------------------------- */
/* The fixture's cardinalities                                                 */
/* -------------------------------------------------------------------------- */

/**
 * How many Cards and Edges `packages/app/fixture/` actually declares, read from
 * the authored files at load.
 *
 * Four assertions used to spell these out as literals — `40` target handles,
 * `14`/`13`/`13` edges — so a change to the fixture silently broke tests that
 * are not about the fixture. Reading the files keeps them synchronised without
 * weakening anything: the fixture is the independent source of truth the page is
 * being checked against, and no count here is ever derived from the page under
 * test.
 */
const fixtureDir = fileURLToPath(new URL('../fixture', import.meta.url));

const markdownFileCount = (directory: string): number =>
  readdirSync(directory, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && entry.name.endsWith('.md'),
  ).length;

/**
 * Cards are discovered non-recursively in two places — beside the space file and
 * in `cards/` — and every `.md` in scope *is* a card (ADR 0020), so counting
 * those files counts the Cards.
 */
export const FIXTURE_CARD_COUNT =
  markdownFileCount(fixtureDir) + markdownFileCount(`${fixtureDir}/cards`);

/**
 * Graphs are a Layout's only connection structure, so every Edge the overview
 * draws is one of a Graph's authored `{from, to}` pairs — summed across every
 * Layout, because a Graph is a nested owned value of the one that holds it (ADR
 * 0040) and the fixture spreads four Graphs over two Layouts.
 *
 * This is the count across the fixture's Layouts,
 * Layouts (ADR 0045). A *selected* Layout draws only the Graphs it owns, so it
 * is not the number to assert after a conversion.
 */
export const FIXTURE_EDGE_COUNT =
  // SAFETY: `space.json` is this repo's own tracked E2E fixture, not user
  // input — its shape is asserted elsewhere by the fixture's own
  // schema-validated load; this narrow read only needs the two nested array
  // fields used below.
  (
    JSON.parse(readFileSync(`${fixtureDir}/space.json`, 'utf8')) as {
      layouts: readonly { graphs: readonly { edges: readonly unknown[] }[] }[];
    }
  ).layouts.reduce(
    (total, layout) =>
      total + layout.graphs.reduce((edges, graph) => edges + graph.edges.length, 0),
    0,
  );

/** Authoring presents one handle per side of a Card, source and target alike —
 *  four sides, graph-independent (ADR 0033). */
export const AUTHORING_HANDLE_SIDES = 4;

/* -------------------------------------------------------------------------- */
/* Locating and driving                                                        */
/* -------------------------------------------------------------------------- */

export function nodeByTitle(page: Page, title: string): Locator {
  return page
    .locator('.react-flow__node')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

/** The visible face shares its node's complete rectangle, including during resize. */
export async function expectCardFillsNode(node: Locator): Promise<void> {
  await expect
    .poll(() =>
      node.evaluate((element) => {
        const face = element.querySelector('.canvas-card');
        if (face === null) throw new Error('Card face is missing');
        const outer = element.getBoundingClientRect();
        const inner = face.getBoundingClientRect();
        return Math.max(
          Math.abs(outer.x - inner.x),
          Math.abs(outer.y - inner.y),
          Math.abs(outer.width - inner.width),
          Math.abs(outer.height - inner.height),
        );
      }),
    )
    .toBeLessThan(0.1);
}

/**
 * The Card reached during traversal, by the class the projection marks it with.
 *
 * Shared because presenting is asserted from both projects: `presenting.spec`
 * traverses the fixture's authored Graphs, and `new-space.spec` presents the Graph a
 * self-connection mints in a Space that started with none. The class is the
 * render layer's, not the domain's, so a second copy of the string is one the
 * next rename leaves behind.
 */
export function activeCard(page: Page): Locator {
  return page.locator('.react-flow__node.rf-card-node--active');
}

/**
 * Open a Card in place, without beginning content editing (ADR 0064).
 *
 * No pointer gesture on a Card's body opens it (ADR 0036) — the Card's own
 * control does, and it is revealed by hovering the Card.
 */
export async function openCard(node: Locator, title: string): Promise<void> {
  await node.hover();
  await node.getByRole('button', { name: `Open Card ${title}` }).click();
}

/**
 * The Space's command surface (ADR 0082).
 *
 * **Every helper below opens a menu where it used to press a button**, and that
 * is the whole of what the Command Dock changed for this suite. The Sidebar was
 * a sixteen-rem column with room for a permanent row per Layout, a permanent row
 * per Graph and a permanent Add Layout; the Dock is a strip over the canvas that
 * finds room by disclosure. So the *claims* the specs make are unchanged and the
 * reach is not, which is exactly why the reach lives here — one module rather
 * than the thirty call sites that would otherwise each settle on their own way
 * of pressing it. `packages/app/test/command-dock.ts` is this module's opposite
 * number in the unit suite, for the same reason.
 */
export function dock(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Command Dock' });
}

/**
 * Press a Dock disclosure and wait for what it discloses.
 *
 * `delay` is not decoration. A default Playwright click puts mousedown and
 * mouseup in one tick and Base UI's dismissal never gets a turn between them, so
 * a menu can open and close inside one press without this suite seeing it
 * (`ladle-e2e/link-actions.spec.ts` records the regression that found it).
 *
 */
async function disclose(page: Page, name: string | RegExp): Promise<Locator> {
  await dock(page).getByRole('button', { name }).click({ delay: 120 });
  const menu = page.getByRole('menu').last();
  await expect(menu).toBeVisible();
  return menu;
}

/** The Layout cluster's disclosure: the authored Layouts, then its own commands. */
export function layoutMenu(page: Page): Promise<Locator> {
  return disclose(page, /^Layout: /);
}

/** The Graph cluster's disclosure: the Graphs this Layout owns, then its commands. */
export function graphMenu(page: Page): Promise<Locator> {
  return disclose(page, /^Active Graph: /);
}

/** The Space cluster's disclosure: New Space, Copy link and Exit Space. */
export function spaceMenu(page: Page): Promise<Locator> {
  return disclose(page, /^Space: /);
}

/** What the Dock says is drawing. */
export function selectedCanvas(page: Page): Locator {
  return page.getByTestId('selected-canvas');
}

/**
 * Draw one authored Layout, by title.
 *
 * One exclusive choice over authored Layouts, with no second control and no
 * empty value — ADR 0053's one durable clause, which ADR 0082 keeps verbatim.
 * The fixture declares two Layouts (`fixture/space.json`), so a test can open
 * one without authoring it first, which is the only way to drag a Card in a
 * Layout that already owns Edges.
 */
export async function selectCanvas(page: Page, title: string): Promise<void> {
  // Exact, both times. On a substring the early return fires for `Workshop`
  // while `Workshop 2` is drawing — the test then runs against the wrong Layout
  // and the closing `toContainText` agrees with it.
  const named = (text: string): boolean => text.trim() === title;
  if (named(await selectedCanvas(page).innerText())) return;
  const menu = await layoutMenu(page);
  await menu.getByRole('menuitemradio', { name: title, exact: true }).click();
  await expect(selectedCanvas(page)).toHaveText(title);
}

/** Create and select an empty Layout owning one empty Graph (ADR 0079, ADR 0080). */
export async function newLayout(page: Page): Promise<void> {
  const menu = await layoutMenu(page);
  await menu.getByRole('menuitem', { name: 'New Layout' }).click();
}

/** The Layouts the Space offers, read from the one list that offers them. */
export async function layoutChoices(page: Page): Promise<Locator> {
  return (await layoutMenu(page)).getByRole('menuitemradio');
}

/** The Graph the Dock is naming as active, or nothing when none is. */
export function activeGraph(page: Page): Locator {
  return page.getByTestId('active-graph');
}

/** Emphasise one Graph by title. Activating is never an Edit (ADR 0028). */
export async function activateGraph(page: Page, title: string): Promise<void> {
  // Exact, for the reason {@link selectCanvas} is.
  if ((await activeGraph(page).innerText()).trim() === title) return;
  const menu = await graphMenu(page);
  await menu.getByRole('menuitemradio', { name: title, exact: true }).click();
  await expect(activeGraph(page)).toHaveText(title);
}

/** The Graphs the selected Layout owns, read from the one list that offers them. */
export async function graphChoices(page: Page): Promise<Locator> {
  return (await graphMenu(page)).getByRole('menuitemradio');
}

/**
 * Present, which traverses the Active Graph.
 *
 * Named for the Graph it acts on rather than sitting under a generic label, so
 * the prefix is matched and the title is left to the assertion that wants it.
 */
export function presentControl(page: Page): Locator {
  return dock(page).getByRole('button', { name: /^Present / });
}

/** Whether creating a Card is available at all, which the `+` reports. */
export function createCardControl(page: Page): Locator {
  return dock(page).getByRole('button', { name: 'Create Card' });
}

/** Create a Card of one kind, from the Cards cluster's `+`. */
export async function createCard(
  page: Page,
  kind: 'Markdown Card' | 'Space Card' | 'Alias',
): Promise<void> {
  const menu = await disclose(page, 'Create Card');
  // The row says the kind twice — `CardKindIcon` announces it and the word
  // beside it repeats it — so which of the two carries the accessible name is
  // the glyph's decision and not this module's.
  await menu.getByRole('menuitem', { name: new RegExp(`^(${kind}\\s*)+$`) }).click();
}

/** The resolved colour drawn on one Graph's legend swatch, by its title. */
export async function graphLegendSwatchColor(page: Page, title: string): Promise<string> {
  const swatch = page
    .getByTestId('graph-legend')
    .locator('.legend__item')
    .filter({ hasText: title })
    .locator('span')
    .first();
  return swatch.evaluate((el) => getComputedStyle(el).backgroundColor);
}

/** Where React Flow has actually put a node, in flow coordinates. */
export async function positionOf(node: Locator): Promise<{ x: number; y: number }> {
  return node.evaluate((el) => {
    // SAFETY: `.react-flow__node` only ever matches a `<div>` React Flow
    // renders, so the element this callback receives is always an
    // `HTMLElement`.
    const match = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(
      (el as HTMLElement).style.transform,
    );
    return { x: Number(match?.[1] ?? NaN), y: Number(match?.[2] ?? NaN) };
  });
}

/** All node positions, keyed by the node's React Flow id. */
export async function allPositions(page: Page): Promise<Record<string, { x: number; y: number }>> {
  return page.locator('.react-flow__node').evaluateAll((els) =>
    Object.fromEntries(
      els.map((el) => {
        // SAFETY: `.react-flow__node` only ever matches a `<div>` React Flow
        // renders, so the element this callback receives is always an
        // `HTMLElement`.
        const match = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(
          (el as HTMLElement).style.transform,
        );
        return [
          el.getAttribute('data-id') ?? '',
          { x: Number(match?.[1] ?? NaN), y: Number(match?.[2] ?? NaN) },
        ];
      }),
    ),
  );
}

export const viewportTransform = (page: Page) =>
  page.evaluate(
    () => document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? '',
  );

/**
 * Wait until the viewport stops moving.
 *
 * Camera moves while presenting are animated. A bounding box read during one is
 * stale by the time the mouse gets there, so mousedown lands beside the card and
 * no drag starts — a failure that looks exactly like dragging being broken.
 */
export async function settled(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      // The two reads must straddle a real gap. Comparing values sampled in the
      // same tick reports "stable" on the first try, every time, mid-animation.
      const before = await viewportTransform(page);
      await page.waitForTimeout(120);
      return before !== '' && (await viewportTransform(page)) === before;
    })
    .toBe(true);
}

/**
 * The box of an element the test requires, waited for and named.
 *
 * `(await locator.boundingBox())!` is null whenever the element is absent or not
 * yet laid out, and the assertion then fires on a later line as a null property
 * read — reporting the arithmetic rather than the element that never arrived.
 * Waiting for visibility first turns that into Playwright's own "not visible"
 * timeout against `what`, which names the thing actually missing.
 */
export async function boxOf(
  locator: Locator,
  what: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  await expect(locator, `${what} is visible`).toBeVisible();
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${what} is visible but has no bounding box.`);
  return box;
}

/**
 * Drag by a flow-space delta, scaled through the current zoom.
 *
 * Anything a caller wants to assert *while* the Card is being dragged goes in
 * `whileDragging`, which runs between the two moves — the same shape
 * `connectHandles` uses above, and for the same kind of reason. What a drag does
 * to the rest of the canvas mid-flight is invisible from either resting frame:
 * the defect ADR 0084 removes moved a neighbour as the dragged Card crossed its
 * origin and moved it back before release, so a test that reads only the before
 * and after sees a gesture that did nothing. The callback runs after the first
 * move, so the Card is already past the halfway point of the delta — a crossing
 * a caller wants observed belongs in the first half of the drag.
 */
export async function dragBy(
  page: Page,
  node: Locator,
  dx: number,
  dy: number,
  whileDragging?: () => Promise<void>,
): Promise<void> {
  await settled(page);
  const box = (await node.boundingBox())!;
  const zoom = Number(/scale\(([\d.]+)\)/.exec(await viewportTransform(page))?.[1] ?? 1);

  // Grab the card's header rather than its centre: the body scrolls its markdown
  // and the ports sit at the edges.
  await page.mouse.move(box.x + box.width / 2, box.y + 12);
  await page.mouse.down();
  // The opening nudge is its own move, and it is the difference between a Card
  // that lands where the delta says and one that lands ninety per cent of the
  // way there. React Flow begins the drag at the first pointer event past
  // `nodeDragThreshold` (1px at the pinned 12.11.2) and measures the Card's
  // travel from *that* position, so everything covered before it is lost — and a
  // `steps: 5` move to the halfway point spends a tenth of the whole delta on
  // its first event. Spending two pixels here instead leaves an error the
  // flow-coordinate assertions can ignore rather than one that scales with the
  // drag.
  await page.mouse.move(box.x + box.width / 2 + Math.sign(dx) * 2, box.y + 12 + Math.sign(dy) * 2);
  // A single jump can still be swallowed, so the travel itself moves twice.
  await page.mouse.move(box.x + box.width / 2 + (dx * zoom) / 2, box.y + 12 + (dy * zoom) / 2, {
    steps: 5,
  });

  await whileDragging?.();

  await page.mouse.move(box.x + box.width / 2 + dx * zoom, box.y + 12 + dy * zoom, { steps: 5 });
  await page.mouse.up();
}

/** Which side of a Card an authoring handle sits on. The side is interaction
 *  geometry and is never authored (ADR 0033). */
export type HandleSide = 'top' | 'right' | 'bottom' | 'left';

/** A Card's graph-independent authoring handle on one side. */
export function authoringHandle(
  node: Locator,
  type: 'source' | 'target',
  side: HandleSide,
): Locator {
  return node.locator(`.rf-card-node__authoring-handle--${type}.react-flow__handle-${side}`);
}

/**
 * Draw a connection from one authoring handle to another.
 *
 * The two waits in the middle are load-bearing, not politeness. Target handles
 * are invisible until React Flow has actually started a connection, so a
 * `mouse.up` issued before `connectableend` lands ends a drag that never began —
 * and the spec then reports "no Edge was recorded" for a connection nothing ever
 * attempted. Anything a caller wants to assert *while* the connection is in
 * progress goes in `whileConnecting`, which runs between the gate and the drop.
 */
export async function connectHandles(
  page: Page,
  sourceHandle: Locator,
  targetHandle: Locator,
  whileConnecting?: () => Promise<void>,
): Promise<void> {
  const from = (await sourceHandle.boundingBox())!;
  const to = await targetHandle.boundingBox();
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  // The opening nudge goes *towards* the target rather than always rightwards.
  // React Flow auto-pans while a connection is dragged within 40px of the
  // container edge, and the Space Sidebar took 256px of that container
  // (ADR 0053): parking the pointer 36px from the right edge made the canvas
  // pan for as long as the drag lasted, and Playwright waits forever for a box
  // that never stops moving. Aiming at the target is also the truer gesture.
  const nudge = to !== null && to.x + to.width / 2 < start.x ? -30 : 30;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // React Flow starts the connection on the first move after mousedown, and a
  // single jump can be swallowed — the same reason `dragBy` moves in steps.
  await page.mouse.move(start.x + nudge, start.y, { steps: 4 });

  await expect(targetHandle).toHaveCSS('opacity', '1');
  await expect(targetHandle).toHaveClass(/connectableend/);

  await whileConnecting?.();

  await targetHandle.hover();
  // `hover` moves the mouse; assert it landed, so a connection dropped on empty
  // canvas fails here rather than as a mysteriously missing Edge later.
  expect(await targetHandle.evaluate((element) => element.matches(':hover'))).toBe(true);
  await page.mouse.up();
}

/** Explicitly create a connection target on empty canvas with Alt/Option. */
export async function connectToEmptyWithAlt(
  page: Page,
  sourceHandle: Locator,
): Promise<{ x: number; y: number }> {
  const from = await boxOf(sourceHandle, 'the source handle');
  const pane = await boxOf(page.locator('.react-flow__pane'), 'the React Flow pane');
  let mouseDown = false;
  let altDown = false;
  let previewed = false;
  try {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    mouseDown = true;
    await page.mouse.move(from.x + from.width / 2 + 30, from.y + from.height / 2, { steps: 4 });
    await page.keyboard.down('Alt');
    altDown = true;
    await page.mouse.move(pane.x + 36, pane.y + 36, { steps: 4 });
    const preview = page.getByTestId('new-card-preview');
    await expect(preview).toBeVisible();
    previewed = true;
    // Read the position while the drag is still live — the preview is gone the
    // moment the button comes up.
    return await positionOf(preview);
  } finally {
    // The preview assertion above can fail, and Playwright's mouse and keyboard
    // state is per-page, not per-test-step: a held button and a held Alt would
    // otherwise leak into every later interaction on this page and fail it for
    // an unrelated-looking reason.
    //
    // Which key comes up first is the difference between a drop and a cancel.
    // On the way out with a preview in hand, the drop is what creates the Card,
    // so it must still see Alt down. On the way out through a failed assertion
    // it must not: an Alt-drop would create a Card the aborted test never asked
    // for, and whatever that broke next would be reported instead of the
    // assertion that actually failed.
    if (!previewed && altDown) await page.keyboard.up('Alt');
    if (mouseDown) await page.mouse.up();
    if (previewed && altDown) await page.keyboard.up('Alt');
  }
}
