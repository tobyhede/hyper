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

/** Routes are a space's only structure, so every Edge the graph draws is one of
 *  a Route's authored `{from, to}` pairs. */
export const FIXTURE_EDGE_COUNT = (
  JSON.parse(readFileSync(`${fixtureDir}/space.json`, 'utf8')) as {
    routes: readonly { edges: readonly unknown[] }[];
  }
).routes.reduce((total, route) => total + route.edges.length, 0);

/** Authoring presents one handle per side of a Card, source and target alike —
 *  four sides, route-independent (ADR 0033). */
export const AUTHORING_HANDLE_SIDES = 4;

/* -------------------------------------------------------------------------- */
/* Locating and driving                                                        */
/* -------------------------------------------------------------------------- */

export function nodeByTitle(page: Page, title: string): Locator {
  return page
    .locator('.react-flow__node')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

/** Where React Flow has actually put a node, in flow coordinates. */
export async function positionOf(node: Locator): Promise<{ x: number; y: number }> {
  return node.evaluate((el) => {
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
 * Once the layout resolves, `ViewController` runs an animated `fitView`. A
 * bounding box read during it is stale by the time the mouse gets there, so
 * mousedown lands beside the card and no drag starts — a failure that looks
 * exactly like dragging being broken.
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

/** Drag by a flow-space delta, scaled through the current zoom. */
export async function dragBy(page: Page, node: Locator, dx: number, dy: number): Promise<void> {
  await settled(page);
  const box = (await node.boundingBox())!;
  const zoom = Number(/scale\(([\d.]+)\)/.exec(await viewportTransform(page))?.[1] ?? 1);

  // Grab the card's header rather than its centre: the body scrolls its markdown
  // and the ports sit at the edges.
  await page.mouse.move(box.x + box.width / 2, box.y + 12);
  await page.mouse.down();
  // React Flow starts a drag on the first move after mousedown; a single jump
  // can be swallowed, so move twice.
  await page.mouse.move(box.x + box.width / 2 + (dx * zoom) / 2, box.y + 12 + (dy * zoom) / 2, {
    steps: 5,
  });
  await page.mouse.move(box.x + box.width / 2 + dx * zoom, box.y + 12 + dy * zoom, { steps: 5 });
  await page.mouse.up();
}

/** Which side of a Card an authoring handle sits on. The side is interaction
 *  geometry and is never authored (ADR 0033). */
export type HandleSide = 'top' | 'right' | 'bottom' | 'left';

/** A Card's route-independent authoring handle on one side. */
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
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // React Flow starts the connection on the first move after mousedown, and a
  // single jump can be swallowed — the same reason `dragBy` moves in steps.
  await page.mouse.move(from.x + from.width / 2 + 30, from.y + from.height / 2, { steps: 4 });

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
  const from = (await sourceHandle.boundingBox())!;
  const pane = (await page.locator('.react-flow__pane').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 30, from.y + from.height / 2, { steps: 4 });
  await page.keyboard.down('Alt');
  await page.mouse.move(pane.x + 36, pane.y + 36, { steps: 4 });
  const preview = page.getByTestId('new-card-preview');
  await expect(preview).toBeVisible();
  const position = await positionOf(preview);
  await page.mouse.up();
  await page.keyboard.up('Alt');
  return position;
}
