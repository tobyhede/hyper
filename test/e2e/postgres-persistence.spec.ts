import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { newUuid, type UUID } from '@project/core';
import { createServer, type ViteDevServer } from 'vite';
import { PostgresSpaceRepository } from '../../src/persistence/postgres-space-repository';
import { db } from '../../src/prisma/db';
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
  await page.goto('/');
  const choice = page.getByRole('button', { name: `${title} ${spaceId}` });
  if ((await choice.count()) > 0) await choice.click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  return { context, page };
};

test('a PostgreSQL-backed edit survives a fresh Vite host', async ({ browser }) => {
  const repository = new PostgresSpaceRepository(db);
  const spaceId = newUuid();
  const cardId = newUuid();
  const title = `HTTP restart ${spaceId}`;
  let firstHost: ViteDevServer | undefined;
  let secondHost: ViteDevServer | undefined;
  let firstContext: BrowserContext | undefined;
  let secondContext: BrowserContext | undefined;
  let spaceRemains: boolean | undefined;

  try {
    const imported = await repository.importSpaces([
      {
        id: spaceId,
        document: { version: 1, title },
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
      await db.orm.public.Card.where({ spaceId }).delete();
      await db.orm.public.Space.where({ id: spaceId }).delete();
      spaceRemains = (await repository.loadSpace(spaceId)) !== undefined;
    } finally {
      await db.close();
    }
  }

  expect(spaceRemains).toBe(false);
});
