import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { describe, expect, it } from 'vitest';
import { MemorySpaceRepository } from '../support/memory-space-repository';
import { spaceRepositoryContract } from '../support/repository-contract';

spaceRepositoryContract('MemorySpaceRepository', () =>
  Promise.resolve({ repository: new MemorySpaceRepository(), close: () => Promise.resolve() }),
);

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const OTHER_SPACE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const THING_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const OTHER_THING_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const LINK_THING_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');
const DIAGRAM_ID = uuidSchema.parse('66666666-6666-4666-8666-666666666666');
const GRAPH_ID = uuidSchema.parse('77777777-7777-4777-8777-777777777777');

/** One Space carrying a single Markdown Thing, fully identified as the lifecycle takes it. */
const space = (id: UUID, thingId: UUID, title: string): SpaceSnapshot => ({
  id,
  document: { version: 1, title },
  things: [{ id: thingId, document: { title: `${title} thing`, kind: 'markdown', body: '' } }],
});

/**
 * What is left here is what the shared contract cannot say: this double's own
 * behaviour under a `commit`. Everything this file used to pin about batched
 * import — conflicting identities, a Thing a stored Space owns, clearing before
 * a truncating batch — moved to `repository-contract.ts` against
 * `initializeAggregate` and `replaceAggregate` when ADR 0078 retired
 * `importSpaces`, because those rules are the seam's and both adapters owe them,
 * not the double's alone.
 */
describe('MemorySpaceRepository', () => {
  it('rejects a commit that claims a Thing owned by another Space', async () => {
    const repository = new MemorySpaceRepository();
    const meta = space(SPACE_ID, THING_ID, 'First');
    // The second Space carries the Diagram the Space Thing selects, because a
    // Space Thing names a Diagram of its target and a Graph that Diagram owns
    // from the moment it exists (ADR 0079).
    const second = space(OTHER_SPACE_ID, OTHER_THING_ID, 'Second');
    const seeded = await repository.initializeAggregate({
      metaSpaceId: SPACE_ID,
      spaces: [
        {
          ...meta,
          things: [
            ...meta.things,
            {
              id: LINK_THING_ID,
              document: {
                title: 'Second',
                kind: 'space',
                spaceId: OTHER_SPACE_ID,
                diagram: DIAGRAM_ID,
                graph: GRAPH_ID,
              },
            },
          ],
        },
        {
          ...second,
          document: {
            ...second.document,
            defaultDiagram: DIAGRAM_ID,
            diagrams: [
              {
                id: DIAGRAM_ID,
                title: 'Diagram 1',
                kind: 'positioned',
                // Positions nothing: the claiming commit below replaces this
                // Space's Things, and what a Space Thing resolves is the Diagram
                // and the Graph rather than what that Diagram places.
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
      things: [
        {
          id: THING_ID,
          document: { title: 'Claimed thing', kind: 'markdown' as const, body: '' },
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
      errors: [{ kind: 'duplicate-thing-id' }],
    });
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toEqual(before);
  });
});
