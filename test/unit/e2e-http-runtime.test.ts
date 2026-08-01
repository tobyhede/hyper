import { uuidSchema } from '@project/core';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpSpaceBackend } from '@project/http';
import { createHandler, type E2eHttpRuntimeOptions } from '../support/e2e-http-runtime';
import { startHttpServer, type TestHttpServer } from '../support/http-server';

const FIXTURE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000040');
const servers: TestHttpServer[] = [];

const startRuntime = async (options: E2eHttpRuntimeOptions) => {
  const server = await startHttpServer(await createHandler(options));
  servers.push(server);
  return new HttpSpaceBackend(server.url);
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('e2e HTTP runtime', () => {
  it('imports the abstract-layout fixture into each fresh runtime', async () => {
    const first = await startRuntime({ catalog: 'fixture' });
    const second = await startRuntime({ catalog: 'fixture' });

    await expect(first.listSpaces()).resolves.toEqual([
      { id: FIXTURE_ID, title: 'Layout fixture' },
    ]);
    const loaded = await first.loadSpace(FIXTURE_ID);
    if (loaded === undefined) throw new Error('Expected fixture workspace');
    expect(loaded.snapshot.id).toBe(FIXTURE_ID);
    const changed = {
      ...loaded.snapshot,
      document: { ...loaded.snapshot.document, title: 'Changed only in first runtime' },
    };
    await expect(first.commitSpace(changed, 0n)).resolves.toEqual({
      kind: 'committed',
      revision: 1n,
    });

    await expect(second.loadSpace(FIXTURE_ID)).resolves.toMatchObject({
      revision: 0n,
      snapshot: { document: { title: 'Layout fixture' } },
    });
  });

  it('creates an independent empty catalog', async () => {
    const backend = await startRuntime({ catalog: 'empty' });

    await expect(backend.listSpaces()).resolves.toEqual([]);
  });

  it('applies the database zero-space startup policy when hosting the browser', async () => {
    const backend = await startRuntime({ catalog: 'empty', startup: true });

    const spaces = await backend.listSpaces();
    expect(spaces).toHaveLength(1);
    expect(spaces[0]?.title).toBe('New space');
  });
});
