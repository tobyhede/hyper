import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { HttpSpaceBackend } from '@project/http';
import { afterEach, describe, expect, it } from 'vitest';
import { createSpaceHttpHandler } from '../../src/http/space-http-handler';
import { E2eMemorySpaceRepository } from '../support/e2e-memory-space-repository';
import { startHttpServer, type TestHttpServer } from '../support/http-server';
import { createWorkspaceStartup } from '../../packages/app/src/space';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OTHER_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

const snapshot = (id = SPACE_ID, cardId = CARD_ID, title = 'Stored space'): SpaceSnapshot => ({
  id,
  document: { version: 2, title, routes: [] },
  cards: [{ id: cardId, document: { title: 'Start here', kind: 'markdown', body: 'Stored body' } }],
});

const servers: TestHttpServer[] = [];

const startupFor = async (...snapshots: SpaceSnapshot[]) => {
  const repository = new E2eMemorySpaceRepository(
    snapshots.map((value) => ({ snapshot: value, revision: 0n, exportedRevision: null })),
  );
  const server = await startHttpServer(createSpaceHttpHandler(repository));
  servers.push(server);
  return createWorkspaceStartup(new HttpSpaceBackend(server.url));
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('HTTP workspace startup composition', () => {
  it('opens the only durable workspace through the HTTP backend', async () => {
    const startup = await startupFor(snapshot());

    const result = await startup.resolve();

    expect(result.kind).toBe('opened');
    if (result.kind !== 'opened') throw new Error('Expected opened workspace');
    expect(result.opened.space.id).toBe(SPACE_ID);
    expect(result.opened.spaceSession.getState().acknowledgedRevision).toBe(0n);
  });

  it('fails rather than inventing a workspace when the catalog is empty', async () => {
    // Server-side startup is what guarantees a database has at least one Space,
    // so an empty catalog here means that policy did not run. The browser has
    // no import path of its own to fall back to, and quietly opening something
    // it minted locally would be a workspace with nowhere to commit.
    const startup = await startupFor();

    await expect(startup.resolve()).rejects.toThrow(
      'The persistence service returned no database workspaces.',
    );
  });

  it('returns the complete catalog and opens the exact selected UUID', async () => {
    const startup = await startupFor(
      snapshot(),
      snapshot(OTHER_SPACE_ID, OTHER_CARD_ID, 'Other space'),
    );

    await expect(startup.resolve()).resolves.toEqual({
      kind: 'selection',
      spaces: [
        { id: SPACE_ID, title: 'Stored space' },
        { id: OTHER_SPACE_ID, title: 'Other space' },
      ],
    });
    const opened = await startup.openSelected(OTHER_SPACE_ID);
    expect(opened.space.id).toBe(OTHER_SPACE_ID);
  });
});
