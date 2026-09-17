import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AGGREGATE_FILE_VERSION, uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AGGREGATE_FILE_NAME,
  writeSpaceDirectory as writeLoadedSpaceDirectory,
} from '../../src/aggregate-directory';
import { runHyper } from '../../src/cli/run';
import { SqliteSpaceRepository } from '../../src/persistence/sqlite-space-repository';
import { createSqliteDatabase } from '../../src/sqlite/db';
import { runHyperScript } from '../support/hyper-command';
import { migrateSqliteFile } from '../support/sqlite-harness';

const META_SPACE_ID = uuidSchema.parse('e1111111-1111-4111-8111-111111111111');
const TARGET_SPACE_ID = uuidSchema.parse('e2222222-2222-4222-8222-222222222222');
const OTHER_META_SPACE_ID = uuidSchema.parse('e3333333-3333-4333-8333-333333333333');
const THING_ID = uuidSchema.parse('e4444444-4444-4444-8444-444444444444');
const LINK_THING_ID = uuidSchema.parse('e5555555-5555-4555-8555-555555555555');
const DIAGRAM_ID = uuidSchema.parse('e6666666-6666-4666-8666-666666666666');
const GRAPH_ID = uuidSchema.parse('e7777777-7777-4777-8777-777777777777');

const targetSpace: SpaceSnapshot = {
  id: TARGET_SPACE_ID,
  document: {
    version: 1,
    title: 'Target',
    diagrams: [
      {
        id: DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: GRAPH_ID,
      },
    ],
    defaultDiagram: DIAGRAM_ID,
  },
  things: [],
};

const metaSpace: SpaceSnapshot = {
  id: META_SPACE_ID,
  document: { version: 1, title: 'Meta' },
  things: [
    {
      id: THING_ID,
      document: { title: 'Opening', kind: 'markdown', body: 'Durable SQLite body.\n' },
    },
    {
      id: LINK_THING_ID,
      document: {
        title: 'To the target',
        kind: 'space',
        spaceId: TARGET_SPACE_ID,
        diagram: DIAGRAM_ID,
        graph: GRAPH_ID,
      },
    },
  ],
};

const otherMeta: SpaceSnapshot = {
  id: OTHER_META_SPACE_ID,
  document: { version: 1, title: 'Other Meta' },
  things: [],
};

describe('hyper:sqlite CLI', () => {
  const temporaryDirectories = new Set<string>();

  afterEach(async () => {
    await Promise.all(
      [...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })),
    );
    temporaryDirectories.clear();
  });

  const temporaryDirectory = async (prefix: string): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), prefix));
    temporaryDirectories.add(directory);
    return directory;
  };

  /** A migrated file this test process owns alone. */
  const migratedFile = async (): Promise<string> => {
    const path = join(await temporaryDirectory('hyper-sqlite-cli-db-'), 'hyper.db');
    migrateSqliteFile(path);
    return path;
  };

  const aggregateDirectory = async (
    metaSpaceId: UUID,
    snapshots: readonly SpaceSnapshot[],
  ): Promise<string> => {
    const directory = await temporaryDirectory('hyper-sqlite-cli-aggregate-');
    await writeFile(
      join(directory, AGGREGATE_FILE_NAME),
      `${JSON.stringify({ version: AGGREGATE_FILE_VERSION, metaSpaceId }, null, 2)}\n`,
    );
    for (const snapshot of snapshots) {
      await writeLoadedSpaceDirectory(
        { snapshot, revision: 0n, exportedRevision: null },
        join(directory, snapshot.id),
      );
    }
    return directory;
  };

  /**
   * Open the file only for the duration of `body`, and close it before any
   * command runs, so no command shares a live file with this process.
   */
  const withRepository = async <T>(
    path: string,
    body: (repository: SqliteSpaceRepository) => Promise<T>,
  ): Promise<T> => {
    const database = createSqliteDatabase(path);
    try {
      return await body(new SqliteSpaceRepository(database));
    } finally {
      await database.close();
    }
  };

  const hyper = (path: string, args: readonly string[]) =>
    runHyperScript('hyper:sqlite', args, { SQLITE_PATH: path });

  it('initializes an empty file, reports an identical re-import as unchanged, and refuses a different one', async () => {
    const path = await migratedFile();
    const linked = await aggregateDirectory(META_SPACE_ID, [targetSpace, metaSpace]);

    await expect(hyper(path, [linked])).resolves.toEqual({
      status: 0,
      stdout:
        'Imported the aggregate\n' +
        `Imported space ${META_SPACE_ID} at revision 0\n` +
        `Imported space ${TARGET_SPACE_ID} at revision 0\n`,
      stderr: '',
    });
    await expect(hyper(path, [linked])).resolves.toEqual({
      status: 0,
      stdout:
        'The repository already holds this aggregate\n' +
        `Holds space ${META_SPACE_ID} at revision 0\n` +
        `Holds space ${TARGET_SPACE_ID} at revision 0\n`,
      stderr: '',
    });

    const different = await aggregateDirectory(OTHER_META_SPACE_ID, [otherMeta]);
    await expect(hyper(path, [different])).resolves.toEqual({
      status: 1,
      stdout: '',
      stderr: `The repository is already initialized as Meta Space ${META_SPACE_ID}. Re-run with --dangerous-truncate to replace it.\n`,
    });

    await withRepository(path, async (repository) => {
      await expect(repository.loadAggregate()).resolves.toEqual({
        kind: 'loaded',
        aggregate: {
          metaSpaceId: META_SPACE_ID,
          spaces: [
            { snapshot: metaSpace, revision: 0n, exportedRevision: null },
            { snapshot: targetSpace, revision: 0n, exportedRevision: null },
          ],
        },
      });
    });
  });

  it('replaces the stored aggregate only with --dangerous-truncate', async () => {
    const path = await migratedFile();
    const linked = await aggregateDirectory(META_SPACE_ID, [targetSpace, metaSpace]);
    expect((await hyper(path, [linked])).status).toBe(0);
    const different = await aggregateDirectory(OTHER_META_SPACE_ID, [otherMeta]);

    await expect(hyper(path, [different, '--dangerous-truncate'])).resolves.toEqual({
      status: 0,
      stdout: `Imported the aggregate\nImported space ${OTHER_META_SPACE_ID} at revision 0\n`,
      stderr: '',
    });

    await withRepository(path, async (repository) => {
      await expect(repository.loadAggregate()).resolves.toEqual({
        kind: 'loaded',
        aggregate: {
          metaSpaceId: OTHER_META_SPACE_ID,
          spaces: [{ snapshot: otherMeta, revision: 0n, exportedRevision: null }],
        },
      });
    });
  });

  /*
   * A stale Meta identity needs another writer between the command's read and
   * its replacement, which two processes cannot be made to interleave on cue.
   * So the command runs in this process, over a real SQLite repository whose
   * `loadMetaSpaceId` lets that writer in straight after answering.
   */
  it('answers a replacement authorized against a superseded Meta identity as a conflict', async () => {
    const path = await migratedFile();
    const linked = await aggregateDirectory(META_SPACE_ID, [targetSpace, metaSpace]);
    expect((await hyper(path, [linked])).status).toBe(0);
    const proposal = await aggregateDirectory(META_SPACE_ID, [targetSpace, metaSpace]);
    const output: string[] = [];

    const status = await withRepository(path, (repository) =>
      runHyper([proposal, '--dangerous-truncate'], {
        repository: {
          listSpaces: () => repository.listSpaces(),
          loadSpace: (id) => repository.loadSpace(id),
          loadAggregate: () => repository.loadAggregate(),
          initializeAggregate: (input) => repository.initializeAggregate(input),
          replaceAggregate: (input, expected) => repository.replaceAggregate(input, expected),
          markExported: (id, revision) => repository.markExported(id, revision),
          commit: (request) => repository.commit(request),
          loadMetaSpaceId: async () => {
            const read = await repository.loadMetaSpaceId();
            await repository.replaceAggregate(
              { metaSpaceId: OTHER_META_SPACE_ID, spaces: [otherMeta] },
              read,
            );
            return read;
          },
        },
        io: {
          stdout: (message) => output.push(message),
          stderr: (message) => output.push(message),
        },
        newId: () => {
          throw new Error('A fully identified aggregate mints nothing');
        },
      }),
    );

    expect(status).toBe(1);
    expect(output).toEqual([
      `The Meta Space changed to ${OTHER_META_SPACE_ID} during replacement. Nothing was written; run the command again.\n`,
    ]);
    await withRepository(path, async (repository) => {
      await expect(repository.loadAggregate()).resolves.toMatchObject({
        kind: 'loaded',
        aggregate: { metaSpaceId: OTHER_META_SPACE_ID },
      });
    });
  });

  it('truncates a file holding broken state with --dangerous-truncate, and only with it', async () => {
    const path = await migratedFile();
    // Written raw: no lifecycle door stores an aggregate whose Meta Space does
    // not reach every other Space.
    const database = createSqliteDatabase(path);
    try {
      await database.transaction(async ({ orm }) => {
        await orm.Space.create({
          id: OTHER_META_SPACE_ID,
          document: { version: 1, title: 'Broken Meta' },
          revision: '0',
        });
        await orm.Space.create({
          id: TARGET_SPACE_ID,
          document: { version: 1, title: 'Unreachable' },
          revision: '0',
        });
        await orm.RepositoryState.create({ singletonId: 1, metaSpaceId: OTHER_META_SPACE_ID });
      });
    } finally {
      await database.close();
    }
    const linked = await aggregateDirectory(META_SPACE_ID, [targetSpace, metaSpace]);

    const refused = await hyper(path, [linked]);
    expect(refused.status).toBe(1);
    expect(refused.stdout).toBe('');

    await expect(hyper(path, [linked, '--dangerous-truncate'])).resolves.toEqual({
      status: 0,
      stdout:
        'Imported the aggregate\n' +
        `Imported space ${META_SPACE_ID} at revision 0\n` +
        `Imported space ${TARGET_SPACE_ID} at revision 0\n`,
      stderr: '',
    });
    await withRepository(path, async (repository) => {
      await expect(repository.loadAggregate()).resolves.toEqual({
        kind: 'loaded',
        aggregate: {
          metaSpaceId: META_SPACE_ID,
          spaces: [
            { snapshot: metaSpace, revision: 0n, exportedRevision: null },
            { snapshot: targetSpace, revision: 0n, exportedRevision: null },
          ],
        },
      });
    });
  });

  it('exports the canonical directory, records the projected revisions, and survives reopen', async () => {
    const path = await migratedFile();
    const linked = await aggregateDirectory(META_SPACE_ID, [targetSpace, metaSpace]);
    expect((await hyper(path, [linked])).status).toBe(0);
    const destination = join(await temporaryDirectory('hyper-sqlite-cli-export-'), 'exported');

    await expect(hyper(path, ['export', destination])).resolves.toEqual({
      status: 0,
      stdout:
        `Exported the aggregate rooted at ${META_SPACE_ID} to ${destination}\n` +
        `Exported space ${META_SPACE_ID} at revision 0\n` +
        `Exported space ${TARGET_SPACE_ID} at revision 0\n`,
      stderr: '',
    });
    const aggregateFile: unknown = JSON.parse(
      await readFile(join(destination, AGGREGATE_FILE_NAME), 'utf8'),
    );
    expect(aggregateFile).toEqual({ version: AGGREGATE_FILE_VERSION, metaSpaceId: META_SPACE_ID });

    // A reopened file shows the recorded export; an Edit after it advances the
    // revision and leaves the projected one where the export put it.
    await withRepository(path, async (repository) => {
      await expect(repository.loadSpace(META_SPACE_ID)).resolves.toEqual({
        snapshot: metaSpace,
        revision: 0n,
        exportedRevision: 0n,
      });
      const edited = { ...metaSpace, document: { ...metaSpace.document, title: 'Edited' } };
      await expect(
        repository.commit({
          changes: [
            { kind: 'update', spaceId: META_SPACE_ID, snapshot: edited, expectedRevision: 0n },
          ],
        }),
      ).resolves.toMatchObject({ kind: 'committed' });
      await expect(repository.loadSpace(META_SPACE_ID)).resolves.toMatchObject({
        revision: 1n,
        exportedRevision: 0n,
      });
    });

    // The exported directory is an ordinary aggregate: a second, empty file
    // imports it whole. That is the only bridge between two databases.
    const second = await migratedFile();
    expect((await hyper(second, [destination])).status).toBe(0);
    await withRepository(second, async (repository) => {
      await expect(repository.loadAggregate()).resolves.toEqual({
        kind: 'loaded',
        aggregate: {
          metaSpaceId: META_SPACE_ID,
          spaces: [
            { snapshot: metaSpace, revision: 0n, exportedRevision: null },
            { snapshot: targetSpace, revision: 0n, exportedRevision: null },
          ],
        },
      });
    });
  });

  it('refuses to run without SQLITE_PATH naming a file', async () => {
    await expect(runHyperScript('hyper:sqlite', [], { SQLITE_PATH: '' })).resolves.toEqual({
      status: 1,
      stdout: '',
      stderr: 'SQLITE_PATH must name the SQLite database file\n',
    });
  });

  it('refuses a SQLITE_PATH naming no file and creates nothing there', async () => {
    const path = join(await temporaryDirectory('hyper-sqlite-cli-typo-'), 'hyper.db');

    await expect(hyper(path, [])).resolves.toEqual({
      status: 1,
      stdout: '',
      stderr: `Database open failed: SQLite database file does not exist: ${path}. Run pnpm db:migrate:sqlite first.\n`,
    });
    await expect(access(path)).rejects.toThrow();
  });
});
