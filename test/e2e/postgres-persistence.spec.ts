import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext } from '@playwright/test';
import { newUuid } from '@project/core';
import { createServer, type ViteDevServer } from 'vite';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import { postgresSqlStore } from '../../src/prisma/sql-store';
import { clearHyperContent } from '../support/clear-hyper-content';
import { postgresTestDatabase } from '../support/postgres-database';
import {
  dragResourceAndCapturePosition,
  expectRestartProofExport,
  expectResourceRestoredAt,
  openStoredSpace,
  restartProofFixture,
} from '../support/restart-proof';
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
    // failure that blames the wrong resource.
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

test('a PostgreSQL-backed edit survives a fresh Vite host', async ({ browser }) => {
  // The same handle `clearHyperContent` holds, not a second one beside it.
  // That module opens its client at import, so a client of this spec's own
  // would leave that one live after the `finally` below closed only its own —
  // one pool per process is what the closing `finally` can actually account
  // for.
  const repository = new SqlSpaceRepository(postgresSqlStore(postgresTestDatabase));
  const spaceId = newUuid();
  const resourceId = newUuid();
  const mapId = newUuid();
  const graphId = newUuid();
  const title = `HTTP restart ${spaceId}`;
  let firstHost: ViteDevServer | undefined;
  let secondHost: ViteDevServer | undefined;
  let firstContext: BrowserContext | undefined;
  let secondContext: BrowserContext | undefined;
  let spaceRemains: boolean | undefined;

  try {
    // Before the fixture, not only after it. `initializeAggregate` establishes
    // first state and leaves an initialized repository exactly as it is (ADR
    // 0078), so on a developer's database that already holds a Meta Space it
    // would answer `already-initialized` and write nothing — and the drag below
    // would then be looking for a Resource that was never stored. So the empty
    // repository this test needs has to be arranged rather than assumed. Safe
    // for the same reason the cleanup below is: `workers: 1` and one test, so
    // nothing else holds this `DATABASE_URL`.
    await clearHyperContent();

    // The Map is part of the fixture, and has to be. A mapless Space is
    // initialized on its first working load (ADR 0079), and that initialization
    // mints an *empty* Map — `positions: {}` in `working-space.ts`. The
    // fixture's Resource would then belong to the Space and to no Map, so the
    // canvas would draw nothing and `nodeByTitle` below would wait out the
    // timeout with the Resource sitting in the Resources list. Placing the Resource here
    // also keeps this test about durability alone: initialization is a write,
    // and an unasked-for write is one more resource between the drag and the
    // revision this asserts.
    //
    // This Space is Meta, and says so rather than being inferred to be. A
    // one-Space aggregate has nowhere else for the root to be, but naming it is
    // what the lifecycle takes (ADR 0078) — array position decides nothing.
    const fixture = restartProofFixture({ spaceId, resourceId, mapId, graphId, title });
    const initialized = await repository.initializeAggregate({
      metaSpaceId: spaceId,
      spaces: [fixture],
    });
    if (initialized.kind !== 'initialized') {
      throw new Error(`The fixture aggregate was not established: ${initialized.kind}`);
    }

    const first = await startHost();
    firstHost = first.server;
    const openedFirst = await openStoredSpace(browser, first.baseURL, spaceId, title);
    firstContext = openedFirst.context;
    const durablePosition = await dragResourceAndCapturePosition(
      openedFirst.page,
      'Restart resource',
      0,
      220,
      '1',
    );

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
    await expectResourceRestoredAt(openedSecond.page, 'Restart resource', durablePosition, '1');

    // Durability is only half of what the aggregate owes; the other half is
    // that it can leave again, at the revision the drag actually reached. An
    // export taken at revision 0 would still write a directory that reads back
    // and still record *something*, so the assertion that matters is the
    // projected revision: `markExported` runs after the bytes land, and 1n is
    // what says it recorded the edit rather than the fixture.
    await expectRestartProofExport(repository, fixture);
  } finally {
    await secondContext?.close();
    await firstContext?.close();
    await secondHost?.close();
    await firstHost?.close();
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
      // The reset runs before the fixture as well as after it, so this Space
      // is Meta on every machine and there is no second branch to fall into.
      //
      // `clearHyperContent` drops the repository-state row first, which is what
      // releases the key, and it is the same reset the integration suite runs.
      // Safe here for the reason it is safe there: `workers: 1` and one test, so
      // nothing else holds this `DATABASE_URL`.
      await clearHyperContent();
      spaceRemains = (await repository.loadSpace(spaceId)) !== undefined;
    } finally {
      await postgresTestDatabase.close();
    }
  }

  expect(spaceRemains).toBe(false);
});
