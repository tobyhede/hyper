import { fileURLToPath } from 'node:url';
import { newUuid, type SpaceSnapshot } from '@project/core';
import {
  identifySpace,
  readAggregate,
  readSingleSpace,
  storedImageId,
} from '../../src/aggregate-directory';
import { importAggregateContents } from '../../src/import/import-aggregate';
import type { SpaceRepository } from '../../src/persistence/space-repository';
import type { ImageId, LoadedSpace } from '@project/persistence';

const fixtureDirectory = fileURLToPath(new URL('../../packages/app/fixture', import.meta.url));

const seededSpace = (
  initialized: Awaited<ReturnType<SpaceRepository['initializeAggregate']>>,
  directory: string,
  spaceId: string,
): LoadedSpace => {
  if (initialized.kind !== 'initialized') {
    // `existing` and `already-initialized` both mean the repository was seeded
    // before this call, which is a fault in the test's setup rather than in the
    // directory; `aggregate-refused` means the directory itself does not load.
    const because =
      initialized.kind === 'aggregate-refused'
        ? initialized.errors.map(({ kind }) => kind).join(', ')
        : 'the repository was already initialized';
    throw new Error(`Directory ${directory} did not seed: ${initialized.kind} (${because})`);
  }
  const fixture = initialized.aggregate.spaces.find(({ snapshot: { id } }) => id === spaceId);
  if (fixture === undefined) {
    throw new Error(`Directory ${directory} seeded no Space for ${spaceId}`);
  }
  return fixture;
};

/**
 * Import one Space directory through the production file importer, and seed it
 * through the lifecycle door every other caller uses (ADR 0078).
 *
 * The Meta identity is **named** here rather than inferred: the one Space this
 * reads is the aggregate's root, and `initializeAggregate` is told so. Taking
 * Meta from array position is the inference ADR 0078 refuses.
 *
 * `newUuid` rather than an injected generator because nothing here asserts on an
 * identity: the ids the directory leaves out are filled in so the snapshot can
 * be stored at all, and a test that wants to name one identifies its own
 * snapshot (ADR 0109).
 */
export const importSpaceDirectory = async (
  repository: SpaceRepository,
  directory: string,
): Promise<LoadedSpace> => {
  const input = await readSingleSpace(directory);
  const snapshot = identifySpace(input, newUuid);
  const initialized = await repository.initializeAggregate({
    metaSpaceId: snapshot.id,
    spaces: [snapshot],
  });
  return seededSpace(initialized, directory, snapshot.id);
};

/**
 * Every stored image URL the Spaces name that the fixture's `images/` does not
 * carry, read by the same rule Export uses to decide which images to carry.
 */
const uncarriedImageUrls = (
  spaces: readonly SpaceSnapshot[],
  carried: ReadonlySet<ImageId>,
): readonly string[] =>
  spaces.flatMap(({ resources }) =>
    resources.flatMap(({ document }) => {
      if (document.kind !== 'image') return [];
      const id = storedImageId(document.url);
      return id === undefined || carried.has(id) ? [] : [document.url];
    }),
  );

/**
 * Import the tracked fixture as a complete Meta-rooted aggregate, through the
 * same `readAggregate` and import path public import uses, its `images/`
 * included (ADR 0118).
 *
 * Returns the Meta Space so callers that open the fixture still receive the
 * Map fixture they address.
 *
 * Stricter than public import in one way: a fixture naming an `/images/<id>`
 * its own `images/` does not carry is refused before anything is stored, so the
 * fixture and its files cannot drift apart (ADR 0054). Public import draws such
 * a picture as one that will not load.
 *
 * `directory` defaults to the tracked fixture; a test names a copy to seed an
 * altered fixture without touching tracked files.
 */
export const importFixture = async (
  repository: SpaceRepository,
  { directory = fixtureDirectory }: { readonly directory?: string } = {},
): Promise<LoadedSpace> => {
  const source = await readAggregate(directory, newUuid);
  const carried = new Set(source.images.map(({ id }) => id));
  const uncarried = uncarriedImageUrls(source.spaces, carried);
  if (uncarried.length > 0) {
    throw new Error(
      `Fixture ${directory} names stored images its images/ does not carry: ${uncarried.join(', ')}`,
    );
  }
  const imported = await importAggregateContents(source, repository, { replace: false });
  if (imported.kind !== 'imported') {
    const because =
      imported.kind === 'aggregate-refused'
        ? imported.errors.map(({ kind }) => kind).join(', ')
        : 'the repository was already initialized';
    throw new Error(`Directory ${directory} did not seed: ${imported.kind} (${because})`);
  }
  const meta = imported.spaces.find(({ snapshot: { id } }) => id === source.metaSpaceId);
  if (meta === undefined) throw new Error(`Directory ${directory} seeded no Meta Space`);
  return meta;
};
