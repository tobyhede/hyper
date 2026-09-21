import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeCompactUuid, type SpaceSnapshot, type UUID } from '@project/core';
import type { SpaceRepository } from '../../src/persistence/space-repository';
import { exportAggregate } from '../../src/export/export-aggregate';
import { AGGREGATE_FILE_NAME } from '../../src/aggregate-directory';
import { dragBy, nodeByTitle, positionOf, settled } from '../../packages/app/e2e/graph';

/**
 * The drag-and-read-back steps a browser durability proof spends against a
 * fresh Vite host, shared between `test/e2e/postgres-persistence.spec.ts` and
 * `test/e2e/sqlite-persistence.spec.ts` so a change to the Space's chrome
 * breaks both proofs at once rather than only the one a reviewer remembered to
 * update.
 */

export interface OpenedStoredSpace {
  readonly context: BrowserContext;
  readonly page: Page;
}

export const restartProofFixture = (input: {
  readonly spaceId: UUID;
  readonly resourceId: UUID;
  readonly mapId: UUID;
  readonly graphId: UUID;
  readonly title: string;
}): SpaceSnapshot => ({
  id: input.spaceId,
  document: {
    version: 1,
    title: input.title,
    maps: [
      {
        id: input.mapId,
        title: 'Map 1',
        kind: 'positioned',
        positions: { [input.resourceId]: { x: 0, y: 0, open: false } },
        graphs: [{ id: input.graphId, title: 'Graph 1', edges: [] }],
        activeGraph: input.graphId,
      },
    ],
    defaultMap: input.mapId,
  },
  resources: [
    {
      id: input.resourceId,
      document: { title: 'Restart resource', kind: 'markdown', body: 'Durable.' },
    },
  ],
});

export async function expectRestartProofExport(
  repository: SpaceRepository,
  fixture: SpaceSnapshot,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'hyper-restart-proof-export-'));
  try {
    await expect(exportAggregate(repository, directory)).resolves.toMatchObject({
      kind: 'exported',
    });
    const aggregateFile: unknown = JSON.parse(
      await readFile(join(directory, AGGREGATE_FILE_NAME), 'utf8'),
    );
    expect(aggregateFile).toEqual({ version: 1, metaSpaceId: fixture.id });
    const spaceFile: unknown = JSON.parse(
      await readFile(join(directory, fixture.id, 'space.json'), 'utf8'),
    );
    expect(spaceFile).toMatchObject({ id: fixture.id, title: fixture.document.title });
    await expect(repository.loadSpace(fixture.id)).resolves.toMatchObject({
      revision: 1n,
      exportedRevision: 1n,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * Open a Space already stored at `spaceId`, and wait for the Dock to name it.
 *
 * **The Space's name is a label, not a heading** (ADR 0082). The Space
 * Sidebar drew it as an `h1`; the Command Dock draws it through the same
 * `IdentityName` the Map and Graph use, and a name with no rename Edit
 * behind it renders as a `span` rather than as a button or a heading —
 * renaming a Space is not built (`.scratch/command-dock/issues/09`). So the
 * slot is addressed the way every other spec addresses it, and the visible
 * filter is the open-Spaces rule: every open Space stays mounted, and only
 * the one on the canvas is showing.
 * `toContainText`, which is the matcher `space-resource.spec.ts` spends on this
 * same locator and the one actually proven green against the Dock. The title
 * carries the Space's own UUID, so containment is unambiguous here.
 */
export async function openStoredSpace(
  browser: Browser,
  baseURL: string,
  spaceId: UUID,
  title: string,
): Promise<OpenedStoredSpace> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto(`/spaces/${encodeCompactUuid(spaceId)}`);
  await expect(page.locator('[data-testid="space-title"]:visible')).toContainText(title);
  return { context, page };
}

/**
 * Drag the named Resource by a flow-space delta, wait for the commit to reach
 * `revision`, and answer where React Flow actually put it.
 */
export async function dragResourceAndCapturePosition(
  page: Page,
  title: string,
  dx: number,
  dy: number,
  revision: string,
): Promise<{ x: number; y: number }> {
  const resource = nodeByTitle(page, title);
  await settled(page);
  await dragBy(page, resource, dx, dy);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', revision);
  return positionOf(resource);
}

/**
 * Assert the named Resource reappears at `position` on a freshly opened host,
 * once it reports `revision`.
 */
export async function expectResourceRestoredAt(
  page: Page,
  title: string,
  position: { x: number; y: number },
  revision: string,
): Promise<void> {
  const reloaded = nodeByTitle(page, title);
  await expect(reloaded).toBeVisible();
  await settled(page);
  expect(await positionOf(reloaded)).toEqual(position);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', revision);
}
