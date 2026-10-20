import {
  aggregateFileSchema,
  uuidSchema,
  type ImportSpace,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import type { StoredImage } from '@project/persistence';
import { describeSchemaFailure, identifySpace, SpaceIdentityError } from './identify-space';
import { admitImageFile, IMAGES_DIRECTORY_NAME } from './images';
import { compareOrdinal } from './ordinal';
import type { AggregateInput } from './space-repository';
import { AggregateDirectoryError, parseSingleSpace, refuseSpaceDocument } from './space-directory';

/** The name of the aggregate file at the root of a canonical aggregate directory. */
export const AGGREGATE_FILE_NAME = 'hyper.json';

/** The files of an Aggregate directory, by path relative to it with `/` between segments. */
export type AggregateFiles = ReadonlyMap<string, Uint8Array>;

/**
 * The files of an Aggregate directory that were listed but could not be read,
 * by path as in {@link AggregateFiles}, each with the reason its read failed.
 */
export type UnreadableFiles = ReadonlyMap<string, string>;

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

/** A path's segments, split on `/`. */
const segmentsOf = (path: string): readonly string[] => path.split('/');

/** One Space directory's files Importing reads, by path inside it. */
interface ScannedSpace {
  readonly name: string;
  /** `*.md` beside `space.json`, `resources/*.json` and `resources/*.md`, in ordinal order. */
  readonly resources: readonly string[];
}

/** What Importing reads among an Aggregate directory's files, grouped as it reads them. */
interface ScannedAggregate {
  readonly aggregateFile: boolean;
  readonly spaces: readonly ScannedSpace[];
  readonly images: readonly string[];
}

/**
 * Group `paths` by their top-level directory once, so the scan is linear in
 * the number of files however many Space directories there are.
 *
 * A top-level directory is a Space directory because it holds a `space.json`,
 * except `images/`, which is the image directory whatever it holds: a file
 * there is read once, as an image.
 */
const scanAggregatePaths = (paths: Iterable<string>): ScannedAggregate => {
  let aggregateFile = false;
  const byDirectory = new Map<string, string[]>();
  const images: string[] = [];
  for (const path of new Set(paths)) {
    if (path === AGGREGATE_FILE_NAME) {
      aggregateFile = true;
      continue;
    }
    const [first, ...rest] = segmentsOf(path);
    if (first === undefined || first === '' || rest.length === 0) continue;
    if (first === IMAGES_DIRECTORY_NAME) {
      const [name] = rest;
      if (rest.length === 1 && name !== undefined && name !== '' && !name.startsWith('.')) {
        images.push(path);
      }
      continue;
    }
    const inside = byDirectory.get(first);
    if (inside === undefined) byDirectory.set(first, [rest.join('/')]);
    else inside.push(rest.join('/'));
  }

  const spaces = [...byDirectory]
    .filter(([, inside]) => inside.includes('space.json'))
    .map(([name, inside]) => ({
      name,
      resources: inside
        .filter((file) => {
          const parts = segmentsOf(file);
          return (
            (parts.length === 1 && file.endsWith('.md')) ||
            (parts.length === 2 &&
              parts[0] === 'resources' &&
              (file.endsWith('.json') || file.endsWith('.md')))
          );
        })
        .sort(compareOrdinal),
    }))
    .sort((left, right) => compareOrdinal(left.name, right.name));

  return { aggregateFile, spaces, images: images.sort(compareOrdinal) };
};

/**
 * The paths among `paths` that Importing reads, in the order it reads them:
 * `hyper.json`; then, for each top-level directory holding a `space.json`, in
 * ordinal name order, that `space.json` followed by the `*.md` beside it and
 * the `resources/*.json` and `resources/*.md`, in ordinal order of their path
 * inside the Space directory; then the visible files directly in `images/`, in
 * ordinal order.
 *
 * `paths` are the files of one Aggregate directory, by path relative to it with
 * `/` between segments. A top-level directory without a `space.json` is not a
 * Space directory, so nothing in it is read, and nothing deeper than these is
 * read at all. `images/` is never a Space directory. A sibling aggregate, notes
 * and any other file are left out.
 *
 * This is the one discovery rule: the filesystem shell lists a directory and
 * asks it what Import reads and so what Export owns.
 */
export const scannedAggregatePaths = (paths: Iterable<string>): readonly string[] => {
  const { aggregateFile, spaces, images } = scanAggregatePaths(paths);
  return [
    ...(aggregateFile ? [AGGREGATE_FILE_NAME] : []),
    ...spaces.flatMap(({ name, resources }) => [
      `${name}/space.json`,
      ...resources.map((inside) => `${name}/${inside}`),
    ]),
    ...images,
  ];
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
 * Read a canonical aggregate from its files into the complete Meta-rooted input
 * the persistence lifecycle takes, beside every image `images/` carries, each
 * admitted by the rule storing an uploaded picture uses (ADR 0118).
 *
 * Only `scannedAggregatePaths` of the given paths is read; every other file is
 * ignored. A path in `unreadable` is one the caller listed and could not read:
 * it is reported as a discovery failure naming it, after its Space's space file
 * has been asked whether the document is refused outright, and beside every
 * other Space's diagnostics. `directory` only names the paths in diagnostics. The filesystem
 * reader feeds this from disk, and Export asks it whether the files it is about
 * to write would read back.
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
export const readAggregateFiles = async (
  directory: string,
  files: AggregateFiles,
  newId: () => UUID,
  unreadable: UnreadableFiles = new Map(),
): Promise<AggregateDirectoryContents> => {
  const aggregatePath = joinPath(directory, AGGREGATE_FILE_NAME);
  const aggregateBytes = files.get(AGGREGATE_FILE_NAME);
  if (aggregateBytes === undefined) throw missingAggregateFile(aggregatePath);
  const metaSpaceId = parseAggregateFile(aggregatePath, textOf(aggregateBytes));

  const scanned = scanAggregatePaths([...files.keys(), ...unreadable.keys()]);
  const bytesOf = (path: string): Uint8Array => {
    const bytes = files.get(path);
    if (bytes === undefined) throw new Error(`${path} was scanned but has no bytes.`);
    return bytes;
  };
  const unreadableDiagnostic = (path: string): string[] => {
    const reason = unreadable.get(path);
    return reason === undefined ? [] : [`${joinPath(directory, path)}: ${reason}`];
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
          unreadable.has(spacePath) ? undefined : textOf(bytesOf(spacePath)),
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
      .filter((path) => !unreadable.has(path))
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
