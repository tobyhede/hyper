import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidSchema, type ImportSpace, type SpaceSnapshot, type UUID } from '@project/core';
import { afterEach, describe, expect, it } from 'vitest';
import { runCliMain } from '../../src/cli/main';
import { runHyper, type CliIo } from '../../src/cli/run';
import type {
  ImportMode,
  RepositoryCommitResult,
  RepositoryImportResult,
  SpaceRepository,
  SpaceSummary,
  StoredSpace,
} from '../../src/persistence/space-repository';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const CARD_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const ROUTE_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const OTHER_SPACE_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');

const storedSpace: StoredSpace = {
  snapshot: {
    id: SPACE_ID,
    document: { version: 2, title: 'Stored talk', routes: [] },
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

const otherStoredSpace: StoredSpace = {
  snapshot: {
    id: OTHER_SPACE_ID,
    document: { version: 2, title: 'Other stored talk', routes: [] },
    cards: [],
  },
  revision: 2n,
  exportedRevision: null,
};

class ImportRepository implements SpaceRepository {
  readonly modes: ImportMode[] = [];
  private readonly outcome: RepositoryImportResult | Error;

  constructor(outcome: RepositoryImportResult | Error) {
    this.outcome = outcome;
  }

  listSpaces(): Promise<readonly SpaceSummary[]> {
    throw new Error('Unexpected listSpaces call');
  }

  loadSpace(_id: UUID): Promise<StoredSpace | undefined> {
    throw new Error('Unexpected loadSpace call');
  }

  commitSpace(
    _snapshot: SpaceSnapshot,
    _expectedRevision: bigint,
  ): Promise<RepositoryCommitResult> {
    throw new Error('Unexpected commitSpace call');
  }

  importSpaces(_input: readonly ImportSpace[], mode: ImportMode): Promise<RepositoryImportResult> {
    this.modes.push(mode);
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

const writeValidSpace = async (): Promise<string> => {
  const directory = await makeTemporaryDirectory();
  await mkdir(join(directory, 'cards'));
  await writeFile(
    join(directory, 'space.json'),
    JSON.stringify({ version: 2, id: SPACE_ID, title: 'Imported talk', routes: [] }),
  );
  await writeFile(join(directory, 'cards', 'opening.md'), '---\ntitle: Opening\n---\nHello.\n');
  return directory;
};

const captureIo = (): { io: CliIo; stdout: string[]; stderr: string[] } => {
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
  it.each([{ args: [] }, { args: ['first', 'second'] }, { args: ['--dangerous-truncate'] }])(
    'rejects invalid arguments $args',
    async ({ args }) => {
      const output = captureIo();

      const exitCode = await runHyper(args, {
        repository: new ImportRepository({ kind: 'imported', spaces: [storedSpace] }),
        io: output.io,
      });

      expect(exitCode).toBe(2);
      expect(output.stdout).toEqual([]);
      expect(output.stderr).toEqual(['Usage: hyper <path> [--dangerous-truncate]\n']);
    },
  );

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
    });

    expect(exitCode).toBe(0);
    expect(output.stdout).toEqual([`Imported space ${SPACE_ID} at revision 9007199254740993\n`]);
    expect(output.stderr).toEqual([]);
  });

  it('imports a collection in truncate mode and reports every stored space', async () => {
    const collection = await makeTemporaryDirectory();
    const first = join(collection, 'first');
    const second = join(collection, 'second');
    await mkdir(first);
    await mkdir(second);
    await writeFile(
      join(first, 'space.json'),
      JSON.stringify({ version: 2, id: SPACE_ID, title: 'First', routes: [] }),
    );
    await writeFile(
      join(second, 'space.json'),
      JSON.stringify({ version: 2, id: OTHER_SPACE_ID, title: 'Second', routes: [] }),
    );
    const output = captureIo();
    const repository = new ImportRepository({
      kind: 'imported',
      spaces: [storedSpace, otherStoredSpace],
    });

    const exitCode = await runHyper([collection, '--dangerous-truncate'], {
      repository,
      io: output.io,
    });

    expect(exitCode).toBe(0);
    expect(repository.modes).toEqual(['truncate']);
    expect(output.stdout).toEqual([
      `Imported 2 spaces:\n${SPACE_ID} at revision 0\n${OTHER_SPACE_ID} at revision 2\n`,
    ]);
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
        message: `Duplicate route ${ROUTE_ID}`,
      } satisfies RepositoryImportResult,
      entityId: ROUTE_ID,
    },
    {
      outcome: {
        kind: 'rejected',
        code: 'invalid-snapshot',
        message: `Route ${ROUTE_ID} has an unresolved card`,
      } satisfies RepositoryImportResult,
      entityId: ROUTE_ID,
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
      });

      expect(exitCode).toBe(1);
      expect(output.stdout).toEqual([]);
      expect(output.stderr.join('')).toContain(entityId);
    },
  );

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
    });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(output.stderr).toEqual(['Database import failed: connection lost\n']);
  });
});

describe('runCliMain', () => {
  it('preserves the import result after awaiting a successful database close', async () => {
    const directory = await writeValidSpace();
    const output = captureIo();
    let closed = false;

    const exitCode = await runCliMain([directory], {
      repository: new ImportRepository({ kind: 'imported', spaces: [storedSpace] }),
      io: output.io,
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
      close: () => Promise.reject(new Error('socket stuck')),
    });

    expect(exitCode).toBe(1);
    expect(output.stdout).toEqual([`Imported space ${SPACE_ID} at revision 0\n`]);
    expect(output.stderr).toEqual(['Database shutdown failed: socket stuck\n']);
  });
});
