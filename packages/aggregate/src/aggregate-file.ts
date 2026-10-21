import {
  aggregateFileSchema,
  uuidSchema,
  type ImportSpace,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import type { StoredImage } from '@project/persistence';
import type { AggregateSource, DirectoryListing, SourceRead } from './aggregate-source';
import { describeSchemaFailure, identifySpace, SpaceIdentityError } from './identify-space';
import { admitImageFile, IMAGES_DIRECTORY_NAME } from './images';
import { compareOrdinal } from './ordinal';
import type { AggregateInput } from './space-repository';
import { AggregateDirectoryError, parseSingleSpace, refuseSpaceDocument } from './space-directory';

/** The name of the aggregate file at the root of a canonical aggregate directory. */
export const AGGREGATE_FILE_NAME = 'hyper.json';

/**
 * A path inside `directory`, joined as a string so the reader needs no path
 * module. `directory` only names files in diagnostics.
 */
const joinPath = (directory: string, ...segments: readonly string[]): string =>
  [directory.endsWith('/') ? directory.slice(0, -1) : directory, ...segments].join('/');

/**
 * Text as a file read as UTF-8 gives it: a malformed sequence becomes U+FFFD
 * and a byte order mark is kept, so the parsers see what they saw from disk.
 */
const textOf = (bytes: Uint8Array): string =>
  new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);

/**
 * The absence of `hyper.json`, which is what makes a directory an aggregate at
 * all, is a **discovery** failure rather than a parsing one, and the message
 * names the file: the likeliest way to arrive here is by pointing the command
 * at a single Space directory, which is not what public import takes, and
 * "there is no hyper.json here" is the sentence that says so.
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

/** One Space directory's files Importing reads, by path inside it. */
interface ScannedSpace {
  readonly name: string;
  /** `*.md` beside `space.json`, `resources/*.json` and `resources/*.md`, in ordinal order. */
  readonly resources: readonly string[];
}

/** What Importing reads beneath an Aggregate directory's root, grouped as it reads them. */
interface ScannedBelowRoot {
  readonly spaces: readonly ScannedSpace[];
  /** By path relative to the Aggregate directory, in ordinal order. */
  readonly images: readonly string[];
}

/**
 * `listing`'s value, or the discovery refusal it raised, so a caller can wait
 * for every listing before raising one. A fault that is not a refusal is
 * raised as it is.
 */
const settledListing = async <T>(
  listing: Promise<T>,
): Promise<
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusal: AggregateDirectoryError }
> => {
  try {
    return { ok: true, value: await listing };
  } catch (error) {
    if (error instanceof AggregateDirectoryError) return { ok: false, refusal: error };
    throw error;
  }
};

/** `directory`'s listing, or a discovery failure naming it when it could not be listed. */
const listOrRefuse = async (
  source: AggregateSource,
  directory: string,
): Promise<DirectoryListing> => {
  const answer = await source.list(directory);
  if (!answer.ok) {
    const path = directory === '' ? source.name : joinPath(source.name, directory);
    throw new AggregateDirectoryError('discovery', [`${path}: ${answer.reason}`]);
  }
  return answer.listing;
};

/**
 * The child directory `name` as a Space directory, or `undefined` when it
 * holds no `space.json` and so is not one: then nothing in it is read, and its
 * `resources/` is not listed.
 */
const scanSpaceDirectory = async (
  source: AggregateSource,
  name: string,
): Promise<ScannedSpace | undefined> => {
  const inside = await listOrRefuse(source, name);
  if (!inside.files.includes('space.json')) return undefined;
  const resources = await listOrRefuse(source, `${name}/resources`);
  return {
    name,
    resources: [
      ...inside.files.filter((file) => file.endsWith('.md')),
      ...resources.files
        .filter((file) => file.endsWith('.json') || file.endsWith('.md'))
        .map((file) => `resources/${file}`),
    ].sort(compareOrdinal),
  };
};

/**
 * List what Importing reads beneath the root, given the root's listing: each
 * child directory but `images/`, the `resources/` of each one holding a
 * `space.json`, and `images/`.
 *
 * A child directory is a Space directory because it holds a `space.json`,
 * except `images/`, which is the image directory whatever it holds: a visible
 * file directly in it is read once, as an image. `images/` is listed whether
 * or not the root's listing names it as a directory, so a source that reaches
 * it through a link lists it as it would a directory. Nothing deeper is
 * listed, so a sibling aggregate or a nested `hyper.json` is never searched
 * for.
 *
 * Every directory is listed before a failure is raised, so each one that
 * could not be listed is reported together, in ordinal order with `images/`
 * last, as every file that could not be read is.
 */
const scanBelowRoot = async (
  source: AggregateSource,
  root: DirectoryListing,
): Promise<ScannedBelowRoot> => {
  const names = root.directories
    .filter((name) => name !== IMAGES_DIRECTORY_NAME)
    .sort(compareOrdinal);
  const [spaceResults, imagesResult] = await Promise.all([
    Promise.all(names.map((name) => settledListing(scanSpaceDirectory(source, name)))),
    settledListing(listOrRefuse(source, IMAGES_DIRECTORY_NAME)),
  ]);
  const refusals = [...spaceResults, imagesResult].flatMap((result) =>
    result.ok ? [] : [result.refusal],
  );
  if (refusals.length > 0 || !imagesResult.ok) {
    throw new AggregateDirectoryError(
      'discovery',
      refusals.flatMap(({ diagnostics }) => diagnostics),
    );
  }
  const spaces = spaceResults.flatMap((result) => (result.ok ? [result.value] : []));
  const images = imagesResult.value;
  return {
    spaces: spaces
      .filter((space): space is ScannedSpace => space !== undefined)
      .sort((left, right) => compareOrdinal(left.name, right.name)),
    images: images.files
      .filter((name) => name !== '' && !name.startsWith('.'))
      .sort(compareOrdinal)
      .map((name) => `${IMAGES_DIRECTORY_NAME}/${name}`),
  };
};

/** The paths beneath the root that Importing reads, in the order it reads them. */
const scannedPaths = ({ spaces, images }: ScannedBelowRoot): readonly string[] => [
  ...spaces.flatMap(({ name, resources }) => [
    `${name}/space.json`,
    ...resources.map((inside) => `${name}/${inside}`),
  ]),
  ...images,
];

/** The files Importing reads in an Aggregate directory, and the Space directories among them. */
export interface AggregateScan {
  /** By path relative to the directory with `/` between segments, in the order Importing reads them. */
  readonly files: readonly string[];
  /** By name, in the order Importing reads them. */
  readonly spaceDirectories: readonly string[];
}

/**
 * The files Importing reads in a source's directory, in the order it reads
 * them, found by listing alone: `hyper.json`; then, for each child directory
 * holding a `space.json`, in ordinal name order, that `space.json` followed by
 * the `*.md` beside it and the `resources/*.json` and `resources/*.md`, in
 * ordinal order of their path inside the Space directory; then the visible
 * files directly in `images/`, in ordinal order.
 *
 * This is the one discovery rule: `readAggregateFrom` reads what it finds, and
 * Export owns what it finds. A child directory without a `space.json` is not a
 * Space directory, and `images/` is never one. A sibling aggregate, notes and
 * any other file are left out. A directory with no `hyper.json` still answers
 * the rest, which Export owns there as well.
 */
export const scanAggregateFrom = async (source: AggregateSource): Promise<AggregateScan> => {
  const root = await listOrRefuse(source, '');
  const scanned = await scanBelowRoot(source, root);
  return {
    files: [
      ...(root.files.includes(AGGREGATE_FILE_NAME) ? [AGGREGATE_FILE_NAME] : []),
      ...scannedPaths(scanned),
    ],
    spaceDirectories: scanned.spaces.map(({ name }) => name),
  };
};

/**
 * Read every one of `paths` from `source`, no more than its `concurrency` at
 * once, answering each path's bytes or the reason it could not be read.
 */
const readEach = async (
  source: AggregateSource,
  paths: readonly string[],
): Promise<ReadonlyMap<string, SourceRead>> => {
  const reads = new Map<string, SourceRead>();
  const pending = [...paths];
  const reader = async (): Promise<void> => {
    for (let path = pending.shift(); path !== undefined; path = pending.shift()) {
      reads.set(path, await source.read(path));
    }
  };
  await Promise.all(Array.from({ length: Math.min(source.concurrency, paths.length) }, reader));
  return reads;
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
 * Take a Space directory's identity from the directory's own name.
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
 * ordinal order once every Space has been read, so which Space receives which
 * minted id is decided by the sort rather than by the order reads completed in.
 */
const requireSpaceDirectoryId = (directory: string, name: string): UUID => {
  const id = spaceDirectoryId(name);
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
      `${joinPath(directory, 'space.json')}: declares Space ${input.id} inside directory ${id}`,
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
 * Mint what the reads left out and answer every failure by one policy.
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
    // A failure this reader does not model — a programming fault, the identity
    // generator itself throwing — is raised as it is rather than folded into a
    // refusal written for unreadable files. It goes first because the
    // alternative is whichever failure sorted first, and a neighbour's ordinary
    // parse diagnostic would then be all the operator sees.
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

/**
 * Read a canonical aggregate from a source into the complete Meta-rooted input
 * the persistence lifecycle takes, beside every image `images/` carries, each
 * admitted by the rule storing an uploaded picture uses (ADR 0130, ADR 0118).
 *
 * The reader decides everything the read involves, and the source only reaches
 * the files. It lists the root, and refuses a root with no `hyper.json`. It
 * reads and parses `hyper.json` before anything else, so a malformed one stops
 * the read with nothing else read. It then lists and reads what
 * `scanAggregateFrom` finds, through one pool no wider than the source allows.
 * A directory that could not be listed stops the read as a discovery failure
 * naming it. A file that could not be read is reported as a discovery failure
 * naming it, after its Space's space file has been asked whether the document
 * is refused outright, and beside every other Space's diagnostics. Diagnostics
 * name each file under the source's name.
 *
 * This reads and identifies; it validates nothing about how the Spaces relate.
 * Meta rooting, Space Resource targets, cross-Space Resource ownership and the
 * rest are `loadSpaceAggregate`'s, asked once over the whole collection by
 * `initializeAggregate` and `replaceAggregate` — so an aggregate that reads
 * cleanly here can still be refused, and is refused in one place rather than
 * twice in two vocabularies.
 *
 * Every Space directory is read before any failure is raised, so one unreadable
 * Space does not hide the next one's problem, and ids are minted afterwards in
 * ordinal order of the Space directories' names, so the same files yield the
 * same assignment every time.
 */
export const readAggregateFrom = async (
  source: AggregateSource,
  newId: () => UUID,
): Promise<AggregateDirectoryContents> => {
  // A source that allows no read is a fault of its composition, refused before
  // anything is listed or read rather than part-way through.
  if (!Number.isInteger(source.concurrency) || source.concurrency < 1) {
    throw new RangeError(
      `${source.name} allows ${source.concurrency} reads at once, which is not a positive integer.`,
    );
  }
  const directory = source.name;
  const root = await listOrRefuse(source, '');
  const aggregatePath = joinPath(directory, AGGREGATE_FILE_NAME);
  if (!root.files.includes(AGGREGATE_FILE_NAME)) throw missingAggregateFile(aggregatePath);
  const aggregateRead = await source.read(AGGREGATE_FILE_NAME);
  if (!aggregateRead.ok) {
    throw new AggregateDirectoryError('discovery', [`${aggregatePath}: ${aggregateRead.reason}`]);
  }
  const metaSpaceId = parseAggregateFile(aggregatePath, textOf(aggregateRead.bytes));

  const scanned = await scanBelowRoot(source, root);
  const read = await readEach(source, scannedPaths(scanned));
  const bytesOf = (path: string): Uint8Array => {
    const answer = read.get(path);
    if (answer?.ok !== true) throw new Error(`${path} was scanned but has no bytes.`);
    return answer.bytes;
  };
  const isUnreadable = (path: string): boolean => read.get(path)?.ok === false;
  const unreadableDiagnostic = (path: string): string[] => {
    const answer = read.get(path);
    return answer?.ok === false ? [`${joinPath(directory, path)}: ${answer.reason}`] : [];
  };

  const reads: SpaceDirectoryRead[] = [];
  const readFailures: unknown[] = [];
  for (const { name, resources: inside } of scanned.spaces) {
    const spaceDirectory = joinPath(directory, name);
    const spaceFile = joinPath(spaceDirectory, 'space.json');
    const spacePath = `${name}/space.json`;
    try {
      const id = requireSpaceDirectoryId(spaceDirectory, name);
      const readDiagnostics = [spacePath, ...inside.map((file) => `${name}/${file}`)].flatMap(
        unreadableDiagnostic,
      );
      if (readDiagnostics.length > 0) {
        // A document refused outright was never going to load, so it is
        // reported as that rather than as the read failure beside it. With
        // no space file there is no document, and the read failure is all
        // there is to report.
        refuseSpaceDocument(
          spaceFile,
          isUnreadable(spacePath) ? undefined : textOf(bytesOf(spacePath)),
        );
        throw new AggregateDirectoryError('discovery', readDiagnostics);
      }
      const input = parseSingleSpace({
        spaceFile,
        spaceText: textOf(bytesOf(spacePath)),
        resources: inside.map((file) => ({
          path: joinPath(spaceDirectory, file),
          text: textOf(bytesOf(`${name}/${file}`)),
        })),
      });
      reads.push(agreeingSpaceDirectory(spaceDirectory, id, input));
    } catch (error) {
      readFailures.push(error);
    }
  }

  const unreadableImages = scanned.images.flatMap(unreadableDiagnostic);
  const imageResults = await Promise.allSettled(
    scanned.images
      .filter((path) => !isUnreadable(path))
      .map((path) => {
        const name = path.slice(IMAGES_DIRECTORY_NAME.length + 1);
        return admitImageFile(
          joinPath(directory, IMAGES_DIRECTORY_NAME, name),
          name,
          new Uint8Array(bytesOf(path)),
        );
      }),
  );
  const images = {
    images: imageResults.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
    // SAFETY: PromiseRejectedResult.reason is typed `any` by lib.es; asserting
    // `unknown` stops that `any` from propagating into `failures`.
    failures: [
      ...imageResults.flatMap((result) =>
        result.status === 'rejected' ? [result.reason as unknown] : [],
      ),
      ...(unreadableImages.length > 0
        ? [new AggregateDirectoryError('discovery', unreadableImages)]
        : []),
    ],
  };
  return aggregateContents(metaSpaceId, reads, readFailures, images, newId);
};
