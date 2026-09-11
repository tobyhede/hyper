import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { encodeCompactUuid, newUuid, type UUID } from '@project/core';
import { createServer, type ViteDevServer } from 'vite';
import { exportAggregate } from '../../src/export/export-aggregate';
import { AGGREGATE_FILE_NAME } from '../../src/import/read-aggregate';
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

const openStoredSpace = async (
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
  // `toContainText`, which is the matcher `space-thing.spec.ts` spends on this
  // same locator and the one actually proven green against the Dock. The title
  // carries the Space's own UUID, so containment is unambiguous here.
  await expect(page.locator('[data-testid="space-title"]:visible')).toContainText(title);
  return { context, page };
};

test('a PostgreSQL-backed edit survives a fresh Vite host', async ({ browser }) => {
  const repository = new PostgresSpaceRepository(db);
  const spaceId = newUuid();
  const thingId = newUuid();
  const diagramId = newUuid();
  const graphId = newUuid();
  const title = `HTTP restart ${spaceId}`;
  let firstHost: ViteDevServer | undefined;
  let secondHost: ViteDevServer | undefined;
  let firstContext: BrowserContext | undefined;
  let secondContext: BrowserContext | undefined;
  let exportDirectory: string | undefined;
  let spaceRemains: boolean | undefined;

  try {
    // Before the fixture, not only after it. `initializeAggregate` establishes
    // first state and leaves an initialized repository exactly as it is (ADR
    // 0078), so on a developer's database that already holds a Meta Space it
    // would answer `already-initialized` and write nothing — and the drag below
    // would then be looking for a Thing that was never stored. The old
    // `importSpaces` hid that by falling through to an insert; there is no such
    // door now, so the empty repository this test needs has to be arranged
    // rather than assumed. Safe for the same reason the cleanup below is:
    // `workers: 1` and one test, so nothing else holds this `DATABASE_URL`.
    await clearHyperContent();

    // The Diagram is part of the fixture, and has to be. A diagramless Space is
    // initialized on its first working load (ADR 0079), and that initialization
    // mints an *empty* Diagram — `positions: {}` in `working-space.ts`. The
    // fixture's Thing would then belong to the Space and to no Diagram, so the
    // canvas would draw nothing and `nodeByTitle` below would wait out the
    // timeout with the Thing sitting in the Things list. Placing the Thing here
    // also keeps this test about durability alone: initialization is a write,
    // and an unasked-for write is one more thing between the drag and the
    // revision this asserts.
    //
    // This Space is Meta, and says so rather than being inferred to be. A
    // one-Space aggregate has nowhere else for the root to be, but naming it is
    // what the lifecycle takes (ADR 0078) — array position no longer decides.
    const initialized = await repository.initializeAggregate({
      metaSpaceId: spaceId,
      spaces: [
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
                positions: { [thingId]: { x: 0, y: 0, open: false } },
                graphs: [{ id: graphId, title: 'Graph 1', edges: [] }],
                activeGraph: graphId,
              },
            ],
            defaultDiagram: diagramId,
          },
          things: [
            {
              id: thingId,
              document: { title: 'Restart thing', kind: 'markdown', body: 'Durable.' },
            },
          ],
        },
      ],
    });
    if (initialized.kind !== 'initialized') {
      throw new Error(`The fixture aggregate was not established: ${initialized.kind}`);
    }

    const first = await startHost();
    firstHost = first.server;
    const openedFirst = await openStoredSpace(browser, first.baseURL, spaceId, title);
    firstContext = openedFirst.context;
    const thing = nodeByTitle(openedFirst.page, 'Restart thing');
    await settled(openedFirst.page);
    await dragBy(openedFirst.page, thing, 0, 220);
    await expect(openedFirst.page.getByTestId('persistence-status')).toHaveAttribute(
      'data-revision',
      '1',
    );
    const durablePosition = await positionOf(thing);

    await firstContext.close();
    firstContext = undefined;
    await firstHost.close();
    firstHost = undefined;

    const stored = await repository.loadSpace(spaceId);
    expect(stored?.revision).toBe(1n);

    const second = await startHost();
    secondHost = second.server;
    const openedSecond = await openStoredSpace(browser, second.baseURL, spaceId, title);
    secondContext = openedSecond.context;
    const reloaded = nodeByTitle(openedSecond.page, 'Restart thing');
    await expect(reloaded).toBeVisible();
    await settled(openedSecond.page);
    expect(await positionOf(reloaded)).toEqual(durablePosition);
    await expect(openedSecond.page.getByTestId('persistence-status')).toHaveAttribute(
      'data-revision',
      '1',
    );

    // Durability is only half of what the aggregate owes; the other half is
    // that it can leave again, at the revision the drag actually reached. An
    // export taken at revision 0 would still write a directory that reads back
    // and still record *something*, so the assertion that matters is the
    // projected revision: `markExported` runs after the bytes land, and 1n is
    // what says it recorded the edit rather than the fixture.
    exportDirectory = await mkdtemp(join(tmpdir(), 'hyper-postgres-e2e-export-'));
    const exported = await exportAggregate(repository, exportDirectory);
    expect(exported.kind).toBe('exported');
    const manifest: unknown = JSON.parse(
      await readFile(join(exportDirectory, AGGREGATE_FILE_NAME), 'utf8'),
    );
    expect(manifest).toEqual({ version: 1, metaSpaceId: spaceId });
    // The Space directory is named for the Space, which is where an aggregate
    // writes every Space Id down (ADR 0078) — so its presence under this name
    // is the check, not a search for a file called `space.json` somewhere.
    const spaceFile: unknown = JSON.parse(
      await readFile(join(exportDirectory, spaceId, 'space.json'), 'utf8'),
    );
    expect(spaceFile).toMatchObject({ id: spaceId, title });
    await expect(repository.loadSpace(spaceId)).resolves.toMatchObject({
      revision: 1n,
      exportedRevision: 1n,
    });
  } finally {
    await secondContext?.close();
    await firstContext?.close();
    await secondHost?.close();
    await firstHost?.close();
    if (exportDirectory !== undefined) {
      await rm(exportDirectory, { recursive: true, force: true });
    }
    // Cleanup records what it observed rather than asserting it. An assertion
    // here throws over whatever failure sent us into this block, and would also
    // strand the connection below unclosed.
    try {
      // Not a per-Space delete, because this Space *is* the Meta Space: the
      // fixture above names it as the root of the aggregate it establishes.
      // `repository_state_meta_space_id_fkey` is `Restrict`, so deleting the
      // Space row while repository state still names it fails — which the
      // integration suite asserts on purpose, in *prevents direct deletion of
      // the Meta Space while repository state names it*.
      //
      // There is no longer a second branch to fall into. The old cleanup could
      // pass on a developer's database and fail in CI because `importSpaces`
      // established Meta only when the repository was empty and otherwise
      // inserted beside whatever was there; the reset now runs before the
      // fixture as well as after it, so this Space is Meta on every machine.
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
