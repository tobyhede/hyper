import { encodeCompactUuid, uuidSchema } from '@project/core';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HttpSpaceBackend } from '@project/http';
import { createApp, type E2eHttpRuntimeOptions } from '../support/e2e-http-runtime';

const FIXTURE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000040');
const startRuntime = async (options: E2eHttpRuntimeOptions) => {
  const app = await createApp(options);
  return new HttpSpaceBackend('http://hyper.test', {
    fetch: (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
  });
};

describe('e2e HTTP runtime', () => {
  it('imports the abstract-layout fixture into each fresh runtime', async () => {
    const first = await startRuntime({ catalog: 'fixture' });
    const second = await startRuntime({ catalog: 'fixture' });

    await expect(first.listSpaces()).resolves.toEqual([
      { id: FIXTURE_ID, title: 'Layout fixture' },
    ]);
    const loaded = await first.loadSpace(FIXTURE_ID);
    if (loaded === undefined) throw new Error('Expected fixture space');
    expect(loaded.snapshot.id).toBe(FIXTURE_ID);
    const changed = {
      ...loaded.snapshot,
      document: { ...loaded.snapshot.document, title: 'Changed only in first runtime' },
    };
    await expect(
      first.commit({
        changes: [
          {
            kind: 'update',
            spaceId: FIXTURE_ID,
            snapshot: changed,
            expectedRevision: loaded.revision,
          },
        ],
      }),
    ).resolves.toEqual({
      kind: 'committed',
      revisions: [{ spaceId: FIXTURE_ID, revision: loaded.revision + 1n }],
      deletedSpaceIds: [],
    });

    await expect(second.loadSpace(FIXTURE_ID)).resolves.toMatchObject({
      revision: 0n,
      snapshot: { document: { title: 'Layout fixture' } },
    });
  });

  it('configures the tracked fixture as the explicit Entry Space', async () => {
    const app = await createApp({ catalog: 'fixture', startup: true });

    await expect(app.resolveProductRequest('/', 'GET')).resolves.toEqual({
      status: 302,
      headers: {
        location: `/spaces/${encodeCompactUuid(FIXTURE_ID)}`,
      },
    });
  });

  it('creates an independent empty catalog', async () => {
    const backend = await startRuntime({ catalog: 'empty' });

    await expect(backend.listSpaces()).resolves.toEqual([]);
  });

  it('imports an explicit Space directory for generated catalogues', async () => {
    const directory = fileURLToPath(new URL('../../packages/app/fixture', import.meta.url));
    const backend = await startRuntime({ catalog: 'directory', directory });

    await expect(backend.listSpaces()).resolves.toEqual([
      { id: FIXTURE_ID, title: 'Layout fixture' },
    ]);
  });

  it('applies the database zero-space startup policy when hosting the browser', async () => {
    const backend = await startRuntime({ catalog: 'empty', startup: true });

    const spaces = await backend.listSpaces();
    expect(spaces).toHaveLength(1);
    expect(spaces[0]?.title).toBe('New space');
  });
});
