import { describe, expect, it } from 'vitest';
import {
  AggregateDirectoryError,
  mapSource,
  readAggregateFrom,
  type AggregateDirectoryContents,
  type AggregateSource,
} from '@project/aggregate';
import type { UUID } from '@project/core';
import {
  readGitHubAggregate,
  type GitHubSourceResult,
  type Wait,
} from '../src/mount/github-source';
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

/** The fixture names every identity it holds, so reading it mints none. */
const mintsNothing = (): UUID => {
  throw new Error('The fixture names every identity, so reading it mints none.');
};

/** The fixture as the reader reads it from bytes in memory, which a GitHub read must equal. */
const fixtureContents = await readAggregateFrom(mapSource('fixture', fixtureFiles), mintsNothing);

const PINNED = `github:${OWNER}/${REPO}@${COMMIT}`;

/** A Space's resource file and Markdown sidecar in the fixture, both read after `hyper.json`. */
const RESOURCE_FILE =
  '00000000-0000-4000-8000-000000000060/resources/00000000-0000-4000-8000-000000000063.json';
const SIDECAR_FILE =
  '00000000-0000-4000-8000-000000000080/resources/00000000-0000-4000-8000-000000000083.md';

/** The source a read answered, failing the test when it answered a GitHub failure. */
const sourceOf = (result: GitHubSourceResult): AggregateSource => {
  if (!result.ok) throw new Error(`GitHub answered ${result.failure.kind}.`);
  return result.aggregate.source;
};

/** The aggregate the reader reads from the source a read answered. */
const contentsOf = (result: GitHubSourceResult): Promise<AggregateDirectoryContents> =>
  readAggregateFrom(sourceOf(result), mintsNothing);

/** The reader's refusal of the source a read answered. */
const refusalOf = async (result: GitHubSourceResult): Promise<AggregateDirectoryError> => {
  try {
    await contentsOf(result);
  } catch (error) {
    if (error instanceof AggregateDirectoryError) return error;
    throw error;
  }
  throw new Error('The reader read the aggregate.');
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

/** How many raw requests were made for `path`. */
const requestsFor = (github: FakeGitHub, path: string): number =>
  github.rawRequests().filter((requested) => requested === path).length;

describe('readGitHubAggregate', () => {
  it("reads the default branch's root, resolving it to a commit in one call", async () => {
    const github = fakeGitHub({ files: fixtureFiles });

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch);

    expect(result.ok && result.aggregate.location).toEqual({
      owner: OWNER,
      repo: REPO,
      sha: COMMIT,
      path: '',
    });
    expect(result.ok && result.aggregate.source.name).toBe(PINNED);
    // Nothing is fetched until the reader reads.
    expect(github.rawRequests()).toEqual([]);
    expect(await contentsOf(result)).toEqual(fixtureContents);
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
    expect(await contentsOf(result)).toEqual(fixtureContents);
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

      expect(result.ok && result.aggregate.location).toEqual({
        owner: OWNER,
        repo: REPO,
        sha: COMMIT,
        path: SELECTED,
      });
      expect(await contentsOf(result)).toEqual(fixtureContents);
      expect(github.rawRequests()).toEqual(sorted(under(SELECTED, fixtureFiles).keys()));
      expectNoCredentials(github);
    });

    it("lists only the selected directory's tree, by its path at the commit, in one call", async () => {
      const github = fakeGitHub({ files: repository });

      const result = await readGitHubAggregate(
        `github:${OWNER}/${REPO}@${COMMIT}/${SELECTED}`,
        github.fetch,
      );

      expect(await contentsOf(result)).toEqual(fixtureContents);
      expect(github.apiRequests()).toEqual([`${API}/git/trees/${COMMIT}:${SELECTED}?recursive=1`]);
    });

    it("lists a directory at the repository's root by its path at the commit", async () => {
      const github = fakeGitHub({ files: under('pgdu', fixtureFiles) });

      const result = await readGitHubAggregate(
        `github:${OWNER}/${REPO}@${COMMIT}/pgdu`,
        github.fetch,
      );

      expect(await contentsOf(result)).toEqual(fixtureContents);
      expect(github.apiRequests()).toEqual([`${API}/git/trees/${COMMIT}:pgdu?recursive=1`]);
      expect(github.rawRequests()).toEqual(sorted(under('pgdu', fixtureFiles).keys()));
    });

    it("mounts a directory whose own tree is whole although the repository's is truncated", async () => {
      const github = fakeGitHub({ files: repository, truncated: true });

      const result = await readGitHubAggregate(
        `github:${OWNER}/${REPO}@main/${SELECTED}`,
        github.fetch,
      );

      expect(await contentsOf(result)).toEqual(fixtureContents);
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
    ])(
      'answers a selected directory without hyper.json as one the reader refuses: %s',
      async (_description, suffix) => {
        const github = fakeGitHub({ files: repository });

        const result = await readGitHubAggregate(
          `github:${OWNER}/${REPO}@main${suffix}`,
          github.fetch,
        );

        const refusal = await refusalOf(result);
        expect(refusal.kind).toBe('discovery');
        expect(refusal.diagnostics).toEqual([
          `${PINNED}${suffix}/hyper.json: a canonical aggregate directory must contain hyper.json`,
        ]);
        expect(github.rawRequests()).toEqual([]);
      },
    );
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

  it('names a file whose fetch failed, retried once, reading nothing after hyper.json', async () => {
    const github = fakeGitHub({ files: fixtureFiles, failingBlob: 'hyper.json' });

    const result = await readGitHubAggregate(
      `github:${OWNER}/${REPO}`,
      github.fetch,
      recordingWait().wait,
    );

    const refusal = await refusalOf(result);
    expect(refusal.kind).toBe('discovery');
    expect(refusal.diagnostics).toEqual([
      `${PINNED}/hyper.json: could not be fetched from GitHub: the request failed with HTTP 500`,
    ]);
    expect(github.rawRequests()).toEqual(['hyper.json', 'hyper.json']);
  });

  it('retries a blob GitHub throttled once, and reads', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([['hyper.json', [{ status: 429 }]]]),
    });
    const { wait, waits } = recordingWait();

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch, wait);

    expect(await contentsOf(result)).toEqual(fixtureContents);
    expect(requestsFor(github, 'hyper.json')).toBe(2);
    expect(waits).toEqual([1000]);
  });

  it('waits the Retry-After seconds a throttled blob names before retrying it', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([['hyper.json', [{ status: 503, retryAfter: '3' }]]]),
    });
    const { wait, waits } = recordingWait();

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch, wait);

    expect(await contentsOf(result)).toEqual(fixtureContents);
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

    expect(await contentsOf(result)).toEqual(fixtureContents);
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

    expect(await contentsOf(result)).toEqual(fixtureContents);
    expect(waits).toEqual([5000]);
  });

  it('reports a blob that still fails after its one retry as unreadable, with its status', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([[RESOURCE_FILE, [{ status: 500 }, { status: 500 }]]]),
    });
    const { wait } = recordingWait();

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch, wait);

    expect((await refusalOf(result)).diagnostics).toEqual([
      `${PINNED}/${RESOURCE_FILE}: could not be fetched from GitHub: the request failed with HTTP 500`,
    ]);
    expect(requestsFor(github, RESOURCE_FILE)).toBe(2);
  });

  it('retries a blob whose fetch threw once, and reads', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([['hyper.json', [{ throws: true }]]]),
    });
    const { wait, waits } = recordingWait();

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch, wait);

    expect(await contentsOf(result)).toEqual(fixtureContents);
    expect(requestsFor(github, 'hyper.json')).toBe(2);
    expect(waits).toEqual([1000]);
  });

  it('reports a blob whose fetch still throws after its one retry as answering nothing', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([[RESOURCE_FILE, [{ throws: true }, { throws: true }]]]),
    });
    const { wait } = recordingWait();

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch, wait);

    expect((await refusalOf(result)).diagnostics).toEqual([
      `${PINNED}/${RESOURCE_FILE}: could not be fetched from GitHub: the request failed with no response`,
    ]);
  });

  it('does not retry a blob that is not there', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([[RESOURCE_FILE, [{ status: 404 }]]]),
    });
    const { wait, waits } = recordingWait();

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch, wait);

    expect((await refusalOf(result)).diagnostics).toEqual([
      `${PINNED}/${RESOURCE_FILE}: could not be fetched from GitHub: the request failed with HTTP 404`,
    ]);
    expect(waits).toEqual([]);
  });

  it('reports every blob that could not be fetched, fetching every other one', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      holdRaw: true,
      blobFailures: new Map([
        [RESOURCE_FILE, [{ status: 404 }]],
        [SIDECAR_FILE, [{ status: 404 }]],
      ]),
    });

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch);

    expect((await refusalOf(result)).diagnostics).toEqual([
      `${PINNED}/${RESOURCE_FILE}: could not be fetched from GitHub: the request failed with HTTP 404`,
      `${PINNED}/${SIDECAR_FILE}: could not be fetched from GitHub: the request failed with HTTP 404`,
    ]);
    expect(github.rawRequests()).toEqual(sorted(fixtureFiles.keys()));
    expect(github.cancelledRaw()).toBe(0);
  });

  it('requests no blob once one is still throttled after its retry', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([[RESOURCE_FILE, [{ status: 429 }, { status: 429 }]]]),
    });
    const source = sourceOf(
      await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch, recordingWait().wait),
    );

    expect(await source.read(RESOURCE_FILE)).toEqual({
      ok: false,
      reason: 'could not be fetched from GitHub: the request failed with HTTP 429',
    });
    expect(await source.read(SIDECAR_FILE)).toEqual({
      ok: false,
      reason: 'not fetched: GitHub is throttling requests',
    });
    expect(github.rawRequests()).toEqual([RESOURCE_FILE, RESOURCE_FILE]);
  });

  it('waits for no retry once GitHub went on throttling while a request was in flight', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map([
        [RESOURCE_FILE, [{ status: 429 }, { status: 429 }]],
        [SIDECAR_FILE, [{ status: 429 }]],
      ]),
    });
    const held = Promise.withResolvers<undefined>();
    const holdingSidecar: typeof fetch = async (input, init) => {
      if (new Request(input).url.endsWith(SIDECAR_FILE)) await held.promise;
      return await github.fetch(input, init);
    };
    const { wait, waits } = recordingWait();
    const source = sourceOf(
      await readGitHubAggregate(`github:${OWNER}/${REPO}`, holdingSidecar, wait),
    );

    const sidecar = source.read(SIDECAR_FILE);
    await source.read(RESOURCE_FILE);
    held.resolve(undefined);

    expect(await sidecar).toEqual({
      ok: false,
      reason: 'not fetched: GitHub is throttling requests',
    });
    expect(waits).toEqual([1000]);
    expect(requestsFor(github, SIDECAR_FILE)).toBe(1);
  });

  it('reports every file read after GitHub went on throttling as not fetched', async () => {
    const github = fakeGitHub({
      files: fixtureFiles,
      blobFailures: new Map(
        [...fixtureFiles.keys()]
          .filter((path) => path !== 'hyper.json')
          .map((path) => [path, [{ status: 429 }, { status: 429 }]]),
      ),
    });

    const result = await readGitHubAggregate(
      `github:${OWNER}/${REPO}`,
      github.fetch,
      recordingWait().wait,
    );

    const { diagnostics } = await refusalOf(result);
    const requested = new Set(github.rawRequests().filter((path) => path !== 'hyper.json'));
    // Only the reads already in flight, eight at once, were requested, each
    // with its one retry; every file read after them was answered at once.
    expect(requested.size).toBeGreaterThan(0);
    expect(requested.size).toBeLessThanOrEqual(8);
    expect(github.rawRequests()).toHaveLength(1 + requested.size * 2);
    expect(diagnostics).toHaveLength(fixtureFiles.size - 1);
    for (const path of fixtureFiles.keys()) {
      if (path === 'hyper.json') continue;
      expect(diagnostics).toContain(
        requested.has(path)
          ? `${PINNED}/${path}: could not be fetched from GitHub: the request failed with HTTP 429`
          : `${PINNED}/${path}: not fetched: GitHub is throttling requests`,
      );
    }
  });

  it('fetches at most eight blobs at once', async () => {
    expect(fixtureFiles.size).toBeGreaterThan(8);
    const github = fakeGitHub({ files: fixtureFiles, holdRaw: true });

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch);

    expect(await contentsOf(result)).toEqual(fixtureContents);
    expect(github.peakRawInFlight()).toBe(8);
  });

  it('does not fetch a file listed over 25 MiB, reporting its size, and fetches the rest', async () => {
    const size = 25 * 1024 * 1024 + 1;
    const github = fakeGitHub({
      files: under('talks/pgdu', fixtureFiles),
      listedSizes: new Map([[`talks/pgdu/${RESOURCE_FILE}`, size]]),
    });

    const result = await readGitHubAggregate(
      `github:${OWNER}/${REPO}@main/talks/pgdu`,
      github.fetch,
    );

    expect((await refusalOf(result)).diagnostics).toEqual([
      `${PINNED}/talks/pgdu/${RESOURCE_FILE}: ${size} bytes, over the 25 MiB a mounted file may be, so it is not fetched`,
    ]);
    expect(github.rawRequests()).toEqual(
      sorted(under('talks/pgdu', fixtureFiles).keys()).filter(
        (path) => path !== `talks/pgdu/${RESOURCE_FILE}`,
      ),
    );
  });

  it('never reads a scanned path that is a symbolic link', async () => {
    const linkPath =
      '00000000-0000-4000-8000-000000000060/resources/00000000-0000-4000-8000-0000000000aa.json';
    const files = new Map([...fixtureFiles, [linkPath, text('../../../etc/passwd')]]);
    const github = fakeGitHub({ files, symlinks: new Set([linkPath]) });

    const result = await readGitHubAggregate(`github:${OWNER}/${REPO}`, github.fetch);

    expect(await contentsOf(result)).toEqual(fixtureContents);
    expect(github.rawRequests()).not.toContain(linkPath);
    await expect(sourceOf(result).read(linkPath)).resolves.toEqual({
      ok: false,
      reason: 'not in the tree GitHub listed',
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
