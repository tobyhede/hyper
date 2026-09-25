import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { describe, expect, it } from 'vitest';
import { MemorySpaceRepository } from '../support/memory-space-repository';
import { spaceRepositoryContract } from '../support/repository-contract';

spaceRepositoryContract('MemorySpaceRepository', () =>
  Promise.resolve({ repository: new MemorySpaceRepository(), close: () => Promise.resolve() }),
);

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const OTHER_SPACE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const RESOURCE_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const OTHER_RESOURCE_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const LINK_RESOURCE_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');
const MAP_ID = uuidSchema.parse('66666666-6666-4666-8666-666666666666');
const GRAPH_ID = uuidSchema.parse('77777777-7777-4777-8777-777777777777');

/** One Space carrying a single Markdown Resource, fully identified as the lifecycle takes it. */
const space = (id: UUID, resourceId: UUID, title: string): SpaceSnapshot => ({
  id,
  document: { version: 1, title },
  resources: [
    { id: resourceId, document: { title: `${title} resource`, kind: 'markdown', body: '' } },
  ],
});

/**
 * What is here is what the shared contract cannot say: this double's own
 * behaviour under a `commit`. The lifecycle rules — conflicting identities, a
 * Resource a stored Space owns, clearing before a truncating replacement — are
 * pinned in `repository-contract.ts` against `initializeAggregate` and
 * `replaceAggregate`, because those rules are the seam's and both adapters owe
 * them, not the double's alone.
 */
describe('MemorySpaceRepository', () => {
  it('rejects a commit that claims a Resource owned by another Space', async () => {
    const repository = new MemorySpaceRepository();
    const meta = space(SPACE_ID, RESOURCE_ID, 'First');
    // The second Space carries the Map the Space Resource selects, because a
    // Space Resource names a Map of its target and a Graph that Map owns
    // from the moment it exists (ADR 0079).
    const second = space(OTHER_SPACE_ID, OTHER_RESOURCE_ID, 'Second');
    const seeded = await repository.initializeAggregate({
      metaSpaceId: SPACE_ID,
      spaces: [
        {
          ...meta,
          resources: [
            ...meta.resources,
            {
              id: LINK_RESOURCE_ID,
              document: {
                title: 'Second',
                kind: 'space',
                spaceId: OTHER_SPACE_ID,
                map: MAP_ID,
                graph: GRAPH_ID,
              },
            },
          ],
        },
        {
          ...second,
          document: {
            ...second.document,
            defaultMap: MAP_ID,
            maps: [
              {
                id: MAP_ID,
                title: 'Map 1',
                kind: 'positioned',
                // Positions nothing: the claiming commit below replaces this
                // Space's Resources, and what a Space Resource resolves is the Map
                // and the Graph rather than what that Map places.
                positions: {},
                graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
                activeGraph: GRAPH_ID,
              },
            ],
          },
        },
      ],
    });
    // Asserted rather than assumed: a refused seed would leave every expectation
    // below passing against an empty repository.
    expect(seeded).toMatchObject({ kind: 'initialized' });
    const before = await repository.loadSpace(OTHER_SPACE_ID);
    if (before === undefined) throw new Error('Expected the second Space to be stored');

    const claimed = {
      ...before.snapshot,
      resources: [
        {
          id: RESOURCE_ID,
          document: { title: 'Claimed resource', kind: 'markdown' as const, body: '' },
        },
      ],
    };
    const result = await repository.commit({
      changes: [
        {
          kind: 'update',
          spaceId: OTHER_SPACE_ID,
          snapshot: claimed,
          expectedRevision: before.revision,
        },
      ],
    });

    expect(result).toMatchObject({
      kind: 'aggregate-refused',
      errors: [{ kind: 'duplicate-resource-id' }],
    });
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual(before);
  });
});
