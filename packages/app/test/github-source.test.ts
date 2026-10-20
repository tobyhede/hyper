import { describe, expect, it } from 'vitest';
import { readGitHubAggregate, type Wait } from '../src/mount/github-source';
import { fixtureFiles as readFixtureFiles } from './fixture-files';

/** Every tracked fixture file, which is exactly the set Importing reads there. */
const fixtureFiles = readFixtureFiles();

const under = (prefix: string, files: ReadonlyMap<string, Uint8Array>): Map<string, Uint8Array> =>
  new Map([...files].map(([path, bytes]) => [`${prefix}/${path}`, bytes]));

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const OWNER = 'tobyhede';
const REPO = 'talks';

interface FakeGitHubOptions {
  /** The repository's files at `COMMIT`, by repository-relative path. */
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly truncated?: boolean;
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

interface ApiFailure {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

interface BlobFailure {
  readonly status: number;
  readonly retryAfter?: string;
}

interface FakeGitHub {
  readonly fetch: typeof fetch;
  readonly requests: Request[];
  readonly apiRequests: () => string[];
  readonly rawRequests: () => string[];
  /** The most raw requests that were awaiting their answers at once. */
  readonly peakRawInFlight: () => number;
}

const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${COMMIT}/`;

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

/** The tree GitHub lists for `files`: every blob, and every directory holding one. */
const treeEntries = (
  files: ReadonlyMap<string, Uint8Array>,
  symlinks: ReadonlySet<string>,
  listedSizes: ReadonlyMap<string, number>,
): TreeEntry[] => {
  const directories = new Set<string>();
  for (const path of files.keys()) {
    const segments = path.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join('/'));
    }
  }
  return [
    ...[...directories].map((path): TreeEntry => ({
      path,
      mode: '040000',
      type: 'tree',
      sha: COMMIT,
    })),
    ...[...files].map(([path, bytes]): TreeEntry => ({
      path,
      mode: symlinks.has(path) ? '120000' : '100644',
      type: 'blob',
      sha: COMMIT,
      size: listedSizes.get(path) ?? bytes.length,
    })),
  ].sort((left, right) => (left.path < right.path ? -1 : 1));
};

/**
 * A public repository with one commit, reachable from `main` (the default
 * branch) and the tag `v1`, answering the three requests a GitHub source makes.
 */
const fakeGitHub = ({
  files,
  truncated = false,
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
      const tree = /\/git\/trees\/([0-9a-f]{40})\?recursive=1$/.exec(url);
      if (tree !== null) {
        return tree[1] === COMMIT
          ? json(200, { sha: COMMIT, tree: treeEntries(files, symlinks, listedSizes), truncated })
          : json(404, { message: 'Not Found' });
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

  const fakeFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (!holdRaw || !request.url.startsWith(RAW)) return answer(request);
    rawInFlight += 1;
    peakRawInFlight = Math.max(peakRawInFlight, rawInFlight);
    await new Promise((release) => setTimeout(release, 0));
    rawInFlight -= 1;
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
  };
};

interface RecordingWait {
  readonly wait: Wait;
  /** Every delay `wait` was asked for, in milliseconds. */
  readonly waits: number[];
}

/** A `wait` that resolves at once and records every delay it was asked for. */
const recordingWait = (): RecordingWait => {
  const waits: number[] = [];
  return {
    waits,
    wait: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  };
};

const expectNoCredentials = (github: FakeGitHub): void => {
  for (const request of github.requests) {
    expect(request.headers.get('authorization')).toBeNull();
    expect(request.credentials).not.toBe('include');
  }
};

const sorted = (paths: Iterable<string>): string[] => [...paths].sort();

describe('readGitHubAggregate', () => {
  it("reads the default branch's root, resolving it to a commit in one call", async () => {
    const github = fakeGitHub({ files: fixtureFiles });

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch);

    expect(result).toEqual({
      ok: true,
      aggregate: {
        location: { owner: OWNER, repo: REPO, sha: COMMIT, path: '' },
        files: fixtureFiles,
      },
    });
    expect(github.apiRequests()).toEqual([
      `${API}/commits/HEAD`,
      `${API}/git/trees/${COMMIT}?recursive=1`,
    ]);
    expect(github.rawRequests()).toEqual(sorted(fixtureFiles.keys()));
    expectNoCredentials(github);
  });

  it('resolves a named ref to the commit it names', async () => {
    const github = fakeGitHub({ files: fixtureFiles });

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}@v1`, github.fetch);

    expect(result.ok && result.aggregate.location).toEqual({
      owner: OWNER,
      repo: REPO,
      sha: COMMIT,
      path: '',
    });
    expect(github.apiRequests()).toEqual([
      `${API}/commits/v1`,
      `${API}/git/trees/${COMMIT}?recursive=1`,
    ]);
  });

  it('spends no call resolving a ref that is already a commit SHA', async () => {
    const github = fakeGitHub({ files: fixtureFiles });

    const result = await readGitHubAggregate(
      `github:${OWNER}/${REPO}@${COMMIT.toUpperCase()}`,
      github.fetch,
    );

    expect(result.ok && result.aggregate.location.sha).toBe(COMMIT);
    expect(github.apiRequests()).toEqual([`${API}/git/trees/${COMMIT}?recursive=1`]);
    expect(github.rawRequests()).toEqual(sorted(fixtureFiles.keys()));
  });

  describe('in a repository holding more than the selected aggregate', () => {
    const SELECTED = 'talks/pgdu';
    const space = '00000000-0000-4000-8000-000000000040';
    const repository = new Map([
      ['README.md', text('# Talks')],
      ['package.json', text('{}')],
      ['docs/notes.md', text('notes')],
      ['talks/README.md', text('# The talks')],
      // A second, independent aggregate beside the selected one.
      ...under('talks/other', fixtureFiles),
      ...under(SELECTED, fixtureFiles),
      // Unrelated files inside the selected directory, none of which Importing reads.
      [`${SELECTED}/README.md`, text('# PG Down Under')],
      [`${SELECTED}/notes/space-ideas.md`, text('ideas')],
      [`${SELECTED}/notes/resources/draft.json`, text('{}')],
      [`${SELECTED}/${space}/assets/figure.png`, text('png')],
      [`${SELECTED}/${space}/resources/old/legacy.json`, text('{}')],
      [`${SELECTED}/images/.DS_Store`, text('')],
      [`${SELECTED}/images/originals/photo.png`, text('png')],
    ]);

    it("fetches only the selected aggregate's scanned files, relative to it", async () => {
      const github = fakeGitHub({ files: repository });

      const result = await readGitHubAggregate(
        `github:${OWNER}/${REPO}@main/${SELECTED}`,
        github.fetch,
      );

      expect(result).toEqual({
        ok: true,
        aggregate: {
          location: { owner: OWNER, repo: REPO, sha: COMMIT, path: SELECTED },
          files: fixtureFiles,
        },
      });
      expect(github.rawRequests()).toEqual(sorted(under(SELECTED, fixtureFiles).keys()));
      expectNoCredentials(github);
    });

    it.each([
      ['the repository root, whose descendants hold one', ''],
      ['a parent of the aggregate', '/talks'],
      ['a directory that is not there', '/talks/missing'],
      ['a file rather than a directory', `/${SELECTED}/hyper.json`],
    ])('refuses a selected directory without hyper.json: %s', async (_description, suffix) => {
      const github = fakeGitHub({ files: repository });

      const result = await readGitHubAggregate(
        `github:${OWNER}/${REPO}@main${suffix}`,
        github.fetch,
      );

      expect(result).toEqual({
        ok: false,
        failure: {
          kind: 'missing-aggregate-file',
          location: { owner: OWNER, repo: REPO, sha: COMMIT, path: suffix.slice(1) },
        },
      });
      expect(github.rawRequests()).toEqual([]);
    });
  });

  it('refuses a truncated tree before fetching anything', async () => {
    const github = fakeGitHub({ files: fixtureFiles, truncated: true });

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch);

    expect(result).toEqual({
      ok: false,
      failure: {
        kind: 'truncated-tree',
        location: { owner: OWNER, repo: REPO, sha: COMMIT, path: '' },
      },
    });
    expect(github.rawRequests()).toEqual([]);
  });

  it.each([403, 429] as const)(
    'answers a %d with no requests remaining as a rate limit',
    async (status) => {
      const github = fakeGitHub({ files: fixtureFiles, rateLimitStatus: status });

      const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch);

      expect(result).toEqual({ ok: false, failure: { kind: 'rate-limited' } });
    },
  );

  it.each([
    ['a 429 with requests remaining', { status: 429 }],
    ['a 403 naming a Retry-After', { status: 403, headers: { 'retry-after': '60' } }],
    [
      'a 403 whose message names a secondary rate limit',
      {
        status: 403,
        body: '{"message":"You have exceeded a secondary rate limit. Please wait a few minutes before you try again."}',
      },
    ],
  ])('answers %s as a rate limit', async (_description, apiFailure: ApiFailure) => {
    const github = fakeGitHub({ files: fixtureFiles, apiFailure });

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch);

    expect(result).toEqual({ ok: false, failure: { kind: 'rate-limited' } });
  });

  it('answers a plain 403 as a failed request', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      apiFailure: { status: 403, body: '{"message":"Resource not accessible"}' },
    });

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch);

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'request-failed', url: `${API}/commits/HEAD`, status: 403 },
    });
  });

  it('answers a 403 with requests remaining as a failed request, not a rate limit', async () => {
    const forbidden: typeof fetch = () =>
      Promise.resolve(
        new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '12' } }),
      );

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, forbidden);

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'request-failed', url: `${API}/commits/HEAD`, status: 403 },
    });
  });

  it.each([
    ['a repository', `github:${OWNER}/missing`],
    ['a ref', `github:${OWNER}/${REPO}@no-such-branch`],
    ['a commit', `github:${OWNER}/${REPO}@${'f'.repeat(40)}`],
  ])('answers %s that is not there as not found', async (_description, input) => {
    const github = fakeGitHub({ files: fixtureFiles });

    const result = await readGitHubAggregate(input, github.fetch);

    expect(!result.ok && result.failure.kind).toBe('not-found');
    expect(github.rawRequests()).toEqual([]);
  });

  it('refuses a malformed location without a request', async () => {
    const github = fakeGitHub({ files: fixtureFiles });

    const result = await readGitHubAggregate(`github:${OWNER}`, github.fetch);

    expect(!result.ok && result.failure).toMatchObject({
      kind: 'malformed-location',
      input: `github:${OWNER}`,
    });
    expect(github.requests).toEqual([]);
  });

  it('names the file whose fetch failed', async () => {
    const github = fakeGitHub({ files: fixtureFiles, failingBlob: 'hyper.json' });

    const result = await readGitHubAggregate(
      `github:${OWNER}/${REPO}`,
      github.fetch,
      recordingWait().wait,
    );

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'blob-failed', path: 'hyper.json', status: 500 },
    });
  });

  it('retries a blob GitHub throttled once, and mounts', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([['hyper.json', [{ status: 429 }]]]),
    });
    const { wait, waits } = recordingWait();

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch, wait);

    expect(result.ok && result.aggregate.files).toEqual(fixtureFiles);
    expect(github.rawRequests().filter((path) => path === 'hyper.json')).toHaveLength(2);
    expect(waits).toEqual([1000]);
  });

  it('waits the Retry-After seconds a throttled blob names before retrying it', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([['hyper.json', [{ status: 503, retryAfter: '3' }]]]),
    });
    const { wait, waits } = recordingWait();

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch, wait);

    expect(result.ok).toBe(true);
    expect(waits).toEqual([3000]);
  });

  it.each([
    ['an empty Retry-After as absent', '', 1000],
    ['a non-numeric Retry-After as absent', 'soon', 1000],
    ['a Retry-After beyond ten seconds as ten seconds', '3600', 10000],
  ])('reads %s', async (_description, retryAfter, expected) => {
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([['hyper.json', [{ status: 429, retryAfter }]]]),
    });
    const { wait, waits } = recordingWait();

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch, wait);

    expect(result.ok).toBe(true);
    expect(waits).toEqual([expected]);
  });

  it('waits until the HTTP-date a Retry-After names', async () => {
    const now = Date.UTC(2026, 9, 20, 12, 0, 0);
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([
        ['hyper.json', [{ status: 503, retryAfter: new Date(now + 5000).toUTCString() }]],
      ]),
    });
    const { wait, waits } = recordingWait();

    const result = await readGitHubAggregate(
      `github:${OWNER}/${REPO}`,
      github.fetch,
      wait,
      () => now,
    );

    expect(result.ok).toBe(true);
    expect(waits).toEqual([5000]);
  });

  it('fails a blob that still fails after its one retry, naming it', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([['hyper.json', [{ status: 500 }, { status: 500 }]]]),
    });
    const { wait } = recordingWait();

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch, wait);

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'blob-failed', path: 'hyper.json', status: 500 },
    });
    expect(github.rawRequests().filter((path) => path === 'hyper.json')).toHaveLength(2);
  });

  it('does not retry a blob that is not there', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([['hyper.json', [{ status: 404 }]]]),
    });
    const { wait, waits } = recordingWait();

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch, wait);

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'blob-failed', path: 'hyper.json', status: 404 },
    });
    expect(waits).toEqual([]);
  });

  it('fetches at most eight blobs at once', async () => {
    expect(fixtureFiles.size).toBeGreaterThan(8);
    const github = fakeGitHub({ files: fixtureFiles, holdRaw: true });

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch);

    expect(result.ok && result.aggregate.files).toEqual(fixtureFiles);
    expect(github.peakRawInFlight()).toBe(8);
  });

  it('refuses a scanned file listed over 25 MiB before fetching any blob', async () => {
    const size = 25 * 1024 * 1024 + 1;
    const github = fakeGitHub({
      files: under('talks/pgdu', fixtureFiles),
      listedSizes: new Map([['talks/pgdu/hyper.json', size]]),
    });

    const result = await readGitHubAggregate(
      `github:${OWNER}/${REPO}@main/talks/pgdu`,
      github.fetch,
    );

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'blob-too-large', path: 'hyper.json', size },
    });
    expect(github.rawRequests()).toEqual([]);
  });

  it('never reads a scanned path that is a symbolic link', async () => {
    const linkPath =
      '00000000-0000-4000-8000-000000000060/resources/00000000-0000-4000-8000-0000000000aa.json';
    const files = new Map([...fixtureFiles, [linkPath, text('../../../etc/passwd')]]);
    const github = fakeGitHub({ files, symlinks: new Set([linkPath]) });

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch);

    expect(github.rawRequests()).not.toContain(linkPath);
    expect(result.ok && result.aggregate.files.has(linkPath)).toBe(false);
  });

  it('answers a network failure as a failed request', async () => {
    const offline: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'));

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, offline);

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'request-failed', url: `${API}/commits/HEAD` },
    });
  });
});
