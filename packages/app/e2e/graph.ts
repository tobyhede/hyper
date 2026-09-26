import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aggregateFileSchema } from '@project/core';
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Reading and driving the React Flow graph from e2e.
 *
 * Shared rather than duplicated because several specs need it: `editing.spec`
 * drags resources around the fixture and draws Edges between them, `read-only.spec`
 * does the same to prove none of it reaches the imported files, and
 * `new-space.spec` drags the single resource of a space the app minted. The
 * `settled` gate and the mid-connection waits in `connectHandles` are the
 * non-obvious parts, and the ones worth having in exactly one place.
 */

/* -------------------------------------------------------------------------- */
/* The fixture's counts                                                       */
/* -------------------------------------------------------------------------- */

/**
 * How many Resources and Edges the fixture Meta Space actually declares, read from
 * the authored files at load.
 *
 * Spelled out as literals, these counts would break tests that are not about
 * the fixture whenever the fixture changes. Reading the files keeps them synchronised without
 * weakening anything: the fixture is the independent source of truth the page is
 * being checked against, and no count here is ever derived from the page under
 * test.
 */
const fixtureRoot = fileURLToPath(new URL('../fixture', import.meta.url));
const rawAggregate: unknown = JSON.parse(readFileSync(`${fixtureRoot}/hyper.json`, 'utf8'));
const fixtureAggregate = aggregateFileSchema.parse(rawAggregate);
const fixtureMetaId = fixtureAggregate.metaSpaceId;
const fixtureDir = `${fixtureRoot}/${fixtureMetaId}`;

/**
 * Ordinary Spaces the fixture aggregate already holds, excluding Meta.
 *
 * `space-resource.spec.ts` (`stops offering a Space…`, `deleting the last Space
 * Resource…`) lands back on this count after destroying a Space it just created.
 */
export const FIXTURE_ORDINARY_SPACE_COUNT = readdirSync(fixtureRoot, {
  withFileTypes: true,
}).filter((entry) => entry.isDirectory() && entry.name !== fixtureMetaId).length;

const markdownFileCount = (directory: string): number =>
  readdirSync(directory, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && entry.name.endsWith('.md'),
  ).length;

/**
 * Resources are discovered non-recursively in two places — beside the space file and
 * in `resources/` — and every `.md` in scope *is* a resource (ADR 0020), so counting
 * those files counts the Resources.
 */
export const FIXTURE_RESOURCE_COUNT =
  markdownFileCount(fixtureDir) + markdownFileCount(`${fixtureDir}/resources`);

/**
 * Graphs are a Map's only connection structure, so every Edge the overview
 * draws is one of a Graph's authored `{from, to}` pairs — summed across every
 * Map, because a Graph is a nested owned value of the one that holds it (ADR
 * 0040) and the fixture Meta Space spreads five Graphs over three Maps.
 *
 * This is the count across every Map the fixture Meta Space holds. A
 * *selected* Map draws only the Graphs it owns, so it is not the number
 * to assert after a conversion. Ordinary Spaces in the same aggregate are
 * never opened here.
 */
export const FIXTURE_EDGE_COUNT =
  // SAFETY: `space.json` is this repo's own tracked E2E fixture, not user
  // input — its shape is asserted elsewhere by the fixture's own
  // schema-validated load; this narrow read only needs the two nested array
  // fields used below.
  (
    JSON.parse(readFileSync(`${fixtureDir}/space.json`, 'utf8')) as {
      maps: readonly { graphs: readonly { edges: readonly unknown[] }[] }[];
    }
  ).maps.reduce(
    (total, map) => total + map.graphs.reduce((edges, graph) => edges + graph.edges.length, 0),
    0,
  );

/** Authoring presents one handle per side of a Resource, source and target alike —
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
export async function expectResourceFillsNode(node: Locator): Promise<void> {
  await expect
    .poll(() =>
      node.evaluate((element) => {
        const face = element.querySelector('.canvas-resource');
        if (face === null) throw new Error('Resource face is missing');
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
 * The Resource reached during traversal, by the class the projection marks it with.
 *
 * Shared because presenting is asserted from both projects: `presenting.spec`
 * traverses the fixture's authored Graphs, and `new-space.spec` presents the Graph a
 * self-connection mints in a Space that started with none. The class is the
 * render layer's, not the domain's, so a second copy of the string is one the
 * next rename leaves behind.
 */
export function activeResource(page: Page): Locator {
  return page.locator('.react-flow__node.rf-resource-node--active');
}

/**
 * Open a Resource in place, without beginning content editing (ADR 0064).
 *
 * No pointer gesture on a Resource's body opens it (ADR 0036) — the Resource's own
 * control does, drawn in its floating toolbar once the Resource is selected
 * (ADR 0102).
 */
export async function openResource(node: Locator, title: string): Promise<void> {
  const controls = await resourceControls(node.page(), node);
  await controls.getByRole('button', { name: `Open Resource ${title}` }).click();
}

/**
 * Select a placed Resource, so its toolbar is drawn (ADR 0102), and open its actions menu.
 *
 * Shared by three suites — `editing.spec` and `mobile-dock.spec` through the
 * real page harness, `ladle-e2e/command-dock.spec` through the Ladle story
 * host — all reaching for the Command Dock's organising rule that a Resource's
 * own commands live on its rail rather than on the Dock (ADR 0073). `.last()`
 * costs nothing when only one menu is open, which is every case these three
 * exercise.
 */
export async function resourceActions(page: Page, title: string): Promise<Locator> {
  const resource = nodeByTitle(page, title).first();
  await selectResource(resource);
  await (
    await resourceToolbar(page, resource)
  )
    .getByRole('button', { name: `Actions for Resource ${title}` })
    .click({ delay: 120 });
  const menu = page.getByRole('menu').last();
  await expect(menu).toBeVisible();
  return menu;
}

/**
 * The Space's command surface (ADR 0082).
 *
 * **Every helper below reaches its command by opening a menu**, because the
 * Dock is a strip over the canvas that finds room by disclosure. The reach
 * lives here — one module rather than the thirty call sites that would
 * otherwise each settle on their own way of pressing it.
 * `packages/app/test/command-dock.ts` is this module's opposite number in the
 * unit suite, for the same reason.
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
 * (`ladle-e2e/link-actions.spec.ts` holds that case).
 *
 */
async function disclose(page: Page, name: string | RegExp): Promise<Locator> {
  await dock(page).getByRole('button', { name }).click({ delay: 120 });
  const menu = page.getByRole('menu').last();
  await expect(menu).toBeVisible();
  return menu;
}

/** The Map cluster's disclosure: the authored Maps, then its own commands. */
export function mapMenu(page: Page): Promise<Locator> {
  return disclose(page, /^Map: /);
}

/** The Graph cluster's disclosure: the Graphs this Map owns, then its commands. */
export function graphMenu(page: Page): Promise<Locator> {
  return disclose(page, /^Active Graph: /);
}

/** The Space cluster's disclosure: Rename, Copy link to Space, then Exit Space. */
export function spaceMenu(page: Page): Promise<Locator> {
  return disclose(page, /^Space: /);
}

/**
 * The Space the Dock is in, named on the cluster beside its menu.
 *
 * The third identity, and a control like the other two: the name discloses
 * the Space list; Rename in that list continues in the editor.
 */
export function spaceName(page: Page): Locator {
  return page.getByTestId('space-title');
}

/**
 * Begin a Dock identity rename from its list.
 *
 * The name discloses; Rename is the command that opens the editor.
 * `delay` is the same Base UI dismissal turn {@link disclose} waits for.
 */
export async function beginRename(page: Page, identity: Locator): Promise<void> {
  await identity.click({ delay: 120 });
  await page.getByRole('menuitem', { name: 'Rename' }).click();
}

/** What the Dock says is drawing. */
export function selectedCanvas(page: Page): Locator {
  return page.getByTestId('selected-canvas');
}

/**
 * Draw one authored Map, by title.
 *
 * One exclusive choice over authored Maps, with no second control and no
 * empty value (ADR 0082).
 * The fixture Meta Space declares Collection 1 and Collection 2
 * (`fixture/<meta>/space.json`), so a test can open one without authoring it
 * first, which is the only way to drag a Resource in a Map that already owns
 * Edges. Linked Spaces is the third Map, holding the Space Resources.
 */
export async function selectCanvas(page: Page, title: string): Promise<void> {
  // Exact, both times. On a substring the early return fires for `Workshop`
  // while `Workshop 2` is drawing — the test then runs against the wrong Map
  // and the closing `toContainText` agrees with it.
  const named = (text: string): boolean => text.trim() === title;
  if (named(await selectedCanvas(page).innerText())) return;
  const menu = await mapMenu(page);
  await menu.getByRole('menuitemradio', { name: title, exact: true }).click();
  await expect(selectedCanvas(page)).toHaveText(title);
}

/**
 * Create and select an empty Map owning one empty Graph (ADR 0079, ADR 0080).
 *
 * **It leaves the caret in the new Map's name**, which is where the command
 * continues — so the Dock is drawing an
 * editor and not a name when this returns, and `selectedCanvas` matches nothing.
 * Callers that want to read the Dock back settle the editor with
 * {@link settleNewMapName} first.
 */
export async function newMap(page: Page): Promise<void> {
  const menu = await mapMenu(page);
  await menu.getByRole('menuitem', { name: 'New Map' }).click();
}

/**
 * Assert the New Map continuation landed, and hand the Dock back its name.
 *
 * The caret in the new Map's name is the command's visible outcome, so it is
 * asserted here rather than stepped over: a continuation that stopped firing
 * would otherwise show up only as a puzzling absence somewhere later.
 *
 * Escape rather than Enter, because the Edit already stored this title — the
 * editor opened on `Map N` as the numbering minted it, and cancelling an
 * untouched draft leaves exactly that.
 */
export async function settleNewMapName(page: Page, title: string): Promise<void> {
  const editor = page.getByRole('textbox', { name: 'Map name' });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue(title);
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
}

/**
 * Append, colour and activate one empty Graph (ADR 0040).
 *
 * Unlike New Map, the Edit completes on the press — there is no name
 * continuation and the new Graph is already selected when this returns.
 */
export async function newGraph(page: Page): Promise<void> {
  const menu = await graphMenu(page);
  await menu.getByRole('menuitem', { name: 'New Graph' }).click();
}

/** Delete the Graph the cluster is showing. */
export async function deleteActiveGraph(page: Page): Promise<void> {
  const title = (await activeGraph(page).innerText()).trim();
  const menu = await graphMenu(page);
  await menu.getByRole('menuitem', { name: `Delete ${title}` }).click();
}

/** The Maps the Space offers, read from the one list that offers them. */
export async function mapChoices(page: Page): Promise<Locator> {
  return (await mapMenu(page)).getByRole('menuitemradio');
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

/** The Graphs the selected Map owns, read from the one list that offers them. */
export async function graphChoices(page: Page): Promise<Locator> {
  return (await graphMenu(page)).getByRole('menuitemradio');
}

/** Open the palette-bound colour picker for the Active Graph. */
export async function openGraphColourPicker(page: Page): Promise<void> {
  const menu = await graphMenu(page);
  await menu.getByRole('menuitem', { name: 'Colour…' }).click({ delay: 120 });
  const group = page.getByRole('radiogroup', { name: 'Graph colour' });
  await expect(group.getByRole('radio')).toHaveCount(20);
  await expect(group.getByRole('radio', { name: 'Orange', exact: true })).toBeVisible();
}

/** Recolour the Active Graph through the swatch popover. */
export async function recolorActiveGraph(page: Page, label: string): Promise<void> {
  await openGraphColourPicker(page);
  await page.getByRole('radio', { name: label, exact: true }).click();
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

/** The kinds the Dock offers, named as their controls announce them. */
export type ResourceKindName = 'Markdown Resource' | 'Space Resource';

/**
 * One kind's Create control, which is also what reports whether creating is
 * available at all — both peers are withdrawn by the same fact.
 *
 * **The default answers the availability question and nothing else.** Asking
 * "can a Resource be created" may use either peer, because `createDisabled`
 * withdraws them together; an assertion about *which* control names its kind.
 */
export function createResourceControl(
  page: Page,
  kind: ResourceKindName = 'Markdown Resource',
): Locator {
  return dock(page).getByRole('button', { name: `Create ${kind}` });
}

/**
 * Create a Resource of one kind, from its own control in the Resources cluster.
 *
 * The two kinds are peers with no disclosure in front of them and each completes
 * its Edit on the press (ADR 0089), so this is one press whichever kind is
 * asked for. A Reference Resource is not here: it is created from the Resource it points at,
 * through that Resource's own command menu.
 */
export async function createResource(page: Page, kind: ResourceKindName): Promise<void> {
  await createResourceControl(page, kind).click();
}

/** The resolved colour drawn on one Graph's legend mark, by its title. */
export async function graphLegendSwatchColor(page: Page, title: string): Promise<string> {
  const line = page
    .getByTestId('graph-legend')
    .locator('.legend__item')
    .filter({ hasText: title })
    .locator('[data-slot="graph-legend-mark-line"]');
  return line.evaluate((el) => getComputedStyle(el).stroke);
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
 * stale by the time the mouse gets there, so mousedown lands beside the resource and
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
 * timeout against `what`, which names the resource actually missing.
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
 * The screen pixels spent crossing React Flow's `nodeDragThreshold` before the
 * travel below is measured. Two rather than one, because the threshold is
 * exclusive and a single pixel does not clear it.
 */
const NUDGE = 2;

/**
 * Drag by a flow-space delta, scaled through the current zoom.
 *
 * Anything a caller wants to assert *while* the Resource is being dragged goes in
 * `whileDragging`, which runs between the two moves — the same shape
 * `connectHandles` uses above, and for the same kind of reason. What a drag does
 * to the rest of the canvas mid-flight is invisible from either resting frame:
 * a neighbour moved as the dragged Resource crosses its origin and moved back
 * before release (which ADR 0084 forbids) looks, to a test that reads only the
 * before and after, like a gesture that did nothing. The callback runs after the first
 * move, which lands on exactly the halfway point of the delta — a crossing a
 * caller wants observed belongs strictly before that halfway mark.
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

  // Grab the resource's header rather than its centre: the body scrolls its markdown
  // and the ports sit at the edges.
  await page.mouse.move(box.x + box.width / 2, box.y + 12);
  await page.mouse.down();
  // The opening nudge is its own move, and it is the difference between a Resource
  // that lands where the delta says and one that lands ninety per cent of the
  // way there. React Flow begins the drag at the first pointer event past
  // `nodeDragThreshold` (1px at the pinned 12.11.2) and measures the Resource's
  // travel from *that* position, so everything covered before it is lost — and a
  // `steps: 5` move to the halfway point spends a tenth of the whole delta on
  // its first event.
  //
  // Spending the nudge on its own move makes that loss a known constant instead
  // of a proportion, and **every coordinate below is then measured from the
  // nudge rather than from the press**, so the Resource travels exactly `dx`/`dy`
  // flow units. Leaving the nudge uncompensated would leave an error of
  // `NUDGE / zoom` — small at the fixture's zoom, and growing as a Map gets
  // wider or a viewport narrower, which is precisely the shape of assertion
  // that passes until the day it does not.
  const from = {
    x: box.x + box.width / 2 + Math.sign(dx) * NUDGE,
    y: box.y + 12 + Math.sign(dy) * NUDGE,
  };
  await page.mouse.move(from.x, from.y);
  // A single jump can still be swallowed, so the travel itself moves twice.
  await page.mouse.move(from.x + (dx * zoom) / 2, from.y + (dy * zoom) / 2, { steps: 5 });

  await whileDragging?.();

  await page.mouse.move(from.x + dx * zoom, from.y + dy * zoom, { steps: 5 });
  await page.mouse.up();
}

/** Which side of a Resource an authoring handle sits on. The side is interaction
 *  geometry and is never authored (ADR 0033). */
export type HandleSide = 'top' | 'right' | 'bottom' | 'left';

/** A Resource's graph-independent authoring handle on one side. */
export function authoringHandle(
  node: Locator,
  type: 'source' | 'target',
  side: HandleSide,
): Locator {
  return node.locator(`.rf-resource-node__authoring-handle--${type}.react-flow__handle-${side}`);
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
  const from = await boxOf(sourceHandle, 'the source handle');
  const to = await targetHandle.boundingBox();
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  // The opening nudge goes *towards* the target rather than always rightwards.
  // React Flow auto-pans while a connection is dragged within 40px of the
  // container edge: a pointer parked that close to an edge pans the canvas for
  // as long as the drag lasts, and Playwright waits forever for a box that
  // never stops moving. Aiming at the target is also the truer gesture.
  const nudge = to !== null && to.x + to.width / 2 < start.x ? -30 : 30;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // React Flow starts the connection on the first move after mousedown, and a
  // single jump can be swallowed — the same reason `dragBy` moves in steps.
  await page.mouse.move(start.x + nudge, start.y, { steps: 4 });

  // Eligibility arms `connectableend` for the whole drag; seeking-end *visibility*
  // waits until the pointer is within the product proximity of the Resource
  // (connection-handle-proximity/01). Hidden handles keep `pointer-events: none`,
  // so Playwright `hover` cannot arm them — move by coordinates onto the target
  // first, then the reveal turns pointer events back on.
  await expect(targetHandle).toHaveClass(/connectableend/);
  const drop = await boxOf(targetHandle, 'the target handle');
  await page.mouse.move(drop.x + drop.width / 2, drop.y + drop.height / 2, { steps: 8 });
  await expect(targetHandle).toHaveCSS('opacity', '1');
  expect(await targetHandle.evaluate((element) => element.matches(':hover'))).toBe(true);

  await whileConnecting?.();

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
    const preview = page.getByTestId('new-resource-preview');
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
    // On the way out with a preview in hand, the drop is what creates the Resource,
    // so it must still see Alt down. On the way out through a failed assertion
    // it must not: an Alt-drop would create a Resource the aborted test never asked
    // for, and whatever that broke next would be reported instead of the
    // assertion that actually failed.
    if (!previewed && altDown) await page.keyboard.up('Alt');
    if (mouseDown) await page.mouse.up();
    if (previewed && altDown) await page.keyboard.up('Alt');
  }
}

/**
 * Select a Resource the way a pointer does, so React Flow draws its toolbar.
 *
 * A Resource's commands float in React Flow's `NodeToolbar`, drawn while that
 * Resource is the one selected (ADR 0102). The press lands just inside the
 * Resource's top-left corner, in the rail band, which holds no control of its own
 * on the canvas — the centre can hold the Title, whose control begins a rename.
 */
export async function selectResource(resource: Locator): Promise<void> {
  await resource.click({ position: { x: 10, y: 10 } });
  await expect(resource).toHaveClass(/\bselected\b/);
}

/** A Resource's floating toolbar, drawn outside the Resource while it is selected (ADR 0102). */
export async function resourceToolbar(page: Page, resource: Locator): Promise<Locator> {
  const id = await resource.getAttribute('data-id');
  if (id === null) throw new Error('Resource placement id missing');
  return page.locator(`[data-resource-rail-for="${id}"]`);
}

/**
 * Everything a Resource offers: its own face and its floating toolbar. Selects the
 * Resource first when its toolbar is not drawn, since the toolbar exists only
 * while the Resource is selected or an edit is running (ADR 0102).
 */
export async function resourceControls(page: Page, resource: Locator): Promise<Locator> {
  const toolbar = await resourceToolbar(page, resource);
  if ((await toolbar.count()) === 0) await selectResource(resource);
  return resource.or(toolbar);
}

/**
 * Assert a menu's rows read as the given groups, in order, with exactly one
 * separator between each pair of groups — the one grouping grammar every
 * entity, Map, Graph and Space menu in this product shares.
 *
 * Reads the ordered `menuitem` / `menuitemradio` / `separator` rows rather
 * than `role="group"`, because that is the one shape every menu here
 * supports: the Map and Graph command lists (`MapMenuActions`,
 * `GraphMenuActions`) do render a `role="group"` per group, but the Resource
 * and Space Resource entity menus (`EntityActionsMenu`) deliberately do not —
 * its own `MenuGroup` doc comment explains why. A matching separator count
 * in the wrong place still fails.
 */
export async function expectMenuGroups(
  menu: Locator,
  groups: readonly (readonly (string | RegExp)[])[],
): Promise<void> {
  const rows = menu.locator('[role="menuitem"], [role="menuitemradio"], [role="separator"]');
  const expected: (string | RegExp)[] = [];
  for (const [index, group] of groups.entries()) {
    if (index > 0) expected.push('separator');
    expected.push(...group);
  }
  await expect(rows).toHaveCount(expected.length);
  for (const [index, row] of expected.entries()) {
    const locator = rows.nth(index);
    if (row === 'separator') {
      await expect(locator).toHaveAttribute('role', 'separator');
      continue;
    }
    await expect(locator).toHaveText(row);
  }
}
