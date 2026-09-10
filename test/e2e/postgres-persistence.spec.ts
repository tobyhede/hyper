import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { encodeCompactUuid, newUuid, type UUID } from '@project/core';
import { createServer, type ViteDevServer } from 'vite';
import { PostgresSpaceRepository } from '../../src/persistence/postgres-space-repository';
import { db } from '../../src/prisma/db';
import { clearHyperContent } from '../support/clear-hyper-content';
import { dragBy, nodeByTitle, positionOf, settled } from '../../packages/app/e2e/graph';
import { POSTGRES_E2E_PORT } from '../../packages/app/e2e/projects';

const appRoot = fileURLToPath(new URL('../../packages/app', import.meta.url));
const configFile = fileURLToPath(new URL('../../packages/app/vite.config.ts', import.meta.url));

const startHost = async (): Promise<{ server: ViteDevServer; baseURL: string }> => {
  const server = await createServer({
    root: appRoot,
    configFile,
    mode: 'postgres-e2e',
    // Below the default suite's `E2E_PORT_BASE + workerIndex` range, which no
    // worker index can reach downward: this project is opt-in and may be running
    // beside a normal `pnpm e2e`, and `strictPort` turns any overlap into a
    // failure that blames the wrong thing.
    server: { host: '127.0.0.1', port: POSTGRES_E2E_PORT, strictPort: true },
  });
  try {
    await server.listen();
    const baseURL = server.resolvedUrls?.local[0];
    if (baseURL === undefined) throw new Error('Vite did not publish a loopback URL');
    return { server, baseURL };
  } catch (error) {
    // The caller only learns of a server it can close on success, so a failure
    // between here and the return would strand one holding the fixed port —
    // and the retry of a `strictPort` host then fails for the wrong reason.
    await server.close();
    throw error;
  }
};

const openImportedSpace = async (
  browser: Browser,
  baseURL: string,
  spaceId: UUID,
  title: string,
): Promise<{ context: BrowserContext; page: Page }> => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto(`/spaces/${encodeCompactUuid(spaceId)}`);
  // **The Space's name is a label, not a heading** (ADR 0082). The Space
  // Sidebar drew it as an `h1`; the Command Dock draws it through the same
  // `IdentityName` the Diagram and Graph use, and a name with no rename Edit
  // behind it renders as a `span` rather than as a button or a heading —
  // renaming a Space is not built (`.scratch/command-dock/issues/09`). So the
  // slot is addressed the way every other spec addresses it, and the visible
  // filter is the open-Spaces rule: every open Space stays mounted, and only
  // the one on the canvas is showing.
  // `toContainText`, which is the matcher `space-card.spec.ts` spends on this
  // same locator and the one actually proven green against the Dock. The title
  // carries the Space's own UUID, so containment is unambiguous here.
  await expect(page.locator('[data-testid="space-title"]:visible')).toContainText(title);
  return { context, page };
};

test('a PostgreSQL-backed edit survives a fresh Vite host', async ({ browser }) => {
  const repository = new PostgresSpaceRepository(db);
  const spaceId = newUuid();
  const cardId = newUuid();
  const diagramId = newUuid();
  const graphId = newUuid();
  const title = `HTTP restart ${spaceId}`;
  let firstHost: ViteDevServer | undefined;
  let secondHost: ViteDevServer | undefined;
  let firstContext: BrowserContext | undefined;
  let secondContext: BrowserContext | undefined;
  let spaceRemains: boolean | undefined;

  try {
    // The Diagram is part of the fixture, and has to be. A diagramless Space is
    // initialized on its first working load (ADR 0079), and that initialization
    // mints an *empty* Diagram — `positions: {}` in `working-space.ts`. The
    // imported Card would then belong to the Space and to no Diagram, so the
    // canvas would draw nothing and `nodeByTitle` below would wait out the
    // timeout with the Card sitting in the Cards drawer. Placing the Card here
    // also keeps this test about durability alone: initialization is a write,
    // and an unasked-for write is one more thing between the drag and the
    // revision this asserts.
    const imported = await repository.importSpaces([
      {
        id: spaceId,
        document: {
          version: 1,
          title,
          diagrams: [
            {
              id: diagramId,
              title: 'Diagram 1',
              kind: 'positioned',
              positions: { [cardId]: { x: 0, y: 0, open: false } },
              graphs: [{ id: graphId, title: 'Graph 1', edges: [] }],
              activeGraph: graphId,
            },
          ],
          defaultDiagram: diagramId,
        },
        cards: [
          {
            id: cardId,
            document: { title: 'Restart card', kind: 'markdown', body: 'Durable.' },
          },
        ],
      },
    ]);
    if (imported.kind !== 'imported') throw new Error(imported.message);

    const first = await startHost();
    firstHost = first.server;
    const openedFirst = await openImportedSpace(browser, first.baseURL, spaceId, title);
    firstContext = openedFirst.context;
    const card = nodeByTitle(openedFirst.page, 'Restart card');
    await settled(openedFirst.page);
    await dragBy(openedFirst.page, card, 0, 220);
    await expect(openedFirst.page.getByTestId('persistence-status')).toHaveAttribute(
      'data-revision',
      '1',
    );
    const durablePosition = await positionOf(card);

    await firstContext.close();
    firstContext = undefined;
    await firstHost.close();
    firstHost = undefined;

    const stored = await repository.loadSpace(spaceId);
    expect(stored?.revision).toBe(1n);

    const second = await startHost();
    secondHost = second.server;
    const openedSecond = await openImportedSpace(browser, second.baseURL, spaceId, title);
    secondContext = openedSecond.context;
    const reloaded = nodeByTitle(openedSecond.page, 'Restart card');
    await expect(reloaded).toBeVisible();
    await settled(openedSecond.page);
    expect(await positionOf(reloaded)).toEqual(durablePosition);
    await expect(openedSecond.page.getByTestId('persistence-status')).toHaveAttribute(
      'data-revision',
      '1',
    );
  } finally {
    await secondContext?.close();
    await firstContext?.close();
    await secondHost?.close();
    await firstHost?.close();
    // Cleanup records what it observed rather than asserting it. An assertion
    // here throws over whatever failure sent us into this block, and would also
    // strand the connection below unclosed.
    try {
      // Not a per-Space delete, because on a fresh database this Space *is* the
      // Meta Space: `importSpaces` takes the `initializeAggregate` branch when no
      // Meta identity is stored, and makes the first Space imported the Meta one.
      // `repository_state_meta_space_id_fkey` is `Restrict`, so deleting it then
      // fails — which the integration suite asserts on purpose, in *prevents
      // direct deletion of the Meta Space while repository state names it*. That
      // is also why this passes on a developer's database and failed in CI: a
      // database that already holds a Meta Space takes the ordinary insert branch
      // and the old cleanup had nothing to trip over.
      //
      // `clearHyperContent` drops the repository-state row first, which is what
      // releases the key, and it is the same reset the integration suite runs.
      // Safe here for the reason it is safe there: `workers: 1` and one test, so
      // nothing else holds this `DATABASE_URL`.
      await clearHyperContent();
      spaceRemains = (await repository.loadSpace(spaceId)) !== undefined;
    } finally {
      await db.close();
    }
  }

  expect(spaceRemains).toBe(false);
});
