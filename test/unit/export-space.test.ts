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
          positions: {
            [CARD_B]: { x: 260, y: 0, open: false },
            [CARD_A]: { x: 0, y: 0, open: false },
          },
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
          positions: {
            [CARD_E]: { x: 0, y: 200, open: false },
            [CARD_F]: { x: 260, y: 200, open: false },
          },
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
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);

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
          positions: {
            [CARD_A]: { x: 0, y: 0, open: false },
            [CARD_B]: { x: 260, y: 0, open: false },
          },
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
          positions: {
            [CARD_E]: { x: 0, y: 200, open: false },
            [CARD_F]: { x: 260, y: 200, open: false },
          },
          graphs: [{ id: ECHO_GRAPH_ID, title: 'Echo', edges: [{ from: CARD_E, to: CARD_F }] }],
        },
      ],
    });
  });

  /**
   * The same Space under a different insertion order, which is the only input
   * that can fail this.
   *
   * `jsonb` reorders an object's keys on write, so two databases holding
   * identical content can hand back objects whose keys arrive in different
   * orders — and a re-export must still produce no diff, because a canonical
   * directory is what a version-controlled Space *is*. Exporting one object
   * twice cannot show that: identical bytes would follow from `JSON.stringify`
   * alone, whatever ordering the exporter does or does not impose.
   *
   * So every object below is permuted against `storedSpace`: the document's
   * keys, each layout's, each graph's, each edge's, the position map's, each
   * *point's*, and the card array's. Only the exporter rebuilding all of them
   * makes the two agree.
   */
  const shuffledStoredSpace: LoadedSpace = {
    revision: 7n,
    exportedRevision: null,
    snapshot: {
      cards: [
        { id: CARD_A, document: { kind: 'markdown', body: 'A body.\n', title: 'A' } },
        { id: CARD_E, document: { body: 'E body.\n', title: 'E', kind: 'markdown' } },
        { id: CARD_B, document: { title: 'B', body: 'B body.\n', kind: 'markdown' } },
        { id: CARD_F, document: { kind: 'markdown', title: 'F', body: 'F body.\n' } },
      ],
      id: SPACE_ID,
      document: {
        title: 'Stored talk',
        layouts: [
          {
            kind: 'positioned',
            activeGraph: LONG_GRAPH_ID,
            graphs: [
              {
                color: '#22aa88',
                edges: [{ to: CARD_A, from: CARD_B }],
                title: 'Short',
                id: SHORT_GRAPH_ID,
              },
              { edges: [{ to: CARD_B, from: CARD_A }], id: LONG_GRAPH_ID, title: 'Long' },
            ],
            title: 'Spine',
            positions: {
              [CARD_A]: { y: 0, x: 0, open: false },
              [CARD_B]: { y: 0, x: 260, open: false },
            },
            id: SPINE_LAYOUT_ID,
          },
          {
            title: 'Echo',
            positions: {
              [CARD_F]: { y: 200, x: 260, open: false },
              [CARD_E]: { y: 200, x: 0, open: false },
            },
            graphs: [{ title: 'Echo', edges: [{ to: CARD_F, from: CARD_E }], id: ECHO_GRAPH_ID }],
            id: ECHO_LAYOUT_ID,
            kind: 'positioned',
          },
        ],
        version: 1,
      },
    },
  };

  it('exports one Space identically however its stored objects were ordered', async () => {
    const first = join(await makeTemporaryDirectory(), 'exported');
    const second = join(await makeTemporaryDirectory(), 'exported');

    await exportSpace(new MemorySpaceRepository([storedSpace], SPACE_ID), SPACE_ID, first);
    await exportSpace(new MemorySpaceRepository([shuffledStoredSpace], SPACE_ID), SPACE_ID, second);

    await expect(readFile(join(first, 'space.json'), 'utf8')).resolves.toBe(
      await readFile(join(second, 'space.json'), 'utf8'),
    );
    for (const cardId of [CARD_A, CARD_B, CARD_E, CARD_F]) {
      await expect(readFile(join(first, 'cards', `${cardId}.md`), 'utf8')).resolves.toBe(
        await readFile(join(second, 'cards', `${cardId}.md`), 'utf8'),
      );
    }
  });

  /**
   * Both arms of the placement union carrying a remembered Open Size (ADR 0066)
   * — an Open Card, and a Closed one that kept its rect for the next Open — each
   * stored *height first*, which is an order `jsonb` is free to hand back.
   */
  const storedSpaceWithOpenSizes: LoadedSpace = {
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
            positions: {
              [CARD_A]: { x: 0, y: 0, open: true, openSize: { height: 420, width: 560 } },
              [CARD_B]: { x: 260, y: 0, open: false, openSize: { height: 300, width: 400 } },
            },
            graphs: [{ id: LONG_GRAPH_ID, title: 'Long', edges: [{ from: CARD_A, to: CARD_B }] }],
          },
        ],
      },
      cards: [
        { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A body.\n' } },
        { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B body.\n' } },
      ],
    },
    revision: 7n,
    exportedRevision: null,
  };

  /**
   * The keys of every exported `openSize`, in the order the bytes hold them.
   * Read off the text rather than a parsed value: re-parsing through the schema
   * would impose the schema's own key order and hide the thing under test.
   */
  const exportedOpenSizeKeys = (json: string): string[][] =>
    [...json.matchAll(/"openSize": \{([^}]*)\}/g)].map((openSize) =>
      [...(openSize[1] ?? '').matchAll(/"(\w+)":/g)].map((key) => key[1] ?? ''),
    );

  it('writes every Open Size width before height, however it was stored', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const repository = new MemorySpaceRepository([storedSpaceWithOpenSizes], SPACE_ID);

    await exportSpace(repository, SPACE_ID, destination);

    const written = await readFile(join(destination, 'space.json'), 'utf8');
    // Positions export sorted by Card id, so the Open Card's rect is first and
    // the Closed Card's remembered rect second.
    expect(exportedOpenSizeKeys(written)).toEqual([
      ['width', 'height'],
      ['width', 'height'],
    ]);
    expect(JSON.parse(written)).toEqual({
      version: 1,
      id: SPACE_ID,
      title: 'Stored talk',
      layouts: [
        {
          id: SPINE_LAYOUT_ID,
          title: 'Spine',
          kind: 'positioned',
          positions: {
            [CARD_A]: { x: 0, y: 0, open: true, openSize: { width: 560, height: 420 } },
            [CARD_B]: { x: 260, y: 0, open: false, openSize: { width: 400, height: 300 } },
          },
          graphs: [{ id: LONG_GRAPH_ID, title: 'Long', edges: [{ from: CARD_A, to: CARD_B }] }],
        },
      ],
    });
  });

  /**
   * Separate from the ordering above: this is the staged, validated replacement
   * running over a destination it has already written, which is the path an
   * author actually repeats.
   */
  it('re-exports over its own output without changing a byte', async () => {
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    const destination = join(await makeTemporaryDirectory(), 'exported');

    await exportSpace(repository, SPACE_ID, destination);
    const afterFirst = await readFile(join(destination, 'space.json'), 'utf8');
    await exportSpace(repository, SPACE_ID, destination);

    await expect(readFile(join(destination, 'space.json'), 'utf8')).resolves.toBe(afterFirst);
  });

  it('exports a directory that imports back as the Space it came from', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);

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
