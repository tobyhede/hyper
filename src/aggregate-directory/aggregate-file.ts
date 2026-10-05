import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  AGGREGATE_FILE_VERSION,
  aggregateFileSchema,
  uuidSchema,
  type AggregateFile,
  type ImportSpace,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import type { LoadedAggregate, StoredImage } from '@project/persistence';
import { compareOrdinal } from '../ordinal';
import type { AggregateInput } from '../persistence/space-repository';
import { describeSchemaFailure, identifySpace, SpaceIdentityError } from './identify-space';
import {
  admitImageFile,
  imageFileName,
  IMAGES_DIRECTORY_NAME,
  readAggregateImages,
  scannedImageFileNames,
} from './images';
import {
  AggregateDirectoryError,
  isMissingFile,
  parseSingleSpace,
  readSingleSpace,
} from './space-directory';
import { rejectSymbolicLinks, writeInPlace, type DirectoryFiles } from './write-in-place';
import { scannedSpaceFiles, spaceDirectoryFiles } from './write-space-directory';

/** The name of the aggregate file at the root of a canonical aggregate directory. */
export const AGGREGATE_FILE_NAME = 'hyper.json';

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
 * command at a single Space directory, which is not what public import takes, and "there is no hyper.json here" is the sentence that says so.
 */
const missingAggregateFile = (path: string): AggregateDirectoryError =>
  new AggregateDirectoryError('discovery', [
    `${path}: a canonical aggregate directory must contain ${AGGREGATE_FILE_NAME}`,
  ]);

/** Parse `hyper.json`'s text into the Meta Space it names. */
const parseAggregateFile = (path: string, text: string): UUID => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new AggregateDirectoryError('parsing', [`${path}: ${String(error)}`]);
  }

  const parsed = aggregateFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new AggregateDirectoryError('parsing', [
      `${path}: ${describeSchemaFailure(parsed.error.issues, 'aggregate file')}`,
    ]);
  }
  return parsed.data.metaSpaceId;
};

const readAggregateFile = async (directory: string): Promise<UUID> => {
  const path = join(directory, AGGREGATE_FILE_NAME);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) throw missingAggregateFile(path);
    throw new AggregateDirectoryError('discovery', [`${path}: ${String(error)}`]);
  }
  return parseAggregateFile(path, text);
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
 * Ordinal order, not the host's collation, for the reason `space-directory`
 * sorts that way: import order decides the order Spaces are written and read
 * back, so it has to come from the bytes rather than from ICU.
 *
 * Private to this module: export reaches discovery only through
 * `assertExportableDestination` and `scannedAggregateFiles`, so a second
 * discovery rule cannot drift beside the write path.
 */
const discoverSpaceDirectories = async (directory: string): Promise<string[]> => {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new AggregateDirectoryError('discovery', [String(error)]);
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
    throw new AggregateDirectoryError('discovery', [String(error)]);
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
const spaceDirectoryId = (name: string): UUID | undefined => {
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
const requireSpaceDirectoryId = (directory: string): UUID => {
  const id = spaceDirectoryId(basename(directory));
  if (id === undefined) {
    throw new AggregateDirectoryError('parsing', [
      `${directory}: a Space directory must be named for its Space UUID, in lower case`,
    ]);
  }
  return id;
};

const agreeingSpaceDirectory = (
  directory: string,
  id: UUID,
  input: ImportSpace,
): SpaceDirectoryRead => {
  if (input.id !== undefined && input.id !== id) {
    throw new AggregateDirectoryError('parsing', [
      `${join(directory, 'space.json')}: declares Space ${input.id} inside directory ${id}`,
    ]);
  }
  return { directory, id, input };
};

const readSpaceDirectory = async (directory: string): Promise<SpaceDirectoryRead> => {
  const id = requireSpaceDirectoryId(directory);
  return agreeingSpaceDirectory(directory, id, await readSingleSpace(directory));
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
 * throwing is how canonical export checks its files before writing them — so it has to be
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
          ? new AggregateDirectoryError('parsing', [`${directory}: ${error.message}`])
          : error,
      );
    }
  }
  return { spaces, failures };
};

/**
 * What an Aggregate directory holds: the complete Meta-rooted input the
 * persistence lifecycle takes, and the stored images its `images/` carries.
 * The images are outside the aggregate (ADR 0106), so they travel beside it
 * rather than inside the input either lifecycle door reads.
 */
export interface AggregateDirectoryContents extends AggregateInput {
  readonly images: readonly StoredImage[];
}

/**
 * Read a canonical aggregate directory into the complete Meta-rooted input the
 * persistence lifecycle takes, beside every image `images/` carries, each
 * admitted by the rule storing an uploaded picture uses (ADR 0118).
 *
 * This reads and identifies; it validates nothing about how the Spaces relate.
 * Meta rooting, Space Resource targets, cross-Space Resource ownership and the rest
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
): Promise<AggregateDirectoryContents> => {
  const directory = resolve(inputPath);
  const metaSpaceId = await readAggregateFile(directory);
  const spaceDirectories = await discoverSpaceDirectories(directory);

  const [results, images] = await Promise.all([
    Promise.allSettled(spaceDirectories.map(readSpaceDirectory)),
    readAggregateImages(directory),
  ]);
  // SAFETY: PromiseRejectedResult.reason is typed `any` by lib.es; asserting
  // `unknown` stops that `any` from propagating into `failures`.
  const readFailures: unknown[] = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : [],
  );
  const reads = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  return aggregateContents(metaSpaceId, reads, readFailures, images, newId);
};

/**
 * Mint what the reads left out and answer every failure by one policy, for the
 * directory reader and the in-memory one alike.
 */
const aggregateContents = (
  metaSpaceId: UUID,
  reads: readonly SpaceDirectoryRead[],
  readFailures: readonly unknown[],
  images: { readonly images: readonly StoredImage[]; readonly failures: readonly unknown[] },
  newId: () => UUID,
): AggregateDirectoryContents => {
  // Minting runs over whatever read cleanly even when a neighbour did not, so a
  // fault it raises is weighed against the read failures rather than hidden
  // behind them.
  const identified = identifyReadSpaces(reads, newId);
  const failures = [...readFailures, ...identified.failures, ...images.failures];

  if (failures.length > 0) {
    // A failure this reader does not model — a programming fault, a non-ENOENT
    // `fs` error, the identity generator itself throwing — is raised as it is
    // rather than folded into a refusal written for unreadable files. It goes
    // first because the alternative is whichever failure sorted first, and a
    // neighbour's ordinary parse diagnostic would then be all the operator sees.
    for (const failure of failures) {
      if (!(failure instanceof AggregateDirectoryError)) throw failure;
    }
    const fileFailures = failures.filter(
      (error): error is AggregateDirectoryError => error instanceof AggregateDirectoryError,
    );
    throw new AggregateDirectoryError(
      fileFailures.some(({ kind }) => kind === 'discovery') ? 'discovery' : 'parsing',
      fileFailures.flatMap(({ diagnostics }) => diagnostics),
    );
  }

  return { metaSpaceId, spaces: identified.spaces, images: images.images };
};

const textOf = (bytes: Uint8Array): string => Buffer.from(bytes).toString('utf8');

/**
 * The files of an Aggregate directory's own layout, by path relative to it,
 * read the way `readAggregate` reads that directory once they are on disk:
 * `hyper.json`; each top-level directory holding `space.json`, with the
 * `*.md` beside it and `resources/*.md`; and the visible files in `images/`.
 * Each is parsed and admitted by the same functions the directory reader uses,
 * and failures are answered by the same policy, so Export can ask whether its
 * files would read back before it writes any of them. `directory` only names
 * the paths in diagnostics.
 */
export const readAggregateFiles = async (
  directory: string,
  files: DirectoryFiles,
  newId: () => UUID,
): Promise<AggregateDirectoryContents> => {
  const aggregatePath = join(directory, AGGREGATE_FILE_NAME);
  const aggregateBytes = files.get(AGGREGATE_FILE_NAME);
  if (aggregateBytes === undefined) throw missingAggregateFile(aggregatePath);
  const metaSpaceId = parseAggregateFile(aggregatePath, textOf(aggregateBytes));

  const paths = [...files.keys()];
  const spaceNames = paths
    .flatMap((path) => {
      const [name, file, ...rest] = path.split('/');
      return file === 'space.json' && rest.length === 0 && name !== undefined ? [name] : [];
    })
    .sort(compareOrdinal);

  const reads: SpaceDirectoryRead[] = [];
  const readFailures: unknown[] = [];
  for (const name of spaceNames) {
    const spaceDirectory = join(directory, name);
    try {
      const id = requireSpaceDirectoryId(spaceDirectory);
      const resources = paths
        .flatMap((path) => {
          const [owner, ...rest] = path.split('/');
          const inside = rest.join('/');
          const isResource =
            owner === name &&
            ((rest.length === 1 && inside.endsWith('.md')) ||
              (rest.length === 2 && rest[0] === 'resources' && inside.endsWith('.md')));
          return isResource ? [inside] : [];
        })
        .sort(compareOrdinal)
        .map((inside) => ({
          path: join(spaceDirectory, inside),
          text: textOf(files.get(`${name}/${inside}`) ?? new Uint8Array()),
        }));
      const spaceText = textOf(files.get(`${name}/space.json`) ?? new Uint8Array());
      const input = parseSingleSpace({
        spaceFile: join(spaceDirectory, 'space.json'),
        spaceText,
        resources,
      });
      reads.push(agreeingSpaceDirectory(spaceDirectory, id, input));
    } catch (error) {
      readFailures.push(error);
    }
  }

  const imageResults = await Promise.allSettled(
    paths
      .flatMap((path) => {
        const [first, name, ...rest] = path.split('/');
        return first === IMAGES_DIRECTORY_NAME &&
          name !== undefined &&
          !name.startsWith('.') &&
          rest.length === 0
          ? [name]
          : [];
      })
      .sort(compareOrdinal)
      .map((name) =>
        admitImageFile(
          join(directory, IMAGES_DIRECTORY_NAME, name),
          name,
          new Uint8Array(files.get(`${IMAGES_DIRECTORY_NAME}/${name}`) ?? new Uint8Array()),
        ),
      ),
  );
  const images = {
    images: imageResults.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
    // SAFETY: PromiseRejectedResult.reason is typed `any` by lib.es; asserting
    // `unknown` stops that `any` from propagating into `failures`.
    failures: imageResults.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : [],
    ),
  };
  return aggregateContents(metaSpaceId, reads, readFailures, images, newId);
};

const aggregateFile = (metaSpaceId: UUID): AggregateFile => ({
  version: AGGREGATE_FILE_VERSION,
  metaSpaceId,
});

/**
 * Every file an aggregate and the stored images it shows serialise to, by path
 * relative to the Aggregate directory: `hyper.json`, each Space's directory
 * named for its id, and `images/<content-id>.<ext>` (ADR 0118).
 */
export const aggregateFiles = (
  aggregate: LoadedAggregate,
  images: readonly StoredImage[],
): DirectoryFiles => {
  const files = new Map<string, Uint8Array>([
    [
      AGGREGATE_FILE_NAME,
      Buffer.from(`${JSON.stringify(aggregateFile(aggregate.metaSpaceId), null, 2)}\n`),
    ],
  ]);
  for (const space of [...aggregate.spaces].sort((left, right) =>
    compareOrdinal(left.snapshot.id, right.snapshot.id),
  )) {
    for (const [path, text] of spaceDirectoryFiles(space)) {
      files.set(`${space.snapshot.id}/${path}`, Buffer.from(text));
    }
  }
  for (const image of images) {
    files.set(`${IMAGES_DIRECTORY_NAME}/${imageFileName(image)}`, image.bytes);
  }
  return files;
};

const directoryExists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
};

/**
 * Every file Import would read in `directory`, by path relative to it: what
 * Export owns there, and so what it removes when the aggregate no longer
 * serialises to it. `hyper.json`, each discovered Space directory's
 * `space.json` and Resource files, and the visible files in `images/` — and
 * nothing else, so a file Import does not read is never Export's to remove.
 */
export const scannedAggregateFiles = async (directory: string): Promise<readonly string[]> => {
  if (!(await directoryExists(directory))) return [];
  const aggregate = (await isRegularFile(join(directory, AGGREGATE_FILE_NAME)))
    ? [AGGREGATE_FILE_NAME]
    : [];
  const spaces = await Promise.all(
    (await discoverSpaceDirectories(directory)).map(async (child) =>
      (await scannedSpaceFiles(child)).map((path) => `${basename(child)}/${path}`),
    ),
  );
  const images = (await scannedImageFileNames(directory)).map(
    (name) => `${IMAGES_DIRECTORY_NAME}/${name}`,
  );
  return [...aggregate, ...spaces.flat(), ...images];
};

/**
 * Refuse a destination holding a Space directory import could not read back,
 * before anything is written.
 *
 * Import refuses a Space directory the author left here under a name that is
 * not its Space's id — an old flat-format Space, a hand-authored sample — so
 * every export into it would write a directory that cannot be imported.
 *
 * Checked here rather than answered by having the reader skip a directory it
 * cannot name: that skip is the guard which stops a renamed Space directory
 * importing as a fresh Space, and dropping it would trade a loud failure for a
 * silent duplication.
 */
export const assertExportableDestination = async (destination: string): Promise<void> => {
  if (!(await directoryExists(destination))) return;
  const unreadable = (await discoverSpaceDirectories(destination)).filter(
    (child) => spaceDirectoryId(basename(child)) === undefined,
  );
  if (unreadable.length === 0) return;
  throw new Error(
    [
      'Export destination holds a Space directory that is not named for its Space, so the export could not be read back:',
      ...unreadable,
      'Rename each to its Space id in lower case, or move it out of the destination.',
    ].join('\n'),
  );
};

/**
 * Write one Aggregate into a directory, in place: `hyper.json` plus every
 * Space directory, removing the Space directories and Resource files Import
 * would read that the Aggregate no longer holds. Nothing is checked before
 * writing; `exportAggregate` is the write that checks.
 */
export const writeAggregateDirectory = async (
  aggregate: LoadedAggregate,
  directory: string,
): Promise<void> => {
  const owned = (await scannedAggregateFiles(directory)).filter(
    (path) => !path.startsWith(`${IMAGES_DIRECTORY_NAME}/`),
  );
  const files = aggregateFiles(aggregate, []);
  await rejectSymbolicLinks(directory, files.keys());
  await writeInPlace(directory, files, owned);
};
