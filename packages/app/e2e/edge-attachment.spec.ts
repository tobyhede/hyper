import { COLLAPSED_THING_SIZE } from '@project/core';
import { expect, test, type Page } from './fixtures';
import {
  authoringHandle,
  connectHandles,
  dragBy,
  nodeByTitle,
  positionOf,
  selectCanvas,
  settled,
} from './graph';

/**
 * Where an Edge meets a Thing (ADR 0087).
 *
 * An Edge attaches to the anchor on the side that faces the other Thing, chosen
 * while it is drawn from where the two Things are at that moment. Nothing about
 * it is stored, and nothing decides it before the frame it is drawn in — which
 * is why these are browser tests: the rule itself is a pure function of two
 * rects and is covered in the node environment, and what only a browser can show
 * is that the side is right *during* a drag and not merely after it.
 */

/** Half the 24-unit anchor. React Flow puts an Edge's end on the outer rim of the
 *  handle it attaches to, which is the border plus this. */
const RADIUS = 12;

type Side = 'top' | 'right' | 'bottom' | 'left';

/** A point on the canvas, in flow coordinates. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/** Where an Edge meets one side of a Thing at the given flow position. */
function anchorAt(at: Point, side: Side): Point {
  const { width, height } = COLLAPSED_THING_SIZE;
  switch (side) {
    case 'top':
      return { x: at.x + width / 2, y: at.y - RADIUS };
    case 'right':
      return { x: at.x + width + RADIUS, y: at.y + height / 2 };
    case 'bottom':
      return { x: at.x + width / 2, y: at.y + height + RADIUS };
    case 'left':
      return { x: at.x - RADIUS, y: at.y + height / 2 };
  }
}

/**
 * The two ends of a drawn Edge, in flow coordinates.
 *
 * `getBezierPath` writes `M<sourceX>,<sourceY> C… <targetX>,<targetY>`, and the
 * SVG sits inside React Flow's transformed viewport, so these are the same
 * coordinates a node's own transform is written in.
 */
async function endsOf(page: Page, edge: string): Promise<{ from: Point; to: Point }> {
  const d = await page
    .locator(`.react-flow__edge[data-id="${edge}"] .react-flow__edge-path`)
    .getAttribute('d');
  if (d === null) throw new Error(`Edge ${edge} drew no path.`);
  const numbers = d.match(/-?\d+(?:\.\d+)?/g) ?? [];
  expect(numbers, `path "${d}" should be a bezier with four points`).toHaveLength(8);
  const at = (index: number): Point => ({
    x: Number(numbers[index]),
    y: Number(numbers[index + 1]),
  });
  return { from: at(0), to: at(6) };
}

/** Playwright's pointer arithmetic lands within a unit or two of the delta asked
 *  for, so an anchor is compared to the position the canvas actually reports. */
const near = (actual: Point, expected: Point, what: string): void => {
  expect(Math.abs(actual.x - expected.x), `${what} x`).toBeLessThan(2);
  expect(Math.abs(actual.y - expected.y), `${what} y`).toBeLessThan(2);
};

/** The fixture's Long Graph, and the Edge it draws from A to B. An Edge is
 *  identified by its Graph and its two endpoints (`graphRenderEdgeId`). */
const LONG = '00000000-0000-4000-8000-000000000023';
const THING_A = '00000000-0000-4000-8000-000000000002';
const THING_B = '00000000-0000-4000-8000-000000000003';
const A_TO_B = `${LONG}::${THING_A}::${THING_B}`;
const A_TO_A = `${LONG}::${THING_A}::${THING_A}`;

test('an Edge leaves and enters on the sides the two Things face', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  const b = nodeByTitle(page, 'B').first();
  await expect(a).toBeVisible();
  await settled(page);

  // A sits to the left of B, clear of it horizontally and level with it, so the
  // Edge crosses the gap: out of A's right side and into B's left.
  {
    const [from, to] = [await positionOf(a), await positionOf(b)];
    const ends = await endsOf(page, A_TO_B);
    near(ends.from, anchorAt(from, 'right'), 'the Edge leaving A');
    near(ends.to, anchorAt(to, 'left'), 'the Edge entering B');
  }

  // Put A below B. Nothing about the Edge is authored, so what changes is only
  // where the two Things are — and the Edge now leaves A's top and enters B's
  // bottom.
  await dragBy(page, a, 420, 488);
  await settled(page);
  {
    const [from, to] = [await positionOf(a), await positionOf(b)];
    expect(from.y, 'A should have landed below B').toBeGreaterThan(to.y + 300);
    const ends = await endsOf(page, A_TO_B);
    near(ends.from, anchorAt(from, 'top'), 'the Edge leaving A');
    near(ends.to, anchorAt(to, 'bottom'), 'the Edge entering B');
  }
});

test('the attachment follows the drag rather than waiting for the release', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await settled(page);
  const atRest = await endsOf(page, A_TO_B);

  // Read mid-gesture, with the pointer still down. This is the whole reason the
  // side is chosen in the Edge rather than in the projection: the projection
  // does not run again during a drag — the render adapter splices React Flow's
  // live positions into the published projection and leaves the Edges as they
  // were — so an Edge that took its side from there would stay on A's right and
  // cross A until the author let go.
  await dragBy(page, a, 420, 488, async () => {
    const moving = await positionOf(a);
    const ends = await endsOf(page, A_TO_B);
    expect(ends.from, 'the Edge should not still leave where it did at rest').not.toEqual(
      atRest.from,
    );
    near(ends.from, anchorAt(moving, 'top'), 'the Edge leaving A mid-drag');
  });
});

test('a self-Edge draws a visible loop', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await settled(page);
  const before = await page.locator('.react-flow__edge').count();

  // A Graph may hold an Edge from a Thing to itself (ADR 0032). The facing rule
  // divides by the vector between two centres, which is zero here, and React
  // Flow draws a `NaN` path as nothing at all — so this case is taken first.
  await a.hover();
  await connectHandles(
    page,
    authoringHandle(a, 'source', 'right'),
    authoringHandle(a, 'target', 'top'),
  );
  await expect(page.locator('.react-flow__edge')).toHaveCount(before + 1);
  await settled(page);

  // Two adjacent sides, so the curve goes round the corner rather than doubling
  // back through the Thing it belongs to.
  const at = await positionOf(a);
  const ends = await endsOf(page, A_TO_A);
  near(ends.from, anchorAt(at, 'right'), 'the self-Edge leaving A');
  near(ends.to, anchorAt(at, 'top'), 'the self-Edge entering A');

  // And nothing anywhere draws `NaN`, which React Flow renders as no line at all.
  const paths = await page
    .locator('.react-flow__edge-path')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('d') ?? ''));
  expect(paths.every((d) => d.length > 0 && !d.includes('NaN'))).toBe(true);
});

test('several Graphs over one pair of Things share the anchors and keep their colours', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  // Long, Mid and Short all carry A → B. Four anchors are Graph-independent, so
  // every Graph joining the same two Things resolves to the same two points and
  // the three lines coincide. **This is ADR 0087's stated cost**, accepted
  // deliberately: colour and the Active Graph's emphasis are what separate them,
  // and fanning is a decision to take against `.scratch/multiple-routes`'
  // measured finding rather than a rule to build in now.
  const between = await page.locator('.react-flow__edge-path').evaluateAll((elements) =>
    elements.map((element) => ({
      d: element.getAttribute('d') ?? '',
      stroke: getComputedStyle(element).stroke,
    })),
  );
  const shared = between.filter((edge) => edge.d === between[0]?.d);
  expect(shared.length, 'three Graphs carry A → B').toBe(3);
  expect(new Set(shared.map((edge) => edge.stroke)).size, 'each in its own colour').toBe(3);
});

test('a selected Edge draws its controls on the geometry it moved to', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await settled(page);

  await dragBy(page, a, 420, 488);
  await settled(page);

  // Click the drawn path's own middle, which is where the controls must arrive:
  // both come from one `useRoutedEdgeGeometry`, so a disagreement between them
  // would be a disagreement with what is on screen.
  const middle = await page
    .locator(`.react-flow__edge[data-id="${A_TO_B}"] .react-flow__edge-path`)
    .first()
    .evaluate((path) => {
      // Narrowed rather than asserted: what the selector matches is React Flow's
      // own `<path>`, and the browser is where that can be checked instead of
      // claimed.
      if (!(path instanceof SVGPathElement)) throw new Error('The Edge drew no path element.');
      const transform = path.getScreenCTM();
      if (transform === null) throw new Error('The Edge has no screen transform.');
      const at = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(transform);
      return { x: at.x, y: at.y };
    });
  await page.mouse.click(middle.x, middle.y);
  await expect(page.locator('.react-flow__edge.selected')).toHaveCount(1);

  const controls = page.getByTestId('edge-edit');
  await expect(controls).toBeVisible();
  const box = (await controls.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - middle.x)).toBeLessThan(box.width + 8);
  expect(Math.abs(box.y + box.height / 2 - middle.y)).toBeLessThan(8);
});
