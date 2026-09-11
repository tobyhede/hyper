import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidSchema, type UUID } from '@project/core';
import type {
  AggregateLoadResult,
  LoadedSpace,
  RepositoryCommitResult,
  SpaceCommit,
  SpaceSummary,
} from '@project/persistence';
import { afterEach, describe, expect, it } from 'vitest';
import { importAggregate } from '../../src/import/import-aggregate';
import { SpaceImportFileError } from '../../src/import/read-single-space';
import { AGGREGATE_FILE_NAME } from '../../src/import/read-aggregate';
import type {
  AggregateInput,
  InitializeAggregateResult,
  ReplaceAggregateResult,
  SpaceRepository,
} from '../../src/persistence/space-repository';
import { MemorySpaceRepository } from '../support/memory-space-repository';
import { captureError } from '../support/capture-error';

const META_SPACE_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const OTHER_META_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const ORDINARY_SPACE_ID = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const GRAPH_ID = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const DIAGRAM_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');

/**
 * Which seam call an import made, in order, over the behavioural double behind
 * it.
 *
 * Two lifecycle doors and no mode parameter (ADR 0078), so *which* door was
 * opened is part of the outcome rather than an implementation detail: an empty
 * repository under `--dangerous-truncate` has to initialize, and nothing but the
 * call record tells that apart from a successful replacement. It is also how
 * "the repository was never touched" is stated — an assertion about stored state
 * would pass just as well for an import that wrote and rolled back.
 */
type SeamCall = 'loadAggregate' | 'initializeAggregate' | 'replaceAggregate';

class RecordingRepository implements SpaceRepository {
  readonly calls: SeamCall[] = [];
  readonly #stored: MemorySpaceRepository;

  constructor(stored: MemorySpaceRepository = new MemorySpaceRepository()) {
    this.#stored = stored;
  }

  listSpaces(): Promise<readonly SpaceSummary[]> {
    return this.#stored.listSpaces();
  }

  loadSpace(id: UUID): Promise<LoadedSpace | undefined> {
    return this.#stored.loadSpace(id);
  }

  markExported(id: UUID, revision: bigint): Promise<void> {
    return this.#stored.markExported(id, revision);
  }

  commit(request: SpaceCommit): Promise<RepositoryCommitResult> {
    return this.#stored.commit(request);
  }

  loadAggregate(): Promise<AggregateLoadResult> {
    this.calls.push('loadAggregate');
    return this.#stored.loadAggregate();
  }

  initializeAggregate(input: AggregateInput): Promise<InitializeAggregateResult> {
    this.calls.push('initializeAggregate');
    return this.#stored.initializeAggregate(input);
  }

  replaceAggregate(
    input: AggregateInput,
    expectedMetaSpaceId: UUID,
  ): Promise<ReplaceAggregateResult> {
    this.calls.push('replaceAggregate');
    return this.#stored.replaceAggregate(input, expectedMetaSpaceId);
  }
}

/**
 * The identities a hand-authored directory leaves out come from here rather than
 * from the ambient generator (ADR 0016), so a test can name what it asserts on
 * and a second run mints the same ids as the first.
 */
const countingIds = (): (() => UUID) => {
  let next = 0;
  return () => {
    next += 1;
    return uuidSchema.parse(`00000000-0000-4000-8000-${next.toString().padStart(12, '0')}`);
  };
};

interface SpaceDirectory {
  /** The directory name, which is where a Space's own identity is written. */
  readonly name: string;
  /** Raw text, so a test can write a space file that does not parse. */
  readonly spaceFile: string;
  readonly things?: Readonly<Record<string, string>>;
}

const temporaryDirectories: string[] = [];

const makeTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'hyper-import-aggregate-'));
  temporaryDirectories.push(directory);
  return directory;
};

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
const writeMetaOnlyAggregate = (
  metaSpaceId: UUID = META_SPACE_ID,
  title = 'Meta',
): Promise<string> =>
  writeAggregate(metaSpaceId, [
    {
      name: metaSpaceId,
      spaceFile: JSON.stringify({ version: 1, id: metaSpaceId, title }),
      things: { 'opening.md': '---\ntitle: Opening\n---\nHello.\n' },
    },
  ]);

const importFrom = (
  path: string,
  repository: SpaceRepository,
  truncate = false,
): ReturnType<typeof importAggregate> =>
  importAggregate(path, repository, { truncate, newId: countingIds() });

const storedMetaSpaceId = async (repository: SpaceRepository): Promise<UUID | undefined> => {
  const loaded = await repository.loadAggregate();
  return loaded.kind === 'loaded' ? loaded.aggregate.metaSpaceId : undefined;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('importAggregate', () => {
  it('finishes file validation before calling the repository', async () => {
    const root = await writeAggregate(META_SPACE_ID, [
      { name: META_SPACE_ID, spaceFile: '{ invalid JSON' },
    ]);
    const repository = new RecordingRepository();

    await expect(importFrom(root, repository)).rejects.toBeInstanceOf(SpaceImportFileError);
    expect(repository.calls).toEqual([]);
  });

  it('refuses a version 2 space directory rather than migrating it', async () => {
    // The disposable pre-release shape: graphs beside the diagrams instead of
    // inside them. Hyper is unreleased, so it has no compatibility claim on the
    // first-public document and never enters (ADR 0040).
    //
    // Import parses against `importSpaceFileSchema`, which runs ahead of domain
    // intake, so it asks `documentRefusal` before that schema can answer for the
    // keys that moved — the same composed gate `loadSpace` asks, so the CLI says
    // of a version 2 directory exactly what intake says, once. What that gate is
    // and where it lives is pinned in `read-single-space.test.ts`; what matters
    // here is that the version is the whole of the refusal and nothing reaches
    // the repository.
    const root = await writeAggregate(META_SPACE_ID, [
      {
        name: META_SPACE_ID,
        spaceFile: JSON.stringify({
          version: 2,
          id: META_SPACE_ID,
          title: 'Pre-release talk',
          graphs: [{ id: GRAPH_ID, title: 'Main', edges: [] }],
          diagrams: [{ id: DIAGRAM_ID, title: 'Working', positions: {} }],
        }),
      },
    ]);
    const repository = new RecordingRepository();

    const error = await captureError(() => importFrom(root, repository));

    expect(error).toBeInstanceOf(SpaceImportFileError);
    if (!(error instanceof SpaceImportFileError)) return;
    expect(error.kind).toBe('parsing');
    expect(error.diagnostics).toHaveLength(1);
    expect(error.diagnostics[0]).toContain('version 2');
    expect(repository.calls).toEqual([]);
  });

  it('refuses a retired space-level graphs key rather than importing what survives it', async () => {
    // The regression this exists for is not a bad diagnostic — it is a
    // successful import. `importSpaceFileSchema` was a plain Zod object then, so
    // it dropped the retired key and handed the repository a Space missing its
    // whole topology, reported as imported (issue `10`). Refusing is what the
    // test above proves; what this adds is that nothing reaches the repository.
    const root = await writeAggregate(META_SPACE_ID, [
      {
        name: META_SPACE_ID,
        spaceFile: JSON.stringify({
          version: 1,
          id: META_SPACE_ID,
          title: 'Talk',
          graphs: [{ id: GRAPH_ID, title: 'Main', edges: [] }],
        }),
      },
    ]);
    const repository = new RecordingRepository();

    const error = await captureError(() => importFrom(root, repository));

    expect(error).toBeInstanceOf(SpaceImportFileError);
    if (!(error instanceof SpaceImportFileError)) return;
    expect(error.kind).toBe('parsing');
    expect(error.diagnostics).toHaveLength(1);
    expect(error.diagnostics[0]).toContain('`graphs`');
    expect(repository.calls).toEqual([]);
  });

  it('initializes an empty repository through the initializing door', async () => {
    const root = await writeMetaOnlyAggregate();
    const repository = new RecordingRepository();

    const result = await importFrom(root, repository);

    expect(result.kind).toBe('imported');
    if (result.kind !== 'imported') return;
    expect(result.spaces.map(({ snapshot }) => snapshot.id)).toEqual([META_SPACE_ID]);
    expect(repository.calls).toEqual(['initializeAggregate']);
    await expect(storedMetaSpaceId(repository)).resolves.toBe(META_SPACE_ID);
  });

  /*
   * Idempotent rather than a failure (ADR 0078), and its own arm rather than
   * `imported`, so a second run of the same command does not claim to have
   * written anything.
   */
  it('answers unchanged when the repository already holds exactly this aggregate', async () => {
    const root = await writeMetaOnlyAggregate();
    const repository = new RecordingRepository();
    await importFrom(root, repository);

    const result = await importFrom(root, repository);

    expect(result.kind).toBe('unchanged');
    if (result.kind !== 'unchanged') return;
    expect(result.spaces.map(({ snapshot }) => snapshot.id)).toEqual([META_SPACE_ID]);
  });

  /*
   * Without the flag, an import that would have overwritten authored state says
   * so instead of doing it — and says which Meta identity is in the way, because
   * that is what the operator needs to recognise what they are about to destroy.
   */
  it('leaves an initialized repository holding a different aggregate exactly as it is', async () => {
    const repository = new RecordingRepository();
    await importFrom(await writeMetaOnlyAggregate(META_SPACE_ID, 'Stored'), repository);
    const replacement = await writeMetaOnlyAggregate(OTHER_META_ID, 'Replacement');

    const result = await importFrom(replacement, repository);

    expect(result.kind).toBe('already-initialized');
    if (result.kind !== 'already-initialized') return;
    expect(result.currentMetaSpaceId).toBe(META_SPACE_ID);
    expect(repository.calls).toEqual(['initializeAggregate', 'initializeAggregate']);
    await expect(storedMetaSpaceId(repository)).resolves.toBe(META_SPACE_ID);
  });

  it('replaces the stored aggregate and its Meta identity under truncate', async () => {
    const repository = new RecordingRepository();
    await importFrom(await writeMetaOnlyAggregate(META_SPACE_ID, 'Stored'), repository);
    const replacement = await writeMetaOnlyAggregate(OTHER_META_ID, 'Replacement');

    const result = await importFrom(replacement, repository, true);

    expect(result.kind).toBe('imported');
    if (result.kind !== 'imported') return;
    expect(result.spaces.map(({ snapshot }) => snapshot.id)).toEqual([OTHER_META_ID]);
    // The identity `loadAggregate` just reported is what authorizes the
    // replacement, so the read is part of the door rather than a courtesy.
    expect(repository.calls).toEqual(['initializeAggregate', 'loadAggregate', 'replaceAggregate']);
    await expect(storedMetaSpaceId(repository)).resolves.toBe(OTHER_META_ID);
    await expect(repository.listSpaces()).resolves.toEqual([
      { id: OTHER_META_ID, title: 'Replacement' },
    ]);
  });

  /*
   * `replaceAggregate` refuses to establish first state, so an empty repository
   * takes the initializing door even under the flag: there is nothing to
   * truncate, and `--dangerous-truncate` is permission to destroy rather than a
   * demand that something be destroyed.
   */
  it('initializes rather than replaces an empty repository under truncate', async () => {
    const root = await writeMetaOnlyAggregate();
    const repository = new RecordingRepository();

    const result = await importFrom(root, repository, true);

    expect(result.kind).toBe('imported');
    expect(repository.calls).toEqual(['loadAggregate', 'initializeAggregate']);
    await expect(storedMetaSpaceId(repository)).resolves.toBe(META_SPACE_ID);
  });

  /*
   * The gap between the `loadAggregate` that found nothing and the
   * `initializeAggregate` that follows it is real: `pnpm dev`'s startup, or a
   * second `hyper`, can establish the Meta Space in between. What comes back is
   * `already-initialized`, whose sentence tells the operator to re-run with
   * `--dangerous-truncate` — the flag they just passed. It is a lost race, so it
   * is reported as the conflict it is, and the advice becomes "run it again".
   */
  it('reports a Meta Space established during the truncate race as a conflict', async () => {
    const stored = new MemorySpaceRepository();
    await stored.initializeAggregate({
      metaSpaceId: META_SPACE_ID,
      spaces: [{ id: META_SPACE_ID, document: { version: 1, title: 'Raced in' }, things: [] }],
    });
    const repository = new RecordingRepository(stored);
    // The repository was empty when it was read, and holds a Meta Space by the
    // time the import writes — which is exactly what the losing side of the race
    // observes.
    repository.loadAggregate = () => Promise.resolve({ kind: 'uninitialized' });

    const result = await importFrom(
      await writeMetaOnlyAggregate(OTHER_META_ID, 'Replacement'),
      repository,
      true,
    );

    expect(result.kind).toBe('conflict');
    if (result.kind !== 'conflict') return;
    expect(result.currentMetaSpaceId).toBe(META_SPACE_ID);
    await expect(storedMetaSpaceId(stored)).resolves.toBe(META_SPACE_ID);
  });

  /*
   * Meta rooting is intake's question, not the reader's, so a directory that
   * read cleanly still arrives as a refusal — carrying the intake errors rather
   * than a second vocabulary written for import.
   */
  it('answers aggregate-refused carrying the intake errors', async () => {
    const root = await writeAggregate(META_SPACE_ID, [
      {
        name: META_SPACE_ID,
        spaceFile: JSON.stringify({ version: 1, id: META_SPACE_ID, title: 'Meta' }),
      },
      {
        name: ORDINARY_SPACE_ID,
        spaceFile: JSON.stringify({ version: 1, id: ORDINARY_SPACE_ID, title: 'Unreachable' }),
      },
    ]);
    const repository = new RecordingRepository();

    const result = await importFrom(root, repository);

    expect(result.kind).toBe('aggregate-refused');
    if (result.kind !== 'aggregate-refused') return;
    expect(result.errors).toEqual([
      { kind: 'ordinary-space-unreferenced', spaceId: ORDINARY_SPACE_ID },
    ]);
    await expect(repository.loadAggregate()).resolves.toEqual({ kind: 'uninitialized' });
  });
});
