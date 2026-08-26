import { expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import type { LoadedSpace, SpaceBackend } from '../src/index';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const MISSING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

export const contractLoaded: LoadedSpace = {
  snapshot: {
    id: SPACE_ID,
    document: { version: 1, title: 'One' },
    cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'Original' } }],
  },
  revision: 9_007_199_254_740_993n,
  exportedRevision: 9_007_199_254_740_992n,
};

interface BackendHarness {
  backend: SpaceBackend;
  close(): Promise<void>;
}

export const spaceBackendContract = (
  name: string,
  createHarness: (initial: readonly LoadedSpace[]) => Promise<BackendHarness>,
): void => {
  it(`${name} lists, loads, commits, and reports stale conflicts losslessly`, async () => {
    const harness = await createHarness([contractLoaded]);
    try {
      expect(new Set(await harness.backend.listSpaces())).toEqual(
        new Set([{ id: SPACE_ID, title: 'One' }]),
      );
      await expect(harness.backend.loadSpace(SPACE_ID)).resolves.toEqual(contractLoaded);
      await expect(harness.backend.loadSpace(MISSING_ID)).resolves.toBeUndefined();

      const changed = structuredClone(contractLoaded.snapshot);
      changed.document.title = 'Changed';
      await expect(harness.backend.commitSpace(changed, 9_007_199_254_740_993n)).resolves.toEqual({
        kind: 'committed',
        revision: 9_007_199_254_740_994n,
      });
      await expect(harness.backend.loadSpace(SPACE_ID)).resolves.toEqual({
        snapshot: changed,
        revision: 9_007_199_254_740_994n,
        exportedRevision: 9_007_199_254_740_992n,
      });
      await expect(
        harness.backend.commitSpace(contractLoaded.snapshot, 9_007_199_254_740_993n),
      ).resolves.toEqual({
        kind: 'conflict',
        current: {
          snapshot: changed,
          revision: 9_007_199_254_740_994n,
          exportedRevision: 9_007_199_254_740_992n,
        },
      });
    } finally {
      await harness.close();
    }
  });

  it(`${name} rejects a shape-valid snapshot that fails domain intake`, async () => {
    const harness = await createHarness([contractLoaded]);
    try {
      // Shape-valid and domain-invalid: a graph reaches intake only through the
      // layout that owns it now (ADR 0040), and its edge endpoints must be cards
      // of *that* layout, so the dangling end is one the positions omit.
      const invalid = structuredClone(contractLoaded.snapshot);
      invalid.document.layouts = [
        {
          id: LAYOUT_ID,
          title: 'Owner',
          kind: 'positioned',
          positions: { [CARD_ID]: { x: 0, y: 0, state: 'closed' } },
          graphs: [{ id: GRAPH_ID, title: 'Dangling', edges: [{ from: CARD_ID, to: MISSING_ID }] }],
        },
      ];
      await expect(
        harness.backend.commitSpace(invalid, 9_007_199_254_740_993n),
      ).resolves.toMatchObject({ kind: 'permanent-failure', code: 'invalid-snapshot' });
    } finally {
      await harness.close();
    }
  });
};
