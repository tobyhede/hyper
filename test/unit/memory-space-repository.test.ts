import { uuidSchema, type ImportSpace, type UUID } from '@project/core';
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

const importSpace = (id: UUID, thingId: UUID, title: string): ImportSpace => ({
  id,
  document: { version: 1, title },
  things: [
    {
      id: thingId,
      document: { title: `${title} thing`, kind: 'markdown', body: '' },
    },
  ],
});

describe('MemorySpaceRepository', () => {
  it.each([
    {
      name: 'Space identity',
      batch: [
        importSpace(SPACE_ID, THING_ID, 'First'),
        importSpace(SPACE_ID, OTHER_THING_ID, 'Duplicate space'),
      ],
      code: 'duplicate-identity',
    },
    {
      name: 'Thing identity',
      batch: [
        importSpace(SPACE_ID, THING_ID, 'First'),
        importSpace(OTHER_SPACE_ID, THING_ID, 'Duplicate thing'),
      ],
      code: 'duplicate-identity',
    },
  ] as const)('rejects conflicting $name atomically', async ({ batch, code }) => {
    const repository = new MemorySpaceRepository();

    const result = await repository.importSpaces(batch, 'insert');

    expect(result).toMatchObject({ kind: 'rejected', code });
    await expect(repository.listSpaces()).resolves.toEqual([]);
  });

  // A thing repeated inside one batch is an identity collision, not an ownership
  // conflict: no stored Space owns it yet. `PostgresSpaceRepository` decides this
  // in `duplicateIdentity` before its transaction opens, so the double has to
  // reject it the same way or the CLI's error differs by backend.
  it('rejects a Thing repeated within one batch as a duplicate identity', async () => {
    const repository = new MemorySpaceRepository();

    const result = await repository.importSpaces(
      [importSpace(SPACE_ID, THING_ID, 'First'), importSpace(OTHER_SPACE_ID, THING_ID, 'Second')],
      'insert',
    );

    expect(result).toEqual({
      kind: 'rejected',
      code: 'duplicate-identity',
      message: `Duplicate thing identity "${THING_ID}"`,
    });
    await expect(repository.listSpaces()).resolves.toEqual([]);
  });

  it('rejects a batch claiming a Thing owned by a stored Space', async () => {
    const repository = new MemorySpaceRepository();
    await repository.importSpaces([importSpace(SPACE_ID, THING_ID, 'Stored')], 'insert');

    const result = await repository.importSpaces(
      [importSpace(OTHER_SPACE_ID, THING_ID, 'Claims a stored thing')],
      'insert',
    );

    expect(result).toEqual({
      kind: 'rejected',
      code: 'thing-ownership',
      message: `Thing ${THING_ID} belongs to space ${SPACE_ID}`,
    });
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toBeUndefined();
  });

  it('clears stored Spaces before inserting a truncating batch', async () => {
    const repository = new MemorySpaceRepository();
    await repository.importSpaces([importSpace(SPACE_ID, THING_ID, 'Stored')], 'insert');

    const result = await repository.importSpaces(
      [importSpace(OTHER_SPACE_ID, OTHER_THING_ID, 'Replacement')],
      'truncate',
    );

    expect(result).toMatchObject({ kind: 'imported' });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toBeUndefined();
    await expect(repository.listSpaces()).resolves.toMatchObject([{ id: OTHER_SPACE_ID }]);
  });

  // Truncation drops every stored Space, so a thing a doomed Space owns is free.
  // Ownership must be judged against what survives, not against what the same
  // call is about to delete.
  it('accepts a truncating batch reusing a Thing id owned by a cleared Space', async () => {
    const repository = new MemorySpaceRepository();
    await repository.importSpaces([importSpace(SPACE_ID, THING_ID, 'Stored')], 'insert');

    const result = await repository.importSpaces(
      [importSpace(OTHER_SPACE_ID, THING_ID, 'Reuses the thing id')],
      'truncate',
    );

    expect(result).toMatchObject({ kind: 'imported' });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toBeUndefined();
  });

  it('rejects an explicitly identified Space already in the repository atomically', async () => {
    const repository = new MemorySpaceRepository();
    const existing = importSpace(SPACE_ID, THING_ID, 'Existing');
    await repository.importSpaces([existing], 'insert');
    const before = await repository.loadSpace(SPACE_ID);

    const result = await repository.importSpaces(
      [
        importSpace(OTHER_SPACE_ID, OTHER_THING_ID, 'Must roll back'),
        importSpace(SPACE_ID, THING_ID, 'Duplicate'),
      ],
      'insert',
    );

    expect(result).toEqual({
      kind: 'rejected',
      code: 'duplicate-identity',
      message: `Space ${SPACE_ID} already exists`,
    });
    await expect(repository.loadSpace(SPACE_ID)).resolves.toEqual(before);
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toBeUndefined();
  });

  it('rejects a commit that claims a Thing owned by another Space', async () => {
    const repository = new MemorySpaceRepository();
    const meta = importSpace(SPACE_ID, THING_ID, 'First');
    // The second Space carries the Diagram the Space Thing selects, because a
    // Space Thing names a Diagram of its target and a Graph that Diagram owns
    // from the moment it exists (ADR 0079).
    const second = importSpace(OTHER_SPACE_ID, OTHER_THING_ID, 'Second');
    await repository.importSpaces(
      [
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
      'insert',
    );
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
