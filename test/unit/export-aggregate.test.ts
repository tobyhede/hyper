import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidSchema } from '@project/core';
import type { LoadedSpace } from '@project/persistence';
import { afterEach, describe, expect, it } from 'vitest';
import { exportAggregate } from '../../src/export/export-aggregate';
import { captureError } from '../support/capture-error';
import { MemorySpaceRepository } from '../support/memory-space-repository';

const SPACE_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000001');
const THING_A = uuidSchema.parse('a0000000-0000-4000-8000-000000000010');
const THING_B = uuidSchema.parse('a0000000-0000-4000-8000-000000000011');
const THING_E = uuidSchema.parse('a0000000-0000-4000-8000-000000000012');
const THING_F = uuidSchema.parse('a0000000-0000-4000-8000-000000000013');
const SPINE_DIAGRAM_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000020');
const ECHO_DIAGRAM_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000021');
const LONG_GRAPH_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000030');
const SHORT_GRAPH_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000031');
const ECHO_GRAPH_ID = uuidSchema.parse('a0000000-0000-4000-8000-000000000032');
/**
 * A UUID-shaped directory name in upper case. Canonical export writes a Space's
 * id in lower case and nothing else, so no export can have written this one.
 */
const UPPER_CASE_NAME = 'B0000000-0000-4000-8000-0000000000FF';

/**
 * What one Space's bytes look like is this file's whole subject, so every
 * aggregate below holds exactly one Space and that Space is Meta. The aggregate
 * shapes — the manifest, several Space directories, converging Space Things —
 * belong to `aggregate-round-trip.test.ts`, which owns the round trip; a second
 * Space here would only make the canonical form harder to read off the page.
 *
 * Two Diagrams owning three Graphs between them, which is the only shape that
 * exercises what version 1 moved: a Graph reached through its owner rather than
 * through a Space-level array. The second Diagram's Graph shares no Thing with the
 * first, so each owned Edge is closed over its own Diagram's position keys.
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
      diagrams: [
        {
          id: SPINE_DIAGRAM_ID,
          title: 'Spine',
          kind: 'positioned',
          positions: {
            [THING_B]: { x: 260, y: 0, open: false },
            [THING_A]: { x: 0, y: 0, open: false },
          },
          graphs: [
            {
              id: SHORT_GRAPH_ID,
              title: 'Short',
              color: '#22aa88',
              edges: [{ from: THING_B, to: THING_A }],
            },
            { id: LONG_GRAPH_ID, title: 'Long', edges: [{ from: THING_A, to: THING_B }] },
          ],
          activeGraph: LONG_GRAPH_ID,
        },
        {
          id: ECHO_DIAGRAM_ID,
          title: 'Echo',
          kind: 'positioned',
          positions: {
            [THING_E]: { x: 0, y: 200, open: false },
            [THING_F]: { x: 260, y: 200, open: false },
          },
          graphs: [{ id: ECHO_GRAPH_ID, title: 'Echo', edges: [{ from: THING_E, to: THING_F }] }],
        },
      ],
    },
    things: [
      { id: THING_B, document: { title: 'B', kind: 'markdown', body: 'B body.\n' } },
      { id: THING_A, document: { title: 'A', kind: 'markdown', body: 'A body.\n' } },
      { id: THING_F, document: { title: 'F', kind: 'markdown', body: 'F body.\n' } },
      { id: THING_E, document: { title: 'E', kind: 'markdown', body: 'E body.\n' } },
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

/**
 * Export, insisting the aggregate was there to export. `uninitialized` is a real
 * answer rather than a failure, so a test that means to write bytes has to say
 * which answer it expected or read an empty destination and blame the exporter.
 */
const exportTo = async (repository: MemorySpaceRepository, destination: string): Promise<void> => {
  const result = await exportAggregate(repository, destination);
  if (result.kind !== 'exported') throw new Error(`Export answered ${result.kind}`);
};

/** The Space's own directory under the aggregate root, named by its id. */
const spaceFileIn = (destination: string): string => join(destination, SPACE_ID, 'space.json');

afterEach(async () => {
  for (const directory of temporaryDirectories) {
    await rm(directory, { recursive: true, force: true });
  }
  temporaryDirectories.clear();
});

describe('canonical export', () => {
  it('emits a version 1 space file whose Graphs are nested under the Diagrams that own them', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);

    await exportTo(repository, destination);

    const written: unknown = JSON.parse(await readFile(spaceFileIn(destination), 'utf8'));
    expect(written).toEqual({
      version: 1,
      id: SPACE_ID,
      title: 'Stored talk',
      diagrams: [
        {
          id: SPINE_DIAGRAM_ID,
          title: 'Spine',
          kind: 'positioned',
          positions: {
            [THING_A]: { x: 0, y: 0, open: false },
            [THING_B]: { x: 260, y: 0, open: false },
          },
          graphs: [
            {
              id: SHORT_GRAPH_ID,
              title: 'Short',
              color: '#22aa88',
              edges: [{ from: THING_B, to: THING_A }],
            },
            { id: LONG_GRAPH_ID, title: 'Long', edges: [{ from: THING_A, to: THING_B }] },
          ],
          activeGraph: LONG_GRAPH_ID,
        },
        {
          id: ECHO_DIAGRAM_ID,
          title: 'Echo',
          kind: 'positioned',
          positions: {
            [THING_E]: { x: 0, y: 200, open: false },
            [THING_F]: { x: 260, y: 200, open: false },
          },
          graphs: [{ id: ECHO_GRAPH_ID, title: 'Echo', edges: [{ from: THING_E, to: THING_F }] }],
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
   * keys, each diagram's, each graph's, each edge's, the position map's, each
   * *point's*, and the thing array's. Only the exporter rebuilding all of them
   * makes the two agree.
   */
  const shuffledStoredSpace: LoadedSpace = {
    revision: 7n,
    exportedRevision: null,
    snapshot: {
      things: [
        { id: THING_A, document: { kind: 'markdown', body: 'A body.\n', title: 'A' } },
        { id: THING_E, document: { body: 'E body.\n', title: 'E', kind: 'markdown' } },
        { id: THING_B, document: { title: 'B', body: 'B body.\n', kind: 'markdown' } },
        { id: THING_F, document: { kind: 'markdown', title: 'F', body: 'F body.\n' } },
      ],
      id: SPACE_ID,
      document: {
        title: 'Stored talk',
        diagrams: [
          {
            kind: 'positioned',
            activeGraph: LONG_GRAPH_ID,
            graphs: [
              {
                color: '#22aa88',
                edges: [{ to: THING_A, from: THING_B }],
                title: 'Short',
                id: SHORT_GRAPH_ID,
              },
              { edges: [{ to: THING_B, from: THING_A }], id: LONG_GRAPH_ID, title: 'Long' },
            ],
            title: 'Spine',
            positions: {
              [THING_A]: { y: 0, x: 0, open: false },
              [THING_B]: { y: 0, x: 260, open: false },
            },
            id: SPINE_DIAGRAM_ID,
          },
          {
            title: 'Echo',
            positions: {
              [THING_F]: { y: 200, x: 260, open: false },
              [THING_E]: { y: 200, x: 0, open: false },
            },
            graphs: [{ title: 'Echo', edges: [{ to: THING_F, from: THING_E }], id: ECHO_GRAPH_ID }],
            id: ECHO_DIAGRAM_ID,
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

    await exportTo(new MemorySpaceRepository([storedSpace], SPACE_ID), first);
    await exportTo(new MemorySpaceRepository([shuffledStoredSpace], SPACE_ID), second);

    await expect(readFile(spaceFileIn(first), 'utf8')).resolves.toBe(
      await readFile(spaceFileIn(second), 'utf8'),
    );
    for (const thingId of [THING_A, THING_B, THING_E, THING_F]) {
      await expect(
        readFile(join(first, SPACE_ID, 'things', `${thingId}.md`), 'utf8'),
      ).resolves.toBe(await readFile(join(second, SPACE_ID, 'things', `${thingId}.md`), 'utf8'));
    }
  });

  /**
   * Both arms of the placement union carrying a remembered Open Size (ADR 0066)
   * — an Open Thing, and a Closed one that kept its rect for the next Open — each
   * stored *height first*, which is an order `jsonb` is free to hand back.
   */
  const storedSpaceWithOpenSizes: LoadedSpace = {
    snapshot: {
      id: SPACE_ID,
      document: {
        version: 1,
        title: 'Stored talk',
        diagrams: [
          {
            id: SPINE_DIAGRAM_ID,
            title: 'Spine',
            kind: 'positioned',
            positions: {
              [THING_A]: { x: 0, y: 0, open: true, openSize: { height: 420, width: 560 } },
              [THING_B]: { x: 260, y: 0, open: false, openSize: { height: 300, width: 400 } },
            },
            graphs: [{ id: LONG_GRAPH_ID, title: 'Long', edges: [{ from: THING_A, to: THING_B }] }],
          },
        ],
      },
      things: [
        { id: THING_A, document: { title: 'A', kind: 'markdown', body: 'A body.\n' } },
        { id: THING_B, document: { title: 'B', kind: 'markdown', body: 'B body.\n' } },
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

    await exportTo(repository, destination);

    const written = await readFile(spaceFileIn(destination), 'utf8');
    // Positions export sorted by Thing id, so the Open Thing's rect is first and
    // the Closed Thing's remembered rect second.
    expect(exportedOpenSizeKeys(written)).toEqual([
      ['width', 'height'],
      ['width', 'height'],
    ]);
    expect(JSON.parse(written)).toEqual({
      version: 1,
      id: SPACE_ID,
      title: 'Stored talk',
      diagrams: [
        {
          id: SPINE_DIAGRAM_ID,
          title: 'Spine',
          kind: 'positioned',
          positions: {
            [THING_A]: { x: 0, y: 0, open: true, openSize: { width: 560, height: 420 } },
            [THING_B]: { x: 260, y: 0, open: false, openSize: { width: 400, height: 300 } },
          },
          graphs: [{ id: LONG_GRAPH_ID, title: 'Long', edges: [{ from: THING_A, to: THING_B }] }],
        },
      ],
    });
  });

  /*
   * Staging is a copy of the destination, and verification re-reads the staged
   * copy through the ordinary import reader — which refuses a Space directory
   * whose name is not its Space's id. So a directory the author put there would
   * fail every export from that moment on, and the path the diagnostic names
   * lives inside a staging root deleted before the operator can read it.
   *
   * The destination is checked first, and by the path that is really there.
   */
  it('refuses a destination holding a Space directory import could not read back', async () => {
    const root = await makeTemporaryDirectory();
    const destination = join(root, 'exported');
    const drafts = join(destination, 'drafts');
    await mkdir(drafts, { recursive: true });
    await writeFile(join(drafts, 'space.json'), '{ "version": 1, "title": "Drafts" }\n');

    const thrown = await captureError(() =>
      exportAggregate(new MemorySpaceRepository([storedSpace], SPACE_ID), destination),
    );

    expect(thrown?.message).toContain(drafts);
    expect(thrown?.message).not.toContain('hyper-export-');
    // Nothing was staged beside the destination and nothing was written into it.
    await expect(readdir(root)).resolves.toEqual(['exported']);
    await expect(readdir(destination)).resolves.toEqual(['drafts']);
  });

  /*
   * `z.string().uuid()` is case insensitive, so an upper-cased UUID name parses
   * — and obsolete-directory removal is recursive. Canonical export only ever
   * writes lower case, so such a directory is the author's, and the rule that
   * justifies removing it ("a previous export wrote this") does not hold.
   */
  it('leaves a UUID-shaped directory no export could have written', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    await exportTo(repository, destination);
    const authored = join(destination, UPPER_CASE_NAME);
    await mkdir(authored);
    await writeFile(join(authored, 'notes.md'), '# Notes\n');

    await exportTo(repository, destination);

    await expect(readFile(join(authored, 'notes.md'), 'utf8')).resolves.toBe('# Notes\n');
  });

  /**
   * An uninitialized repository has no Meta Space, so there is no aggregate to
   * write and no directory whose absence would be a defect — the answer is a
   * kind rather than a thrown error, because "nothing has been created yet" is
   * a state the command reports rather than a failure it recovers from.
   *
   * The parent directory is what proves nothing was written, not the
   * destination: the staging root is minted *beside* the destination, so an
   * exporter that started work and then noticed would leave a sibling behind
   * where a check on the destination alone would still pass.
   */
  it('writes nothing and answers uninitialized when the repository holds no aggregate', async () => {
    const root = await makeTemporaryDirectory();

    await expect(
      exportAggregate(new MemorySpaceRepository(), join(root, 'exported')),
    ).resolves.toEqual({ kind: 'uninitialized' });

    await expect(readdir(root)).resolves.toEqual([]);
  });
});
