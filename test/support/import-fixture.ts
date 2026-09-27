import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newUuid, type SpaceSnapshot } from '@project/core';
import { identifySpace, readAggregate, readSingleSpace } from '../../src/aggregate-directory';
import type { SpaceRepository } from '../../src/persistence/space-repository';
import {
  admitImage,
  IMAGE_COLLECTION_PATH,
  imagePath,
  type ImageStore,
  type LoadedSpace,
} from '@project/persistence';

const fixtureDirectory = fileURLToPath(new URL('../../packages/app/fixture', import.meta.url));
/**
 * The tracked image files the fixture's Image Resources show. They sit beside
 * the aggregate directory rather than in it, because an aggregate carries an
 * image's URL and never its bytes (ADR 0106).
 */
const fixtureImageDirectory = fileURLToPath(
  new URL('../../packages/app/fixture-images', import.meta.url),
);

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
 * Store every tracked image file through the same admission and store the
 * storing route uses, and answer the `/images/<id>` URL each one produced. A
 * file admission refuses is a broken fixture, so it throws rather than being
 * skipped.
 */
const storeFixtureImages = async (
  store: ImageStore,
  directory: string,
): Promise<ReadonlySet<string>> => {
  const produced = new Set<string>();
  for (const name of (await readdir(directory)).sort()) {
    const admission = await admitImage(new Uint8Array(await readFile(join(directory, name))));
    if (admission.kind === 'refused') {
      throw new Error(`Fixture image ${join(directory, name)} was refused: ${admission.code}`);
    }
    await store.storeImage(admission.image);
    produced.add(imagePath(admission.image.id));
  }
  return produced;
};

/** Every stored image URL the Spaces name that no tracked file produced. */
const unproducedImageUrls = (
  spaces: readonly SpaceSnapshot[],
  produced: ReadonlySet<string>,
): readonly string[] =>
  spaces.flatMap(({ resources }) =>
    resources.flatMap(({ document }) =>
      document.kind === 'image' &&
      document.url.startsWith(`${IMAGE_COLLECTION_PATH}/`) &&
      !produced.has(document.url)
        ? [document.url]
        : [],
    ),
  );

/**
 * Import the tracked fixture as a complete Meta-rooted aggregate, through the
 * same `readAggregate` + `initializeAggregate` path public import uses.
 *
 * Returns the Meta Space so callers that open the fixture still receive the
 * Map fixture they address.
 *
 * The tracked image files are stored first, so every Image Resource the
 * fixture seeds loads from the host before anything is served; a fixture that
 * names an `/images/<id>` none of those files produces is refused before a
 * Space is stored, so the fixture and its files cannot drift apart (ADR 0054).
 */
export const importFixture = async (
  repository: SpaceRepository,
  directory: string = fixtureDirectory,
): Promise<LoadedSpace> => {
  const source = await readAggregate(directory, newUuid);
  const produced = await storeFixtureImages(repository, fixtureImageDirectory);
  const unproduced = unproducedImageUrls(source.spaces, produced);
  if (unproduced.length > 0) {
    throw new Error(
      `Fixture ${directory} names stored images no file in ${fixtureImageDirectory} produces: ${unproduced.join(', ')}`,
    );
  }
  const initialized = await repository.initializeAggregate({
    metaSpaceId: source.metaSpaceId,
    spaces: source.spaces,
  });
  return seededSpace(initialized, directory, source.metaSpaceId);
};
