import { expect, type Locator, type Page } from '@playwright/test';

const boxOf = async (locator: Locator, description: string) => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${description} was not drawn`);
  return box;
};

/** Assert rigid parent, child and optional connector translation before and after release. */
export async function expectEmbeddedThingToFollowDrag(
  page: Page,
  parent: Locator,
  child: Locator,
  connectors: readonly Locator[] = [],
  incident?: { readonly connector: Locator; readonly endpoint: 'source' | 'target' },
): Promise<void> {
  const beforeParent = await boxOf(parent, 'The Open Space Thing');
  const beforeChild = await boxOf(child, 'The embedded Thing');
  const offset = { x: beforeChild.x - beforeParent.x, y: beforeChild.y - beforeParent.y };
  const connectorOffsets = await Promise.all(
    connectors.map(async (connector) => {
      const box = await boxOf(connector, 'A connector');
      return { x: box.x - beforeParent.x, y: box.y - beforeParent.y };
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
          x: point.x - beforeParent.x,
          y: point.y - beforeParent.y,
        }));

  const geometry = async (parentDescription: string, childDescription: string) => ({
    parent: await boxOf(parent, parentDescription),
    child: await boxOf(child, childDescription),
    connectors: await Promise.all(
      connectors.map((connector) => boxOf(connector, 'A moving connector')),
    ),
    incident: incident === undefined ? undefined : await endpointOf(incident),
  });
  const expectAligned = (
    sample: Awaited<ReturnType<typeof geometry>>,
    expectedOffset: typeof offset,
  ) => {
    expect(Math.abs(sample.child.x - sample.parent.x - expectedOffset.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(sample.child.y - sample.parent.y - expectedOffset.y)).toBeLessThanOrEqual(3);
    for (const [index, connector] of sample.connectors.entries()) {
      const connectorOffset = connectorOffsets[index];
      if (connectorOffset === undefined) throw new Error('A connector lost its initial geometry');
      expect(Math.abs(connector.x - sample.parent.x - connectorOffset.x)).toBeLessThanOrEqual(3);
      expect(Math.abs(connector.y - sample.parent.y - connectorOffset.y)).toBeLessThanOrEqual(3);
    }
    if (sample.incident !== undefined && incidentOffset !== undefined) {
      expect(Math.abs(sample.incident.x - sample.parent.x - incidentOffset.x)).toBeLessThanOrEqual(
        3,
      );
      expect(Math.abs(sample.incident.y - sample.parent.y - incidentOffset.y)).toBeLessThanOrEqual(
        3,
      );
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

  await page.mouse.move(beforeParent.x + beforeParent.width / 2, beforeParent.y + 24);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(
      beforeParent.x + beforeParent.width / 2 + (150 * step) / 12,
      beforeParent.y + 24 + (80 * step) / 12,
    );
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expectAligned(await geometry('The dragged Space Thing', 'The moving embedded Thing'), offset);
  }

  const during = await geometry('The dragged Space Thing', 'The moving embedded Thing');
  expect(during.parent.x - beforeParent.x).toBeGreaterThan(100);
  expect(during.parent.y - beforeParent.y).toBeGreaterThan(50);

  await page.mouse.up();
  const released = await geometry('The released Space Thing', 'The released embedded Thing');
  expectAligned(released, offset);

  let previous = released;
  let settled = released;
  await expect
    .poll(async () => {
      settled = await geometry('The settled Space Thing', 'The retained embedded Thing');
      const stable = isStable(settled, previous);
      previous = settled;
      return stable;
    })
    .toBe(true);
  expectAligned(settled, offset);
}
