import { fileURLToPath } from 'node:url';
import { newUuid } from '@project/core';
import { identifySpace, readAggregate, readSingleSpace } from '../../src/aggregate-directory';
import type { SpaceRepository } from '../../src/persistence/space-repository';
import type { LoadedSpace } from '@project/persistence';

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
  return seededSpace(initialized, directory, snapshot.id);
};

/**
 * Import the tracked fixture as a complete Meta-rooted aggregate, through the
 * same `readAggregate` + `initializeAggregate` path public import uses.
 *
 * Returns the Meta Space so callers that open the fixture still receive the
 * Diagram fixture they address.
 */
export const importFixture = async (repository: SpaceRepository): Promise<LoadedSpace> => {
  const source = await readAggregate(fixtureDirectory, newUuid);
  const initialized = await repository.initializeAggregate({
    metaSpaceId: source.metaSpaceId,
    spaces: source.spaces,
  });
  return seededSpace(initialized, fixtureDirectory, source.metaSpaceId);
};
