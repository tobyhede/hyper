import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import type { LoadedSpace } from '../src/backend';
import { MemorySpaceBackend, MemorySpaceBackendTestControl } from '../src/memory';

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const MISSING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const SPACE_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

const snapshot = (id = META_ID, title = 'Meta'): SpaceSnapshot => ({
  id,
  document: { version: 1, title },
  cards: [],
});

const loaded = (id = META_ID, revision = 3n): LoadedSpace => ({
  snapshot: snapshot(id),
  revision,
  exportedRevision: null,
});

describe('MemorySpaceBackend aggregate persistence', () => {
  it('loads the complete aggregate rooted at the explicit Meta Space', async () => {
    const backend = new MemorySpaceBackend(META_ID, [loaded()]);

    await expect(backend.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: { metaSpaceId: META_ID, spaces: [loaded()] },
    });
  });

  /*
   * The constructor's own types admit a control in the second position, so a
   * caller that writes one there has every reason to expect it honoured. Reading
   * it from the third argument regardless leaves the injection silently inert
   * and the test passing for the wrong reason.
   */
  it('honours a test control given in place of the initial Spaces', async () => {
    const control = new MemorySpaceBackendTestControl();
    const backend = new MemorySpaceBackend(META_ID, control);
    control.queueResult({ kind: 'permanent-failure', code: 'forbidden', message: 'injected' });

    await expect(
      backend.commit({
        changes: [{ kind: 'create', spaceId: OTHER_ID, snapshot: snapshot(OTHER_ID, 'Other') }],
      }),
    ).resolves.toEqual({ kind: 'permanent-failure', code: 'forbidden', message: 'injected' });
    expect(control.requests).toHaveLength(1);
  });

  it('reports every create, update, and delete conflict without changing anything', async () => {
    const backend = new MemorySpaceBackend(META_ID, [loaded()]);

    await expect(
      backend.commit({
        changes: [
          { kind: 'create', spaceId: META_ID, snapshot: snapshot() },
          {
            kind: 'update',
            spaceId: OTHER_ID,
            snapshot: snapshot(OTHER_ID, 'Other'),
            expectedRevision: 0n,
          },
          { kind: 'delete', spaceId: MISSING_ID, expectedRevision: 0n },
        ],
      }),
    ).resolves.toEqual({
      kind: 'conflict',
      conflicts: [
        { spaceId: META_ID, current: loaded() },
        { spaceId: OTHER_ID, current: undefined },
        { spaceId: MISSING_ID, current: undefined },
      ],
    });
    await expect(backend.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: { metaSpaceId: META_ID, spaces: [loaded()] },
    });
  });

  it('rejects an empty, duplicate, or mismatched change set as one invalid commit', async () => {
    const backend = new MemorySpaceBackend(META_ID, [loaded()]);
    const invalidRequests: unknown[] = [
      { changes: [] },
      {
        changes: [
          { kind: 'delete', spaceId: META_ID, expectedRevision: 3n },
          { kind: 'delete', spaceId: META_ID, expectedRevision: 3n },
        ],
      },
      {
        changes: [
          { kind: 'update', spaceId: OTHER_ID, snapshot: snapshot(), expectedRevision: 3n },
        ],
      },
    ];

    for (const request of invalidRequests) {
      await expect(
        // @ts-expect-error Runtime validation protects the JavaScript boundary.
        backend.commit(request),
      ).resolves.toMatchObject({ kind: 'permanent-failure', code: 'invalid-commit' });
    }
  });

  it('refuses and rolls back a candidate that fails complete aggregate intake', async () => {
    const backend = new MemorySpaceBackend(META_ID, [loaded()]);

    await expect(
      backend.commit({
        changes: [{ kind: 'delete', spaceId: META_ID, expectedRevision: 3n }],
      }),
    ).resolves.toEqual({
      kind: 'aggregate-refused',
      errors: [{ kind: 'meta-space-missing', metaSpaceId: META_ID }],
    });
    await expect(backend.loadSpace(META_ID)).resolves.toEqual(loaded());
  });

  it('assigns revision zero to a newly created ordinary Space', async () => {
    const backend = new MemorySpaceBackend(META_ID, [loaded()]);
    const linkedMeta: SpaceSnapshot = {
      ...snapshot(),
      cards: [
        {
          id: SPACE_CARD_ID,
          document: { title: 'Other', kind: 'space', spaceId: OTHER_ID },
        },
      ],
    };

    await expect(
      backend.commit({
        changes: [
          {
            kind: 'update',
            spaceId: META_ID,
            snapshot: linkedMeta,
            expectedRevision: 3n,
          },
          { kind: 'create', spaceId: OTHER_ID, snapshot: snapshot(OTHER_ID, 'Other') },
        ],
      }),
    ).resolves.toEqual({
      kind: 'committed',
      revisions: [
        { spaceId: META_ID, revision: 4n },
        { spaceId: OTHER_ID, revision: 0n },
      ],
      deletedSpaceIds: [],
    });
  });

  it('commits beside an existing imported root Space', async () => {
    const other = loaded(OTHER_ID, 0n);
    const backend = new MemorySpaceBackend(META_ID, [loaded(), other]);

    await expect(
      backend.commit({
        changes: [
          {
            kind: 'update',
            spaceId: META_ID,
            snapshot: snapshot(META_ID, 'Changed'),
            expectedRevision: 3n,
          },
        ],
      }),
    ).resolves.toEqual({
      kind: 'committed',
      revisions: [{ spaceId: META_ID, revision: 4n }],
      deletedSpaceIds: [],
    });
    await expect(backend.loadSpace(OTHER_ID)).resolves.toEqual(other);
  });

  it('conflicts an incomplete deletion when authoritative state still references the Space', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...snapshot(),
      cards: [
        {
          id: SPACE_CARD_ID,
          document: { title: 'Other', kind: 'space', spaceId: OTHER_ID },
        },
      ],
    };
    const other = loaded(OTHER_ID, 6n);
    const backend = new MemorySpaceBackend(META_ID, [{ ...loaded(), snapshot: linkedMeta }, other]);

    await expect(
      backend.commit({
        changes: [{ kind: 'delete', spaceId: OTHER_ID, expectedRevision: 6n }],
      }),
    ).resolves.toEqual({
      kind: 'conflict',
      conflicts: [{ spaceId: OTHER_ID, current: other }],
    });
    await expect(backend.loadSpace(OTHER_ID)).resolves.toEqual(other);
  });
});
