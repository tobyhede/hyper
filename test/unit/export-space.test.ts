import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidSchema } from '@project/core';
import type { LoadedSpace } from '@project/persistence';
import { afterEach, describe, expect, it } from 'vitest';
import { exportSpace } from '../../src/export/export-space';
import { readSingleSpace } from '../../src/import/read-single-space';
import { MemorySpaceRepository } from '../support/memory-space-repository';

const SPACE_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('a0000000-0000-4000-8000-000000000010');
const CARD_B = uuidSchema.parse('a0000000-0000-4000-8000-000000000011');
const CARD_E = uuidSchema.parse('a0000000-0000-4000-8000-000000000012');
const CARD_F = uuidSchema.parse('a0000000-0000-4000-8000-000000000013');
const SPINE_LAYOUT_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000020');
const ECHO_LAYOUT_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000021');
const LONG_GRAPH_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000030');
const SHORT_GRAPH_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000031');
const ECHO_GRAPH_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000032');

/**
 * Two Layouts owning three Graphs between them, which is the only shape that
 * exercises what version 1 moved: a Graph reached through its owner rather than
 * through a Space-level array. The second Layout's Graph shares no Card with the
 * first, so each owned Edge is closed over its own Layout's position keys.
 *
 * Deliberately supplied *unsorted* — positions in descending key order, Graphs
 * in an order no sort would produce — so the canonical form's two different
 * answers are both visible: positions are ordered by the exporter, Graph order
 * is the author's and is carried through.
 */
const storedSpace: LoadedSpace = {
  snapshot: {
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'Stored talk',
      layouts: [
        {
          id: SPINE_LAYOUT_ID,
          title: 'Spine',
          kind: 'positioned',
          positions: { [CARD_B]: { x: 260, y: 0 }, [CARD_A]: { x: 0, y: 0 } },
          graphs: [
            {
              id: SHORT_GRAPH_ID,
              title: 'Short',
              color: '#22aa88',
              edges: [{ from: CARD_B, to: CARD_A }],
            },
            { id: LONG_GRAPH_ID, title: 'Long', edges: [{ from: CARD_A, to: CARD_B }] },
          ],
          activeGraph: LONG_GRAPH_ID,
        },
        {
          id: ECHO_LAYOUT_ID,
          title: 'Echo',
          kind: 'positioned',
          positions: { [CARD_E]: { x: 0, y: 200 }, [CARD_F]: { x: 260, y: 200 } },
          graphs: [{ id: ECHO_GRAPH_ID, title: 'Echo', edges: [{ from: CARD_E, to: CARD_F }] }],
        },
      ],
    },
    cards: [
      { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B body.\n' } },
      { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A body.\n' } },
      { id: CARD_F, document: { title: 'F', kind: 'markdown', body: 'F body.\n' } },
      { id: CARD_E, document: { title: 'E', kind: 'markdown', body: 'E body.\n' } },
    ],
  },
  revision: 7n,
  exportedRevision: null,
};

const temporaryDirectories = new Set<string>();

const makeTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'hyper-canonical-export-'));
  temporaryDirectories.add(directory);
  return directory;
};

afterEach(async () => {
  for (const directory of temporaryDirectories) {
    await rm(directory, { recursive: true, force: true });
  }
  temporaryDirectories.clear();
});

describe('canonical export', () => {
  it('emits a version 1 space file whose Graphs are nested under the Layouts that own them', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const repository = new MemorySpaceRepository([storedSpace]);

    await exportSpace(repository, SPACE_ID, destination);

    const written: unknown = JSON.parse(await readFile(join(destination, 'space.json'), 'utf8'));
    expect(written).toEqual({
      version: 1,
      id: SPACE_ID,
      title: 'Stored talk',
      layouts: [
        {
          id: SPINE_LAYOUT_ID,
          title: 'Spine',
          kind: 'positioned',
          positions: { [CARD_A]: { x: 0, y: 0 }, [CARD_B]: { x: 260, y: 0 } },
          graphs: [
            {
              id: SHORT_GRAPH_ID,
              title: 'Short',
              color: '#22aa88',
              edges: [{ from: CARD_B, to: CARD_A }],
            },
            { id: LONG_GRAPH_ID, title: 'Long', edges: [{ from: CARD_A, to: CARD_B }] },
          ],
          activeGraph: LONG_GRAPH_ID,
        },
        {
          id: ECHO_LAYOUT_ID,
          title: 'Echo',
          kind: 'positioned',
          positions: { [CARD_E]: { x: 0, y: 200 }, [CARD_F]: { x: 260, y: 200 } },
          graphs: [{ id: ECHO_GRAPH_ID, title: 'Echo', edges: [{ from: CARD_E, to: CARD_F }] }],
        },
      ],
    });
  });

  /**
   * Byte-identical, not merely equivalent. The canonical directory is what a
   * version-controlled Space *is*, so a re-export of content nothing has touched
   * must produce no diff — which means the exporter, not the stored order,
   * decides every ordering it emits: the position keys within a Layout, the key
   * order within each Graph, and the card files.
   */
  it('re-exports unchanged content byte-identically', async () => {
    const repository = new MemorySpaceRepository([storedSpace]);
    const first = join(await makeTemporaryDirectory(), 'exported');
    const second = join(await makeTemporaryDirectory(), 'exported');

    await exportSpace(repository, SPACE_ID, first);
    await exportSpace(repository, SPACE_ID, first);
    await exportSpace(repository, SPACE_ID, second);

    await expect(readFile(join(first, 'space.json'), 'utf8')).resolves.toBe(
      await readFile(join(second, 'space.json'), 'utf8'),
    );
    for (const cardId of [CARD_A, CARD_B, CARD_E, CARD_F]) {
      await expect(readFile(join(first, 'cards', `${cardId}.md`), 'utf8')).resolves.toBe(
        await readFile(join(second, 'cards', `${cardId}.md`), 'utf8'),
      );
    }
  });

  it('exports a directory that imports back as the Space it came from', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const repository = new MemorySpaceRepository([storedSpace]);

    await exportSpace(repository, SPACE_ID, destination);

    await expect(readSingleSpace(destination)).resolves.toEqual({
      id: SPACE_ID,
      document: storedSpace.snapshot.document,
      cards: [
        { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A body.\n' } },
        { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B body.\n' } },
        { id: CARD_E, document: { title: 'E', kind: 'markdown', body: 'E body.\n' } },
        { id: CARD_F, document: { title: 'F', kind: 'markdown', body: 'F body.\n' } },
      ],
    });
  });
});
