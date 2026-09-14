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

  await page.mouse.move(beforeParent.x + beforeParent.width / 2, beforeParent.y + 24);
  await page.mouse.down();
  await page.mouse.move(beforeParent.x + beforeParent.width / 2 + 150, beforeParent.y + 104, {
    steps: 12,
  });

  const duringParent = await boxOf(parent, 'The dragged Space Thing');
  const duringChild = await boxOf(child, 'The moving embedded Thing');
  expect(duringParent.x - beforeParent.x).toBeGreaterThan(100);
  expect(duringParent.y - beforeParent.y).toBeGreaterThan(50);
  expect(Math.abs(duringChild.x - duringParent.x - offset.x)).toBeLessThanOrEqual(3);
  expect(Math.abs(duringChild.y - duringParent.y - offset.y)).toBeLessThanOrEqual(3);
  for (const [index, connector] of connectors.entries()) {
    const connectorOffset = connectorOffsets[index];
    if (connectorOffset === undefined) throw new Error('A connector lost its initial geometry');
    const duringConnector = await boxOf(connector, 'A moving connector');
    expect(Math.abs(duringConnector.x - duringParent.x - connectorOffset.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(duringConnector.y - duringParent.y - connectorOffset.y)).toBeLessThanOrEqual(3);
  }
  if (incident !== undefined && incidentOffset !== undefined) {
    const point = await endpointOf(incident);
    expect(Math.abs(point.x - duringParent.x - incidentOffset.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(point.y - duringParent.y - incidentOffset.y)).toBeLessThanOrEqual(3);
  }

  await page.mouse.up();
  await page.waitForTimeout(250);
  const settledParent = await boxOf(parent, 'The settled Space Thing');
  const settledChild = await boxOf(child, 'The retained embedded Thing');
  expect(Math.abs(settledChild.x - settledParent.x - offset.x)).toBeLessThanOrEqual(3);
  expect(Math.abs(settledChild.y - settledParent.y - offset.y)).toBeLessThanOrEqual(3);
}
