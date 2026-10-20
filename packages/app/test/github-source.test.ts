import { describe, expect, it } from 'vitest';
import { readGitHubAggregate } from '../src/mount/github-source';
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
  /** A repository path whose raw request answers 500. */
  readonly failingBlob?: string;
}

interface FakeGitHub {
  readonly fetch: typeof fetch;
  readonly requests: Request[];
  readonly apiRequests: () => string[];
  readonly rawRequests: () => string[];
}

const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${COMMIT}/`;

/** The fields of GitHub's tree entries a GitHub source reads, and its blob SHA. */
interface TreeEntry {
  readonly path: string;
  readonly mode: string;
  readonly type: 'tree' | 'blob';
  readonly sha: string;
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
const treeEntries = (files: ReadonlyMap<string, Uint8Array>): TreeEntry[] => {
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
    ...[...files.keys()].map((path): TreeEntry => ({
      path,
      mode: '100644',
      type: 'blob',
      sha: COMMIT,
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
  failingBlob,
}: FakeGitHubOptions): FakeGitHub => {
  const requests: Request[] = [];
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
          ? json(200, { sha: COMMIT, tree: treeEntries(files), truncated })
          : json(404, { message: 'Not Found' });
      }
      return json(404, { message: 'Not Found' });
    }
    if (url.startsWith(RAW)) {
      const path = decodeURIComponent(url.slice(RAW.length));
      if (path === failingBlob) return new Response('', { status: 500 });
      const bytes = files.get(path);
      return bytes === undefined
        ? new Response('404: Not Found', { status: 404 })
        : new Response(new Uint8Array(bytes), { status: 200 });
    }
    return new Response('', { status: 404 });
  };

  const fakeFetch: typeof fetch = (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    return Promise.resolve(answer(request));
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

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch);

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'blob-failed', path: 'hyper.json', status: 500 },
    });
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
