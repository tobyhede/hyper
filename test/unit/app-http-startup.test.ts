import { encodeCompactUuid, uuidSchema, type SpaceSnapshot } from '@project/core';
import { createSpaceHttpApp, HttpSpaceBackend } from '@project/http';
import { describe, expect, it } from 'vitest';
import { E2eMemorySpaceRepository } from '../support/e2e-memory-space-repository';
import { createSpaceStartup } from '../../packages/app/src/space';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OTHER_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

const snapshot = (id = SPACE_ID, cardId = CARD_ID, title = 'Stored space'): SpaceSnapshot => ({
  id,
  document: { version: 1, title },
  cards: [{ id: cardId, document: { title: 'Start here', kind: 'markdown', body: 'Stored body' } }],
});

const startupFor = (...snapshots: SpaceSnapshot[]) => {
  const repository = new E2eMemorySpaceRepository(
    snapshots.map((value) => ({ snapshot: value, revision: 0n, exportedRevision: null })),
  );
  const app = createSpaceHttpApp(repository);
  return createSpaceStartup(
    new HttpSpaceBackend('http://hyper.test', {
      fetch: (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
    }),
  );
};

describe('HTTP space startup composition', () => {
  it('opens the Space named by the compact product-route id through HTTP', async () => {
    const startup = startupFor(snapshot());

    const result = await startup.resolve(encodeCompactUuid(SPACE_ID));

    expect(result.kind).toBe('opened');
    expect(result.opened.space.id).toBe(SPACE_ID);
    expect(result.opened.spaceSession.getState().acknowledgedRevision).toBe(0n);
  });

  it('fails when the product-route id no longer resolves', async () => {
    const startup = startupFor();

    await expect(startup.resolve(encodeCompactUuid(SPACE_ID))).rejects.toThrow(SPACE_ID);
  });

  it('opens the exact named Space when several are stored', async () => {
    const startup = startupFor(snapshot(), snapshot(OTHER_SPACE_ID, OTHER_CARD_ID, 'Other space'));

    const result = await startup.resolve(encodeCompactUuid(OTHER_SPACE_ID));

    expect(result.opened.space.id).toBe(OTHER_SPACE_ID);
  });

  it('rejects a malformed compact product-route id', async () => {
    const startup = startupFor(snapshot());

    await expect(startup.resolve('not-a-compact-uuid')).rejects.toThrow(
      'The Space URL contains an invalid id.',
    );
  });
});
