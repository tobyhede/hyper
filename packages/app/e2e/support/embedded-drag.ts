import { expect, type Locator, type Page } from '@playwright/test';

const boxOf = async (locator: Locator, description: string) => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${description} was not drawn`);
  return box;
};

const centreOf = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

/**
 * Turn a resting offset into the one the same rigid motion puts it at.
 *
 * A dragged Space Resource leans, and its embedded canvas leans with it about the
 * same centre — so an embedded Resource keeps its *distance* from the containing
 * Resource through a drag and not its x and y. Comparing raw offsets only holds
 * while nothing leans, which is what this helper used to assume.
 */
/**
 * The lean, read from the Resource that publishes it rather than imported.
 *
 * `@project/ui`'s barrel pulls its stylesheets, which Playwright's loader
 * cannot parse — and reading the live custom property is the better evidence
 * anyway: it holds the assertion to the angle the application is actually
 * drawing with rather than to a second copy of the number.
 */
const publishedLean = async (child: Locator): Promise<number> => {
  const declared = await child.evaluate((node) => {
    const resource = node.querySelector('.canvas-resource') ?? node;
    return getComputedStyle(resource).getPropertyValue('--canvas-resource-drag-tilt');
  });
  const degrees = Number.parseFloat(declared);
  if (!Number.isFinite(degrees))
    throw new Error(`The embedded Resource publishes no drag lean, only "${declared}"`);
  return degrees;
};

const leaned = (offset: { x: number; y: number }, degrees: number) => {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: offset.x * cos - offset.y * sin, y: offset.x * sin + offset.y * cos };
};

/** Assert rigid parent, child and optional connector motion before and after release. */
export async function expectEmbeddedResourceToFollowDrag(
  page: Page,
  parent: Locator,
  child: Locator,
  connectors: readonly Locator[] = [],
  incident?: { readonly connector: Locator; readonly endpoint: 'source' | 'target' },
): Promise<void> {
  const beforeParent = await boxOf(parent, 'The Open Space Resource');
  const beforeChild = await boxOf(child, 'The embedded Resource');
  // Centres, not corners: the lean turns each Resource about its own centre too,
  // so a corner moves by the box's own rotation as well as the group's.
  const beforeParentCentre = centreOf(beforeParent);
  const offset = {
    x: centreOf(beforeChild).x - beforeParentCentre.x,
    y: centreOf(beforeChild).y - beforeParentCentre.y,
  };
  const connectorOffsets = await Promise.all(
    connectors.map(async (connector) => {
      const box = await boxOf(connector, 'A connector');
      return {
        x: centreOf(box).x - beforeParentCentre.x,
        y: centreOf(box).y - beforeParentCentre.y,
      };
    }),
  );
  const endpointOf = async ({ connector, endpoint }: NonNullable<typeof incident>) =>
    connector
      .locator('path')
      .first()
      .evaluate((geometry: SVGGeometryElement, requested) => {
        const point = geometry.getPointAtLength(
          requested === 'source' ? 0 : geometry.getTotalLength(),
        );
        const matrix = geometry.getScreenCTM();
        if (matrix === null) throw new Error('The connector has no screen transform');
        return new DOMPoint(point.x, point.y).matrixTransform(matrix);
      }, endpoint);
  const incidentOffset =
    incident === undefined
      ? undefined
      : await endpointOf(incident).then((point) => ({
          x: point.x - beforeParentCentre.x,
          y: point.y - beforeParentCentre.y,
        }));

  const geometry = async (parentDescription: string, childDescription: string) => ({
    parent: await boxOf(parent, parentDescription),
    child: await boxOf(child, childDescription),
    connectors: await Promise.all(
      connectors.map((connector) => boxOf(connector, 'A moving connector')),
    ),
    incident: incident === undefined ? undefined : await endpointOf(incident),
  });
  /**
   * `degrees` is the lean the containing Resource is under for this sample: the
   * drag angle while the pointer is down, and zero once it is released. Passing
   * it explicitly is what keeps this an assertion about a *rigid* motion rather
   * than a tolerance wide enough to accept a drifting one.
   */
  const expectAligned = (
    sample: Awaited<ReturnType<typeof geometry>>,
    expectedOffset: typeof offset,
    degrees: number,
  ) => {
    const parentCentre = centreOf(sample.parent);
    const expected = leaned(expectedOffset, degrees);

    expect(Math.abs(centreOf(sample.child).x - parentCentre.x - expected.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(centreOf(sample.child).y - parentCentre.y - expected.y)).toBeLessThanOrEqual(3);
    for (const [index, connector] of sample.connectors.entries()) {
      const connectorOffset = connectorOffsets[index];
      if (connectorOffset === undefined) throw new Error('A connector lost its initial geometry');
      const turned = leaned(connectorOffset, degrees);
      expect(Math.abs(centreOf(connector).x - parentCentre.x - turned.x)).toBeLessThanOrEqual(3);
      expect(Math.abs(centreOf(connector).y - parentCentre.y - turned.y)).toBeLessThanOrEqual(3);
    }
    if (sample.incident !== undefined && incidentOffset !== undefined) {
      const turned = leaned(incidentOffset, degrees);
      // An Edge endpoint is allowed more room than a Resource, and only while the
      // Resource turns. React Flow builds an endpoint from the node position plus
      // a handle offset it measured once, and this canvas rotates the position
      // and cannot rotate that offset. So the endpoint lags its handle by
      // `(I - R) * offset`, which is the offset's distance from the Resource's
      // corner times the angle in radians — about 5px on a collapsed Resource at
      // one degree. The lag is along the Resource's border rather than away from
      // it, nothing stores it, and release returns the endpoint exactly.
      // `degrees` is zero for the released and settled samples, where this is
      // therefore still the same 3px as everything else.
      const room = degrees === 0 ? 3 : 6;
      expect(Math.abs(sample.incident.x - parentCentre.x - turned.x)).toBeLessThanOrEqual(room);
      expect(Math.abs(sample.incident.y - parentCentre.y - turned.y)).toBeLessThanOrEqual(room);
    }
  };
  const samePoint = (left: { x: number; y: number }, right: { x: number; y: number }) =>
    Math.abs(left.x - right.x) <= 0.5 && Math.abs(left.y - right.y) <= 0.5;
  const isStable = (
    current: Awaited<ReturnType<typeof geometry>>,
    previous: Awaited<ReturnType<typeof geometry>>,
  ) =>
    samePoint(current.parent, previous.parent) &&
    samePoint(current.child, previous.child) &&
    current.connectors.every((connector, index) => {
      const previousConnector = previous.connectors[index];
      return previousConnector !== undefined && samePoint(connector, previousConnector);
    }) &&
    (current.incident === undefined ||
      (previous.incident !== undefined && samePoint(current.incident, previous.incident)));

  // Left inset, below the floating rail. The rail is a full-width strip with
  // `pointer-events: auto` on its actions when revealed, and Map + Graph
  // clusters make those actions wide enough to cover the horizontal centre
  // (`canvas-resource.css`, `ResourceRailActions`).
  const lean = await publishedLean(child);
  const grab = { x: beforeParent.x + 8, y: beforeParent.y + 80 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(grab.x + (150 * step) / 12, grab.y + (80 * step) / 12);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    // The first frame of the gesture is exempt, and only that one. React Flow
    // leans the Resource from its own store in the render that starts the drag,
    // while the canvas inside it is republished through an effect
    // (`EmbeddedMapAuthoring` publishes, `SpaceCanvas` merges) and so lands
    // one frame later. Every frame after it, the release and the settled state
    // are held to the rigid motion exactly.
    if (step > 1)
      expectAligned(
        await geometry('The dragged Space Resource', 'The moving embedded Resource'),
        offset,
        lean,
      );
  }

  const during = await geometry('The dragged Space Resource', 'The moving embedded Resource');
  expect(during.parent.x - beforeParent.x).toBeGreaterThan(100);
  expect(during.parent.y - beforeParent.y).toBeGreaterThan(50);

  await page.mouse.up();
  // Released, so the lean is gone and the resting offset is the one again.
  const released = await geometry('The released Space Resource', 'The released embedded Resource');
  expectAligned(released, offset, 0);

  let previous = released;
  let settled = released;
  await expect
    .poll(async () => {
      await page.evaluate(() => new Promise(requestAnimationFrame));
      settled = await geometry('The settled Space Resource', 'The retained embedded Resource');
      const stable = isStable(settled, previous);
      previous = settled;
      return stable;
    })
    .toBe(true);
  expectAligned(settled, offset, 0);
}
