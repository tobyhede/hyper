import { fileURLToPath } from 'node:url';
import { newUuid } from '@project/core';
import { identifySpace, readSingleSpace } from '../../src/aggregate-directory';
import type { SpaceRepository } from '../../src/persistence/space-repository';
import type { LoadedSpace } from '@project/persistence';

const fixtureDirectory = fileURLToPath(new URL('../../packages/app/fixture', import.meta.url));

/**
 * Import one Space directory through the production file importer, and seed it
 * through the lifecycle door every other caller uses (ADR 0078).
 *
 * The Meta identity is **named** here rather than inferred: the one Space this
 * reads is the aggregate's root, and `initializeAggregate` is told so. The
 * retired `importSpaces` took Meta from array position instead, which is the
 * inference ADR 0078 refuses — a helper that keeps taking it would be seeding
 * fixtures through a door the product no longer has.
 *
 * `newUuid` rather than an injected generator because nothing here asserts on an
 * identity: the ids the directory leaves out are filled in so the snapshot can
 * be stored at all, and a test that wants to name one identifies its own
 * snapshot (ADR 0016).
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
  if (initialized.kind !== 'initialized') {
    // `existing` and `already-initialized` both mean the repository was seeded
    // before this call, which is a fault in the test's setup rather than in the
    // directory; `aggregate-refused` means the directory itself does not load.
    const because =
      initialized.kind === 'aggregate-refused'
        ? initialized.errors.map(({ kind }) => kind).join(', ')
        : 'the repository was already initialized';
    throw new Error(`Space directory ${directory} did not seed: ${initialized.kind} (${because})`);
  }
  const fixture = initialized.aggregate.spaces.find(({ snapshot: { id } }) => id === snapshot.id);
  if (fixture === undefined) {
    throw new Error(`Space directory ${directory} seeded no Space for ${snapshot.id}`);
  }
  return fixture;
};

/** Import the tracked abstract-layout fixture through the production file importer. */
export const importFixture = (repository: SpaceRepository): Promise<LoadedSpace> =>
  importSpaceDirectory(repository, fixtureDirectory);
