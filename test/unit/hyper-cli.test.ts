import { access, lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newUuid, uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import type { LoadedSpace } from '@project/persistence';
import { afterEach, describe, expect, it } from 'vitest';
import { runCliMain } from '../../src/cli/main';
import { runHyper, type CliIo } from '../../src/cli/run';
import { AGGREGATE_FILE_NAME } from '../../src/import/read-aggregate';
import { readSingleSpace } from '../../src/import/read-single-space';
import { MemorySpaceRepository } from '../support/memory-space-repository';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const THING_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const GRAPH_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const OTHER_SPACE_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const THIRD_SPACE_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');

const USAGE =
  'Usage: hyper [<aggregate-path>] [--dangerous-truncate]\n       hyper export <destination-directory>\n';

const storedSpace: LoadedSpace = {
  snapshot: {
    id: SPACE_ID,
    document: { version: 1, title: 'Stored talk' },
    things: [
      {
        id: THING_ID,
        document: { title: 'Stored thing', kind: 'markdown', body: 'Stored body.\n' },
      },
    ],
  },
  revision: 0n,
  exportedRevision: null,
};

const temporaryDirectories: string[] = [];

const makeTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'hyper-cli-unit-'));
  temporaryDirectories.push(directory);
  return directory;
};

interface SpaceDirectory {
  /** The directory name, which is where a Space's own identity is written. */
  readonly name: string;
  /** Raw text, so a test can write a space file that does not parse. */
  readonly spaceFile: string;
  readonly things?: Readonly<Record<string, string>>;
}

/**
 * Build a canonical aggregate directory: a versioned `hyper.json` naming the
 * Meta Space, and one `<space-uuid>/` child per Space. Public import takes
 * nothing else, so every import test starts here rather than at a bare Space
 * directory.
 */
const writeAggregate = async (
  metaSpaceId: UUID,
  spaces: readonly SpaceDirectory[],
): Promise<string> => {
  const root = await makeTemporaryDirectory();
  await writeFile(join(root, AGGREGATE_FILE_NAME), JSON.stringify({ version: 1, metaSpaceId }));
  for (const space of spaces) {
    const directory = join(root, space.name);
    await mkdir(join(directory, 'things'), { recursive: true });
    await writeFile(join(directory, 'space.json'), space.spaceFile);
    for (const [name, text] of Object.entries(space.things ?? {})) {
      await writeFile(join(directory, 'things', name), text);
    }
  }
  return root;
};

/** One Meta Space alone, which is the smallest complete aggregate there is. */
const writeSingleSpaceAggregate = (id: UUID = SPACE_ID, title = 'Imported talk'): Promise<string> =>
  writeAggregate(id, [
    {
      name: id,
      spaceFile: JSON.stringify({ version: 1, id, title }),
      things: { 'opening.md': '---\ntitle: Opening\n---\nHello.\n' },
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

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('runHyper', () => {
  it('exports the stored aggregate to the canonical version 1 directory', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const output = captureIo();

    const exitCode = await runHyper(['export', destination], {
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
      readFile(join(destination, SPACE_ID, 'things', `${THING_ID}.md`), 'utf8'),
    ).resolves.toBe(
      `---\nid: ${THING_ID}\ntitle: Stored thing\nkind: markdown\n---\n\nStored body.\n`,
    );
  });

  /*
   * Export is whole-aggregate, so there is no Space to name and no Space to get
   * wrong; the one thing left that can be missing is the aggregate itself. An
   * uninitialized repository is a fact about the database rather than bad input,
   * so it exits 1 rather than 2 and writes nothing.
   */
  it('refuses to export a repository that holds no aggregate', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const output = captureIo();

    const exitCode = await runHyper(['export', destination], {
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
    await mkdir(join(spaceDirectory, 'things', 'nested'), { recursive: true });
    await writeFile(join(spaceDirectory, 'space.json'), '{}\n');
    await writeFile(join(spaceDirectory, 'stale-root.md'), 'stale\n');
    await writeFile(join(spaceDirectory, 'things', 'stale.md'), 'stale\n');
    await writeFile(join(spaceDirectory, 'notes.txt'), 'keep space\n');
    await writeFile(join(spaceDirectory, 'things', 'nested', 'keep.md'), 'keep nested\n');
    await writeFile(join(destination, 'notes.txt'), 'keep root\n');

    const exitCode = await runHyper(['export', destination], {
      repository: new MemorySpaceRepository([storedSpace], SPACE_ID),
      io: captureIo().io,
      newId: newUuid,
    });

    expect(exitCode).toBe(0);
    await expect(access(join(spaceDirectory, 'stale-root.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(access(join(spaceDirectory, 'things', 'stale.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(join(destination, 'notes.txt'), 'utf8')).resolves.toBe('keep root\n');
    await expect(readFile(join(spaceDirectory, 'notes.txt'), 'utf8')).resolves.toBe('keep space\n');
    await expect(
      readFile(join(spaceDirectory, 'things', 'nested', 'keep.md'), 'utf8'),
    ).resolves.toBe('keep nested\n');
  });

  it('records the exact revision only after the destination is replaced', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const revision = 9_007_199_254_740_993n;
    const repository = new MemorySpaceRepository([{ ...storedSpace, revision }], SPACE_ID);

    await expect(
      runHyper(['export', destination], {
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
    const spaceDirectory = join(destination, SPACE_ID);
    await mkdir(spaceDirectory, { recursive: true });
    await writeFile(join(spaceDirectory, 'space.json'), 'previous space\n');
    await writeFile(join(spaceDirectory, 'things'), 'not a directory\n');
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    const output = captureIo();

    await expect(
      runHyper(['export', destination], { repository, io: output.io, newId: newUuid }),
    ).resolves.toBe(1);

    expect(output.stderr[0]).toMatch(/^Export failed:/);
    await expect(readFile(join(spaceDirectory, 'space.json'), 'utf8')).resolves.toBe(
      'previous space\n',
    );
    await expect(readFile(join(spaceDirectory, 'things'), 'utf8')).resolves.toBe(
      'not a directory\n',
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: null,
    });
  });

  it('rejects a symlinked destination without changing its external target', async () => {
    const parent = await makeTemporaryDirectory();
    const external = await makeTemporaryDirectory();
    const destination = join(parent, 'exported');
    await mkdir(join(external, SPACE_ID, 'things'), { recursive: true });
    await writeFile(join(external, SPACE_ID, 'space.json'), 'external space\n');
    await writeFile(join(external, SPACE_ID, 'things', 'external.md'), 'external thing\n');
    await symlink(external, destination);
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    const output = captureIo();

    await expect(
      runHyper(['export', destination], { repository, io: output.io, newId: newUuid }),
    ).resolves.toBe(1);

    expect(output.stderr).toEqual([
      `Export failed: Export destination contains a symbolic link: ${destination}\n`,
    ]);
    expect((await lstat(destination)).isSymbolicLink()).toBe(true);
    await expect(readFile(join(external, SPACE_ID, 'space.json'), 'utf8')).resolves.toBe(
      'external space\n',
    );
    await expect(readFile(join(external, SPACE_ID, 'things', 'external.md'), 'utf8')).resolves.toBe(
      'external thing\n',
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: null,
    });
  });

  it('rejects a symlinked things directory without changing the destination or external things', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const spaceDirectory = join(destination, SPACE_ID);
    const externalThings = await makeTemporaryDirectory();
    await mkdir(spaceDirectory, { recursive: true });
    await writeFile(join(spaceDirectory, 'space.json'), 'previous space\n');
    await writeFile(join(destination, 'notes.txt'), 'keep root\n');
    await writeFile(join(externalThings, 'external.md'), 'external thing\n');
    await symlink(externalThings, join(spaceDirectory, 'things'));
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    const output = captureIo();

    await expect(
      runHyper(['export', destination], { repository, io: output.io, newId: newUuid }),
    ).resolves.toBe(1);

    expect(output.stderr).toEqual([
      `Export failed: Export destination contains a symbolic link: ${join(spaceDirectory, 'things')}\n`,
    ]);
    expect((await lstat(join(spaceDirectory, 'things'))).isSymbolicLink()).toBe(true);
    await expect(readFile(join(spaceDirectory, 'space.json'), 'utf8')).resolves.toBe(
      'previous space\n',
    );
    await expect(readFile(join(destination, 'notes.txt'), 'utf8')).resolves.toBe('keep root\n');
    await expect(readFile(join(externalThings, 'external.md'), 'utf8')).resolves.toBe(
      'external thing\n',
    );
    await expect(repository.loadSpace(SPACE_ID)).resolves.toMatchObject({
      exportedRevision: null,
    });
  });

  it('rejects a symlinked canonical thing file without changing its external target', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const spaceDirectory = join(destination, SPACE_ID);
    const external = join(await makeTemporaryDirectory(), 'external.md');
    await mkdir(join(spaceDirectory, 'things'), { recursive: true });
    await writeFile(join(spaceDirectory, 'space.json'), 'previous space\n');
    await writeFile(external, 'external thing\n');
    await symlink(external, join(spaceDirectory, 'things', `${THING_ID}.md`));
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);
    const output = captureIo();

    await expect(
      runHyper(['export', destination], { repository, io: output.io, newId: newUuid }),
    ).resolves.toBe(1);

    expect(output.stderr).toEqual([
      `Export failed: Export destination contains a symbolic link: ${join(spaceDirectory, 'things', `${THING_ID}.md`)}\n`,
    ]);
    expect((await lstat(join(spaceDirectory, 'things', `${THING_ID}.md`))).isSymbolicLink()).toBe(
      true,
    );
    await expect(readFile(join(spaceDirectory, 'space.json'), 'utf8')).resolves.toBe(
      'previous space\n',
    );
    await expect(readFile(external, 'utf8')).resolves.toBe('external thing\n');
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
      runHyper(['export', destination], {
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

  it('writes deterministic fully identified files that re-enter through version 1 intake', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const snapshot: SpaceSnapshot = {
      id: SPACE_ID,
      document: {
        version: 1,
        title: 'Canonical: talk',
        diagrams: [
          {
            id: OTHER_SPACE_ID,
            title: 'Authored diagram',
            kind: 'positioned',
            positions: {
              [THIRD_SPACE_ID]: { x: 30, y: 40, open: false },
              [THING_ID]: { x: 10, y: 20, open: false },
            },
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Main graph',
                color: '#123456',
                edges: [{ from: THING_ID, to: THIRD_SPACE_ID }],
              },
            ],
            activeGraph: GRAPH_ID,
          },
        ],
        defaultDiagram: OTHER_SPACE_ID,
      },
      things: [
        {
          id: THIRD_SPACE_ID,
          document: { title: 'Alias: opening', kind: 'alias', target: THING_ID },
        },
        {
          id: THING_ID,
          document: {
            title: 'Opening: why',
            kind: 'markdown',
            body: '# Opening\n\nHello.\n',
          },
        },
      ],
    };

    await expect(
      runHyper(['export', destination], {
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
    expect(positionsJson.indexOf(`"${THING_ID}"`)).toBeLessThan(
      positionsJson.indexOf(`"${THIRD_SPACE_ID}"`),
    );
    await expect(readSingleSpace(join(destination, SPACE_ID))).resolves.toEqual({
      id: snapshot.id,
      document: snapshot.document,
      things: [...snapshot.things].reverse(),
    });
  });

  it('canonicalizes thing frontmatter independently of document key insertion order', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const reordered: LoadedSpace = {
      ...storedSpace,
      snapshot: {
        ...storedSpace.snapshot,
        things: [
          {
            id: THING_ID,
            document: {
              kind: 'markdown',
              body: 'Stored body.\n',
              title: 'Stored thing',
            },
          },
        ],
      },
    };

    await expect(
      runHyper(['export', destination], {
        repository: new MemorySpaceRepository([reordered], SPACE_ID),
        io: captureIo().io,
        newId: newUuid,
      }),
    ).resolves.toBe(0);

    await expect(
      readFile(join(destination, SPACE_ID, 'things', `${THING_ID}.md`), 'utf8'),
    ).resolves.toBe(
      `---\nid: ${THING_ID}\ntitle: Stored thing\nkind: markdown\n---\n\nStored body.\n`,
    );
  });

  it('normalizes exported Markdown line endings to LF', async () => {
    const destination = join(await makeTemporaryDirectory(), 'exported');
    const withMixedLineEndings: LoadedSpace = {
      ...storedSpace,
      snapshot: {
        ...storedSpace.snapshot,
        things: [
          {
            id: THING_ID,
            document: {
              title: 'Stored thing',
              kind: 'markdown',
              body: 'First\r\nSecond\rThird\n',
            },
          },
        ],
      },
    };

    await expect(
      runHyper(['export', destination], {
        repository: new MemorySpaceRepository([withMixedLineEndings], SPACE_ID),
        io: captureIo().io,
        newId: newUuid,
      }),
    ).resolves.toBe(0);

    const thingFile = await readFile(
      join(destination, SPACE_ID, 'things', `${THING_ID}.md`),
      'utf8',
    );
    expect(thingFile).not.toContain('\r');
    expect(thingFile).toContain('\nFirst\nSecond\nThird\n');
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

  /*
   * Export takes a destination and nothing else now that it is whole-aggregate,
   * so the Space-scoped `hyper export <space-uuid> <destination>` is wrong arity
   * rather than a Space that cannot be found — which is why it belongs with the
   * other malformed command lines and exits 2.
   */
  it.each([
    { args: ['export'] },
    { args: ['export', SPACE_ID, 'destination'] },
    { args: ['first', 'second'] },
    { args: ['--dangerous-truncate'] },
    { args: ['space', '--unknown'] },
  ])('rejects invalid arguments $args', async ({ args }) => {
    const output = captureIo();

    const exitCode = await runHyper(args, {
      repository: new MemorySpaceRepository([storedSpace], SPACE_ID),
      io: output.io,
      newId: newUuid,
    });

    expect(exitCode).toBe(2);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([USAGE]);
  });

  it('reports the stored space identity and lossless bigint revision', async () => {
    // Past `Number.MAX_SAFE_INTEGER`, so a revision that went through `Number`
    // anywhere would print 9007199254740992 and fail here. Revision 0 cannot
    // catch that, and the `int8` workaround in `toDatabaseRevision` is exactly
    // the kind of thing that would reintroduce it.
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

    const exitCode = await runHyper([directory], { repository, io: output.io, newId: newUuid });

    expect(exitCode).toBe(0);
    expect(output.stdout).toEqual([
      'Imported the aggregate\n',
      `Imported space ${SPACE_ID} at revision 9007199254740993\n`,
    ]);
    expect(output.stderr).toEqual([]);
  });

  it('replaces the stored aggregate when --dangerous-truncate is given', async () => {
    const directory = await writeSingleSpaceAggregate(OTHER_SPACE_ID, 'Replacement talk');
    const output = captureIo();
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);

    const exitCode = await runHyper([directory, '--dangerous-truncate'], {
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
   * There is no public merge, so the only thing an import into an initialized
   * repository could do is destroy what is there. It refuses instead, and the
   * refusal has to name both the Meta identity in the way and the flag that
   * would proceed — the operator cannot recognise what they are about to lose
   * from an exit code.
   */
  it('refuses to import over an initialized repository, naming the flag that would proceed', async () => {
    const directory = await writeSingleSpaceAggregate(OTHER_SPACE_ID, 'Replacement talk');
    const output = captureIo();
    const repository = new MemorySpaceRepository([storedSpace], SPACE_ID);

    const exitCode = await runHyper([directory], { repository, io: output.io, newId: newUuid });

    expect(exitCode).not.toBe(0);
    expect(output.stdout).toEqual([]);
    expect(output.stderr.join('')).toContain(SPACE_ID);
    expect(output.stderr.join('')).toContain('--dangerous-truncate');
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
    const firstThingPath = join(spaceDirectory, 'first.md');
    const secondThingPath = join(spaceDirectory, 'second.md');
    await writeFile(join(spaceDirectory, 'space.json'), '{ invalid JSON');
    await writeFile(firstThingPath, 'Missing frontmatter.\n');
    await writeFile(secondThingPath, 'Also missing frontmatter.\n');
    const output = captureIo();
    const repository = new MemorySpaceRepository();

    const exitCode = await runHyper([root], { repository, io: output.io, newId: newUuid });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr.join('')).toContain(join(spaceDirectory, 'space.json'));
    expect(output.stderr.join('')).toContain(firstThingPath);
    expect(output.stderr.join('')).toContain(secondThingPath);
    await expect(repository.loadAggregate()).resolves.toEqual({ kind: 'uninitialized' });
  });

  /*
   * The fault is produced for real: a directory whose two diagrams own one graph
   * id, read off disk, identified, and put through domain intake by a real
   * repository. That error is new to version 1 — a graph id is unique across the
   * space although one diagram owns it (ADR 0045).
   *
   * It used to assert that both colliding diagram ids reached stderr, because
   * the only part an author can act on is *which two* collided. They no longer
   * do: `aggregate-refused` carries structured `SpaceAggregateError`s and the
   * CLI prints their `kind` alone, so a whole-Space fault arrives as the single
   * word `invalid-space-snapshot` with every identity inside it dropped. The
   * assertion below is what the command actually says; restoring the detail is a
   * change to `reportImportResult`, not to this test.
   */
  /*
   * The original of this test is where the CLI's refusal reporting was found to
   * be throwing identities away: a duplicate graph id is a whole-Space fault, so
   * it arrives as one `invalid-space-snapshot`, and printing the kind alone left
   * an author holding a directory and the word "invalid". `describeAggregateRefusal`
   * renders the structured error instead, which is why both colliding Diagram
   * ids are nameable here.
   */
  it('refuses a graph id two diagrams own, naming both of them', async () => {
    const root = await writeAggregate(SPACE_ID, [
      {
        name: SPACE_ID,
        spaceFile: JSON.stringify({
          version: 1,
          id: SPACE_ID,
          title: 'Two owners',
          diagrams: [
            {
              id: OTHER_SPACE_ID,
              title: 'First owner',
              kind: 'positioned',
              positions: { [THING_ID]: { x: 0, y: 0, open: false } },
              graphs: [
                { id: GRAPH_ID, title: 'Shared', edges: [{ from: THING_ID, to: THING_ID }] },
              ],
            },
            {
              id: THIRD_SPACE_ID,
              title: 'Second owner',
              kind: 'positioned',
              positions: { [THING_ID]: { x: 10, y: 10, open: false } },
              graphs: [
                { id: GRAPH_ID, title: 'Shared', edges: [{ from: THING_ID, to: THING_ID }] },
              ],
            },
          ],
        }),
        things: { 'opening.md': `---\nid: ${THING_ID}\ntitle: Opening\n---\nHello.\n` },
      },
    ]);
    const output = captureIo();
    const repository = new MemorySpaceRepository();

    const exitCode = await runHyper([root], { repository, io: output.io, newId: newUuid });

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

    const exitCode = await runHyper([directory], { repository, io: output.io, newId: newUuid });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual(['Database import failed: connection lost\n']);
  });

  it('does not load a successfully imported Space', async () => {
    const directory = await writeSingleSpaceAggregate();
    const output = captureIo();
    const repository = new MemorySpaceRepository();
    repository.loadSpace = () => Promise.reject(new Error('load unavailable'));

    const exitCode = await runHyper([directory], { repository, io: output.io, newId: newUuid });

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

    const exitCode = await runHyper([root], { repository, io: output.io, newId: newUuid });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual([
      `Aggregate validation failed:\nSpace ${OTHER_SPACE_ID} is not the Meta Space and no Space Thing points at it\n`,
    ]);
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
    const directory = await writeSingleSpaceAggregate();
    const output = captureIo();
    let closed = false;

    const exitCode = await runCliMain([directory], {
      repository: new MemorySpaceRepository(),
      io: output.io,
      newId: newUuid,
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    });

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

    const exitCode = await runCliMain([directory], {
      repository: new MemorySpaceRepository(),
      io: output.io,
      newId: newUuid,
      close: () => Promise.reject(new Error('socket stuck')),
    });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([
      'Imported the aggregate\n',
      `Imported space ${SPACE_ID} at revision 0\n`,
    ]);
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
