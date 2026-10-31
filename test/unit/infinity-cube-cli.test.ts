import { access, lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newUuid, uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import type { LoadedSpace } from '@project/persistence';
import { afterEach, describe, expect, it } from 'vitest';
import { runDatabaseCli } from '../../src/cli/database-entry';
import type { DatabaseCommand, RunCommand } from '../../src/cli/arguments';
import type { CliIo } from '../../src/cli/io';
import { runInfinityCube } from '../../src/cli/run';
import { describeRunRefusal } from '../../src/cli/run-refusal';
import { startRun } from '../../src/run/run';
import type { DatabaseTarget } from '../../src/database/database-target';
import { type SpaceRepository, AGGREGATE_FILE_NAME } from '@project/aggregate';
import { readSingleSpace } from '../../src/aggregate-directory';
import {
  filesUnder,
  markdownResourceFiles,
  writeAggregateInto,
  type SpaceDirectory,
} from '../support/aggregate-directory';
import { MemorySpaceRepository } from '@project/aggregate';
import { runCommand } from '../support/infinity-cube-command';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { callTool } from '../support/mcp-tool-answer';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const RESOURCE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const GRAPH_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const OTHER_SPACE_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const THIRD_SPACE_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');
const OPENING_ID = uuidSchema.parse('66666666-6666-4666-8666-666666666666');

/** Stored resource's Resource file, as Export writes it: envelope keys in order, two-space indent. */
const STORED_RESOURCE_FILE = `${JSON.stringify(
  {
    id: RESOURCE_ID,
    title: 'Stored resource',
    kind: 'markdown',
    content: { path: `${RESOURCE_ID}.md`, mediaType: 'text/markdown' },
  },
  null,
  2,
)}\n`;

const USAGE = 'Usage: cube <init|run|check|mcp|import|export|help> [arguments]\n';

const storedSpace: LoadedSpace = {
  snapshot: {
    id: SPACE_ID,
    document: { version: 1, title: 'Stored talk' },
    resources: [
      {
        id: RESOURCE_ID,
        document: {
          title: 'Stored resource',
          kind: 'markdown',
          content: { source: 'Stored body.\n' },
        },
      },
    ],
  },
  revision: 0n,
  exportedRevision: null,
};

const temporaryDirectories: string[] = [];

const makeTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'infinity-cube-cli-unit-'));
  temporaryDirectories.push(directory);
  return directory;
};

/**
 * Build a canonical aggregate directory: a versioned `aggregate.json` naming the
 * Meta Space, and one `<space-uuid>/` child per Space. Public import takes
 * nothing else, so every import test starts here rather than at a bare Space
 * directory.
 */
const writeAggregate = async (
  metaSpaceId: UUID,
  spaces: readonly SpaceDirectory[],
): Promise<string> => writeAggregateInto(await makeTemporaryDirectory(), metaSpaceId, spaces);

/** One Meta Space alone, which is the smallest complete aggregate there is. */
const writeSingleSpaceAggregate = (id: UUID = SPACE_ID, title = 'Imported talk'): Promise<string> =>
  writeAggregate(id, [
    {
      name: id,
      spaceFile: JSON.stringify({ version: 1, id, title }),
      resources: markdownResourceFiles(OPENING_ID, 'Opening', 'Hello.\n'),
    },
  ]);

interface CapturedIo {
  readonly io: CliIo;
  readonly stdout: string[];
  readonly stderr: string[];
}

const captureIo = (): CapturedIo => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    },
    stdout,
    stderr,
  };
};

interface OverRepository {
  readonly repository: SpaceRepository;
  readonly io: CliIo;
  readonly newId: () => UUID;
}

/** A target over a repository the test already holds, closed as a no-op. */
const heldTarget = (repository: SpaceRepository): DatabaseTarget => ({
  open: () => Promise.resolve({ repository, close: () => Promise.resolve() }),
});

/** A target the command line must never reach. */
const unreachedTarget = (store: string): DatabaseTarget => ({
  open: () => Promise.reject(new Error(`${store} was opened`)),
});

/**
 * The author verbs' half of a command line's dependencies, for a command that
 * must reach neither: a working directory nothing is written under, and a
 * launcher that refuses.
 */
const unlaunched = {
  workingDirectory: '/infinity-cube-cli-unit/unreached',
  launchRun: () => Promise.reject(new Error('A run was launched')),
  serveMcp: () => Promise.reject(new Error('An MCP server was served')),
};

/** Run a command line whose default store, PostgreSQL, is the held repository. */
const infinityCubeOver = (
  args: readonly string[],
  { repository, io, newId }: OverRepository,
): Promise<number> =>
  runInfinityCube(args, {
    io,
    newId,
    targets: { postgres: heldTarget(repository), sqlite: unreachedTarget('sqlite') },
    ...unlaunched,
  });

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('runInfinityCube', () => {
  it('exports the stored aggregate to the canonical version 1 directory', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const output = captureIo();

    const exitCode = await infinityCubeOver(['export', destination], {
      repository: new MemorySpaceRepository([storedSpace], SPACE_ID),
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(0);
    expect(output.stdout).toEqual([
      `Exported the aggregate rooted at ${SPACE_ID} to ${destination}\n`,
      `Exported space ${SPACE_ID} at revision 0\n`,
    ]);
    expect(output.stderr).toEqual([]);
    await expect(readFile(join(destination, AGGREGATE_FILE_NAME), 'utf8')).resolves.toBe(
      `${JSON.stringify({ version: 1, metaSpaceId: SPACE_ID }, null, 2)}\n`,
    );
    await expect(readFile(join(destination, SPACE_ID, 'space.json'), 'utf8')).resolves.toBe(
      `${JSON.stringify({ version: 1, id: SPACE_ID, title: 'Stored talk' }, null, 2)}\n`,
    );
    await expect(
      readFile(join(destination, SPACE_ID, 'resources', `${RESOURCE_ID}.json`), 'utf8'),
    ).resolves.toBe(STORED_RESOURCE_FILE);
    await expect(
      readFile(join(destination, SPACE_ID, 'resources', `${RESOURCE_ID}.md`), 'utf8'),
    ).resolves.toBe('Stored body.\n');
  });

  /*
   * Export is whole-aggregate, so there is no Space to name and no Space to get
   * wrong; the one input left that can be missing is the aggregate itself. An
   * uninitialized repository is a fact about the database rather than bad input,
   * so it exits 1 rather than 2 and writes nothing.
   */
  it('refuses to export a repository that holds no aggregate', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const output = captureIo();

    const exitCode = await infinityCubeOver(['export', destination], {
      repository: new MemorySpaceRepository(),
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([
      'The repository is not initialized, so there is no aggregate to export\n',
    ]);
    await expect(access(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('replaces discovered files while preserving files outside space discovery', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const spaceDirectory = join(destination, SPACE_ID);
    await mkdir(join(spaceDirectory, 'resources', 'nested'), { recursive: true });
    await writeFile(join(spaceDirectory, 'space.json'), '{}\n');
    await writeFile(join(spaceDirectory, 'stale-root.md'), 'stale\n');
    await writeFile(join(spaceDirectory, 'resources', 'stale.md'), 'stale\n');
    await writeFile(join(spaceDirectory, 'resources', 'stale.json'), '{}\n');
    await writeFile(join(spaceDirectory, 'resources', 'nested', 'keep.json'), '{}\n');
    await writeFile(join(spaceDirectory, 'notes.txt'), 'keep space\n');
    await writeFile(join(spaceDirectory, 'resources', 'nested', 'keep.md'), 'keep nested\n');
    await writeFile(join(destination, 'notes.txt'), 'keep root\n');

    const exitCode = await infinityCubeOver(['export', destination], {
      repository: new MemorySpaceRepository([storedSpace], SPACE_ID),
      io: captureIo().io,
      newId: newUuid,
    });

    expect(exitCode).toBe(0);
    await expect(access(join(spaceDirectory, 'stale-root.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(access(join(spaceDirectory, 'resources', 'stale.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(access(join(spaceDirectory, 'resources', 'stale.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      readFile(join(spaceDirectory, 'resources', 'nested', 'keep.json'), 'utf8'),
    ).resolves.toBe('{}\n');
    await expect(readFile(join(destination, 'notes.txt'), 'utf8')).resolves.toBe('keep root\n');
    await expect(readFile(join(spaceDirectory, 'notes.txt'), 'utf8')).resolves.toBe('keep space\n');
    await expect(
      readFile(join(spaceDirectory, 'resources', 'nested', 'keep.md'), 'utf8'),
    ).resolves.toBe('keep nested\n');
  });

  it('records the exact revision only after every file is written', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const revision = 9_007_199_254_740_993n;
    const repository = new MemorySpaceRepository([{ ...storedSpace, revision }], SPACE_ID);

    await expect(
      infinityCubeOver(['export', destination], {
        repository,
        io: captureIo().io,
        newId: newUuid,
      }),
    ).resolves.toBe(0);

    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      revision,
      exportedRevision: revision,
    });
  });

  it('reports a write that fails part-way, records nothing, and leaves the files it did not reach', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const spaceDirectory = join(destination, SPACE_ID);
    await mkdir(spaceDirectory, { recursive: true });
    await writeFile(join(spaceDirectory, 'space.json'), 'previous space\n');
    await writeFile(join(spaceDirectory, 'resources'), 'not a directory\n');
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    const output = captureIo();

    await expect(
      infinityCubeOver(['export', destination], { repository, io: output.io, newId: newUuid }),
    ).resolves.toBe(1);

    expect(output.stderr[0]).toMatch(/^Export failed:/);
    await expect(readFile(join(spaceDirectory, 'space.json'), 'utf8')).resolves.toBe(
      'previous space\n',
    );
    await expect(readFile(join(spaceDirectory, 'resources'), 'utf8')).resolves.toBe(
      'not a directory\n',
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: null,
    });
  });

  it('renders an Aggregate intake refusal of the files Export would write, and writes nothing', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const orphan = uuidSchema.parse('c0000000-0000-4000-8000-0000000000aa');
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    repository.loadAggregate = () =>
      Promise.resolve({
        kind: 'loaded',
        aggregate: {
          metaSpaceId: SPACE_ID,
          spaces: [
            storedSpace,
            {
              snapshot: { id: orphan, document: { version: 1, title: 'Orphan' }, resources: [] },
              revision: 0n,
              exportedRevision: null,
            },
          ],
        },
      });
    const output = captureIo();

    await expect(
      infinityCubeOver(['export', destination], { repository, io: output.io, newId: newUuid }),
    ).resolves.toBe(1);

    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([
      `Exported aggregate does not read back as a valid aggregate:\nSpace ${orphan} is not the Meta Space and no Space Resource points at it\n`,
    ]);
  });

  it('rejects a symlinked destination without changing its external target', async () => {
    const parent = await makeTemporaryDirectory();
    const external = await makeTemporaryDirectory();
    const destination = join(parent, 'exported');
    await mkdir(join(external, SPACE_ID, 'resources'), { recursive: true });
    await writeFile(join(external, SPACE_ID, 'space.json'), 'external space\n');
    await writeFile(join(external, SPACE_ID, 'resources', 'external.md'), 'external resource\n');
    await symlink(external, destination);
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    const output = captureIo();

    await expect(
      infinityCubeOver(['export', destination], { repository, io: output.io, newId: newUuid }),
    ).resolves.toBe(1);

    expect(output.stderr).toEqual([
      `Export failed: Export destination contains a symbolic link: ${destination}\n`,
    ]);
    expect((await lstat(destination)).isSymbolicLink()).toBe(true);
    await expect(readFile(join(external, SPACE_ID, 'space.json'), 'utf8')).resolves.toBe(
      'external space\n',
    );
    await expect(
      readFile(join(external, SPACE_ID, 'resources', 'external.md'), 'utf8'),
    ).resolves.toBe('external resource\n');
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: null,
    });
  });

  it('rejects a symlinked resources directory without changing the destination or external resources', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const spaceDirectory = join(destination, SPACE_ID);
    const externalResources = await makeTemporaryDirectory();
    await mkdir(spaceDirectory, { recursive: true });
    await writeFile(join(spaceDirectory, 'space.json'), 'previous space\n');
    await writeFile(join(destination, 'notes.txt'), 'keep root\n');
    await writeFile(join(externalResources, 'external.md'), 'external resource\n');
    await symlink(externalResources, join(spaceDirectory, 'resources'));
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    const output = captureIo();

    await expect(
      infinityCubeOver(['export', destination], { repository, io: output.io, newId: newUuid }),
    ).resolves.toBe(1);

    expect(output.stderr).toEqual([
      `Export failed: Export destination contains a symbolic link: ${join(spaceDirectory, 'resources')}\n`,
    ]);
    expect((await lstat(join(spaceDirectory, 'resources'))).isSymbolicLink()).toBe(true);
    await expect(readFile(join(spaceDirectory, 'space.json'), 'utf8')).resolves.toBe(
      'previous space\n',
    );
    await expect(readFile(join(destination, 'notes.txt'), 'utf8')).resolves.toBe('keep root\n');
    await expect(readFile(join(externalResources, 'external.md'), 'utf8')).resolves.toBe(
      'external resource\n',
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: null,
    });
  });

  it('rejects a symlinked canonical resource file without changing its external target', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const spaceDirectory = join(destination, SPACE_ID);
    const external = join(await makeTemporaryDirectory(), 'external.json');
    await mkdir(join(spaceDirectory, 'resources'), { recursive: true });
    await writeFile(join(spaceDirectory, 'space.json'), 'previous space\n');
    await writeFile(external, 'external resource\n');
    await symlink(external, join(spaceDirectory, 'resources', `${RESOURCE_ID}.json`));
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    const output = captureIo();

    await expect(
      infinityCubeOver(['export', destination], { repository, io: output.io, newId: newUuid }),
    ).resolves.toBe(1);

    expect(output.stderr).toEqual([
      `Export failed: Export destination contains a symbolic link: ${join(spaceDirectory, 'resources', `${RESOURCE_ID}.json`)}\n`,
    ]);
    expect(
      (await lstat(join(spaceDirectory, 'resources', `${RESOURCE_ID}.json`))).isSymbolicLink(),
    ).toBe(true);
    await expect(readFile(join(spaceDirectory, 'space.json'), 'utf8')).resolves.toBe(
      'previous space\n',
    );
    await expect(readFile(external, 'utf8')).resolves.toBe('external resource\n');
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: null,
    });
  });

  it('marks the projected revision when a newer edit commits during export', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    const markExported = repository.markExported.bind(repository);
    repository.markExported = async (id, revision) => {
      const changed: SpaceSnapshot = {
        ...storedSpace.snapshot,
        document: { ...storedSpace.snapshot.document, title: 'Edited during export' },
      };
      await expect(
        repository.commit({
          changes: [
            {
              kind: 'update',
              spaceId: changed.id,
              snapshot: changed,
              expectedRevision: 0n,
            },
          ],
        }),
      ).resolves.toEqual({
        kind: 'committed',
        revisions: [{ spaceId: changed.id, revision: 1n }],
        deletedSpaceIds: [],
      });
      await markExported(id, revision);
    };

    await expect(
      infinityCubeOver(['export', destination], {
        repository,
        io: captureIo().io,
        newId: newUuid,
      }),
    ).resolves.toBe(0);

    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      snapshot: { document: { title: 'Edited during export' } },
      revision: 1n,
      exportedRevision: 0n,
    });
    await expect(readFile(join(destination, SPACE_ID, 'space.json'), 'utf8')).resolves.toContain(
      '"title": "Stored talk"',
    );
  });

  /*
   * The bytes landed, so the export happened, and nothing may say otherwise.
   * `markExported` runs after replacement precisely so a failure here cannot
   * corrupt the destination, and an unrecorded revision reads as changed since
   * its last export — the conservative direction, which invites an export that
   * was already done rather than hiding one that never happened.
   *
   * Reporting it as `Export failed` with exit 1 would invert that: the one state
   * this design chose to be safe would become the one the operator is told to
   * treat as a failure, and would plausibly answer by re-running or discarding
   * the destination. The reasons have to reach the terminal too — an
   * `AggregateError`'s `errors`, not only its `message` — so the operator learns
   * which Space and why.
   */
  it('reports a completed export whose projected revision could not be recorded', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    repository.markExported = () => Promise.reject(new Error('connection lost'));
    const output = captureIo();

    await expect(
      infinityCubeOver(['export', destination], { repository, io: output.io, newId: newUuid }),
    ).resolves.toBe(0);

    expect(output.stdout).toEqual([
      `Exported the aggregate rooted at ${SPACE_ID} to ${destination}\n`,
      `Exported space ${SPACE_ID} at revision 0\n`,
    ]);
    const reported = output.stderr.join('');
    expect(reported).toContain('was exported');
    expect(reported).toContain(SPACE_ID);
    expect(reported).toContain('connection lost');
    // The whole point of the ordering: the files are complete and valid even
    // though the revision behind them was never written down.
    await expect(readFile(join(destination, SPACE_ID, 'space.json'), 'utf8')).resolves.toContain(
      '"title": "Stored talk"',
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: null,
    });
  });

  it('writes deterministic fully identified files that re-enter through version 1 intake', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const snapshot: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 1,
        title: 'Canonical: talk',
        maps: [
          {
            id: OTHER_SPACE_ID,
            title: 'Authored map',
            kind: 'positioned',
            positions: {
              [THIRD_SPACE_ID]: { x: 30, y: 40, open: false },
              [RESOURCE_ID]: { x: 10, y: 20, open: false },
            },
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Main graph',
                color: '#123456',
                edges: [{ from: RESOURCE_ID, to: THIRD_SPACE_ID }],
              },
            ],
            activeGraph: GRAPH_ID,
          },
        ],
        defaultMap: OTHER_SPACE_ID,
      },
      resources: [
        {
          id: THIRD_SPACE_ID,
          document: {
            title: 'Reference Resource: opening',
            kind: 'reference',
            content: { target: RESOURCE_ID },
          },
        },
        {
          id: RESOURCE_ID,
          document: {
            title: 'Opening: why',
            kind: 'markdown',
            content: { source: '# Opening\n\nHello.\n' },
          },
        },
      ],
    };

    await expect(
      infinityCubeOver(['export', destination], {
        repository: new MemorySpaceRepository(
          [{ snapshot, revision: 7n, exportedRevision: null }],
          SPACE_ID,
        ),
        io: captureIo().io,
        newId: newUuid,
      }),
    ).resolves.toBe(0);

    const exportedJson = await readFile(join(destination, SPACE_ID, 'space.json'), 'utf8');
    const positionsJson = exportedJson.slice(exportedJson.indexOf('"positions"'));
    expect(positionsJson.indexOf(`"${RESOURCE_ID}"`)).toBeLessThan(
      positionsJson.indexOf(`"${THIRD_SPACE_ID}"`),
    );
    await expect(readSingleSpace(join(destination, SPACE_ID))).resolves.toEqual({
      id: snapshot.id,
      document: snapshot.document,
      resources: [...snapshot.resources].reverse(),
    });
  });

  it('canonicalizes a Resource file independently of document key insertion order', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const reordered: LoadedSpace = {
      ...storedSpace,
      snapshot: {
        ...storedSpace.snapshot,
        resources: [
          {
            id: RESOURCE_ID,
            document: {
              kind: 'markdown',
              content: { source: 'Stored body.\n' },
              title: 'Stored resource',
            },
          },
        ],
      },
    };

    await expect(
      infinityCubeOver(['export', destination], {
        repository: new MemorySpaceRepository([reordered], SPACE_ID),
        io: captureIo().io,
        newId: newUuid,
      }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(destination, SPACE_ID, 'resources', `${RESOURCE_ID}.json`), 'utf8'),
    ).resolves.toBe(STORED_RESOURCE_FILE);
  });

  it('normalizes exported Markdown line endings to LF', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const withMixedLineEndings: LoadedSpace = {
      ...storedSpace,
      snapshot: {
        ...storedSpace.snapshot,
        resources: [
          {
            id: RESOURCE_ID,
            document: {
              title: 'Stored resource',
              kind: 'markdown',
              content: { source: 'First\r\nSecond\rThird\n' },
            },
          },
        ],
      },
    };

    await expect(
      infinityCubeOver(['export', destination], {
        repository: new MemorySpaceRepository([withMixedLineEndings], SPACE_ID),
        io: captureIo().io,
        newId: newUuid,
      }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(destination, SPACE_ID, 'resources', `${RESOURCE_ID}.md`), 'utf8'),
    ).resolves.toBe('First\nSecond\nThird\n');
  });

  /*
   * Export takes a destination and nothing else because it is whole-aggregate,
   * so the Space-scoped `cube export <space-uuid> <destination>` is wrong arity
   * rather than a Space that cannot be found — which is why it belongs with the
   * other malformed command lines and exits 2. A path with no verb is a usage
   * error too: the verb is never implied by the arguments.
   */
  it.each([
    { args: [] },
    { args: ['space'] },
    { args: ['first', 'second'] },
    { args: ['--dangerous-replace'] },
    { args: ['--dangerous-truncate'] },
    { args: ['space', '--unknown'] },
    { args: ['help', 'import'] },
    { args: ['import'] },
    { args: ['import', 'first', 'second'] },
    { args: ['import', 'space', '--dangerous-truncate'] },
    { args: ['import', 'space', '--dangerous-replace', '--dangerous-replace'] },
    { args: ['import', 'space', '--store'] },
    { args: ['import', 'space', '--store', 'memory'] },
    { args: ['import', 'space', '--store', 'sqlite', '--store', 'postgres'] },
    { args: ['import', 'space', '--store=sqlite'] },
    { args: ['export'] },
    { args: ['export', SPACE_ID, 'destination'] },
    /*
     * An option is never a destination. Accepted on arity alone, an operator
     * mixing the two commands would write a complete aggregate into a directory
     * named after the flag and be told nothing.
     */
    { args: ['export', '--dangerous-replace'] },
    { args: ['export', 'destination', '--dangerous-replace'] },
    { args: ['export', '--unknown'] },
    { args: ['export', ''] },
    { args: ['import', ''] },
    { args: ['init'] },
    { args: ['init', ''] },
    { args: ['init', 'first', 'second'] },
    { args: ['init', '--no-open'] },
    { args: ['init', 'talk', '--no-open'] },
    { args: ['init', 'talk', '--store', 'postgres'] },
    { args: ['init', 'talk', '--store', 'sqlite'] },
    { args: ['check'] },
    { args: ['check', ''] },
    { args: ['check', 'first', 'second'] },
    { args: ['check', 'talk', '--no-open'] },
    { args: ['check', 'talk', '--store', 'sqlite'] },
    { args: ['mcp'] },
    { args: ['mcp', ''] },
    { args: ['mcp', 'first', 'second'] },
    { args: ['mcp', 'talk', '--no-open'] },
    { args: ['mcp', 'talk', '--store', 'sqlite'] },
    { args: ['run'] },
    { args: ['run', ''] },
    { args: ['run', 'first', 'second'] },
    { args: ['run', '--no-open'] },
    { args: ['run', 'talk', '--store', 'postgres'] },
    { args: ['run', 'talk', '--store', 'sqlite'] },
    { args: ['run', 'talk', '--dangerous-replace'] },
    { args: ['run', 'talk', '--port'] },
    { args: ['run', 'talk', '--port', '0'] },
    { args: ['run', 'talk', '--port', '65536'] },
    { args: ['run', 'talk', '--port', 'eighty'] },
    { args: ['run', 'talk', '--port', '4173', '--port', '4174'] },
  ])('rejects invalid arguments $args without opening a store', async ({ args }) => {
    const output = captureIo();

    const exitCode = await runInfinityCube(args, {
      io: output.io,
      newId: newUuid,
      targets: { postgres: unreachedTarget('postgres'), sqlite: unreachedTarget('sqlite') },
      ...unlaunched,
    });

    expect(exitCode).toBe(2);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([USAGE]);
  });

  it('reports the stored space identity and lossless bigint revision', async () => {
    // Past `Number.MAX_SAFE_INTEGER`, so a revision that went through `Number`
    // anywhere would print 9007199254740992 and fail here. Revision 0 cannot
    // catch that, and a revision codec that narrowed through `Number` on
    // either database (ADR 0095's shared `decodeStoredRevision`/
    // `encodeStoredRevision`, `packages/persistence/src/revision-codec.ts`)
    // is exactly the kind of edit that would reintroduce it.
    //
    // A real initialization mints revision 0, so the revision is bent on the way
    // back out of the seam rather than stubbed: what is under test is the
    // sentence the CLI writes about a `LoadedSpace`, not how the repository
    // arrived at one.
    const revision = 9_007_199_254_740_993n;
    const directory = await writeSingleSpaceAggregate();
    const repository = new MemorySpaceRepository();
    const initializeAggregate = repository.initializeAggregate.bind(repository);
    repository.initializeAggregate = async (input) => {
      const result = await initializeAggregate(input);
      if (result.kind !== 'initialized') return result;
      return {
        kind: 'initialized',
        aggregate: {
          ...result.aggregate,
          spaces: result.aggregate.spaces.map((space) => ({ ...space, revision })),
        },
      };
    };
    const output = captureIo();

    const exitCode = await infinityCubeOver(['import', directory], {
      repository,
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(0);
    expect(output.stdout).toEqual([
      'Imported the aggregate\n',
      `Imported space ${SPACE_ID} at revision 9007199254740993\n`,
    ]);
    expect(output.stderr).toEqual([]);
  });

  /*
   * A second run of the same command wrote nothing, and the per-Space lines have
   * to say so too: "Imported space ..." under "already holds this aggregate"
   * contradicts the headline, and a script reading the output cannot tell a
   * no-op from a real write.
   */
  it('reports a re-import of the same aggregate without claiming to have written', async () => {
    // Every id is written down, because `existing` is decided by deep equality
    // against what is stored — a Resource id minted afresh on the second run would
    // make the two aggregates differ and take the `already-initialized` door.
    const directory = await writeAggregate(SPACE_ID, [
      {
        name: SPACE_ID,
        spaceFile: JSON.stringify({ version: 1, id: SPACE_ID, title: 'Imported talk' }),
        resources: markdownResourceFiles(RESOURCE_ID, 'Opening', 'Hello.\n'),
      },
    ]);
    const repository = new MemorySpaceRepository();
    await infinityCubeOver(['import', directory], {
      repository,
      io: captureIo().io,
      newId: newUuid,
    });
    const output = captureIo();

    const exitCode = await infinityCubeOver(['import', directory], {
      repository,
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(0);
    expect(output.stdout).toEqual([
      'The repository already holds this aggregate\n',
      `Holds space ${SPACE_ID} at revision 0\n`,
    ]);
    expect(output.stderr).toEqual([]);
  });

  it('replaces the stored aggregate when --dangerous-replace is given', async () => {
    const directory = await writeSingleSpaceAggregate(OTHER_SPACE_ID, 'Replacement talk');
    const output = captureIo();
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);

    const exitCode = await infinityCubeOver(['import', directory, '--dangerous-replace'], {
      repository,
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(0);
    expect(output.stdout).toEqual([
      'Imported the aggregate\n',
      `Imported space ${OTHER_SPACE_ID} at revision 0\n`,
    ]);
    expect(output.stderr).toEqual([]);
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: OTHER_SPACE_ID, title: 'Replacement talk' },
    ]);
  });

  /*
   * The SQL repository's replacement can conflict on a stored Space that
   * changed mid-replacement without the Meta identity itself moving at all —
   * the row lock loop in `SqlSpaceRepository.replaceAggregate` re-reads the
   * current Meta identity after rolling back, and that read answers the same
   * id the command already expected. The sentence must not claim that id is
   * new.
   */
  it('does not claim the Meta identity moved when replacement conflicts with the same id it expected', async () => {
    const directory = await writeSingleSpaceAggregate(OTHER_SPACE_ID, 'Replacement talk');
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    repository.replaceAggregate = () =>
      Promise.resolve({ kind: 'conflict', currentMetaSpaceId: SPACE_ID });
    const output = captureIo();

    const exitCode = await infinityCubeOver(['import', directory, '--dangerous-replace'], {
      repository,
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([
      `The repository changed during replacement; it now holds Meta Space ${SPACE_ID}. Nothing was written; run the command again.\n`,
    ]);
  });

  /*
   * There is no public merge, so the only operation an import into an initialized
   * repository could do is destroy what is there. It refuses instead, and the
   * refusal has to name both the Meta identity in the way and the flag that
   * would proceed — the operator cannot recognise what they are about to lose
   * from an exit code.
   */
  it('refuses to import over an initialized repository, naming the flag that would proceed', async () => {
    const directory = await writeSingleSpaceAggregate(OTHER_SPACE_ID, 'Replacement talk');
    const output = captureIo();
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);

    const exitCode = await infinityCubeOver(['import', directory], {
      repository,
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).not.toBe(0);
    expect(output.stdout).toEqual([]);
    expect(output.stderr.join('')).toContain(SPACE_ID);
    expect(output.stderr.join('')).toContain('--dangerous-replace');
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: SPACE_ID, title: 'Stored talk' },
    ]);
  });

  it('reports every file diagnostic with its path', async () => {
    const root = await makeTemporaryDirectory();
    const spaceDirectory = join(root, SPACE_ID);
    await mkdir(spaceDirectory);
    await writeFile(
      join(root, AGGREGATE_FILE_NAME),
      JSON.stringify({ version: 1, metaSpaceId: SPACE_ID }),
    );
    await mkdir(join(spaceDirectory, 'resources'));
    const firstResourcePath = join(spaceDirectory, 'resources', `${RESOURCE_ID}.json`);
    const secondResourcePath = join(spaceDirectory, 'second.md');
    await writeFile(join(spaceDirectory, 'space.json'), '{ invalid JSON');
    await writeFile(firstResourcePath, '{ invalid JSON');
    await writeFile(secondResourcePath, 'No Resource file names this.\n');
    const output = captureIo();
    const repository = new MemorySpaceRepository();

    const exitCode = await infinityCubeOver(['import', root], {
      repository,
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr.join('')).toContain(join(spaceDirectory, 'space.json'));
    expect(output.stderr.join('')).toContain(firstResourcePath);
    expect(output.stderr.join('')).toContain(secondResourcePath);
    await expect(repository.loadAggregate()).resolves.toEqual({ kind: 'uninitialized' });
  });

  /*
   * The fault is produced for real: a directory whose two maps own one graph
   * id, read off disk, identified, and put through domain intake by a real
   * repository. A graph id is unique across the space although one map owns it
   * (ADR 0108).
   *
   * A duplicate graph id is a whole-Space fault, so it arrives as one
   * `invalid-space-snapshot`, and printing the kind alone would leave an author
   * holding a directory and the word "invalid" — when the only part they can act
   * on is *which two* collided. `describeAggregateRefusal` renders the structured
   * error instead, which is why both colliding Map ids are nameable below.
   */
  it('refuses a graph id two maps own, naming both of them', async () => {
    const root = await writeAggregate(SPACE_ID, [
      {
        name: SPACE_ID,
        spaceFile: JSON.stringify({
          version: 1,
          id: SPACE_ID,
          title: 'Two owners',
          maps: [
            {
              id: OTHER_SPACE_ID,
              title: 'First owner',
              kind: 'positioned',
              positions: { [RESOURCE_ID]: { x: 0, y: 0, open: false } },
              graphs: [
                { id: GRAPH_ID, title: 'Shared', edges: [{ from: RESOURCE_ID, to: RESOURCE_ID }] },
              ],
            },
            {
              id: THIRD_SPACE_ID,
              title: 'Second owner',
              kind: 'positioned',
              positions: { [RESOURCE_ID]: { x: 10, y: 10, open: false } },
              graphs: [
                { id: GRAPH_ID, title: 'Shared', edges: [{ from: RESOURCE_ID, to: RESOURCE_ID }] },
              ],
            },
          ],
        }),
        resources: markdownResourceFiles(RESOURCE_ID, 'Opening', 'Hello.\n'),
      },
    ]);
    const output = captureIo();
    const repository = new MemorySpaceRepository();

    const exitCode = await infinityCubeOver(['import', root], {
      repository,
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    const reported = output.stderr.join('');
    expect(reported).toContain(`Space ${SPACE_ID} did not load:`);
    expect(reported).toContain(GRAPH_ID);
    expect(reported).toContain(OTHER_SPACE_ID);
    expect(reported).toContain(THIRD_SPACE_ID);
    await expect(repository.loadAggregate()).resolves.toEqual({ kind: 'uninitialized' });
  });

  it('classifies an unexpected repository failure as a database failure without a stack', async () => {
    const directory = await writeSingleSpaceAggregate();
    const output = captureIo();
    const repository = new MemorySpaceRepository();
    repository.initializeAggregate = () => Promise.reject(new Error('connection lost'));

    const exitCode = await infinityCubeOver(['import', directory], {
      repository,
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual(['Database import failed: connection lost\n']);
  });

  it('does not load a successfully imported Space', async () => {
    const directory = await writeSingleSpaceAggregate();
    const output = captureIo();
    const repository = new MemorySpaceRepository();
    repository.loadSpace = () => Promise.reject(new Error('load unavailable'));

    const exitCode = await infinityCubeOver(['import', directory], {
      repository,
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(0);
    expect(output.stdout).toEqual([
      'Imported the aggregate\n',
      `Imported space ${SPACE_ID} at revision 0\n`,
    ]);
    expect(output.stderr).toEqual([]);
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: SPACE_ID, title: 'Imported talk' },
    ]);
  });

  it('refuses a batch that is not one Meta-rooted aggregate', async () => {
    const root = await writeAggregate(SPACE_ID, [
      {
        name: SPACE_ID,
        spaceFile: JSON.stringify({ version: 1, id: SPACE_ID, title: 'First imported' }),
      },
      {
        name: OTHER_SPACE_ID,
        spaceFile: JSON.stringify({ version: 1, id: OTHER_SPACE_ID, title: 'Second imported' }),
      },
    ]);
    const output = captureIo();
    const repository = new MemorySpaceRepository();
    repository.listSpaces = () => Promise.reject(new Error('catalog unavailable'));

    const exitCode = await infinityCubeOver(['import', root], {
      repository,
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([
      `Aggregate validation failed:\nSpace ${OTHER_SPACE_ID} is not the Meta Space and no Space Resource points at it\n`,
    ]);
    await expect(repository.loadAggregate()).resolves.toEqual({ kind: 'uninitialized' });
  });

  it.each([{ args: ['help'] }, { args: ['--help'] }])(
    'prints every verb for $args, the author verbs first, without opening a store',
    async ({ args }) => {
      const output = captureIo();

      const exitCode = await runInfinityCube(args, {
        io: output.io,
        newId: newUuid,
        targets: { postgres: unreachedTarget('postgres'), sqlite: unreachedTarget('sqlite') },
        ...unlaunched,
      });

      expect(exitCode).toBe(0);
      expect(output.stderr).toEqual([]);
      const verbLines = output.stdout
        .join('')
        .split('\n')
        .filter((line) => line.startsWith('  cube '));
      expect(verbLines.map((line) => line.split(/\s+/)[2])).toEqual([
        'init',
        'run',
        'check',
        'mcp',
        'import',
        'export',
        'help',
      ]);
      expect(verbLines.find((line) => line.includes(' import '))).toContain(
        '--store postgres|sqlite',
      );
      expect(verbLines.find((line) => line.includes(' import '))).toContain('--dangerous-replace');
      expect(verbLines.find((line) => line.includes(' export '))).toContain(
        '--store postgres|sqlite',
      );
    },
  );

  it.each([
    { verb: 'import', store: 'sqlite' },
    { verb: 'export', store: 'sqlite' },
    { verb: 'import', store: 'postgres' },
    { verb: 'export', store: 'postgres' },
  ] as const)('opens only the store --store $store names for $verb', async ({ verb, store }) => {
    const repository = new MemorySpaceRepository();
    const directory =
      verb === 'import'
        ? await writeSingleSpaceAggregate()
        : join(await makeTemporaryDirectory(), 'exported');
    if (verb === 'export') {
      expect(
        await infinityCubeOver(['import', await writeSingleSpaceAggregate()], {
          repository,
          io: captureIo().io,
          newId: newUuid,
        }),
      ).toBe(0);
    }
    const output = captureIo();
    const other = store === 'sqlite' ? 'postgres' : 'sqlite';
    const targets =
      store === 'sqlite'
        ? { sqlite: heldTarget(repository), postgres: unreachedTarget(other) }
        : { postgres: heldTarget(repository), sqlite: unreachedTarget(other) };

    const exitCode = await runInfinityCube([verb, directory, '--store', store], {
      io: output.io,
      newId: newUuid,
      targets,
      ...unlaunched,
    });

    expect(output.stderr).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it('accepts --store before the directory and beside --dangerous-replace', async () => {
    const directory = await writeSingleSpaceAggregate(OTHER_SPACE_ID, 'Replacement talk');
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    const output = captureIo();

    const exitCode = await runInfinityCube(
      ['import', '--store', 'sqlite', '--dangerous-replace', directory],
      {
        io: output.io,
        newId: newUuid,
        targets: { sqlite: heldTarget(repository), postgres: unreachedTarget('postgres') },
        ...unlaunched,
      },
    );

    expect(output.stderr).toEqual([]);
    expect(exitCode).toBe(0);
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: OTHER_SPACE_ID, title: 'Replacement talk' },
    ]);
  });

  it('resolves a relative import or export directory against where the author invoked pnpm', async () => {
    const directory = await writeSingleSpaceAggregate();
    const workingDirectory = dirname(directory);
    const repository = new MemorySpaceRepository();
    const output = captureIo();
    const over = (args: readonly string[]) =>
      runInfinityCube(args, {
        io: output.io,
        newId: newUuid,
        targets: { postgres: heldTarget(repository), sqlite: unreachedTarget('sqlite') },
        ...unlaunched,
        workingDirectory,
      });

    expect(await over(['import', basename(directory)])).toBe(0);
    expect(await over(['export', 'exported'])).toBe(0);

    expect(output.stderr).toEqual([]);
    expect(output.stdout).toContain(
      `Exported the aggregate rooted at ${SPACE_ID} to ${join(workingDirectory, 'exported')}\n`,
    );
    await expect(
      access(join(workingDirectory, 'exported', AGGREGATE_FILE_NAME)),
    ).resolves.toBeUndefined();
  });
});

const exportTo = (directory: string): DatabaseCommand => ({
  verb: 'export',
  directory,
  store: 'postgres',
});

const importFrom = (directory: string): DatabaseCommand => ({
  verb: 'import',
  directory,
  store: 'postgres',
  replace: false,
});

describe('runDatabaseCli', () => {
  /** A target over `repository` that closes through `close`. */
  const targetOver = (repository: SpaceRepository, close: () => Promise<void>): DatabaseTarget => ({
    open: () => Promise.resolve({ repository, close }),
  });

  it('closes the database after an export succeeds', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const output = captureIo();
    let closed = false;

    const exitCode = await runDatabaseCli(
      targetOver(new MemorySpaceRepository([storedSpace], SPACE_ID), () => {
        closed = true;
        return Promise.resolve();
      }),
      exportTo(destination),
      { io: output.io, newId: newUuid },
    );

    expect(exitCode).toBe(0);
    expect(closed).toBe(true);
    expect(output.stderr).toEqual([]);
  });

  it('closes the database after an export fails', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const output = captureIo();
    const repository = new MemorySpaceRepository();
    repository.loadAggregate = () => Promise.reject(new Error('catalog unavailable'));
    let closed = false;

    const exitCode = await runDatabaseCli(
      targetOver(repository, () => {
        closed = true;
        return Promise.resolve();
      }),
      exportTo(destination),
      { io: output.io, newId: newUuid },
    );

    expect(exitCode).toBe(1);
    expect(closed).toBe(true);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual(['Export failed: catalog unavailable\n']);
  });

  it('preserves the import result after awaiting a successful database close', async () => {
    const directory = await writeSingleSpaceAggregate();
    const output = captureIo();
    let closed = false;

    const exitCode = await runDatabaseCli(
      targetOver(new MemorySpaceRepository(), () => {
        closed = true;
        return Promise.resolve();
      }),
      importFrom(directory),
      { io: output.io, newId: newUuid },
    );

    expect(exitCode).toBe(0);
    expect(closed).toBe(true);
    expect(output.stdout).toEqual([
      'Imported the aggregate\n',
      `Imported space ${SPACE_ID} at revision 0\n`,
    ]);
    expect(output.stderr).toEqual([]);
  });

  it('classifies database shutdown failure without leaking a stack trace', async () => {
    const directory = await writeSingleSpaceAggregate();
    const output = captureIo();

    const exitCode = await runDatabaseCli(
      targetOver(new MemorySpaceRepository(), () => Promise.reject(new Error('socket stuck'))),
      importFrom(directory),
      { io: output.io, newId: newUuid },
    );

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([
      'Imported the aggregate\n',
      `Imported space ${SPACE_ID} at revision 0\n`,
    ]);
    expect(output.stderr).toEqual(['Database shutdown failed: socket stuck\n']);
  });

  /*
   * The export's own failure is reported through stderr, so a stderr that
   * throws on that first write makes the command reject rather than answer an
   * exit code.
   */
  it('closes the database when the command itself throws', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const output = captureIo();
    const repository = new MemorySpaceRepository();
    repository.loadAggregate = () => Promise.reject(new Error('catalog unavailable'));
    let closed = false;
    let failNextStderr = true;
    const io: CliIo = {
      stdout: (message) => output.io.stdout(message),
      stderr: (message) => {
        if (failNextStderr) {
          failNextStderr = false;
          throw new Error('stderr unavailable');
        }
        output.io.stderr(message);
      },
    };

    const exitCode = await runDatabaseCli(
      targetOver(repository, () => {
        closed = true;
        return Promise.resolve();
      }),
      exportTo(destination),
      { io, newId: newUuid },
    );

    expect(exitCode).toBe(1);
    expect(closed).toBe(true);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual(['Command failed: stderr unavailable\n']);
  });

  it('closes the database when command failure cannot be reported', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const repository = new MemorySpaceRepository();
    repository.loadAggregate = () => Promise.reject(new Error('catalog unavailable'));
    let closed = false;

    const exitCode = await runDatabaseCli(
      targetOver(repository, () => {
        closed = true;
        return Promise.resolve();
      }),
      exportTo(destination),
      {
        io: {
          stdout: () => undefined,
          stderr: () => {
            throw new Error('closed pipe');
          },
        },
        newId: newUuid,
      },
    );

    expect(exitCode).toBe(1);
    expect(closed).toBe(true);
  });
});

describe('runInfinityCube author verbs', () => {
  const noStores = {
    postgres: unreachedTarget('postgres'),
    sqlite: unreachedTarget('sqlite'),
  };

  const author = (args: readonly string[], workingDirectory: string) => {
    const output = captureIo();
    const launched: RunCommand[] = [];
    const served: string[] = [];
    const exitCode = runInfinityCube(args, {
      io: output.io,
      newId: newUuid,
      workingDirectory,
      targets: noStores,
      launchRun: (command) => {
        launched.push(command);
        return Promise.resolve(7);
      },
      serveMcp: (directory) => {
        served.push(directory);
        return Promise.resolve(5);
      },
    });
    return { output, launched, served, exitCode };
  };

  it.each([
    { holding: 'nothing, being missing', make: () => Promise.resolve() },
    {
      holding: 'only dot-entries',
      make: (directory: string) => mkdir(join(directory, '.git'), { recursive: true }),
    },
  ])(
    'init writes a new aggregate to a directory holding $holding, prints the run command and opens no store',
    async ({ make }) => {
      const workingDirectory = await makeTemporaryDirectory();
      const directory = join(workingDirectory, 'new talk');
      await make(directory);

      const { output, launched, exitCode } = author(['init', 'new talk'], workingDirectory);

      expect(await exitCode).toBe(0);
      expect(output.stderr).toEqual([]);
      expect(output.stdout).toEqual([
        `Created a new aggregate; run it with: pnpm cube run '${directory}'\n`,
      ]);
      expect(launched).toEqual([]);
      const aggregateFile: unknown = JSON.parse(
        await readFile(join(directory, AGGREGATE_FILE_NAME), 'utf8'),
      );
      expect(aggregateFile).toMatchObject({ version: 1 });
    },
  );

  it('init refuses a directory that is not empty, writing nothing', async () => {
    const workingDirectory = await makeTemporaryDirectory();
    const directory = await writeSingleSpaceAggregate();
    await writeFile(join(directory, 'NOTES.txt'), 'kept\n');
    const before = await filesUnder(directory);

    const { output, exitCode } = author(['init', directory], workingDirectory);

    expect(await exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([
      `${directory} is not empty; init writes only to a missing or empty directory.\n`,
    ]);
    expect(await filesUnder(directory)).toEqual(before);
  });

  it('check accepts a valid aggregate, writing nothing and launching no run', async () => {
    const directory = await writeSingleSpaceAggregate();
    const before = await filesUnder(directory);

    const { output, launched, exitCode } = author(['check', directory], '/authors/home');

    expect(await exitCode).toBe(0);
    expect(output.stderr).toEqual([]);
    expect(output.stdout).toEqual([`${directory} is a valid aggregate.\n`]);
    expect(launched).toEqual([]);
    expect(await filesUnder(directory)).toEqual(before);
  });

  it('check accepts a hand-written aggregate that omits Map and Graph ids without writing them', async () => {
    const directory = await writeAggregate(SPACE_ID, [
      {
        name: SPACE_ID,
        spaceFile: JSON.stringify({
          version: 1,
          title: 'Hand-written',
          maps: [
            {
              title: 'Only map',
              kind: 'positioned',
              positions: { [RESOURCE_ID]: { x: 0, y: 0, open: false } },
              graphs: [{ title: 'Only graph', edges: [] }],
            },
          ],
        }),
        resources: markdownResourceFiles(RESOURCE_ID, 'Opening', 'Hello.\n'),
      },
    ]);
    const before = await filesUnder(directory);

    const { output, exitCode } = author(['check', directory], '/authors/home');

    expect(output.stderr).toEqual([]);
    expect(await exitCode).toBe(0);
    expect(await filesUnder(directory)).toEqual(before);
  });

  it('check refuses what a run refuses, printing the same problems', async () => {
    const directory = await writeAggregate(SPACE_ID, [
      {
        name: SPACE_ID,
        spaceFile: JSON.stringify({
          version: 1,
          id: SPACE_ID,
          title: 'Dangling',
          maps: [
            {
              id: OTHER_SPACE_ID,
              title: 'Only map',
              kind: 'positioned',
              positions: { [RESOURCE_ID]: { x: 0, y: 0, open: false } },
              graphs: [{ id: GRAPH_ID, title: 'Only graph', edges: [] }],
            },
          ],
        }),
        resources: markdownResourceFiles(OPENING_ID, 'Opening', 'Hello.\n'),
      },
    ]);
    const before = await filesUnder(directory);
    const started = await startRun(directory, {
      newId: newUuid,
      schedule: () => () => undefined,
      report: () => undefined,
    });
    if (started.kind === 'running') {
      await started.run.stop();
      throw new Error('A run accepted a dangling placement');
    }

    const { output, exitCode } = author(['check', directory], '/authors/home');

    expect(await exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([describeRunRefusal(started, directory)]);
    expect(output.stderr.join('')).toContain(RESOURCE_ID);
    expect(await filesUnder(directory)).toEqual(before);
  });

  it('check refuses a directory that is not an Aggregate directory, naming the file', async () => {
    const directory = await writeSingleSpaceAggregate();
    await writeFile(join(directory, AGGREGATE_FILE_NAME), 'not json\n');

    const { output, exitCode } = author(['check', directory], '/authors/home');

    expect(await exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    const reported = output.stderr.join('');
    expect(reported).toContain(`${directory} is not an Aggregate directory:`);
    expect(reported).toContain(AGGREGATE_FILE_NAME);
  });

  it.each([
    { holding: 'nothing, being missing', make: () => Promise.resolve() },
    {
      holding: 'only dot-entries',
      make: (directory: string) => mkdir(join(directory, '.git'), { recursive: true }),
    },
  ])(
    'check refuses a directory holding $holding, naming init, relative to the working directory',
    async ({ make }) => {
      const workingDirectory = await makeTemporaryDirectory();
      const directory = join(workingDirectory, 'rust asycn');
      await make(directory);

      const { output, exitCode } = author(['check', 'rust asycn'], workingDirectory);

      expect(await exitCode).toBe(1);
      expect(output.stdout).toEqual([]);
      expect(output.stderr).toEqual([
        `${directory} holds no aggregate: it is missing or empty. To create one there: pnpm cube init '${directory}'\n`,
      ]);
    },
  );

  it.each([
    {
      args: ['run', 'talk'],
      launched: { verb: 'run', directory: '/authors/home/talk', port: undefined, open: true },
    },
    {
      args: ['run', '--no-open', '/elsewhere/talk', '--port', '4180'],
      launched: { verb: 'run', directory: '/elsewhere/talk', port: 4180, open: false },
    },
  ])(
    'run launches $args with the directory resolved, answering the run’s exit code',
    async ({ args, launched: expected }) => {
      const { output, launched, exitCode } = author(args, '/authors/home');

      expect(await exitCode).toBe(7);
      expect(launched).toEqual([expected]);
      expect(output.stdout).toEqual([]);
      expect(output.stderr).toEqual([]);
    },
  );

  it.each([
    {
      holding: 'an aggregate',
      make: (directory: string) => writeAggregateInto(directory, SPACE_ID, []),
    },
    { holding: 'nothing, being empty', make: () => Promise.resolve() },
  ])(
    'mcp serves a directory holding $holding, resolved against the working directory, answering the server’s exit code',
    async ({ make }) => {
      const workingDirectory = await makeTemporaryDirectory();
      const directory = join(workingDirectory, 'new talk');
      await mkdir(directory);
      await make(directory);

      const { output, launched, served, exitCode } = author(['mcp', 'new talk'], workingDirectory);

      expect(await exitCode).toBe(5);
      expect(served).toEqual([directory]);
      expect(launched).toEqual([]);
      expect(output.stdout).toEqual([]);
      expect(output.stderr).toEqual([]);
    },
  );

  it('mcp refuses a missing directory, naming init, serving nothing', async () => {
    const workingDirectory = await makeTemporaryDirectory();
    const directory = join(workingDirectory, 'rust asycn');

    const { output, served, exitCode } = author(['mcp', 'rust asycn'], workingDirectory);

    expect(await exitCode).toBe(1);
    expect(served).toEqual([]);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([
      `${directory} does not exist. To create an aggregate there: pnpm cube init '${directory}'\n`,
    ]);
  });

  it('mcp refuses a path that is a file, serving nothing', async () => {
    const workingDirectory = await makeTemporaryDirectory();
    const file = join(workingDirectory, 'talk.json');
    await writeFile(file, '{}\n');

    const { output, served, exitCode } = author(['mcp', file], workingDirectory);

    expect(await exitCode).toBe(1);
    expect(served).toEqual([]);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([`${file} is not a directory.\n`]);
  });
});

describe('the cube entry point', () => {
  const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  // Resolved from this file because the child's cwd is a temporary directory
  // outside the monorepo, where neither `pnpm exec` nor `--import tsx` finds tsx.
  const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');

  /** Start `src/cli/entry.ts` as its own process in `cwd`, with `env` added. */
  const entry = (args: readonly string[], cwd: string, env: Readonly<Record<string, string>>) =>
    runCommand(
      process.execPath,
      [
        tsxCli,
        '--tsconfig',
        join(repositoryRoot, 'tsconfig.json'),
        join(repositoryRoot, 'src/cli/entry.ts'),
        ...args,
      ],
      { cwd, env, timeoutLabel: 'infinity-cube entry point' },
    );

  /*
   * pnpm sets `INIT_CWD` and `npm_lifecycle_event` for every script it runs,
   * and a process an outer script started inherits both. Only the `INIT_CWD` of the `cube` or
   * `infinity-cube` script itself says where the author invoked it.
   */
  it.each([
    { invokedBy: 'the cube script', lifecycleEvent: 'cube', resolvesIn: 'invoked' },
    {
      invokedBy: 'the infinity-cube script',
      lifecycleEvent: 'infinity-cube',
      resolvesIn: 'invoked',
    },
    { invokedBy: 'another script', lifecycleEvent: 'test', resolvesIn: 'cwd' },
    { invokedBy: 'no script', lifecycleEvent: '', resolvesIn: 'cwd' },
  ] as const)(
    'resolves a relative directory where pnpm was invoked only when $invokedBy started it',
    async ({ lifecycleEvent, resolvesIn }) => {
      const invoked = await makeTemporaryDirectory();
      const cwd = await makeTemporaryDirectory();
      const expected = join(resolvesIn === 'invoked' ? invoked : cwd, 'talk');
      const unexpected = join(resolvesIn === 'invoked' ? cwd : invoked, 'talk');

      const result = await entry(['init', 'talk'], cwd, {
        INIT_CWD: invoked,
        npm_lifecycle_event: lifecycleEvent,
      });

      expect(result.status).toBe(0);
      await expect(access(join(expected, AGGREGATE_FILE_NAME))).resolves.toBeUndefined();
      await expect(access(unexpected)).rejects.toThrow();
    },
    20_000,
  );

  it('serves mcp over standard input and output, writing nothing else to standard output', async () => {
    const directory = await writeSingleSpaceAggregate();
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        tsxCli,
        '--tsconfig',
        join(repositoryRoot, 'tsconfig.json'),
        join(repositoryRoot, 'src/cli/entry.ts'),
        'mcp',
        directory,
      ],
      cwd: await makeTemporaryDirectory(),
      stderr: 'pipe',
    });
    const errors: Error[] = [];
    const client = new Client({ name: 'cube-entry-point-test', version: '0.0.0' });
    client.onerror = (error) => errors.push(error);
    await client.connect(transport);
    try {
      const listed = await callTool(client, 'list_files');
      const checked = await callTool(client, 'check');

      expect(listed.isError).toBe(false);
      expect(listed.text.split('\n')).toContain(AGGREGATE_FILE_NAME);
      expect(checked).toEqual({ text: `${directory} is a valid aggregate.\n`, isError: false });
      expect(errors).toEqual([]);
    } finally {
      await client.close();
    }
  }, 20_000);
});
