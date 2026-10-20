import { z } from 'zod';
import {
  formatGitHubLocation,
  isCommitSha,
  parseGitHubLocation,
  type GitHubLocation,
  type MalformedGitHubLocation,
  type ResolvedGitHubLocation,
} from './github-location';
import { AGGREGATE_FILE_NAME, scannedAggregatePaths } from '@project/aggregate';

/**
 * The GitHub source (ADR 0130): a GitHub location read into the files of the
 * Aggregate directory it selects.
 *
 * A ref that is not a commit SHA costs one REST call to resolve, and a missing
 * one resolves `HEAD`, the default branch. A selected subdirectory costs one
 * more, listing its parent's contents to find the directory's own tree, so
 * that only that tree is listed rather than the whole repository's. Listing the
 * tree, recursively, costs one more. An API answer that is GitHub's primary or secondary rate limit is
 * answered as one. The selected directory must directly contain `hyper.json`;
 * within it only the files Importing reads are kept. If the tree lists any of
 * them larger than `MAX_BLOB_BYTES`, nothing is fetched; otherwise each is
 * fetched at the commit from `raw.githubusercontent.com`, at most
 * `BLOB_CONCURRENCY` at once. A blob answering 429 (that host throttling its
 * reader) or 5xx is asked for once more, after the delay its `Retry-After`
 * names in seconds or as an HTTP-date, capped at `MAX_RETRY_MS`, or
 * `DEFAULT_RETRY_MS` without a readable one. No token or other credential is
 * ever sent.
 *
 * Every failure is answered as a value naming what failed. What to tell a
 * reader about it is the application's to decide.
 */

/** The selected directory's files, by path relative to it, at one commit. */
export interface GitHubAggregate {
  readonly location: ResolvedGitHubLocation;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export type GitHubSourceFailure =
  | MalformedGitHubLocation
  /** The API answered with its primary or secondary rate limit. */
  | { readonly kind: 'rate-limited' }
  /** The repository, or the ref or commit within it, does not exist or is not public. */
  | { readonly kind: 'not-found'; readonly location: GitHubLocation }
  /** The selected directory does not directly contain `hyper.json`. */
  | { readonly kind: 'missing-aggregate-file'; readonly location: ResolvedGitHubLocation }
  /** GitHub listed only part of the selected directory's tree at the commit. */
  | { readonly kind: 'truncated-tree'; readonly location: ResolvedGitHubLocation }
  /** An API request failed for another reason: `status` is absent when no response came. */
  | { readonly kind: 'request-failed'; readonly url: string; readonly status?: number }
  /** One of the aggregate's files is listed larger than `MAX_BLOB_BYTES`. */
  | { readonly kind: 'blob-too-large'; readonly path: string; readonly size: number }
  /** One of the aggregate's files could not be fetched. */
  | { readonly kind: 'blob-failed'; readonly path: string; readonly status?: number };

export type GitHubSourceResult =
  | { readonly ok: true; readonly aggregate: GitHubAggregate }
  | { readonly ok: false; readonly failure: GitHubSourceFailure };

const shaPattern = /^[0-9a-f]{40}$/;

const commitSchema = z.object({ sha: z.string().regex(shaPattern) });

/**
 * A Contents API answer: a directory's entries, or a single entry when the
 * path is not a directory.
 */
const contentsSchema = z.union([
  z.array(z.object({ path: z.string(), sha: z.string().regex(shaPattern), type: z.string() })),
  z.object({ type: z.string() }),
]);

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

const fetchBlob = async (
  fetch: typeof globalThis.fetch,
  wait: Wait,
  now: Now,
  { owner, repo, sha }: ResolvedGitHubLocation,
  repositoryPath: string,
  path: string,
): Promise<Step<Uint8Array>> => {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${encodePath(repositoryPath)}`;
  try {
    let response = await fetch(url, { credentials: 'omit' });
    if (isRetryable(response.status)) {
      await wait(retryDelay(response, now));
      response = await fetch(url, { credentials: 'omit' });
    }
    if (!response.ok) return fail({ kind: 'blob-failed', path, status: response.status });
    return { ok: true, value: new Uint8Array(await response.arrayBuffer()) };
  } catch {
    return fail({ kind: 'blob-failed', path });
  }
};

/**
 * Every scanned file's blob, fetched `BLOB_CONCURRENCY` at a time. The first
 * failure stops further fetches from starting and is the answer.
 */
const fetchBlobs = async (
  fetch: typeof globalThis.fetch,
  wait: Wait,
  now: Now,
  location: ResolvedGitHubLocation,
  prefix: string,
  scanned: readonly string[],
): Promise<Step<Map<string, Uint8Array>>> => {
  const files = new Map<string, Uint8Array>();
  const pending = [...scanned];
  let failure: GitHubSourceFailure | undefined;
  const worker = async (): Promise<void> => {
    for (let file = pending.shift(); file !== undefined; file = pending.shift()) {
      const blob = await fetchBlob(fetch, wait, now, location, `${prefix}${file}`, file);
      if (!blob.ok) {
        failure ??= blob.failure;
        pending.length = 0;
      } else files.set(file, blob.value);
    }
  };
  await Promise.all(Array.from({ length: BLOB_CONCURRENCY }, worker));
  return failure === undefined ? { ok: true, value: files } : fail(failure);
};

/**
 * The SHA of the tree at the selected directory: the commit itself for the
 * repository's root, otherwise the entry its parent's contents list for it. A
 * parent that is not there, or that lists no directory at the path, means the
 * directory holds no aggregate; the commit has already resolved, so it is not
 * answered as not found.
 */
const selectedTree = async (
  fetch: typeof globalThis.fetch,
  api: string,
  location: GitHubLocation,
  resolved: ResolvedGitHubLocation,
): Promise<Step<string>> => {
  const { sha, path } = resolved;
  if (path === '') return { ok: true, value: sha };
  const missing = fail<string>({ kind: 'missing-aggregate-file', location: resolved });
  const parent = path.split('/').slice(0, -1).join('/');
  const contents = parent === '' ? `${api}/contents` : `${api}/contents/${encodePath(parent)}`;
  const listing = await requestApi(fetch, `${contents}?ref=${sha}`, location, contentsSchema);
  if (!listing.ok) return listing.failure.kind === 'not-found' ? missing : listing;
  if (!Array.isArray(listing.value)) return missing;
  const directory = listing.value.find((entry) => entry.path === path && entry.type === 'dir');
  return directory === undefined ? missing : { ok: true, value: directory.sha };
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

  const treeSha = await selectedTree(fetch, api, location, resolved);
  if (!treeSha.ok) return treeSha;
  const tree = await requestApi(
    fetch,
    `${api}/git/trees/${treeSha.value}?recursive=1`,
    location,
    treeSchema,
  );
  if (!tree.ok) return tree;
  if (tree.value.truncated)
    return { ok: false, failure: { kind: 'truncated-tree', location: resolved } };

  // The tree is the selected directory's, so its paths are relative to it.
  const listedSizes = new Map(
    tree.value.tree.flatMap((entry): [string, number | undefined][] =>
      entry.type === 'blob' && entry.mode !== SYMLINK_MODE ? [[entry.path, entry.size]] : [],
    ),
  );
  const directoryFiles = [...listedSizes.keys()];
  if (!directoryFiles.includes(AGGREGATE_FILE_NAME)) {
    return { ok: false, failure: { kind: 'missing-aggregate-file', location: resolved } };
  }

  const scanned = scannedAggregatePaths(directoryFiles);
  for (const file of scanned) {
    const size = listedSizes.get(file);
    if (size !== undefined && size > MAX_BLOB_BYTES) {
      return { ok: false, failure: { kind: 'blob-too-large', path: file, size } };
    }
  }
  const prefix = path === '' ? '' : `${path}/`;
  const files = await fetchBlobs(fetch, wait, now, resolved, prefix, scanned);
  if (!files.ok) return files;
  return { ok: true, aggregate: { location: resolved, files: files.value } };
};

/** A location as it was given, before its ref resolved. */
const formatGivenLocation = ({ owner, repo, ref, path }: GitHubLocation): string =>
  `github:${owner}/${repo}${ref === undefined ? '' : `@${ref}`}${path === '' ? '' : `/${path}`}`;

const withStatus = (status: number | undefined): string =>
  status === undefined ? 'with no response' : `with HTTP ${status}`;

/** A GitHub source's failure, in the sentence the application's startup failure shows. */
export const describeGitHubSourceFailure = (failure: GitHubSourceFailure): string => {
  switch (failure.kind) {
    case 'malformed-location':
      return `${failure.input} is not a GitHub location: ${failure.reason}.`;
    case 'rate-limited':
      return 'GitHub’s limit on requests without a token is used up for this network. Try again within the hour, or open a location pinned to a commit, which costs one request.';
    case 'not-found':
      return `${formatGivenLocation(failure.location)} was not found: GitHub has no public repository, ref or commit by that name.`;
    case 'missing-aggregate-file':
      return `${formatGitHubLocation(failure.location)} does not directly contain hyper.json, so it is not an Aggregate directory.`;
    case 'truncated-tree':
      return `GitHub listed only part of the tree at ${formatGitHubLocation(failure.location)}, so its aggregate cannot be read whole.`;
    case 'request-failed':
      return `The GitHub request ${failure.url} failed ${withStatus(failure.status)}.`;
    case 'blob-failed':
      return `${failure.path} could not be fetched from GitHub: the request failed ${withStatus(failure.status)}.`;
    case 'blob-too-large':
      return `${failure.path} is ${failure.size} bytes, over the 25 MiB a mounted file may be, so it is not fetched.`;
  }
};
