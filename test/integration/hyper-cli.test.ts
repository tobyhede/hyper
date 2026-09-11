import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AGGREGATE_FILE_VERSION, uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { serializeThingFile } from '@project/graph';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalThing } from '../../src/export/canonical-space';
import { AGGREGATE_FILE_NAME } from '../../src/import/read-aggregate';
import { readSingleSpace } from '../../src/import/read-single-space';
import { PostgresSpaceRepository } from '../../src/persistence/postgres-space-repository';
import { db } from '../../src/prisma/db';
import { clearHyperContent } from '../support/clear-hyper-content';

const IMPORTED_SPACE_ID = uuidSchema.parse('d1111111-1111-4111-8111-111111111111');
const MALFORMED_SPACE_ID = uuidSchema.parse('d2222222-2222-4222-8222-222222222222');
const UNRELATED_SPACE_ID = uuidSchema.parse('d3333333-3333-4333-8333-333333333333');
const REFUSED_IMPORT_SPACE_ID = uuidSchema.parse('d4444444-4444-4444-8444-444444444444');
const TARGET_SPACE_ID = uuidSchema.parse('d5555555-5555-4555-8555-555555555555');
const META_SPACE_ID = uuidSchema.parse('d6666666-6666-4666-8666-666666666666');
const EXPORTED_THING_ID = uuidSchema.parse('d7777777-7777-4777-8777-777777777777');
const TARGET_DIAGRAM_ID = uuidSchema.parse('d8888888-8888-4888-8888-888888888888');
const TARGET_GRAPH_ID = uuidSchema.parse('d9999999-9999-4999-8999-999999999999');
const LINK_THING_ID = uuidSchema.parse('dabababa-abab-4bab-8bab-abababababab');

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

const CLI_PROCESS_TIMEOUT_MS = 10_000;

const runHyperCommand = (args: readonly string[]): Promise<CommandResult> =>
  new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['--silent', 'hyper', '--', ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    const settle = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.stdout.removeListener('data', captureStdout);
      child.stderr.removeListener('data', captureStderr);
      child.removeListener('error', handleError);
      child.removeListener('close', handleClose);
      complete();
    };
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeoutError = new Error(`hyper CLI command timed out after ${CLI_PROCESS_TIMEOUT_MS}ms`);
    const captureStdout = (chunk: string): void => {
      stdout += chunk;
    };
    const captureStderr = (chunk: string): void => {
      stderr += chunk;
    };
    const handleError = (error: Error): void => {
      settle(() => reject(timedOut ? timeoutError : error));
    };
    const handleClose = (status: number | null): void => {
      settle(() => {
        if (timedOut) reject(timeoutError);
        else resolve({ status, stdout, stderr });
      });
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', captureStdout);
    child.stderr.on('data', captureStderr);
    child.once('error', handleError);
    child.once('close', handleClose);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, CLI_PROCESS_TIMEOUT_MS);
  });

/**
 * The Space the Meta below points at, carrying the Diagram and Graph that Space
 * Thing selects.
 *
 * An ordinary Space nothing references is `ordinary-space-unreferenced`, so an
 * aggregate is not a bag of Spaces that happen to be in one directory — Meta has
 * to reach every other Space in it. That is the rule the public commands now
 * import and export against, and it is why the multi-Space cases below are built
 * as a linked pair rather than as two independent Spaces.
 */
const targetSpaceSnapshot: SpaceSnapshot = {
  id: TARGET_SPACE_ID,
  document: {
    version: 1,
    title: 'Target space',
    diagrams: [
      {
        id: TARGET_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: TARGET_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: TARGET_GRAPH_ID,
      },
    ],
    defaultDiagram: TARGET_DIAGRAM_ID,
  },
  things: [],
};

/**
 * Meta, and deliberately the *later* directory name of the two.
 *
 * `d6666…` sorts after `d5555…`, so the reader meets the ordinary Space first.
 * Nothing may infer Meta from that order (ADR 0078) — `hyper.json` states it —
 * and building the fixture this way is what makes the inference observable if it
 * ever comes back.
 */
const metaSpaceSnapshot: SpaceSnapshot = {
  id: META_SPACE_ID,
  document: { version: 1, title: 'Meta space' },
  things: [
    {
      id: LINK_THING_ID,
      document: {
        title: 'To the target',
        kind: 'space',
        spaceId: TARGET_SPACE_ID,
        diagram: TARGET_DIAGRAM_ID,
        graph: TARGET_GRAPH_ID,
      },
    },
  ],
};

const linkedPair = { metaSpaceId: META_SPACE_ID, spaces: [targetSpaceSnapshot, metaSpaceSnapshot] };

describe('hyper CLI', () => {
  const repository = new PostgresSpaceRepository(db);
  const temporaryDirectories = new Set<string>();

  const temporaryDirectory = async (prefix: string): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), prefix));
    temporaryDirectories.add(directory);
    return directory;
  };

  /** One Space of an aggregate, in the directory named for its own Id. */
  const writeSpaceDirectory = async (
    aggregate: string,
    snapshot: SpaceSnapshot,
  ): Promise<string> => {
    const directory = join(aggregate, snapshot.id);
    await mkdir(join(directory, 'things'), { recursive: true });
    await writeFile(
      join(directory, 'space.json'),
      `${JSON.stringify({ ...snapshot.document, id: snapshot.id }, null, 2)}\n`,
    );
    for (const thing of snapshot.things) {
      await writeFile(
        join(directory, 'things', `${thing.id}.md`),
        serializeThingFile(canonicalThing(thing.id, thing.document)),
      );
    }
    return directory;
  };

  /**
   * A canonical aggregate directory: a versioned `hyper.json` naming Meta, plus
   * one `<space-uuid>/` child per Space.
   *
   * A bare Space directory is no longer what the public command takes, so every
   * fixture here is built through this — a directory with no manifest is a
   * different failure, not a shorter fixture.
   */
  const makeAggregateDirectory = async (
    metaSpaceId: UUID,
    snapshots: readonly SpaceSnapshot[],
  ): Promise<string> => {
    const directory = await temporaryDirectory('hyper-cli-integration-');
    await writeFile(
      join(directory, AGGREGATE_FILE_NAME),
      `${JSON.stringify({ version: AGGREGATE_FILE_VERSION, metaSpaceId }, null, 2)}\n`,
    );
    for (const snapshot of snapshots) await writeSpaceDirectory(directory, snapshot);
    return directory;
  };

  const seedAggregate = async (input: {
    metaSpaceId: UUID;
    spaces: readonly SpaceSnapshot[];
  }): Promise<void> => {
    const result = await repository.initializeAggregate(input);
    if (result.kind !== 'initialized') {
      throw new Error(`Could not seed the aggregate: ${result.kind}`);
    }
  };

  /*
   * Every Hyper row, before each case rather than a list of the ids one created.
   *
   * The two lifecycle doors are whole-aggregate doors: `--dangerous-truncate`
   * deletes rows this file never named, and an id-less Thing in a fixture is
   * minted during import, so a per-id cleanup list cannot be written from what
   * the test knows. Clearing up front also gives the `hyper` startup cases the
   * empty repository they assert against, rather than inheriting whatever the
   * previous case left. Safe because `fileParallelism` is off: one integration
   * file at a time owns the single `DATABASE_URL`.
   */
  beforeEach(clearHyperContent);

  afterEach(async () => {
    await Promise.all(
      [...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })),
    );
    temporaryDirectories.clear();
  });

  afterAll(async () => {
    await clearHyperContent();
    await db.close();
  });

  it('imports through the real command and durably reports the stored space', async () => {
    const directory = await makeAggregateDirectory(IMPORTED_SPACE_ID, [
      { id: IMPORTED_SPACE_ID, document: { version: 1, title: 'CLI imported talk' }, things: [] },
    ]);
    // Written by hand rather than through `serializeThingFile`, because the id
    // is the point: a hand-authored aggregate may leave out a nested id nothing
    // can reference, and import mints it. Every *Space* Id stays explicit.
    await writeFile(
      join(directory, IMPORTED_SPACE_ID, 'things', 'opening.md'),
      '---\ntitle: Opening\n---\nDurable CLI body.\n',
    );

    const result = await runHyperCommand([directory]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      `Imported the aggregate\nImported space ${IMPORTED_SPACE_ID} at revision 0\n`,
    );
    expect(result.stderr).toBe('');
    const stored = await repository.loadSpace(IMPORTED_SPACE_ID);
    expect(stored?.revision).toBe(0n);
    expect(stored?.snapshot.document).toEqual({
      version: 1,
      title: 'CLI imported talk',
    });
    expect(stored?.snapshot.things).toHaveLength(1);
    expect(uuidSchema.safeParse(stored?.snapshot.things[0]?.id).success).toBe(true);
    expect(stored?.snapshot.things[0]?.document).toEqual({
      title: 'Opening',
      kind: 'markdown',
      body: 'Durable CLI body.\n',
    });

    // The manifest named Meta and the repository stored what it named. Nothing
    // else selects it: there is no mutable flag to point somewhere else, and no
    // position in the input for it to be read off (ADR 0078).
    await expect(repository.loadAggregate()).resolves.toMatchObject({
      kind: 'loaded',
      aggregate: { metaSpaceId: IMPORTED_SPACE_ID },
    });
  });

  it('imports every Space of an aggregate and takes Meta from hyper.json', async () => {
    const directory = await makeAggregateDirectory(META_SPACE_ID, [
      targetSpaceSnapshot,
      metaSpaceSnapshot,
    ]);

    const result = await runHyperCommand([directory]);

    // Reported in stored id order, which is `loadEverySpace`'s. That puts the
    // ordinary Space first and Meta second — the opposite of what an importer
    // inferring Meta from position would have produced.
    expect(result).toEqual({
      status: 0,
      stdout:
        'Imported the aggregate\n' +
        `Imported space ${TARGET_SPACE_ID} at revision 0\n` +
        `Imported space ${META_SPACE_ID} at revision 0\n`,
      stderr: '',
    });
    await expect(repository.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: {
        metaSpaceId: META_SPACE_ID,
        spaces: [
          { snapshot: targetSpaceSnapshot, revision: 0n, exportedRevision: null },
          { snapshot: metaSpaceSnapshot, revision: 0n, exportedRevision: null },
        ],
      },
    });
  });

  it('refuses an import over an initialized repository and leaves the Meta Space alone', async () => {
    await seedAggregate({
      metaSpaceId: UNRELATED_SPACE_ID,
      spaces: [
        { id: UNRELATED_SPACE_ID, document: { version: 1, title: 'Unrelated talk' }, things: [] },
      ],
    });
    const directory = await makeAggregateDirectory(REFUSED_IMPORT_SPACE_ID, [
      {
        id: REFUSED_IMPORT_SPACE_ID,
        document: { version: 1, title: 'Fresh imported talk' },
        things: [],
      },
    ]);

    const result = await runHyperCommand([directory]);

    // There is no third outcome to fall into. Import either establishes first
    // state or, with `--dangerous-truncate`, replaces it; adding a Space beside
    // stored content is not a mode any more (ADR 0078), so an initialized
    // repository is told what it holds and what flag would replace it.
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      `The repository is already initialized as Meta Space ${UNRELATED_SPACE_ID}. Re-run with --dangerous-truncate to replace it.\n`,
    );
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: UNRELATED_SPACE_ID, title: 'Unrelated talk' },
    ]);
    await expect(repository.loadSpace(REFUSED_IMPORT_SPACE_ID)).resolves.toBeUndefined();
    await expect(repository.loadAggregate()).resolves.toMatchObject({
      kind: 'loaded',
      aggregate: { metaSpaceId: UNRELATED_SPACE_ID },
    });
  });

  it('exports through the real command and records the projected PostgreSQL revision', async () => {
    const snapshot: SpaceSnapshot = {
      id: IMPORTED_SPACE_ID,
      document: { version: 1, title: 'CLI exported talk' },
      things: [
        {
          id: EXPORTED_THING_ID,
          document: {
            title: 'Exported thing',
            kind: 'markdown',
            body: 'Canonical export.\n',
          },
        },
      ],
    };
    await seedAggregate({ metaSpaceId: IMPORTED_SPACE_ID, spaces: [snapshot] });
    const destination = await temporaryDirectory('hyper-cli-export-');

    // One argument, because export takes the whole aggregate. The Space-scoped
    // `hyper export <space-uuid> <destination>` is retired: a Space on its own
    // is not something the format can round-trip, since a Space Thing pointing
    // out of it would name a target the directory does not hold.
    const result = await runHyperCommand(['export', destination]);

    expect(result).toEqual({
      status: 0,
      stdout:
        `Exported the aggregate rooted at ${IMPORTED_SPACE_ID} to ${destination}\n` +
        `Exported space ${IMPORTED_SPACE_ID} at revision 0\n`,
      stderr: '',
    });
    const manifest: unknown = JSON.parse(
      await readFile(join(destination, AGGREGATE_FILE_NAME), 'utf8'),
    );
    expect(manifest).toEqual({ version: AGGREGATE_FILE_VERSION, metaSpaceId: IMPORTED_SPACE_ID });
    // Read back through the ordinary single-Space reader, from the child named
    // for the Space. The directory name is where a Space Id is written down, so
    // addressing it by that name is also the assertion that it was.
    await expect(readSingleSpace(join(destination, IMPORTED_SPACE_ID))).resolves.toEqual({
      id: snapshot.id,
      document: snapshot.document,
      things: snapshot.things,
    });
    await expect(
      readFile(join(destination, IMPORTED_SPACE_ID, 'things', `${EXPORTED_THING_ID}.md`), 'utf8'),
    ).resolves.toContain(`id: ${EXPORTED_THING_ID}`);
    await expect(repository.loadSpace(IMPORTED_SPACE_ID)).resolves.toEqual({
      snapshot,
      revision: 0n,
      exportedRevision: 0n,
    });
  });

  it('round-trips the stored aggregate through the real export and import commands', async () => {
    await seedAggregate(linkedPair);
    const destination = await temporaryDirectory('hyper-cli-round-trip-');

    const exported = await runHyperCommand(['export', destination]);
    expect(exported).toEqual({
      status: 0,
      stdout:
        `Exported the aggregate rooted at ${META_SPACE_ID} to ${destination}\n` +
        `Exported space ${TARGET_SPACE_ID} at revision 0\n` +
        `Exported space ${META_SPACE_ID} at revision 0\n`,
      stderr: '',
    });

    // The repository is initialized, so re-importing what it just wrote needs
    // the destructive flag — which is the round trip worth proving. Without it
    // the command would refuse, and the two halves would never meet.
    const reimported = await runHyperCommand([destination, '--dangerous-truncate']);
    expect(reimported).toEqual({
      status: 0,
      stdout:
        'Imported the aggregate\n' +
        `Imported space ${TARGET_SPACE_ID} at revision 0\n` +
        `Imported space ${META_SPACE_ID} at revision 0\n`,
      stderr: '',
    });

    // The same aggregate, including the Space Thing's own Diagram and Graph
    // selection: a round trip that dropped either would leave a Space Thing
    // pointing at a Space and at nothing inside it (ADR 0079).
    //
    // `exportedRevision` is back to `null` because replacement rewrote the rows
    // the export had marked. That is honest rather than lossy — these are not
    // the rows that were exported.
    await expect(repository.loadAggregate()).resolves.toEqual({
      kind: 'loaded',
      aggregate: {
        metaSpaceId: META_SPACE_ID,
        spaces: [
          { snapshot: targetSpaceSnapshot, revision: 0n, exportedRevision: null },
          { snapshot: metaSpaceSnapshot, revision: 0n, exportedRevision: null },
        ],
      },
    });
  });

  it('creates and opens a fully identified new space when the database is empty', async () => {
    const result = await runHyperCommand([]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const catalog = await repository.listSpaces();
    expect(catalog).toHaveLength(1);
    const created = catalog[0];
    if (created === undefined) throw new Error('Expected the new space in the catalog');
    expect(result.stdout).toBe(`Opened space ${created.id} at revision 0\n`);
    expect(created.title).toBe('New space');
    const stored = await repository.loadSpace(created.id);
    // A new Space begins complete: its Thing is already placed in an authored
    // default Diagram with one empty Active Graph (ADR 0079, ADR 0080). Every id
    // in it is minted, so the shape is asserted against the ones that arrived.
    const diagram = stored?.snapshot.document.diagrams?.[0];
    if (diagram === undefined) throw new Error('Expected the new space to arrive with its Diagram');
    const graph = diagram.graphs[0];
    if (graph === undefined) throw new Error('Expected the new Diagram to arrive with its Graph');
    const thingId = stored?.snapshot.things[0]?.id;
    if (thingId === undefined) throw new Error('Expected the new space to arrive with its Thing');
    expect(stored).toEqual({
      snapshot: {
        id: created.id,
        document: {
          version: 1,
          title: 'New space',
          diagrams: [
            {
              id: diagram.id,
              title: 'Diagram 1',
              kind: 'positioned',
              positions: { [thingId]: { x: 0, y: 0, open: false } },
              graphs: [{ id: graph.id, title: 'Graph 1', edges: [] }],
              activeGraph: graph.id,
            },
          ],
          defaultDiagram: diagram.id,
        },
        things: [
          {
            id: thingId,
            document: { title: 'Thing 1', kind: 'markdown', body: '' },
          },
        ],
      },
      revision: 0n,
      exportedRevision: null,
    });
    for (const id of [thingId, diagram.id, graph.id]) {
      expect(uuidSchema.safeParse(id).success).toBe(true);
    }
  });

  it('reopens the sole stored space without duplicating it', async () => {
    const firstResult = await runHyperCommand([]);
    expect(firstResult.status).toBe(0);
    const firstCatalog = await repository.listSpaces();
    const created = firstCatalog[0];
    if (created === undefined) throw new Error('Expected the first command to create a space');
    const firstStored = await repository.loadSpace(created.id);
    expect(firstResult).toEqual({
      status: 0,
      stdout: `Opened space ${created.id} at revision 0\n`,
      stderr: '',
    });
    expect(firstStored?.revision).toBe(0n);

    const secondResult = await runHyperCommand([]);

    expect(secondResult).toEqual({
      status: 0,
      stdout: `Opened space ${created.id} at revision 0\n`,
      stderr: '',
    });
    await expect(repository.listSpaces()).resolves.toEqual([created]);
    await expect(repository.loadSpace(created.id)).resolves.toEqual(firstStored);
  });

  it('reports a malformed thing path and stores no partial space', async () => {
    const directory = await makeAggregateDirectory(MALFORMED_SPACE_ID, [
      { id: MALFORMED_SPACE_ID, document: { version: 1, title: 'CLI imported talk' }, things: [] },
    ]);
    const thingPath = join(directory, MALFORMED_SPACE_ID, 'things', 'broken.md');
    await writeFile(thingPath, 'Missing frontmatter.\n');

    const result = await runHyperCommand([directory]);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(thingPath);
    await expect(repository.loadSpace(MALFORMED_SPACE_ID)).resolves.toBeUndefined();
  });
});
