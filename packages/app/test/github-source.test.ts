import { describe, expect, it, vi } from 'vitest';
import { readGitHubAggregate, type Wait } from '../src/mount/github-source';
import { fixtureFiles as readFixtureFiles } from './fixture-files';
import {
  API,
  COMMIT,
  fakeGitHub,
  OWNER,
  REPO,
  type ApiFailure,
  type FakeGitHub,
} from './fake-github';

/** Every tracked fixture file, which is exactly the set Importing reads there. */
const fixtureFiles = readFixtureFiles();

const under = (prefix: string, files: ReadonlyMap<string, Uint8Array>): Map<string, Uint8Array> =>
  new Map([...files].map(([path, bytes]) => [`${prefix}/${path}`, bytes]));

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

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

    it("lists only the selected directory's tree, by its path at the commit, in one call", async () => {
      const github = fakeGitHub({ files: repository });

      const result = await readGitHubAggregate(
        `github:${OWNER}/${REPO}@${COMMIT}/${SELECTED}`,
        github.fetch,
      );

      expect(result.ok && result.aggregate.files).toEqual(fixtureFiles);
      expect(github.apiRequests()).toEqual([`${API}/git/trees/${COMMIT}:${SELECTED}?recursive=1`]);
    });

    it("lists a directory at the repository's root by its path at the commit", async () => {
      const github = fakeGitHub({ files: under('pgdu', fixtureFiles) });

      const result = await readGitHubAggregate(
        `github:${OWNER}/${REPO}@${COMMIT}/pgdu`,
        github.fetch,
      );

      expect(result.ok && result.aggregate.files).toEqual(fixtureFiles);
      expect(github.apiRequests()).toEqual([`${API}/git/trees/${COMMIT}:pgdu?recursive=1`]);
      expect(github.rawRequests()).toEqual(sorted(under('pgdu', fixtureFiles).keys()));
    });

    it("mounts a directory whose own tree is whole although the repository's is truncated", async () => {
      const github = fakeGitHub({ files: repository, truncated: true });

      const result = await readGitHubAggregate(
        `github:${OWNER}/${REPO}@main/${SELECTED}`,
        github.fetch,
      );

      expect(result.ok && result.aggregate.files).toEqual(fixtureFiles);
    });

    it('refuses a directory whose own tree is truncated', async () => {
      const github = fakeGitHub({ files: repository, truncatedDirectories: new Set([SELECTED]) });

      const result = await readGitHubAggregate(
        `github:${OWNER}/${REPO}@main/${SELECTED}`,
        github.fetch,
      );

      expect(result).toEqual({
        ok: false,
        failure: {
          kind: 'truncated-tree',
          location: { owner: OWNER, repo: REPO, sha: COMMIT, path: SELECTED },
        },
      });
      expect(github.rawRequests()).toEqual([]);
    });

    it.each([
      ['the repository root, whose descendants hold one', ''],
      ['a parent of the aggregate', '/talks'],
      ['a directory that is not there', '/talks/missing'],
      ['a directory whose parent is not there', '/talks/missing/deeper'],
      ['a directory inside a file', `/${SELECTED}/hyper.json/deeper`],
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

  it('retries a blob whose fetch threw once, and mounts', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([['hyper.json', [{ throws: true }]]]),
    });
    const { wait, waits } = recordingWait();

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch, wait);

    expect(result.ok && result.aggregate.files).toEqual(fixtureFiles);
    expect(github.rawRequests().filter((path) => path === 'hyper.json')).toHaveLength(2);
    expect(waits).toEqual([1000]);
  });

  it('fails a blob whose fetch still throws after its one retry, naming it', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([['hyper.json', [{ throws: true }, { throws: true }]]]),
    });
    const { wait } = recordingWait();

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch, wait);

    expect(result).toEqual({ ok: false, failure: { kind: 'blob-failed', path: 'hyper.json' } });
  });

  it('cancels the blobs in flight once one fails, answering the first failure', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      holdRaw: true,
      blobFailures: new Map([['hyper.json', [{ status: 404 }]]]),
    });
    const { wait, waits } = recordingWait();

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch, wait);

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'blob-failed', path: 'hyper.json', status: 404 },
    });
    expect(github.cancelledRaw()).toBeGreaterThan(0);
    expect(waits).toEqual([]);
  });

  it('cancels a blob waiting to retry once another fails', async () => {
    const [, missing] = [...fixtureFiles.keys()];
    if (missing === undefined) throw new Error('The fixture holds more than one file.');
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([
        ['hyper.json', [{ status: 429, retryAfter: '10' }]],
        [missing, [{ status: 404 }]],
      ]),
    });
    // A wait that never ends on its own: only the cancellation ends it.
    const waitsForever: Wait = (_ms, signal) =>
      new Promise((resolve) => signal.addEventListener('abort', () => resolve()));

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch, waitsForever);

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'blob-failed', path: missing, status: 404 },
    });
  });

  it('leaves no retry timer behind once the blobs are cancelled', async () => {
    const [, missing] = [...fixtureFiles.keys()];
    if (missing === undefined) throw new Error('The fixture holds more than one file.');
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([
        ['hyper.json', [{ status: 429, retryAfter: '10' }]],
        [missing, [{ status: 404 }]],
      ]),
    });
    vi.useFakeTimers();
    try {
      const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch);

      expect(result).toEqual({
        ok: false,
        failure: { kind: 'blob-failed', path: missing, status: 404 },
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
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
