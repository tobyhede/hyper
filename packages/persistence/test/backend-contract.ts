import { expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import type { UUID } from '@project/core';
import type { LoadedSpace, SpaceBackend } from '../src/index';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const MISSING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

export const contractLoaded: LoadedSpace = {
  snapshot: {
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'One',
      defaultMap: MAP_ID,
      maps: [
        {
          id: MAP_ID,
          title: 'Map 1',
          kind: 'positioned',
          positions: { [RESOURCE_ID]: { x: 0, y: 0, open: false } },
          graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
          activeGraph: GRAPH_ID,
        },
      ],
    },
    resources: [{ id: RESOURCE_ID, document: { title: 'A', kind: 'markdown', body: 'Original' } }],
  },
  revision: 9_007_199_254_740_993n,
  exportedRevision: 9_007_199_254_740_992n,
};

interface BackendHarness {
  backend: SpaceBackend;
  close(): Promise<void>;
}

/**
 * What the harness is seeded with. The Meta identity is named rather than
 * inferred from the array: "whichever Space happens to be first is Meta" is the
 * ordering inference ADR 0078 refuses every adapter, and a harness that takes it
 * decides an aggregate's validity by position — seeded the other way round, the
 * same two Spaces leave the one Meta does not reach unreferenced.
 * `MemorySpaceRepository`'s constructor overloads make it unwriteable there; this
 * is the one call site they cannot police.
 */
export interface BackendContractSeed {
  spaces: readonly LoadedSpace[];
  metaSpaceId: UUID;
}

export const spaceBackendContract = (
  name: string,
  createHarness: (seed: BackendContractSeed) => Promise<BackendHarness>,
): void => {
  it(`${name} lists, loads, commits, and reports stale conflicts losslessly`, async () => {
    const harness = await createHarness({ spaces: [contractLoaded], metaSpaceId: SPACE_ID });
    try {
      expect(new Set(await harness.backend.listSpaces())).toEqual(
        new Set([{ id: SPACE_ID, title: 'One' }]),
      );
      await expect(harness.backend.loadSpace(SPACE_ID)).resolves.toEqual(contractLoaded);
      await expect(harness.backend.loadSpace(MISSING_ID)).resolves.toBeUndefined();
      await expect(harness.backend.loadAggregate()).resolves.toEqual({
        kind: 'loaded',
        aggregate: { metaSpaceId: SPACE_ID, spaces: [contractLoaded] },
      });

      const changed = structuredClone(contractLoaded.snapshot);
      changed.document.title = 'Changed';
      await expect(
        harness.backend.commit({
          changes: [
            {
              kind: 'update',
              spaceId: SPACE_ID,
              snapshot: changed,
              expectedRevision: 9_007_199_254_740_993n,
            },
          ],
        }),
      ).resolves.toEqual({
        kind: 'committed',
        revisions: [{ spaceId: SPACE_ID, revision: 9_007_199_254_740_994n }],
        deletedSpaceIds: [],
      });
      await expect(harness.backend.loadSpace(SPACE_ID)).resolves.toEqual({
        snapshot: changed,
        revision: 9_007_199_254_740_994n,
        exportedRevision: 9_007_199_254_740_992n,
      });
      await expect(
        harness.backend.commit({
          changes: [
            {
              kind: 'update',
              spaceId: SPACE_ID,
              snapshot: contractLoaded.snapshot,
              expectedRevision: 9_007_199_254_740_993n,
            },
          ],
        }),
      ).resolves.toEqual({
        kind: 'conflict',
        conflicts: [
          {
            spaceId: SPACE_ID,
            current: {
              snapshot: changed,
              revision: 9_007_199_254_740_994n,
              exportedRevision: 9_007_199_254_740_992n,
            },
          },
        ],
      });
    } finally {
      await harness.close();
    }
  });

  it(`${name} rejects a shape-valid snapshot that fails domain intake`, async () => {
    const harness = await createHarness({ spaces: [contractLoaded], metaSpaceId: SPACE_ID });
    try {
      // Shape-valid and domain-invalid: a graph reaches intake only through the
      // map that owns it now (ADR 0040), and its edge endpoints must be resources
      // of *that* map, so the dangling end is one the positions omit.
      const invalid = structuredClone(contractLoaded.snapshot);
      invalid.document.maps = [
        {
          id: MAP_ID,
          title: 'Owner',
          kind: 'positioned',
          positions: { [RESOURCE_ID]: { x: 0, y: 0, open: false } },
          graphs: [
            { id: GRAPH_ID, title: 'Dangling', edges: [{ from: RESOURCE_ID, to: MISSING_ID }] },
          ],
        },
      ];
      await expect(
        harness.backend.commit({
          changes: [
            {
              kind: 'update',
              spaceId: SPACE_ID,
              snapshot: invalid,
              expectedRevision: 9_007_199_254_740_993n,
            },
          ],
        }),
      ).resolves.toMatchObject({ kind: 'aggregate-refused' });
    } finally {
      await harness.close();
    }
  });
};
