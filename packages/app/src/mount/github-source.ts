import { z } from 'zod';
import {
  isCommitSha,
  parseGitHubLocation,
  type GitHubLocation,
  type MalformedGitHubLocation,
  type ResolvedGitHubLocation,
} from './github-location';
import { scannedAggregatePaths } from '@project/aggregate';

/**
 * The GitHub source (ADR 0130): a GitHub location read into the files of the
 * Aggregate directory it selects.
 *
 * A ref that is not a commit SHA costs one REST call to resolve, and a missing
 * one resolves `HEAD`, the default branch. Listing the tree at the commit costs
 * one more. The selected directory must directly contain `hyper.json`; within
 * it only the files Importing reads are kept, and each is fetched at the commit
 * from `raw.githubusercontent.com`, at most `BLOB_CONCURRENCY` at once. A blob
 * answering 429 (that host throttling its reader) or 5xx is asked for once
 * more, after its `Retry-After` seconds or `DEFAULT_RETRY_MS` without one. No
 * token or other credential is ever sent.
 *
 * Every failure is answered as a value naming what failed. What to tell a
 * reader about it is the application's to decide.
 */

const AGGREGATE_FILE_NAME = 'hyper.json';

/** The selected directory's files, by path relative to it, at one commit. */
export interface GitHubAggregate {
  readonly location: ResolvedGitHubLocation;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export type GitHubSourceFailure =
  | MalformedGitHubLocation
  /** The API answered 403 or 429 with no requests remaining. */
  | { readonly kind: 'rate-limited' }
  /** The repository, or the ref or commit within it, does not exist or is not public. */
  | { readonly kind: 'not-found'; readonly location: GitHubLocation }
  /** The selected directory does not directly contain `hyper.json`. */
  | { readonly kind: 'missing-aggregate-file'; readonly location: ResolvedGitHubLocation }
  /** GitHub listed only part of the tree at the commit. */
  | { readonly kind: 'truncated-tree'; readonly location: ResolvedGitHubLocation }
  /** An API request failed for another reason: `status` is absent when no response came. */
  | { readonly kind: 'request-failed'; readonly url: string; readonly status?: number }
  /** One of the aggregate's files could not be fetched. */
  | { readonly kind: 'blob-failed'; readonly path: string; readonly status?: number };

export type GitHubSourceResult =
  | { readonly ok: true; readonly aggregate: GitHubAggregate }
  | { readonly ok: false; readonly failure: GitHubSourceFailure };

const commitSchema = z.object({ sha: z.string().regex(/^[0-9a-f]{40}$/) });

const treeSchema = z.object({
  truncated: z.boolean(),
  tree: z.array(z.object({ path: z.string(), mode: z.string(), type: z.string() })),
});

/** A Git mode for a symbolic link: its raw "contents" are the link's target. */
const SYMLINK_MODE = '120000';

type Step<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: GitHubSourceFailure };

const fail = <T>(failure: GitHubSourceFailure): Step<T> => ({ ok: false, failure });

const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/');

const isRateLimited = (response: Response): boolean =>
  (response.status === 403 || response.status === 429) &&
  response.headers.get('x-ratelimit-remaining') === '0';

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
  if (isRateLimited(response)) return fail({ kind: 'rate-limited' });
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

/** The delay a `Retry-After` header in seconds asks for, or the default. */
const retryDelay = (response: Response): number => {
  const seconds = Number(response.headers.get('retry-after') ?? Number.NaN);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : DEFAULT_RETRY_MS;
};

const fetchBlob = async (
  fetch: typeof globalThis.fetch,
  wait: Wait,
  { owner, repo, sha }: ResolvedGitHubLocation,
  repositoryPath: string,
  path: string,
): Promise<Step<Uint8Array>> => {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${encodePath(repositoryPath)}`;
  try {
    let response = await fetch(url, { credentials: 'omit' });
    if (isRetryable(response.status)) {
      await wait(retryDelay(response));
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
  location: ResolvedGitHubLocation,
  prefix: string,
  scanned: readonly string[],
): Promise<Step<Map<string, Uint8Array>>> => {
  const files = new Map<string, Uint8Array>();
  const pending = [...scanned];
  let failure: GitHubSourceFailure | undefined;
  const worker = async (): Promise<void> => {
    for (let file = pending.shift(); file !== undefined; file = pending.shift()) {
      const blob = await fetchBlob(fetch, wait, location, `${prefix}${file}`, file);
      if (!blob.ok) {
        failure ??= blob.failure;
        pending.length = 0;
      } else files.set(file, blob.value);
    }
  };
  await Promise.all(Array.from({ length: BLOB_CONCURRENCY }, worker));
  return failure === undefined ? { ok: true, value: files } : fail(failure);
};

export const readGitHubAggregate = async (
  input: string,
  fetch: typeof globalThis.fetch,
  wait: Wait = waitWithTimer,
): Promise<GitHubSourceResult> => {
  const parsed = parseGitHubLocation(input);
  if (!parsed.ok) return parsed;
  const location = parsed.location;
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

  const tree = await requestApi(fetch, `${api}/git/trees/${sha}?recursive=1`, location, treeSchema);
  if (!tree.ok) return tree;
  if (tree.value.truncated)
    return { ok: false, failure: { kind: 'truncated-tree', location: resolved } };

  const prefix = path === '' ? '' : `${path}/`;
  const directoryFiles = tree.value.tree.flatMap((entry) =>
    entry.type === 'blob' && entry.mode !== SYMLINK_MODE && entry.path.startsWith(prefix)
      ? [entry.path.slice(prefix.length)]
      : [],
  );
  if (!directoryFiles.includes(AGGREGATE_FILE_NAME)) {
    return { ok: false, failure: { kind: 'missing-aggregate-file', location: resolved } };
  }

  const scanned = scannedAggregatePaths(directoryFiles);
  const files = await fetchBlobs(fetch, wait, resolved, prefix, scanned);
  if (!files.ok) return files;
  return { ok: true, aggregate: { location: resolved, files: files.value } };
};
