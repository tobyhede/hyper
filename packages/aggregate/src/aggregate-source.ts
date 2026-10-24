/** The files of an Aggregate directory, by path relative to it with `/` between segments. */
export type AggregateFiles = ReadonlyMap<string, Uint8Array>;

/**
 * One directory of a source: the names of the files, child directories and
 * symbolic links directly in it. A link is listed as a link whatever it names,
 * and never as a file or a directory: the reader decides what one means.
 */
export interface DirectoryListing {
  readonly files: readonly string[];
  readonly directories: readonly string[];
  readonly links: readonly string[];
}

/** A source's answer to listing one directory: its listing, or why it could not be listed. */
export type SourceListing =
  | { readonly ok: true; readonly listing: DirectoryListing }
  | { readonly ok: false; readonly reason: string };

/** A source's answer to reading one file: its bytes, or why they could not be read. */
export type SourceRead =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly reason: string };

/**
 * Where an Aggregate directory is read from (ADR 0133). The reader decides
 * which directories to list and which files to read; a source only reaches
 * them, and says how many reads it allows at once.
 *
 * Paths are relative to the Aggregate directory with `/` between segments, and
 * `''` is the directory itself. Neither operation throws: a listing or a read
 * that failed answers the reason, which the reader reports as a discovery
 * failure naming the path.
 */
export interface AggregateSource {
  /** Names the directory in diagnostics, which read `<name>/<path>: <reason>`. */
  readonly name: string;
  /** How many reads the source allows at once, a positive integer. */
  readonly concurrency: number;
  /** The files and child directories directly in `directory`. A missing one lists empty. */
  readonly list: (directory: string) => Promise<SourceListing>;
  /** One file's bytes, or the reason they could not be read. */
  readonly read: (path: string) => Promise<SourceRead>;
}

interface MutableListing {
  readonly files: string[];
  readonly directories: Set<string>;
  readonly links: string[];
}

/**
 * A source over files already in memory: Export's read-back of the files it
 * is about to write, a mounted page's fetched files, and the tests. A
 * directory is listed by the paths beneath it, so one holding no file is not
 * there. Every read is allowed at once, since the bytes are already here.
 * `links` are the paths of symbolic links among them, which hold no bytes.
 */
export const mapSource = (
  name: string,
  files: AggregateFiles,
  links: Iterable<string> = [],
): AggregateSource => {
  const listings = new Map<string, MutableListing>();
  const listingOf = (directory: string): MutableListing => {
    let listing = listings.get(directory);
    if (listing === undefined) {
      listing = { files: [], directories: new Set(), links: [] };
      listings.set(directory, listing);
    }
    return listing;
  };
  const place = (path: string, entries: (listing: MutableListing) => string[]): void => {
    const segments = path.split('/');
    const entry = segments.pop();
    if (entry === undefined) return;
    let directory = '';
    for (const segment of segments) {
      listingOf(directory).directories.add(segment);
      directory = directory === '' ? segment : `${directory}/${segment}`;
    }
    entries(listingOf(directory)).push(entry);
  };
  for (const path of files.keys()) place(path, (listing) => listing.files);
  for (const path of links) place(path, (listing) => listing.links);

  return {
    name,
    concurrency: Math.max(1, files.size),
    list: (directory) => {
      const listing = listings.get(directory);
      return Promise.resolve({
        ok: true,
        listing: {
          files: listing?.files ?? [],
          directories: [...(listing?.directories ?? [])],
          links: listing?.links ?? [],
        },
      });
    },
    read: (path) => {
      const bytes = files.get(path);
      return Promise.resolve(
        bytes === undefined
          ? { ok: false, reason: 'not among the files in memory' }
          : { ok: true, bytes },
      );
    },
  };
};
