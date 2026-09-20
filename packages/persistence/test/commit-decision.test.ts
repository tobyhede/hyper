import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { commitRequestRefusal, decideCommit } from '../src/commit-decision';
import type { LoadedSpace, SpaceCommit } from '../src/backend';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'One' },
  resources: [],
};

/*
 * The refusals a store answers before it reads anything. The duplicate and
 * identity-mismatch cases are also held against every implementation by
 * `test/support/repository-contract.ts`; the empty case cannot be, because
 * `SpaceCommit` is a non-empty tuple and no repository's `commit` can be handed
 * one without an assertion this repository does not allow (ADR 0062). It is
 * reached here instead, which is why the guard takes a plain change list.
 */
describe('commitRequestRefusal', () => {
  it('refuses an empty change set', () => {
    expect(commitRequestRefusal({ changes: [] })).toEqual({
      kind: 'rejected',
      code: 'invalid-commit',
      message: 'A commit requires at least one change',
    });
  });

  it('refuses one Space named twice', () => {
    expect(
      commitRequestRefusal({
        changes: [
          { kind: 'delete', spaceId: SPACE_ID, expectedRevision: 1n },
          { kind: 'delete', spaceId: SPACE_ID, expectedRevision: 1n },
        ],
      }),
    ).toMatchObject({ kind: 'rejected', message: `Space ${SPACE_ID} is named more than once` });
  });

  it('refuses a change whose snapshot names another Space', () => {
    expect(
      commitRequestRefusal({
        changes: [{ kind: 'update', spaceId: OTHER_ID, snapshot, expectedRevision: 1n }],
      }),
    ).toMatchObject({
      kind: 'rejected',
      message: `Change Space id ${OTHER_ID} does not match its snapshot`,
    });
  });

  it('passes a well-formed change set', () => {
    expect(
      commitRequestRefusal({
        changes: [{ kind: 'update', spaceId: SPACE_ID, snapshot, expectedRevision: 1n }],
      }),
    ).toBeUndefined();
  });
});

const bareSpace = (id: UUID, title: string): SpaceSnapshot => ({
  id,
  document: { version: 1, title },
  resources: [],
});

/** A Space complete enough for a Space Resource to select: one Map owning one Graph. */
const targetSpace = (id: UUID, title: string, mapId: UUID, graphId: UUID): SpaceSnapshot => ({
  id,
  document: {
    version: 1,
    title,
    defaultMap: mapId,
    maps: [
      {
        id: mapId,
        title: 'Map 1',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: graphId, title: 'Graph 1', edges: [] }],
        activeGraph: graphId,
      },
    ],
  },
  resources: [],
});

/** A Meta Space with one Space Resource selecting `targetId`'s Map and Graph. */
const linkedMeta = (
  metaId: UUID,
  title: string,
  resourceId: UUID,
  targetId: UUID,
  mapId: UUID,
  graphId: UUID,
): SpaceSnapshot => ({
  id: metaId,
  document: { version: 1, title },
  resources: [
    {
      id: resourceId,
      document: {
        title: 'Target',
        kind: 'space',
        spaceId: targetId,
        map: mapId,
        graph: graphId,
      },
    },
  ],
});

const expectWrite = (decision: ReturnType<typeof decideCommit>) => {
  if (decision.kind !== 'write') {
    throw new Error(
      `Expected a write decision, received ${decision.kind}: ${JSON.stringify(decision.result)}`,
    );
  }
  return decision;
};

const expectRefusedAggregate = (decision: ReturnType<typeof decideCommit>) => {
  if (decision.kind !== 'answer' || decision.result.kind !== 'aggregate-refused') {
    throw new Error(`Expected an aggregate-refused answer, received ${JSON.stringify(decision)}`);
  }
  return decision.result;
};

describe('decideCommit', () => {
  const SOLO_META_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000f1');

  it('lands a created Space at revision 0 with a null exportedRevision', () => {
    const created = bareSpace(SOLO_META_ID, 'Meta');
    const decision = expectWrite(
      decideCommit(
        { changes: [{ kind: 'create', spaceId: SOLO_META_ID, snapshot: created }] },
        SOLO_META_ID,
        [],
      ),
    );
    expect(decision.spaces).toEqual([{ snapshot: created, revision: 0n, exportedRevision: null }]);
  });

  it('lands an updated Space at expectedRevision + 1, keeping its stored exportedRevision', () => {
    const before = bareSpace(SOLO_META_ID, 'Meta');
    const after = bareSpace(SOLO_META_ID, 'Meta v2');
    const stored: readonly LoadedSpace[] = [
      { snapshot: before, revision: 3n, exportedRevision: 7n },
    ];
    const decision = expectWrite(
      decideCommit(
        {
          changes: [
            { kind: 'update', spaceId: SOLO_META_ID, snapshot: after, expectedRevision: 3n },
          ],
        },
        SOLO_META_ID,
        stored,
      ),
    );
    expect(decision.spaces).toEqual([{ snapshot: after, revision: 4n, exportedRevision: 7n }]);
  });

  it('leaves a deleted Space absent from spaces', () => {
    const DELETE_META_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000e1');
    const DELETE_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000e2');
    const meta = bareSpace(DELETE_META_ID, 'Meta');
    const target = bareSpace(DELETE_TARGET_ID, 'Target');
    const stored: readonly LoadedSpace[] = [
      { snapshot: meta, revision: 2n, exportedRevision: null },
      { snapshot: target, revision: 5n, exportedRevision: 9n },
    ];
    const decision = expectWrite(
      decideCommit(
        { changes: [{ kind: 'delete', spaceId: DELETE_TARGET_ID, expectedRevision: 5n }] },
        DELETE_META_ID,
        stored,
      ),
    );
    expect(decision.spaces).toEqual([{ snapshot: meta, revision: 2n, exportedRevision: null }]);
  });

  it('answers spaces ascending by id, including a created Space landing between two stored ones', () => {
    const META_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000d1');
    const CREATED_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000d3');
    const EXISTING_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000d5');
    const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000d0');
    const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000d2');
    const SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000d4');

    const staleMeta = bareSpace(META_ID, 'Meta');
    const updatedMeta = linkedMeta(
      META_ID,
      'Meta',
      SPACE_RESOURCE_ID,
      CREATED_ID,
      MAP_ID,
      GRAPH_ID,
    );
    const existing = bareSpace(EXISTING_ID, 'Existing');
    const created = targetSpace(CREATED_ID, 'Created', MAP_ID, GRAPH_ID);

    // Deliberately not ascending by id: EXISTING_ID (…d5) is read before
    // META_ID (…d1), and the created Space's id (…d3) sorts between the two.
    const stored: readonly LoadedSpace[] = [
      { snapshot: existing, revision: 5n, exportedRevision: 9n },
      { snapshot: staleMeta, revision: 3n, exportedRevision: null },
    ];
    const decision = expectWrite(
      decideCommit(
        {
          changes: [
            { kind: 'update', spaceId: META_ID, snapshot: updatedMeta, expectedRevision: 3n },
            { kind: 'create', spaceId: CREATED_ID, snapshot: created },
          ],
        },
        META_ID,
        stored,
      ),
    );
    expect(decision.spaces).toEqual([
      { snapshot: updatedMeta, revision: 4n, exportedRevision: null },
      { snapshot: created, revision: 0n, exportedRevision: null },
      { snapshot: existing, revision: 5n, exportedRevision: 9n },
    ]);
  });

  it('judges a corrupt stored Space at the position a sorted read would give it, whatever order stored arrives in', () => {
    const ORDER_META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000101');
    const ORDER_OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000102');
    const ORDER_CORRUPT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000104');

    const meta = bareSpace(ORDER_META_ID, 'Meta');
    const other = bareSpace(ORDER_OTHER_ID, 'Other');
    // `title: ''` fails `spaceDocumentSchema`'s `z.string().min(1)`, so this
    // Space's own intake fails before any cross-Space reference check runs —
    // exactly the failure `invalid-space-snapshot` reports by position.
    const corrupt: SpaceSnapshot = {
      id: ORDER_CORRUPT_ID,
      document: { version: 1, title: '' },
      resources: [],
    };
    const metaEntry: LoadedSpace = { snapshot: meta, revision: 1n, exportedRevision: null };
    const otherEntry: LoadedSpace = { snapshot: other, revision: 1n, exportedRevision: null };
    const corruptEntry: LoadedSpace = { snapshot: corrupt, revision: 1n, exportedRevision: null };

    // Ascending by id: meta (…0101), other (…0102), corrupt (…0104).
    const orderedStored: readonly LoadedSpace[] = [metaEntry, otherEntry, corruptEntry];
    // Not ascending: corrupt read before other.
    const scrambledStored: readonly LoadedSpace[] = [metaEntry, corruptEntry, otherEntry];

    const request: SpaceCommit = {
      changes: [
        {
          kind: 'update',
          spaceId: ORDER_OTHER_ID,
          snapshot: bareSpace(ORDER_OTHER_ID, 'Other v2'),
          expectedRevision: 1n,
        },
      ],
    };

    const orderedResult = expectRefusedAggregate(
      decideCommit(request, ORDER_META_ID, orderedStored),
    );
    const scrambledResult = expectRefusedAggregate(
      decideCommit(request, ORDER_META_ID, scrambledStored),
    );

    expect(orderedResult.errors).toEqual([
      expect.objectContaining({ kind: 'invalid-space-snapshot', snapshotIndex: 2 }),
    ]);
    // Whatever order `stored` arrived in, the refusal names the same Space at
    // the same position — the one an ascending-by-id read would give it.
    expect(scrambledResult.errors).toEqual(orderedResult.errors);
  });
});
