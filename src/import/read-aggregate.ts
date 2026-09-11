import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { aggregateFileSchema, uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { describeSchemaFailure, identifySpace, SpaceIdentityError } from './identify-space';
import { isMissingFile, readSingleSpace, SpaceImportFileError } from './read-single-space';

/** The name of the manifest at the root of a canonical aggregate directory. */
export const AGGREGATE_FILE_NAME = 'hyper.json';

/** One complete Meta-rooted aggregate, read from a canonical directory. */
export interface AggregateSource {
  readonly metaSpaceId: UUID;
  readonly spaces: readonly SpaceSnapshot[];
}

const compareOrdinal = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const isRegularFile = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
};

/**
 * Read `hyper.json`, which is what makes a directory an aggregate at all.
 *
 * Its absence is a **discovery** failure rather than a parsing one, and the
 * message names the file: the likeliest way to arrive here is by pointing the
 * command at a single Space directory, which is no longer what public import
 * takes, and "there is no hyper.json here" is the sentence that says so.
 */
const readAggregateFile = async (directory: string): Promise<UUID> => {
  const path = join(directory, AGGREGATE_FILE_NAME);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      throw new SpaceImportFileError('discovery', [
        `${path}: a canonical aggregate directory must contain ${AGGREGATE_FILE_NAME}`,
      ]);
    }
    throw new SpaceImportFileError('discovery', [`${path}: ${String(error)}`]);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new SpaceImportFileError('parsing', [`${path}: ${String(error)}`]);
  }

  const parsed = aggregateFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new SpaceImportFileError('parsing', [
      `${path}: ${describeSchemaFailure(parsed.error.issues, 'aggregate file')}`,
    ]);
  }
  return parsed.data.metaSpaceId;
};

/**
 * The immediate children that are Space directories, in ordinal name order.
 *
 * A child is a Space directory because it holds a `space.json` — the same rule
 * a single Space directory is recognised by. A child that holds none is not an
 * error: re-export preserves whatever else the destination carried, so a
 * directory of notes beside the Spaces has to survive a round trip rather than
 * fail one.
 *
 * Ordinal order, not the host's collation, for the reason `read-single-space`
 * sorts that way: import order decides the order Spaces are written and read
 * back, so it has to come from the bytes rather than from ICU.
 */
const discoverSpaceDirectories = async (directory: string): Promise<string[]> => {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new SpaceImportFileError('discovery', [String(error)]);
  }

  const children = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(directory, entry.name))
    .sort((left, right) => compareOrdinal(basename(left), basename(right)));

  try {
    const candidates = await Promise.all(
      children.map(async (child) => ({
        child,
        containsSpace: await isRegularFile(join(child, 'space.json')),
      })),
    );
    return candidates.flatMap(({ child, containsSpace }) => (containsSpace ? [child] : []));
  } catch (error) {
    throw new SpaceImportFileError('discovery', [String(error)]);
  }
};

/**
 * Read one Space directory, taking its identity from the directory's own name.
 *
 * **Every Space Id in an aggregate is explicit**, and the directory name is
 * where it is written: canonical export names each directory for the Space it
 * holds, so a name that is not a UUID is a directory somebody renamed, and
 * silently reading the id out of `space.json` instead would let that rename
 * pass as a fresh Space on the next round trip.
 *
 * Where `space.json` also carries an `id` the two must agree. Nothing chooses
 * between them — a disagreement is refused, because either answer would be a
 * guess about which of the two the author meant.
 */
const readSpaceDirectory = async (directory: string, newId: () => UUID): Promise<SpaceSnapshot> => {
  const name = basename(directory);
  const named = uuidSchema.safeParse(name);
  if (!named.success) {
    throw new SpaceImportFileError('parsing', [
      `${directory}: a Space directory must be named for its Space UUID`,
    ]);
  }

  const input = await readSingleSpace(directory);
  if (input.id !== undefined && input.id !== named.data) {
    throw new SpaceImportFileError('parsing', [
      `${join(directory, 'space.json')}: declares Space ${input.id} inside directory ${named.data}`,
    ]);
  }

  try {
    return identifySpace(input, newId, named.data);
  } catch (error) {
    if (error instanceof SpaceIdentityError) {
      throw new SpaceImportFileError('parsing', [`${directory}: ${error.message}`]);
    }
    throw error;
  }
};

/**
 * Read a canonical aggregate directory into the complete Meta-rooted input the
 * persistence lifecycle takes.
 *
 * This reads and identifies; it validates nothing about how the Spaces relate.
 * Meta rooting, Space Thing targets, cross-Space Thing ownership and the rest
 * are `loadSpaceAggregate`'s, asked once over the whole collection by
 * `initializeAggregate` and `replaceAggregate` — so a directory that reads
 * cleanly here can still be refused, and is refused in one place rather than
 * twice in two vocabularies.
 *
 * Every Space directory is read before any failure is raised, so one unreadable
 * Space does not hide the next one's problem.
 */
export const readAggregate = async (
  inputPath: string,
  newId: () => UUID,
): Promise<AggregateSource> => {
  const directory = resolve(inputPath);
  const metaSpaceId = await readAggregateFile(directory);
  const spaceDirectories = await discoverSpaceDirectories(directory);

  const results = await Promise.allSettled(
    spaceDirectories.map((child) => readSpaceDirectory(child, newId)),
  );
  // SAFETY: PromiseRejectedResult.reason is typed `any` by lib.es; asserting
  // `unknown` stops that `any` from propagating into `failures`.
  const failures: unknown[] = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : [],
  );
  if (failures.length > 0) {
    const fileFailures = failures.filter(
      (error): error is SpaceImportFileError => error instanceof SpaceImportFileError,
    );
    if (fileFailures.length !== failures.length) throw failures[0];
    throw new SpaceImportFileError(
      fileFailures.some(({ kind }) => kind === 'discovery') ? 'discovery' : 'parsing',
      fileFailures.flatMap(({ diagnostics }) => diagnostics),
    );
  }

  return {
    metaSpaceId,
    spaces: results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
  };
};
