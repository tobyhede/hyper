import { access, lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  newUuid,
  uuidSchema,
  type ImportSpace,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import type {
  LoadedSpace,
  RepositoryCommitResult,
  SpaceCommit,
  SpaceSummary,
} from '@project/persistence';
import { afterEach, describe, expect, it } from 'vitest';
import { runCliMain } from '../../src/cli/main';
import { runHyper, type CliIo } from '../../src/cli/run';
import { readSingleSpace } from '../../src/import/read-single-space';
import type {
  ImportMode,
  RepositoryImportResult,
  SpaceRepository,
} from '../../src/persistence/space-repository';
import { MemorySpaceRepository } from '../support/memory-space-repository';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const CARD_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const GRAPH_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const OTHER_SPACE_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const THIRD_SPACE_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');

const storedSpace: LoadedSpace = {
  snapshot: {
    id: SPACE_ID,
    document: { version: 1, title: 'Stored talk' },
    cards: [
      {
        id: CARD_ID,
        document: { title: 'Stored card', kind: 'markdown', body: 'Stored body.\n' },
      },
    ],
  },
  revision: 0n,
  exportedRevision: null,
};

class ImportRepository implements SpaceRepository {
  private readonly outcome: RepositoryImportResult | Error;

  constructor(outcome: RepositoryImportResult | Error) {
    this.outcome = outcome;
  }

  listSpaces(): Promise<readonly SpaceSummary[]> {
    if (this.outcome instanceof Error || this.outcome.kind !== 'imported') {
      throw new Error('Unexpected listSpaces call');
    }
    return Promise.resolve(
      this.outcome.spaces.map(({ snapshot }) => ({
        id: snapshot.id,
        title: snapshot.document.title,
      })),
    );
  }

  loadSpace(id: UUID): Promise<LoadedSpace | undefined> {
    if (this.outcome instanceof Error || this.outcome.kind !== 'imported') {
      throw new Error('Unexpected loadSpace call');
    }
    return Promise.resolve(this.outcome.spaces.find(({ snapshot }) => snapshot.id === id));
  }

  markExported(_id: UUID, _revision: bigint): Promise<void> {
    throw new Error('Unexpected markExported call');
  }

  loadAggregate(): ReturnType<SpaceRepository['loadAggregate']> {
    throw new Error('Unexpected loadAggregate call');
  }

  initializeAggregate(
    ..._args: Parameters<SpaceRepository['initializeAggregate']>
  ): ReturnType<SpaceRepository['initializeAggregate']> {
    throw new Error('Unexpected initializeAggregate call');
  }

  replaceAggregate(
    ..._args: Parameters<SpaceRepository['replaceAggregate']>
  ): ReturnType<SpaceRepository['replaceAggregate']> {
    throw new Error('Unexpected replaceAggregate call');
  }

  commit(_request: SpaceCommit): Promise<RepositoryCommitResult> {
    throw new Error('Unexpected commit call');
  }

  importSpaces(_input: readonly ImportSpace[], _mode: ImportMode): Promise<RepositoryImportResult> {
    return this.outcome instanceof Error
      ? Promise.reject(this.outcome)
      : Promise.resolve(this.outcome);
  }
}

const temporaryDirectories: string[] = [];

const makeTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'hyper-cli-unit-'));
  temporaryDirectories.push(directory);
  return directory;
};

const writeValidSpace = async (id: UUID = SPACE_ID, title = 'Imported talk'): Promise<string> => {
  const directory = await makeTemporaryDirectory();
  await mkdir(join(directory, 'cards'));
  await writeFile(join(directory, 'space.json'), JSON.stringify({ version: 1, id, title }));
  await writeFile(join(directory, 'cards', 'opening.md'), '---\ntitle: Opening\n---\nHello.\n');
  return directory;
};

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

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('runHyper', () => {
  it('exports one stored space to the canonical version 1 directory', async () => {
    const parent = await makeTemporaryDirectory();
    const destination = join(parent, 'exported');
    const output = captureIo();

    const exitCode = await runHyper(['export', SPACE_ID, destination], {
      repository: new MemorySpaceRepository([storedSpace], SPACE_ID),
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(0);
    expect(output.stdout).toEqual([`Exported space ${SPACE_ID} at revision 0 to ${destination}\n`]);
    expect(output.stderr).toEqual([]);
    await expect(readFile(join(destination, 'space.json'), 'utf8')).resolves.toBe(
      `${JSON.stringify({ version: 1, id: SPACE_ID, title: 'Stored talk' }, null, 2)}\n`,
    );
    await expect(readFile(join(destination, 'cards', `${CARD_ID}.md`), 'utf8')).resolves.toBe(
      `---\nid: ${CARD_ID}\ntitle: Stored card\nkind: markdown\n---\n\nStored body.\n`,
    );
  });

  it.each([
    {
      args: ['export', 'not-a-uuid', 'destination'],
      exitCode: 2,
      error: 'Invalid space UUID: not-a-uuid\n',
    },
    {
      args: ['export', OTHER_SPACE_ID, 'destination'],
      exitCode: 1,
      error: `Space ${OTHER_SPACE_ID} does not exist\n`,
    },
  ])('rejects an invalid export target $args', async ({ args, exitCode, error }) => {
    const output = captureIo();

    await expect(
      runHyper(args, {
        repository: new MemorySpaceRepository([storedSpace], SPACE_ID),
        io: output.io,
        newId: newUuid,
      }),
    ).resolves.toBe(exitCode);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([error]);
  });

  it('replaces discovered files while preserving files outside space discovery', async () => {
    const parent = await makeTemporaryDirectory();
    const destination = join(parent, 'exported');
    await mkdir(join(destination, 'cards', 'nested'), { recursive: true });
    await writeFile(join(destination, 'space.json'), '{}\n');
    await writeFile(join(destination, 'stale-root.md'), 'stale\n');
    await writeFile(join(destination, 'cards', 'stale.md'), 'stale\n');
    await writeFile(join(destination, 'notes.txt'), 'keep root\n');
    await writeFile(join(destination, 'cards', 'nested', 'keep.md'), 'keep nested\n');

    const exitCode = await runHyper(['export', SPACE_ID, destination], {
      repository: new MemorySpaceRepository([storedSpace], SPACE_ID),
      io: captureIo().io,
      newId: newUuid,
    });

    expect(exitCode).toBe(0);
    await expect(access(join(destination, 'stale-root.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(access(join(destination, 'cards', 'stale.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(join(destination, 'notes.txt'), 'utf8')).resolves.toBe('keep root\n');
    await expect(readFile(join(destination, 'cards', 'nested', 'keep.md'), 'utf8')).resolves.toBe(
      'keep nested\n',
    );
  });

  it('records the exact revision only after the destination is replaced', async () => {
    const parent = await makeTemporaryDirectory();
    const destination = join(parent, 'exported');
    const revision = 9_007_199_254_740_993n;
    const repository = new MemorySpaceRepository([{ ...storedSpace, revision }], SPACE_ID);

    await expect(
      runHyper(['export', SPACE_ID, destination], {
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

  it('leaves the previous destination recoverable and metadata unchanged when staging fails', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    await mkdir(destination);
    await writeFile(join(destination, 'space.json'), 'previous space\n');
    await writeFile(join(destination, 'cards'), 'not a directory\n');
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    const output = captureIo();

    await expect(
      runHyper(['export', SPACE_ID, destination], { repository, io: output.io, newId: newUuid }),
    ).resolves.toBe(1);

    expect(output.stderr[0]).toMatch(/^Export failed:/);
    await expect(readFile(join(destination, 'space.json'), 'utf8')).resolves.toBe(
      'previous space\n',
    );
    await expect(readFile(join(destination, 'cards'), 'utf8')).resolves.toBe('not a directory\n');
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: null,
    });
  });

  it('rejects a symlinked destination without changing its external target', async () => {
    const parent = await makeTemporaryDirectory();
    const external = await makeTemporaryDirectory();
    const destination = join(parent, 'exported');
    await mkdir(join(external, 'cards'));
    await writeFile(join(external, 'space.json'), 'external space\n');
    await writeFile(join(external, 'cards', 'external.md'), 'external card\n');
    await symlink(external, destination);
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    const output = captureIo();

    await expect(
      runHyper(['export', SPACE_ID, destination], { repository, io: output.io, newId: newUuid }),
    ).resolves.toBe(1);

    expect(output.stderr).toEqual([
      `Export failed: Export destination contains a symbolic link: ${destination}\n`,
    ]);
    expect((await lstat(destination)).isSymbolicLink()).toBe(true);
    await expect(readFile(join(external, 'space.json'), 'utf8')).resolves.toBe('external space\n');
    await expect(readFile(join(external, 'cards', 'external.md'), 'utf8')).resolves.toBe(
      'external card\n',
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: null,
    });
  });

  it('rejects a symlinked cards directory without changing the destination or external cards', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const externalCards = await makeTemporaryDirectory();
    await mkdir(destination);
    await writeFile(join(destination, 'space.json'), 'previous space\n');
    await writeFile(join(destination, 'notes.txt'), 'keep root\n');
    await writeFile(join(externalCards, 'external.md'), 'external card\n');
    await symlink(externalCards, join(destination, 'cards'));
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    const output = captureIo();

    await expect(
      runHyper(['export', SPACE_ID, destination], { repository, io: output.io, newId: newUuid }),
    ).resolves.toBe(1);

    expect(output.stderr).toEqual([
      `Export failed: Export destination contains a symbolic link: ${join(destination, 'cards')}\n`,
    ]);
    expect((await lstat(join(destination, 'cards'))).isSymbolicLink()).toBe(true);
    await expect(readFile(join(destination, 'space.json'), 'utf8')).resolves.toBe(
      'previous space\n',
    );
    await expect(readFile(join(destination, 'notes.txt'), 'utf8')).resolves.toBe('keep root\n');
    await expect(readFile(join(externalCards, 'external.md'), 'utf8')).resolves.toBe(
      'external card\n',
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: null,
    });
  });

  it('rejects a symlinked canonical card file without changing its external target', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const external = join(await makeTemporaryDirectory(), 'external.md');
    await mkdir(join(destination, 'cards'), { recursive: true });
    await writeFile(join(destination, 'space.json'), 'previous space\n');
    await writeFile(external, 'external card\n');
    await symlink(external, join(destination, 'cards', `${CARD_ID}.md`));
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    const output = captureIo();

    await expect(
      runHyper(['export', SPACE_ID, destination], { repository, io: output.io, newId: newUuid }),
    ).resolves.toBe(1);

    expect(output.stderr).toEqual([
      `Export failed: Export destination contains a symbolic link: ${join(destination, 'cards', `${CARD_ID}.md`)}\n`,
    ]);
    expect((await lstat(join(destination, 'cards', `${CARD_ID}.md`))).isSymbolicLink()).toBe(true);
    await expect(readFile(join(destination, 'space.json'), 'utf8')).resolves.toBe(
      'previous space\n',
    );
    await expect(readFile(external, 'utf8')).resolves.toBe('external card\n');
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
      runHyper(['export', SPACE_ID, destination], {
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
    await expect(readFile(join(destination, 'space.json'), 'utf8')).resolves.toContain(
      '"title": "Stored talk"',
    );
  });

  it('writes deterministic fully identified files that re-enter through version 1 intake', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const snapshot: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 1,
        title: 'Canonical: talk',
        layouts: [
          {
            id: OTHER_SPACE_ID,
            title: 'Authored layout',
            kind: 'positioned',
            positions: {
              [THIRD_SPACE_ID]: { x: 30, y: 40, open: false },
              [CARD_ID]: { x: 10, y: 20, open: false },
            },
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Main graph',
                color: '#123456',
                edges: [{ from: CARD_ID, to: THIRD_SPACE_ID }],
              },
            ],
            activeGraph: GRAPH_ID,
          },
        ],
        defaultLayout: OTHER_SPACE_ID,
      },
      cards: [
        {
          id: THIRD_SPACE_ID,
          document: { title: 'Alias: opening', kind: 'alias', target: CARD_ID },
        },
        {
          id: CARD_ID,
          document: {
            title: 'Opening: why',
            kind: 'markdown',
            body: '# Opening\n\nHello.\n',
          },
        },
      ],
    };

    await expect(
      runHyper(['export', SPACE_ID, destination], {
        repository: new MemorySpaceRepository(
          [{ snapshot, revision: 7n, exportedRevision: null }],
          SPACE_ID,
        ),
        io: captureIo().io,
        newId: newUuid,
      }),
    ).resolves.toBe(0);

    const exportedJson = await readFile(join(destination, 'space.json'), 'utf8');
    const positionsJson = exportedJson.slice(exportedJson.indexOf('"positions"'));
    expect(positionsJson.indexOf(`"${CARD_ID}"`)).toBeLessThan(
      positionsJson.indexOf(`"${THIRD_SPACE_ID}"`),
    );
    await expect(readSingleSpace(destination)).resolves.toEqual({
      id: snapshot.id,
      document: snapshot.document,
      cards: [...snapshot.cards].reverse(),
    });
  });

  it('canonicalizes card frontmatter independently of document key insertion order', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const reordered: LoadedSpace = {
      ...storedSpace,
      snapshot: {
        ...storedSpace.snapshot,
        cards: [
          {
            id: CARD_ID,
            document: {
              kind: 'markdown',
              body: 'Stored body.\n',
              title: 'Stored card',
            },
          },
        ],
      },
    };

    await expect(
      runHyper(['export', SPACE_ID, destination], {
        repository: new MemorySpaceRepository([reordered], SPACE_ID),
        io: captureIo().io,
        newId: newUuid,
      }),
    ).resolves.toBe(0);

    await expect(readFile(join(destination, 'cards', `${CARD_ID}.md`), 'utf8')).resolves.toBe(
      `---\nid: ${CARD_ID}\ntitle: Stored card\nkind: markdown\n---\n\nStored body.\n`,
    );
  });

  it('normalizes exported Markdown line endings to LF', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const withMixedLineEndings: LoadedSpace = {
      ...storedSpace,
      snapshot: {
        ...storedSpace.snapshot,
        cards: [
          {
            id: CARD_ID,
            document: {
              title: 'Stored card',
              kind: 'markdown',
              body: 'First\r\nSecond\rThird\n',
            },
          },
        ],
      },
    };

    await expect(
      runHyper(['export', SPACE_ID, destination], {
        repository: new MemorySpaceRepository([withMixedLineEndings], SPACE_ID),
        io: captureIo().io,
        newId: newUuid,
      }),
    ).resolves.toBe(0);

    const cardFile = await readFile(join(destination, 'cards', `${CARD_ID}.md`), 'utf8');
    expect(cardFile).not.toContain('\r');
    expect(cardFile).toContain('\nFirst\nSecond\nThird\n');
  });

  it('opens the stored Meta Space without filesystem import and preserves its revision', async () => {
    const revision = 9_007_199_254_740_993n;
    const output = captureIo();

    const exitCode = await runHyper([], {
      repository: new MemorySpaceRepository([{ ...storedSpace, revision }], SPACE_ID),
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(0);
    expect(output.stdout).toEqual([`Opened space ${SPACE_ID} at revision 9007199254740993\n`]);
    expect(output.stderr).toEqual([]);
  });

  it.each([
    { args: ['first', 'second'] },
    { args: ['--dangerous-truncate'] },
    { args: ['space', '--unknown'] },
  ])('rejects invalid arguments $args', async ({ args }) => {
    const output = captureIo();

    const exitCode = await runHyper(args, {
      repository: new ImportRepository({ kind: 'imported', spaces: [storedSpace] }),
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(2);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([
      'Usage: hyper [<path>] [--dangerous-truncate]\n       hyper export <space-uuid> <destination-directory>\n',
    ]);
  });

  it('reports the stored space identity and lossless bigint revision', async () => {
    // Past `Number.MAX_SAFE_INTEGER`, so a revision that went through `Number`
    // anywhere would print 9007199254740992 and fail here. Revision 0 cannot
    // catch that, and the `int8` workaround in `toDatabaseRevision` is exactly
    // the kind of thing that would reintroduce it.
    const revision = 9_007_199_254_740_993n;
    const directory = await writeValidSpace();
    const output = captureIo();

    const exitCode = await runHyper([directory], {
      repository: new ImportRepository({
        kind: 'imported',
        spaces: [{ ...storedSpace, revision }],
      }),
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(0);
    expect(output.stdout).toEqual([`Imported space ${SPACE_ID} at revision 9007199254740993\n`]);
    expect(output.stderr).toEqual([]);
  });

  it('imports a UUID into the existing catalog', async () => {
    const directory = await writeValidSpace(OTHER_SPACE_ID, 'Fresh imported talk');
    const output = captureIo();
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);

    const exitCode = await runHyper([directory], { repository, io: output.io, newId: newUuid });

    expect(exitCode).toBe(0);
    expect(output.stdout).toEqual([`Imported space ${OTHER_SPACE_ID} at revision 0\n`]);
    expect(output.stderr).toEqual([]);
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: SPACE_ID, title: 'Stored talk' },
      { id: OTHER_SPACE_ID, title: 'Fresh imported talk' },
    ]);
    await expect(repository.loadSpace(OTHER_SPACE_ID)).resolves.toMatchObject({
      snapshot: { id: OTHER_SPACE_ID },
    });
  });

  it('dangerously truncates existing spaces when importing a path', async () => {
    const directory = await writeValidSpace(OTHER_SPACE_ID, 'Replacement talk');
    const output = captureIo();
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);

    const exitCode = await runHyper([directory, '--dangerous-truncate'], {
      repository,
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(0);
    expect(output.stdout).toEqual([`Imported space ${OTHER_SPACE_ID} at revision 0\n`]);
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: OTHER_SPACE_ID, title: 'Replacement talk' },
    ]);
  });

  it('imports a batch into the existing catalog', async () => {
    const collection = await makeTemporaryDirectory();
    const first = join(collection, 'first');
    const second = join(collection, 'second');
    await mkdir(first);
    await mkdir(second);
    await writeFile(
      join(first, 'space.json'),
      JSON.stringify({ version: 1, id: OTHER_SPACE_ID, title: 'First imported' }),
    );
    await writeFile(
      join(second, 'space.json'),
      JSON.stringify({ version: 1, id: THIRD_SPACE_ID, title: 'Second imported' }),
    );
    const output = captureIo();
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);

    const exitCode = await runHyper([collection], {
      repository,
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(0);
    expect(output.stdout).toEqual([
      `Imported space ${OTHER_SPACE_ID} at revision 0\n`,
      `Imported space ${THIRD_SPACE_ID} at revision 0\n`,
    ]);
    expect(output.stdout.join('')).not.toContain(collection);
    expect(output.stderr).toEqual([]);
  });

  it('reports every file diagnostic with its path', async () => {
    const directory = await makeTemporaryDirectory();
    const firstCardPath = join(directory, 'first.md');
    const secondCardPath = join(directory, 'second.md');
    await writeFile(join(directory, 'space.json'), '{ invalid JSON');
    await writeFile(firstCardPath, 'Missing frontmatter.\n');
    await writeFile(secondCardPath, 'Also missing frontmatter.\n');
    const output = captureIo();

    const exitCode = await runHyper([directory], {
      repository: new ImportRepository({ kind: 'imported', spaces: [storedSpace] }),
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr.join('')).toContain(join(directory, 'space.json'));
    expect(output.stderr.join('')).toContain(firstCardPath);
    expect(output.stderr.join('')).toContain(secondCardPath);
  });

  it.each([
    {
      outcome: {
        kind: 'rejected',
        code: 'duplicate-identity',
        message: `Duplicate graph ${GRAPH_ID}`,
      } satisfies RepositoryImportResult,
      entityId: GRAPH_ID,
    },
    {
      outcome: {
        kind: 'rejected',
        code: 'invalid-snapshot',
        message: `Graph ${GRAPH_ID} has an unresolved card`,
      } satisfies RepositoryImportResult,
      entityId: GRAPH_ID,
    },
    {
      outcome: {
        kind: 'rejected',
        code: 'card-ownership',
        message: `Card ${CARD_ID} already belongs to another space`,
      } satisfies RepositoryImportResult,
      entityId: CARD_ID,
    },
  ] as const)(
    'reports a classified import failure naming $entityId',
    async ({ outcome, entityId }) => {
      const directory = await writeValidSpace();
      const output = captureIo();

      const exitCode = await runHyper([directory], {
        repository: new ImportRepository(outcome),
        io: output.io,
        newId: newUuid,
      });

      expect(exitCode).toBe(1);
      expect(output.stdout).toEqual([]);
      expect(output.stderr.join('')).toContain(entityId);
    },
  );

  /*
   * The three cases above stub the repository's verdict, so they prove the CLI
   * prints what it is handed. This one produces the fault for real: a directory
   * whose two layouts own one graph id, read off disk, identified, and put
   * through domain intake by a real repository. That error is new to version 1
   * — a graph id is unique across the space although one layout owns it (ADR
   * 0045) — and the only part of it an author can act on is which two layouts
   * collided, so both ids have to survive the trip to stderr.
   */
  it('reports a graph id two layouts own, naming both of them', async () => {
    const directory = await makeTemporaryDirectory();
    await mkdir(join(directory, 'cards'));
    await writeFile(
      join(directory, 'cards', 'opening.md'),
      `---\nid: ${CARD_ID}\ntitle: Opening\n---\nHello.\n`,
    );
    await writeFile(
      join(directory, 'space.json'),
      JSON.stringify({
        version: 1,
        id: SPACE_ID,
        title: 'Two owners',
        layouts: [
          {
            id: OTHER_SPACE_ID,
            title: 'First owner',
            kind: 'positioned',
            positions: { [CARD_ID]: { x: 0, y: 0, open: false } },
            graphs: [{ id: GRAPH_ID, title: 'Shared', edges: [{ from: CARD_ID, to: CARD_ID }] }],
          },
          {
            id: THIRD_SPACE_ID,
            title: 'Second owner',
            kind: 'positioned',
            positions: { [CARD_ID]: { x: 10, y: 10, open: false } },
            graphs: [{ id: GRAPH_ID, title: 'Shared', edges: [{ from: CARD_ID, to: CARD_ID }] }],
          },
        ],
      }),
    );
    const output = captureIo();

    const exitCode = await runHyper([directory], {
      repository: new MemorySpaceRepository(),
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    const stderr = output.stderr.join('');
    expect(stderr).toContain('Domain validation failed');
    expect(stderr).toContain(GRAPH_ID);
    expect(stderr).toContain(OTHER_SPACE_ID);
    expect(stderr).toContain(THIRD_SPACE_ID);
  });

  it('reports a taken space identity as an identity failure, never a revision conflict', async () => {
    // The regression this guards: a taken id used to surface as a primary-key
    // violation classified `conflict`, which the CLI printed as "Revision
    // conflict". Insert-only import compares no revisions, so that named a
    // concurrency failure that cannot occur and hid the real cause. There is no
    // longer a conflict result to return — see issue `13` — and this asserts the
    // wording stays gone rather than merely unreachable.
    const directory = await writeValidSpace();
    const output = captureIo();

    const exitCode = await runHyper([directory], {
      repository: new ImportRepository({
        kind: 'rejected',
        code: 'duplicate-identity',
        message: `Space ${SPACE_ID} already exists`,
      }),
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(1);
    expect(output.stderr.join('')).toContain('Identity import failed');
    expect(output.stderr.join('')).toContain(`Space ${SPACE_ID} already exists`);
    expect(output.stderr.join('')).not.toContain('Revision conflict');
  });

  it('classifies an unexpected repository failure as a database failure without a stack', async () => {
    const directory = await writeValidSpace();
    const output = captureIo();

    const exitCode = await runHyper([directory], {
      repository: new ImportRepository(new Error('connection lost')),
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual(['Database import failed: connection lost\n']);
  });

  it('does not load a successfully imported Space', async () => {
    const directory = await writeValidSpace();
    const output = captureIo();
    const repository = new MemorySpaceRepository();
    repository.loadSpace = () => Promise.reject(new Error('load unavailable'));

    const exitCode = await runHyper([directory], { repository, io: output.io, newId: newUuid });

    expect(exitCode).toBe(0);
    expect(output.stdout).toEqual([`Imported space ${SPACE_ID} at revision 0\n`]);
    expect(output.stderr).toEqual([]);
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: SPACE_ID, title: 'Imported talk' },
    ]);
  });

  it('refuses a batch that is not one Meta-rooted aggregate', async () => {
    const collection = await makeTemporaryDirectory();
    const first = join(collection, 'first');
    const second = join(collection, 'second');
    await mkdir(first);
    await mkdir(second);
    await writeFile(
      join(first, 'space.json'),
      JSON.stringify({ version: 1, id: SPACE_ID, title: 'First imported' }),
    );
    await writeFile(
      join(second, 'space.json'),
      JSON.stringify({ version: 1, id: OTHER_SPACE_ID, title: 'Second imported' }),
    );
    const output = captureIo();
    const repository = new MemorySpaceRepository();
    repository.listSpaces = () => Promise.reject(new Error('catalog unavailable'));

    const exitCode = await runHyper([collection], { repository, io: output.io, newId: newUuid });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual(['Domain validation failed: ordinary-space-unreferenced\n']);
    await expect(repository.loadAggregate()).resolves.toEqual({ kind: 'uninitialized' });
  });

  it('classifies a no-path repository failure as database startup without a stack', async () => {
    const output = captureIo();
    const repository = new MemorySpaceRepository();
    repository.loadAggregate = () => Promise.reject(new Error('catalog unavailable'));

    const exitCode = await runHyper([], { repository, io: output.io, newId: newUuid });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual(['Database startup failed: catalog unavailable\n']);
  });
});

describe('runCliMain', () => {
  it('closes the database after no-path startup succeeds', async () => {
    const output = captureIo();
    let closed = false;

    const exitCode = await runCliMain([], {
      repository: new MemorySpaceRepository([storedSpace], SPACE_ID),
      io: output.io,
      newId: newUuid,
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    });

    expect(exitCode).toBe(0);
    expect(closed).toBe(true);
    expect(output.stdout).toEqual([`Opened space ${SPACE_ID} at revision 0\n`]);
    expect(output.stderr).toEqual([]);
  });

  it('closes the database after no-path startup fails', async () => {
    const output = captureIo();
    const repository = new MemorySpaceRepository();
    repository.loadAggregate = () => Promise.reject(new Error('catalog unavailable'));
    let closed = false;

    const exitCode = await runCliMain([], {
      repository,
      io: output.io,
      newId: newUuid,
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    });

    expect(exitCode).toBe(1);
    expect(closed).toBe(true);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual(['Database startup failed: catalog unavailable\n']);
  });

  it('preserves the import result after awaiting a successful database close', async () => {
    const directory = await writeValidSpace();
    const output = captureIo();
    let closed = false;

    const exitCode = await runCliMain([directory], {
      repository: new ImportRepository({ kind: 'imported', spaces: [storedSpace] }),
      io: output.io,
      newId: newUuid,
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    });

    expect(exitCode).toBe(0);
    expect(closed).toBe(true);
    expect(output.stdout).toEqual([`Imported space ${SPACE_ID} at revision 0\n`]);
    expect(output.stderr).toEqual([]);
  });

  it('classifies database shutdown failure without leaking a stack trace', async () => {
    const directory = await writeValidSpace();
    const output = captureIo();

    const exitCode = await runCliMain([directory], {
      repository: new ImportRepository({ kind: 'imported', spaces: [storedSpace] }),
      io: output.io,
      newId: newUuid,
      close: () => Promise.reject(new Error('socket stuck')),
    });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([`Imported space ${SPACE_ID} at revision 0\n`]);
    expect(output.stderr).toEqual(['Database shutdown failed: socket stuck\n']);
  });

  it('closes the database when the command itself throws', async () => {
    const output = captureIo();
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

    const exitCode = await runCliMain(['--bogus'], {
      repository: new MemorySpaceRepository([storedSpace], SPACE_ID),
      io,
      newId: newUuid,
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    });

    expect(exitCode).toBe(1);
    expect(closed).toBe(true);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual(['Command failed: stderr unavailable\n']);
  });

  it('closes the database when command failure cannot be reported', async () => {
    let closed = false;

    const exitCode = await runCliMain(['--bogus'], {
      repository: new MemorySpaceRepository([storedSpace], SPACE_ID),
      newId: newUuid,
      io: {
        stdout: () => undefined,
        stderr: () => {
          throw new Error('closed pipe');
        },
      },
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    });

    expect(exitCode).toBe(1);
    expect(closed).toBe(true);
  });
});
