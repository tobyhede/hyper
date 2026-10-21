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
import { AGGREGATE_FILE_NAME, scannedAggregatePaths } from '@project/aggregate';

/**
 * The GitHub source (ADR 0130): a GitHub location read into the files of the
 * Aggregate directory it selects.
 *
 * A ref that is not a commit SHA costs one REST call to resolve, and a missing
 * one resolves `HEAD`, the default branch. Listing the selected directory's
 * tree, recursively, costs one more: the commit's own tree for the
 * repository's root, otherwise the tree at `<commit>:<path>`, so that only that
 * tree is listed rather than the whole repository's. An API answer that is
 * GitHub's primary or secondary rate limit is answered as one. The selected directory must directly contain `hyper.json`;
 * within it only the files Importing reads are kept. If the tree lists any of
 * them larger than `MAX_BLOB_BYTES`, nothing is fetched; otherwise each is
 * fetched at the commit from `raw.githubusercontent.com`, at most
 * `BLOB_CONCURRENCY` at once, and the first that fails cancels those in
 * flight. A blob answering 429 (that host throttling its reader) or 5xx, or
 * whose fetch throws, is asked for once more, after the delay its
 * `Retry-After` names in seconds or as an HTTP-date, capped at `MAX_RETRY_MS`,
 * or `DEFAULT_RETRY_MS` without a readable one. No token or other credential is
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

/**
 * Suspends for `ms` milliseconds, or until `signal` aborts if that is sooner;
 * injected so a test need not wait.
 */
export type Wait = (ms: number, signal: AbortSignal) => Promise<void>;

/** A timer that the cancellation clears, leaving neither it nor its listener behind. */
const waitWithTimer: Wait = (ms, signal) =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const end = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', end);
      resolve();
    };
    const timer = setTimeout(end, ms);
    signal.addEventListener('abort', end, { once: true });
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
  signal: AbortSignal,
): Promise<Step<Uint8Array>> => {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${encodePath(repositoryPath)}`;
  const failed = (status?: number): Step<Uint8Array> =>
    fail(
      status === undefined ? { kind: 'blob-failed', path } : { kind: 'blob-failed', path, status },
    );
  const request = async (): Promise<Response | undefined> => {
    try {
      return await fetch(url, { credentials: 'omit', signal });
    } catch {
      return undefined;
    }
  };
  let response = await request();
  if (signal.aborted) return failed();
  if (response === undefined || isRetryable(response.status)) {
    // A retry once the blobs are cancelled throws at once, failing below.
    await wait(response === undefined ? DEFAULT_RETRY_MS : retryDelay(response, now), signal);
    response = await request();
  }
  if (response === undefined) return failed();
  if (!response.ok) return failed(response.status);
  try {
    return { ok: true, value: new Uint8Array(await response.arrayBuffer()) };
  } catch {
    return failed();
  }
};

/**
 * Every scanned file's blob, fetched `BLOB_CONCURRENCY` at a time. The first
 * failure is the answer: it stops further fetches from starting and cancels
 * those in flight.
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
  const cancel = new AbortController();
  let failure: GitHubSourceFailure | undefined;
  const worker = async (): Promise<void> => {
    for (let file = pending.shift(); file !== undefined; file = pending.shift()) {
      const blob = await fetchBlob(
        fetch,
        wait,
        now,
        location,
        `${prefix}${file}`,
        file,
        cancel.signal,
      );
      if (!blob.ok) {
        failure ??= blob.failure;
        pending.length = 0;
        cancel.abort();
      } else files.set(file, blob.value);
    }
  };
  await Promise.all(Array.from({ length: BLOB_CONCURRENCY }, worker));
  return failure === undefined ? { ok: true, value: files } : fail(failure);
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

  // A path that is not a directory at a commit that resolved holds no
  // aggregate, so it is not answered as not found.
  const treeish = path === '' ? sha : `${sha}:${encodePath(path)}`;
  const tree = await requestApi(
    fetch,
    `${api}/git/trees/${treeish}?recursive=1`,
    location,
    treeSchema,
  );
  if (!tree.ok) {
    return path !== '' && tree.failure.kind === 'not-found'
      ? { ok: false, failure: { kind: 'missing-aggregate-file', location: resolved } }
      : tree;
  }
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
      return `${formatGivenGitHubLocation(failure.location)} was not found: GitHub has no public repository, ref or commit by that name.`;
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
