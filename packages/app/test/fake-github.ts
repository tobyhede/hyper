/**
 * A public GitHub repository answering the requests a GitHub source makes, from
 * files held in memory: the shared fake behind the GitHub source's and the
 * mount composition's tests.
 */

export const COMMIT = '0123456789abcdef0123456789abcdef01234567';
export const OWNER = 'tobyhede';
export const REPO = 'talks';

export interface FakeGitHubOptions {
  /** The repository's files at `COMMIT`, by repository-relative path. */
  readonly files: ReadonlyMap<string, Uint8Array>;
  /** Whether the whole repository's tree, listed at `COMMIT`, is truncated. */
  readonly truncated?: boolean;
  /** Repository-relative directories whose own trees are listed truncated. */
  readonly truncatedDirectories?: ReadonlySet<string>;
  /** Every API request answers this status with `x-ratelimit-remaining: 0`. */
  readonly rateLimitStatus?: 403 | 429;
  /** Every API request answers this instead, with `x-ratelimit-remaining` 59 unless it sets one. */
  readonly apiFailure?: ApiFailure;
  /** A repository path whose raw request answers 500. */
  readonly failingBlob?: string;
  /**
   * Answers a repository path's first raw requests give, in order, before it
   * answers normally: a status, with the `Retry-After` seconds it sends.
   */
  readonly blobFailures?: ReadonlyMap<string, readonly BlobFailure[]>;
  /** Every raw answer is held until a later macrotask, so requests overlap. */
  readonly holdRaw?: boolean;
  /** Repository paths GitHub lists as symbolic links (mode `120000`). */
  readonly symlinks?: ReadonlySet<string>;
  /** Sizes GitHub lists for repository paths in place of their bytes' length. */
  readonly listedSizes?: ReadonlyMap<string, number>;
}

export interface ApiFailure {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

/** A raw answer with a status and the `Retry-After` it sends, or a fetch that throws. */
type BlobFailure =
  { readonly status: number; readonly retryAfter?: string } | { readonly throws: true };

export interface FakeGitHub {
  readonly fetch: typeof fetch;
  readonly requests: Request[];
  readonly apiRequests: () => string[];
  readonly rawRequests: () => string[];
  /** The most raw requests that were awaiting their answers at once. */
  readonly peakRawInFlight: () => number;
  /** How many raw requests were cancelled while awaiting their answers. */
  readonly cancelledRaw: () => number;
}

export const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
export const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${COMMIT}/`;

/** The fields of GitHub's tree entries a GitHub source reads, and its blob SHA. */
interface TreeEntry {
  readonly path: string;
  readonly mode: string;
  readonly type: 'tree' | 'blob';
  readonly sha: string;
  /** Listed for a blob only. */
  readonly size?: number;
}

/** The bodies of the REST answers this fake gives: a commit, a tree, or an error. */
type ApiBody =
  | { readonly sha: string }
  | { readonly sha: string; readonly tree: readonly TreeEntry[]; readonly truncated: boolean }
  | { readonly message: string };

const json = (status: number, body: ApiBody): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '59' },
  });

/** Every directory holding one of `files`, by repository-relative path. */
const directoriesOf = (files: ReadonlyMap<string, Uint8Array>): string[] => {
  const directories = new Set<string>();
  for (const path of files.keys()) {
    const segments = path.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join('/'));
    }
  }
  return [...directories].sort();
};

/** A tree SHA for the directory at `index` among `directoriesOf`, distinct from `COMMIT`. */
const directorySha = (index: number): string => index.toString(16).padStart(40, 'd');

/**
 * The tree GitHub lists under `directory` (`''` for the repository's root):
 * every blob and every directory holding one, by path relative to it.
 */
const treeEntries = (
  files: ReadonlyMap<string, Uint8Array>,
  directory: string,
  shas: ReadonlyMap<string, string>,
  symlinks: ReadonlySet<string>,
  listedSizes: ReadonlyMap<string, number>,
): TreeEntry[] => {
  const prefix = directory === '' ? '' : `${directory}/`;
  const relativeTo = (path: string): string[] =>
    path.startsWith(prefix) ? [path.slice(prefix.length)] : [];
  return [
    ...[...shas].flatMap(([path, sha]) =>
      relativeTo(path).map((relativePath): TreeEntry => ({
        path: relativePath,
        mode: '040000',
        type: 'tree',
        sha,
      })),
    ),
    ...[...files].flatMap(([path, bytes]) =>
      relativeTo(path).map((relativePath): TreeEntry => ({
        path: relativePath,
        mode: symlinks.has(path) ? '120000' : '100644',
        type: 'blob',
        sha: COMMIT,
        size: listedSizes.get(path) ?? bytes.length,
      })),
    ),
  ].sort((left, right) => (left.path < right.path ? -1 : 1));
};

/**
 * A public repository with one commit, reachable from `main` (the default
 * branch) and the tag `v1`, answering the requests a GitHub source makes.
 */
export const fakeGitHub = ({
  files,
  truncated = false,
  truncatedDirectories = new Set(),
  rateLimitStatus,
  apiFailure,
  failingBlob,
  blobFailures = new Map(),
  holdRaw = false,
  symlinks = new Set(),
  listedSizes = new Map(),
}: FakeGitHubOptions): FakeGitHub => {
  const requests: Request[] = [];
  const failuresAnswered = new Map<string, number>();
  let rawInFlight = 0;
  let peakRawInFlight = 0;
  const shas = new Map(directoriesOf(files).map((path, index) => [path, directorySha(index)]));
  const directoryOfSha = new Map([...shas].map(([path, sha]) => [sha, path]));
  const refs = new Map([
    ['HEAD', COMMIT],
    ['main', COMMIT],
    ['v1', COMMIT],
  ]);

  const answer = (request: Request): Response => {
    const url = request.url;
    if (url.startsWith('https://api.github.com/')) {
      if (rateLimitStatus !== undefined) {
        return new Response('{"message":"API rate limit exceeded"}', {
          status: rateLimitStatus,
          headers: { 'x-ratelimit-remaining': '0' },
        });
      }
      if (apiFailure !== undefined) {
        return new Response(apiFailure.body ?? '', {
          status: apiFailure.status,
          headers: { 'x-ratelimit-remaining': '59', ...apiFailure.headers },
        });
      }
      if (!url.startsWith(`${API}/`)) return json(404, { message: 'Not Found' });
      const commit = /\/commits\/([^/?]+)$/.exec(url);
      if (commit !== null) {
        const sha = refs.get(decodeURIComponent(commit[1] ?? ''));
        return sha === undefined
          ? json(422, { message: 'No commit found for SHA' })
          : json(200, { sha });
      }
      // A tree by its SHA, or as `<commit>:<path>`, the tree at that path.
      const tree = /\/git\/trees\/([0-9a-f]{40})(?::([^?]+))?\?recursive=1$/.exec(url);
      if (tree !== null) {
        const sha = tree[1] ?? '';
        const at = tree[2] === undefined ? undefined : decodeURIComponent(tree[2]);
        if (at !== undefined && sha === COMMIT && files.has(at)) {
          return json(422, {
            message: 'Invalid object requested. SHA must identify a commit or a tree.',
          });
        }
        const directory =
          at === undefined
            ? sha === COMMIT
              ? ''
              : directoryOfSha.get(sha)
            : sha === COMMIT && shas.has(at)
              ? at
              : undefined;
        if (directory === undefined) return json(404, { message: 'Not Found' });
        return json(200, {
          sha: directory === '' ? sha : (shas.get(directory) ?? sha),
          tree: treeEntries(files, directory, shas, symlinks, listedSizes),
          truncated: directory === '' ? truncated : truncatedDirectories.has(directory),
        });
      }
      return json(404, { message: 'Not Found' });
    }
    if (url.startsWith(RAW)) {
      const path = decodeURIComponent(url.slice(RAW.length));
      if (path === failingBlob) return new Response('', { status: 500 });
      const answered = failuresAnswered.get(path) ?? 0;
      const failure = blobFailures.get(path)?.[answered];
      if (failure !== undefined) {
        failuresAnswered.set(path, answered + 1);
        if ('throws' in failure) throw new TypeError('Failed to fetch');
        return new Response('', {
          status: failure.status,
          headers: failure.retryAfter === undefined ? {} : { 'retry-after': failure.retryAfter },
        });
      }
      const bytes = files.get(path);
      return bytes === undefined
        ? new Response('404: Not Found', { status: 404 })
        : new Response(new Uint8Array(bytes), { status: 200 });
    }
    return new Response('', { status: 404 });
  };

  let cancelledRaw = 0;
  // The signal is read here rather than handed to `Request`, which refuses a
  // signal from another realm (jsdom's, under Node's `Request`).
  const fakeFetch: typeof fetch = async (input, init) => {
    const { signal, ...sent } = init ?? {};
    const request = new Request(input, sent);
    requests.push(request);
    if (!holdRaw || !request.url.startsWith(RAW)) return answer(request);
    rawInFlight += 1;
    peakRawInFlight = Math.max(peakRawInFlight, rawInFlight);
    await new Promise((release) => setTimeout(release, 0));
    rawInFlight -= 1;
    if (signal?.aborted === true) {
      cancelledRaw += 1;
      throw new DOMException('The request was aborted.', 'AbortError');
    }
    return answer(request);
  };

  return {
    fetch: fakeFetch,
    requests,
    apiRequests: () =>
      requests.map(({ url }) => url).filter((url) => url.startsWith('https://api.github.com/')),
    rawRequests: () =>
      requests
        .map(({ url }) => url)
        .filter((url) => url.startsWith(RAW))
        .map((url) => decodeURIComponent(url.slice(RAW.length)))
        .sort(),
    peakRawInFlight: () => peakRawInFlight,
    cancelledRaw: () => cancelledRaw,
  };
};
