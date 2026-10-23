import { z } from 'zod';
import {
  formatGitHubLocation,
  formatGivenGitHubLocation,
  isCommitSha,
  parseGitHubLocation,
  type GitHubLocation,
  type MalformedGitHubLocation,
  type ResolvedGitHubLocation,
} from './github-location';
import type { AggregateSource, DirectoryListing, SourceRead } from '@project/aggregate';

/**
 * The GitHub source (ADR 0130, ADR 0133): a GitHub location resolved to a
 * commit and its selected directory's tree listed, answered as the
 * `AggregateSource` the reader reads that directory from.
 *
 * A ref that is not a commit SHA costs one REST call to resolve, and a missing
 * one resolves `HEAD`, the default branch. Listing the selected directory's
 * tree, recursively, costs one more: the commit's own tree for the
 * repository's root, otherwise the tree at `<commit>:<path>`, so that only that
 * tree is listed rather than the whole repository's. An API answer that is
 * GitHub's primary or secondary rate limit is answered as one. A path that is
 * not a directory at the commit lists empty, so the reader refuses it as a
 * directory without `hyper.json`.
 *
 * Nothing is fetched until the reader reads: the source lists from the tree in
 * memory, and the reader decides which files to read, at most
 * `BLOB_CONCURRENCY` at once. Each is fetched at the commit from
 * `raw.githubusercontent.com`. A file the tree lists larger than
 * `MAX_BLOB_BYTES` is not fetched. A blob answering 429 (that host throttling
 * its reader) or 5xx, or whose fetch throws, is asked for once more, after the
 * delay its `Retry-After` names in seconds or as an HTTP-date, capped at
 * `MAX_RETRY_MS`, or `DEFAULT_RETRY_MS` without a readable one. Once a retry is
 * still throttled, no further blob is requested. Every file not fetched is a
 * read answering why, so the reader reports each one. A symbolic link is
 * listed as a link and never fetched, and a submodule is never listed. No
 * token or other credential is ever sent.
 *
 * Every failure is answered as a value naming what failed. What to tell a
 * reader about it is the application's to decide.
 */

/** The selected directory at one commit, and the source the reader reads it from. */
export interface GitHubAggregate {
  readonly location: ResolvedGitHubLocation;
  readonly source: AggregateSource;
}

export type GitHubSourceFailure =
  | MalformedGitHubLocation
  /** The API answered with its primary or secondary rate limit. */
  | { readonly kind: 'rate-limited' }
  /** The repository, or the ref or commit within it, does not exist or is not public. */
  | { readonly kind: 'not-found'; readonly location: GitHubLocation }
  /** GitHub listed only part of the selected directory's tree at the commit. */
  | { readonly kind: 'truncated-tree'; readonly location: ResolvedGitHubLocation }
  /** An API request failed for another reason: `status` is absent when no response came. */
  | { readonly kind: 'request-failed'; readonly url: string; readonly status?: number };

export type GitHubSourceResult =
  | { readonly ok: true; readonly aggregate: GitHubAggregate }
  | { readonly ok: false; readonly failure: GitHubSourceFailure };

const shaPattern = /^[0-9a-f]{40}$/;

const commitSchema = z.object({ sha: z.string().regex(shaPattern) });

const treeSchema = z.object({
  truncated: z.boolean(),
  tree: z.array(
    z.object({
      path: z.string(),
      mode: z.string(),
      type: z.string(),
      size: z.number().int().nonnegative().optional(),
    }),
  ),
});

type TreeEntries = z.infer<typeof treeSchema>['tree'];

/** A Git mode for a symbolic link: its raw "contents" are the link's target. */
const SYMLINK_MODE = '120000';

type Step<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: GitHubSourceFailure };

const fail = <T>(failure: GitHubSourceFailure): Step<T> => ({ ok: false, failure });

const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/');

const errorBodySchema = z.object({ message: z.string() });

/**
 * Whether an API answer is a rate limit, primary or secondary: any 429, or a
 * 403 with no requests remaining, naming a `Retry-After`, or whose message
 * names a secondary rate limit. The body is read only for a 403 the headers do
 * not explain.
 */
const isRateLimited = async (response: Response): Promise<boolean> => {
  if (response.status === 429) return true;
  if (response.status !== 403) return false;
  if (response.headers.get('x-ratelimit-remaining') === '0') return true;
  if (response.headers.has('retry-after')) return true;
  try {
    const body = errorBodySchema.safeParse(await response.json());
    return body.success && /secondary rate limit/i.test(body.data.message);
  } catch {
    return false;
  }
};

/**
 * One REST call, parsed by `schema`. 404 and 422 are GitHub's answers for a
 * repository, ref or commit that is not there.
 */
const requestApi = async <T>(
  fetch: typeof globalThis.fetch,
  url: string,
  location: GitHubLocation,
  schema: z.ZodType<T>,
): Promise<Step<T>> => {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/vnd.github+json' },
      credentials: 'omit',
    });
  } catch {
    return fail({ kind: 'request-failed', url });
  }
  if (await isRateLimited(response)) return fail({ kind: 'rate-limited' });
  if (response.status === 404 || response.status === 422) {
    return fail({ kind: 'not-found', location });
  }
  if (!response.ok) return fail({ kind: 'request-failed', url, status: response.status });
  try {
    const parsed = schema.safeParse(await response.json());
    if (parsed.success) return { ok: true, value: parsed.data };
  } catch {
    // An unreadable body is answered below, like one that does not parse.
  }
  return fail({ kind: 'request-failed', url, status: response.status });
};

/** The largest file a GitHub source fetches, by the size the tree lists. */
const MAX_BLOB_BYTES = 25 * 1024 * 1024;

/** How many blobs are fetched at once. */
const BLOB_CONCURRENCY = 8;

/** The delay before retrying a blob whose answer names none. */
const DEFAULT_RETRY_MS = 1000;

/** Suspends for `ms` milliseconds; injected so a test need not wait. */
export type Wait = (ms: number) => Promise<void>;

const waitWithTimer: Wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isRetryable = (status: number): boolean => status === 429 || status >= 500;

/** The longest a blob's retry waits, whatever its `Retry-After` asks for. */
const MAX_RETRY_MS = 10_000;

/** The current time in milliseconds since the epoch; injected so a test fixes it. */
export type Now = () => number;

const DELTA_SECONDS = /^\d+$/;

/** RFC 9110's IMF-fixdate, the HTTP-date form a sender generates. */
const IMF_FIXDATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * The delay a `Retry-After` header asks for, in seconds or as an HTTP-date,
 * capped at `MAX_RETRY_MS`; `DEFAULT_RETRY_MS` when it is absent, empty or
 * neither form.
 */
const retryDelay = (response: Response, now: Now): number => {
  const header = (response.headers.get('retry-after') ?? '').trim();
  let delay = DEFAULT_RETRY_MS;
  if (DELTA_SECONDS.test(header)) delay = Number(header) * 1000;
  else if (IMF_FIXDATE.test(header)) {
    const at = Date.parse(header);
    if (Number.isFinite(at)) delay = Math.max(0, at - now());
  }
  return Math.min(delay, MAX_RETRY_MS);
};

const withStatus = (status: number | undefined): string =>
  status === undefined ? 'with no response' : `with HTTP ${status}`;

const unreadable = (reason: string): SourceRead => ({ ok: false, reason });

const fetchFailed = (status?: number): SourceRead =>
  unreadable(`could not be fetched from GitHub: the request failed ${withStatus(status)}`);

const THROTTLED = unreadable('not fetched: GitHub is throttling requests');

interface ListedTree {
  readonly listings: ReadonlyMap<string, DirectoryListing>;
  /** Each listed file's size, by path relative to the selected directory. */
  readonly sizes: ReadonlyMap<string, number | undefined>;
}

/**
 * The selected directory's tree, by directory: each regular file, child
 * directory and symbolic link directly in it. Submodules are left out.
 */
const listTree = (entries: TreeEntries): ListedTree => {
  const files = new Map<string, string[]>();
  const directories = new Map<string, Set<string>>();
  const links = new Map<string, string[]>();
  const sizes = new Map<string, number | undefined>();
  const parentAndName = (path: string): [string, string] => {
    const slash = path.lastIndexOf('/');
    return slash === -1 ? ['', path] : [path.slice(0, slash), path.slice(slash + 1)];
  };
  const addDirectory = (path: string): void => {
    if (directories.has(path)) return;
    directories.set(path, new Set());
    if (path === '') return;
    const [parent, name] = parentAndName(path);
    addDirectory(parent);
    directories.get(parent)?.add(name);
  };
  for (const entry of entries) {
    if (entry.type === 'tree') addDirectory(entry.path);
    else if (entry.type === 'blob') {
      const [parent, name] = parentAndName(entry.path);
      addDirectory(parent);
      const isLink = entry.mode === SYMLINK_MODE;
      const byParent = isLink ? links : files;
      const listed = byParent.get(parent) ?? [];
      listed.push(name);
      byParent.set(parent, listed);
      if (!isLink) sizes.set(entry.path, entry.size);
    }
  }
  const listings = new Map(
    [...directories].map(([path, children]): [string, DirectoryListing] => [
      path,
      { files: files.get(path) ?? [], directories: [...children], links: links.get(path) ?? [] },
    ]),
  );
  return { listings, sizes };
};

/**
 * The source over a listed tree: every listing answers from memory, and each
 * read fetches one blob, retried once, unless it is too large or GitHub has
 * gone on throttling.
 */
const treeSource = (
  fetch: typeof globalThis.fetch,
  wait: Wait,
  now: Now,
  location: ResolvedGitHubLocation,
  { listings, sizes }: ListedTree,
): AggregateSource => {
  const { owner, repo, sha, path } = location;
  const prefix = path === '' ? '' : `${path}/`;
  // Set once a blob is still throttled after its retry; no request follows.
  let throttled = false;
  // Read through a call each time: another read sets it across the awaits below.
  const isThrottled = (): boolean => throttled;
  const request = async (url: string): Promise<Response | undefined> => {
    try {
      return await fetch(url, { credentials: 'omit' });
    } catch {
      return undefined;
    }
  };
  const read = async (file: string): Promise<SourceRead> => {
    if (!sizes.has(file)) return unreadable('not in the tree GitHub listed');
    const size = sizes.get(file);
    if (size !== undefined && size > MAX_BLOB_BYTES) {
      return unreadable(
        `${size} bytes, over the 25 MiB a mounted file may be, so it is not fetched`,
      );
    }
    if (isThrottled()) return THROTTLED;
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${encodePath(`${prefix}${file}`)}`;
    let response = await request(url);
    if (response === undefined || isRetryable(response.status)) {
      if (isThrottled()) return THROTTLED;
      await wait(response === undefined ? DEFAULT_RETRY_MS : retryDelay(response, now));
      if (isThrottled()) return THROTTLED;
      response = await request(url);
      if (response?.status === 429) throttled = true;
    }
    if (response === undefined) return fetchFailed();
    if (!response.ok) return fetchFailed(response.status);
    try {
      return { ok: true, bytes: new Uint8Array(await response.arrayBuffer()) };
    } catch {
      return fetchFailed();
    }
  };
  return {
    name: formatGitHubLocation(location),
    concurrency: BLOB_CONCURRENCY,
    list: (directory) =>
      Promise.resolve({
        ok: true,
        listing: listings.get(directory) ?? { files: [], directories: [], links: [] },
      }),
    read,
  };
};

/** Read a GitHub location as written: parse it, then {@link readGitHubLocation}. */
export const readGitHubAggregate = async (
  input: string,
  fetch: typeof globalThis.fetch,
  wait: Wait = waitWithTimer,
  now: Now = Date.now,
): Promise<GitHubSourceResult> => {
  const parsed = parseGitHubLocation(input);
  if (!parsed.ok) return parsed;
  return await readGitHubLocation(parsed.location, fetch, wait, now);
};

/** Read the Aggregate directory a parsed GitHub location selects, at the commit its ref names. */
export const readGitHubLocation = async (
  location: GitHubLocation,
  fetch: typeof globalThis.fetch,
  wait: Wait = waitWithTimer,
  now: Now = Date.now,
): Promise<GitHubSourceResult> => {
  const { owner, repo, ref, path } = location;
  const api = `https://api.github.com/repos/${owner}/${repo}`;

  let sha: string;
  if (ref !== undefined && isCommitSha(ref)) {
    sha = ref.toLowerCase();
  } else {
    const commit = await requestApi(
      fetch,
      `${api}/commits/${encodeURIComponent(ref ?? 'HEAD')}`,
      location,
      commitSchema,
    );
    if (!commit.ok) return commit;
    sha = commit.value.sha;
  }
  const resolved: ResolvedGitHubLocation = { owner, repo, sha, path };

  const treeish = path === '' ? sha : `${sha}:${encodePath(path)}`;
  const tree = await requestApi(
    fetch,
    `${api}/git/trees/${treeish}?recursive=1`,
    location,
    treeSchema,
  );
  // A path that is not a directory at a commit that resolved lists empty
  // rather than being not found.
  let entries: TreeEntries = [];
  if (tree.ok) {
    if (tree.value.truncated)
      return { ok: false, failure: { kind: 'truncated-tree', location: resolved } };
    entries = tree.value.tree;
  } else if (path === '' || tree.failure.kind !== 'not-found') return tree;

  // The tree is the selected directory's, so its paths are relative to it.
  const listed = listTree(entries);
  return {
    ok: true,
    aggregate: { location: resolved, source: treeSource(fetch, wait, now, resolved, listed) },
  };
};

/** A GitHub source's failure, in the sentence the application's startup failure shows. */
export const describeGitHubSourceFailure = (failure: GitHubSourceFailure): string => {
  switch (failure.kind) {
    case 'malformed-location':
      return `${failure.input} is not a GitHub location: ${failure.reason}.`;
    case 'rate-limited':
      return 'GitHub’s limit on requests without a token is used up for this network. Try again within the hour, or open a location pinned to a commit, which costs one request.';
    case 'not-found':
      return `${formatGivenGitHubLocation(failure.location)} was not found: GitHub has no public repository, ref or commit by that name.`;
    case 'truncated-tree':
      return `GitHub listed only part of the tree at ${formatGitHubLocation(failure.location)}, so its aggregate cannot be read whole.`;
    case 'request-failed':
      return `The GitHub request ${failure.url} failed ${withStatus(failure.status)}.`;
  }
};
