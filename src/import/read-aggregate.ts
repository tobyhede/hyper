import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  aggregateFileSchema,
  uuidSchema,
  type ImportSpace,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { compareOrdinal } from '../ordinal';
import { describeSchemaFailure, identifySpace, SpaceIdentityError } from './identify-space';
import { isMissingFile, readSingleSpace, SpaceImportFileError } from './read-single-space';

/** The name of the aggregate file at the root of a canonical aggregate directory. */
export const AGGREGATE_FILE_NAME = 'hyper.json';

/** One complete Meta-rooted aggregate, read from a canonical directory. */
export interface AggregateSource {
  readonly metaSpaceId: UUID;
  readonly spaces: readonly SpaceSnapshot[];
}

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
 *
 * Exported because canonical export checks its destination against this exact
 * rule before staging anything (`src/export/export-aggregate.ts`). A second
 * discovery rule written for export would be a second answer to "what will
 * import find here", and the one that matters is this one.
 */
export const discoverSpaceDirectories = async (directory: string): Promise<string[]> => {
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
 * The Space Id a directory name spells, or `undefined` when the name is not one.
 *
 * Canonical spelling, not merely a parseable UUID: `z.string().uuid()` is case
 * insensitive, while a canonical export writes a Space's id in lower case and
 * nothing else. So an upper-cased name is a directory somebody renamed — import
 * must not take an id from it, or the stored Space is spelled the way no
 * reference to it is spelled, and export must not mistake it for one of its own
 * and remove it.
 */
export const spaceDirectoryId = (name: string): UUID | undefined => {
  if (name !== name.toLowerCase()) return undefined;
  const parsed = uuidSchema.safeParse(name);
  return parsed.success ? parsed.data : undefined;
};

/** One Space directory's bytes, read and identified but not yet minted into. */
interface SpaceDirectoryRead {
  readonly directory: string;
  readonly id: UUID;
  readonly input: ImportSpace;
}

/**
 * Read one Space directory, taking its identity from the directory's own name.
 *
 * **Every Space Id in an aggregate is explicit**, and the directory name is
 * where it is written: canonical export names each directory for the Space it
 * holds, so a name `spaceDirectoryId` does not accept is a directory somebody
 * renamed, and silently reading the id out of `space.json` instead would let
 * that rename pass as a fresh Space on the next round trip.
 *
 * Where `space.json` also carries an `id` the two must agree. Nothing chooses
 * between them — a disagreement is refused, because either answer would be a
 * guess about which of the two the author meant.
 *
 * **Reads, and does not mint.** Minting is `identifyReadSpaces` below, run in
 * ordinal order once every read has settled, because these reads run
 * concurrently and a generator consumed inside them draws in I/O-completion
 * order — so which Space received which minted id depended on how fast its
 * files came back rather than on the sort that discovery applied.
 */
const readSpaceDirectory = async (directory: string): Promise<SpaceDirectoryRead> => {
  const id = spaceDirectoryId(basename(directory));
  if (id === undefined) {
    throw new SpaceImportFileError('parsing', [
      `${directory}: a Space directory must be named for its Space UUID, in lower case`,
    ]);
  }

  const input = await readSingleSpace(directory);
  if (input.id !== undefined && input.id !== id) {
    throw new SpaceImportFileError('parsing', [
      `${join(directory, 'space.json')}: declares Space ${input.id} inside directory ${id}`,
    ]);
  }

  return { directory, id, input };
};

/** The Spaces minting completed, beside the failures it gathered on the way. */
interface IdentifiedSpaces {
  readonly spaces: readonly SpaceSnapshot[];
  readonly failures: readonly unknown[];
}

/**
 * Fill in the ids the documents left out, in the order discovery put the Spaces
 * in, collecting each Space's own failure rather than stopping at the first.
 *
 * Synchronous on purpose: the whole point is that nothing between one Space's
 * first minted id and the next one's can reorder them, and an `await` in here
 * would put that back.
 *
 * Failures are gathered rather than thrown so they join the read failures in one
 * list, and are answered by the one policy below. A fault the reader does not
 * model reaches this phase as readily as the read phase — the identity generator
 * throwing is how canonical export verifies a staged aggregate — so it has to be
 * sorted by what it is, not by which phase raised it.
 */
const identifyReadSpaces = (
  reads: readonly SpaceDirectoryRead[],
  newId: () => UUID,
): IdentifiedSpaces => {
  const spaces: SpaceSnapshot[] = [];
  const failures: unknown[] = [];
  for (const { directory, id, input } of reads) {
    try {
      spaces.push(identifySpace(input, newId, id));
    } catch (error) {
      failures.push(
        error instanceof SpaceIdentityError
          ? new SpaceImportFileError('parsing', [`${directory}: ${error.message}`])
          : error,
      );
    }
  }
  return { spaces, failures };
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
 * Space does not hide the next one's problem. Those reads are concurrent and
 * their minting is not: ids are drawn afterwards, in discovery's ordinal order,
 * so the same directory yields the same assignment every time rather than one
 * decided by which `space.json` came back first.
 */
export const readAggregate = async (
  inputPath: string,
  newId: () => UUID,
): Promise<AggregateSource> => {
  const directory = resolve(inputPath);
  const metaSpaceId = await readAggregateFile(directory);
  const spaceDirectories = await discoverSpaceDirectories(directory);

  const results = await Promise.allSettled(spaceDirectories.map(readSpaceDirectory));
  // SAFETY: PromiseRejectedResult.reason is typed `any` by lib.es; asserting
  // `unknown` stops that `any` from propagating into `failures`.
  const readFailures: unknown[] = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : [],
  );
  const reads = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  // Minting runs over whatever read cleanly even when a neighbour did not, so a
  // fault it raises is weighed against the read failures rather than hidden
  // behind them.
  const identified = identifyReadSpaces(reads, newId);
  const failures = [...readFailures, ...identified.failures];

  if (failures.length > 0) {
    // A failure this reader does not model — a programming fault, a non-ENOENT
    // `fs` error, the identity generator itself throwing — is raised as it is
    // rather than folded into a refusal written for unreadable files. It goes
    // first because the alternative is whichever failure sorted first, and a
    // neighbour's ordinary parse diagnostic would then be all the operator sees.
    for (const failure of failures) {
      if (!(failure instanceof SpaceImportFileError)) throw failure;
    }
    const fileFailures = failures.filter(
      (error): error is SpaceImportFileError => error instanceof SpaceImportFileError,
    );
    throw new SpaceImportFileError(
      fileFailures.some(({ kind }) => kind === 'discovery') ? 'discovery' : 'parsing',
      fileFailures.flatMap(({ diagnostics }) => diagnostics),
    );
  }

  return { metaSpaceId, spaces: identified.spaces };
};
