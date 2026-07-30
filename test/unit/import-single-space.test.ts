import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidSchema, type ImportSpace, type SpaceSnapshot, type UUID } from '@project/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SingleSpaceImportError,
  importSingleSpace,
  importSpaceBatch,
} from '../../src/import/import-single-space';
import { SpaceImportFileError } from '../../src/import/read-single-space';
import type {
  ImportMode,
  RepositoryCommitResult,
  RepositoryImportResult,
  SpaceRepository,
  SpaceSummary,
  StoredSpace,
} from '../../src/persistence/space-repository';

const SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const OTHER_SPACE_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const CARD_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const ROUTE_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');

const storedSnapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 2, title: 'Stored talk', routes: [] },
  cards: [
    {
      id: CARD_ID,
      document: { title: 'Stored card', kind: 'markdown', body: 'Stored body.\n' },
    },
  ],
};

const storedSpace: StoredSpace = {
  snapshot: storedSnapshot,
  revision: 3n,
  exportedRevision: null,
};

const otherStoredSpace: StoredSpace = {
  snapshot: {
    id: OTHER_SPACE_ID,
    document: { version: 2, title: 'Other stored talk', routes: [] },
    cards: [],
  },
  revision: 0n,
  exportedRevision: null,
};

class RecordingRepository implements SpaceRepository {
  readonly imports: ImportSpace[][] = [];
  readonly modes: ImportMode[] = [];
  private readonly result: RepositoryImportResult;

  constructor(result: RepositoryImportResult) {
    this.result = result;
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

  importSpaces(input: readonly ImportSpace[], mode: ImportMode): Promise<RepositoryImportResult> {
    this.imports.push([...input]);
    this.modes.push(mode);
    return Promise.resolve(this.result);
  }
}

const temporaryDirectories: string[] = [];

const makeTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'hyper-import-single-space-'));
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

const captureError = async (operation: () => Promise<unknown>): Promise<unknown> => {
  try {
    await operation();
    return undefined;
  } catch (error) {
    return error;
  }
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('importSingleSpace', () => {
  it('finishes file validation before calling the repository', async () => {
    const directory = await makeTemporaryDirectory();
    await writeFile(join(directory, 'space.json'), '{ invalid JSON');
    const repository = new RecordingRepository({ kind: 'imported', spaces: [storedSpace] });

    await expect(importSingleSpace(directory, repository)).rejects.toBeInstanceOf(
      SpaceImportFileError,
    );
    expect(repository.imports).toEqual([]);
  });

  it('imports one completely read aggregate and returns the repository stored space', async () => {
    const directory = await writeValidSpace();
    const repository = new RecordingRepository({ kind: 'imported', spaces: [storedSpace] });

    const result = await importSingleSpace(directory, repository);

    expect(result).toBe(storedSpace);
    expect(repository.imports).toEqual([
      [
        {
          id: SPACE_ID,
          document: { version: 2, title: 'Imported talk', routes: [] },
          cards: [
            {
              document: { title: 'Opening', kind: 'markdown', body: 'Hello.\n' },
            },
          ],
        },
      ],
    ]);
  });

  it.each([
    {
      result: { kind: 'conflict', current: storedSpace } satisfies RepositoryImportResult,
      expectedKind: 'revision-conflict',
      expectedMessage: `Revision conflict for space ${SPACE_ID}`,
    },
    {
      result: {
        kind: 'rejected',
        code: 'duplicate-identity',
        message: `Duplicate route ${ROUTE_ID}`,
      } satisfies RepositoryImportResult,
      expectedKind: 'identity',
      expectedMessage: `Duplicate route ${ROUTE_ID}`,
    },
    {
      result: {
        kind: 'rejected',
        code: 'card-ownership',
        message: `Card ${CARD_ID} belongs to space ${OTHER_SPACE_ID}`,
      } satisfies RepositoryImportResult,
      expectedKind: 'identity',
      expectedMessage: `Card ${CARD_ID} belongs to space ${OTHER_SPACE_ID}`,
    },
    {
      result: {
        kind: 'rejected',
        code: 'invalid-snapshot',
        message: `Route ${ROUTE_ID} has an unresolved card`,
      } satisfies RepositoryImportResult,
      expectedKind: 'domain-validation',
      expectedMessage: `Route ${ROUTE_ID} has an unresolved card`,
    },
  ] as const)(
    'maps a repository result to $expectedKind without changing its diagnostic',
    async ({ result, expectedKind, expectedMessage }) => {
      const directory = await writeValidSpace();
      const repository = new RecordingRepository(result);

      const thrown = await captureError(() => importSingleSpace(directory, repository));

      expect(thrown).toBeInstanceOf(SingleSpaceImportError);
      if (!(thrown instanceof SingleSpaceImportError)) return;
      expect(thrown.kind).toBe(expectedKind);
      expect(thrown.message).toBe(expectedMessage);
    },
  );

  it.each([
    { spaces: [], count: 0 },
    { spaces: [storedSpace, storedSpace], count: 2 },
  ])('rejects an imported result containing $count spaces', async ({ spaces, count }) => {
    const directory = await writeValidSpace();
    const repository = new RecordingRepository({ kind: 'imported', spaces });

    await expect(importSingleSpace(directory, repository)).rejects.toThrow(
      `Single-space import returned ${count} spaces`,
    );
  });
});

describe('importSpaceBatch', () => {
  it('does not begin repository import when any child space fails parsing', async () => {
    const collection = await makeTemporaryDirectory();
    const valid = join(collection, 'valid');
    const invalid = join(collection, 'invalid');
    await mkdir(valid);
    await mkdir(invalid);
    await writeFile(
      join(valid, 'space.json'),
      JSON.stringify({ version: 2, id: SPACE_ID, title: 'Valid', routes: [] }),
    );
    await writeFile(join(invalid, 'space.json'), '{ invalid JSON');
    const repository = new RecordingRepository({ kind: 'imported', spaces: [storedSpace] });

    await expect(importSpaceBatch(collection, repository)).rejects.toBeInstanceOf(
      SpaceImportFileError,
    );
    expect(repository.imports).toEqual([]);
  });

  it('parses every child space before importing the batch in one repository call', async () => {
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
    const repository = new RecordingRepository({
      kind: 'imported',
      spaces: [storedSpace, otherStoredSpace],
    });

    const result = await importSpaceBatch(collection, repository);

    expect(result).toEqual([storedSpace, otherStoredSpace]);
    expect(repository.imports).toHaveLength(1);
    expect(repository.modes).toEqual(['upsert']);
    expect(repository.imports[0]?.map(({ document }) => document.title)).toEqual([
      'First',
      'Second',
    ]);
  });
});
