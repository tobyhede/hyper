import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { HttpSpaceBackend } from '@project/http';
import {
  decodeCommitConflict,
  decodeCommitResponse,
  decodeLoadedSpace,
  decodeProblemDetails,
  decodeSpaceSummaries,
  encodeCommitRequest,
  problemCatalogue,
  type SpaceCommit,
} from '@project/persistence';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/http/sqlite-http-runtime';
import { createSqliteDatabase } from '../../src/sqlite/db';
import { openSqliteRepository } from '../support/sqlite-harness';

describe('SQLite HTTP runtime', () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    vi.unstubAllEnvs();
    await close?.();
    close = undefined;
  });

  // Composition is where a setup problem is reported (ticket 15): a host with no
  // file behind it would start, then answer every request with a driver error.
  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['blank', ' \t '],
  ])('refuses to compose when SQLITE_PATH is %s', async (_, configured) => {
    vi.stubEnv('SQLITE_PATH', configured);
    const reported: unknown[] = [];

    await expect(
      createApp({
        wait: () => new Promise<void>(() => undefined),
        report: (cause) => reported.push(cause),
      }),
    ).rejects.toThrow('SQLITE_PATH must name the SQLite database file');
    expect(reported).toEqual([]);
  });

  // `pnpm dev:sqlite` migrates from the repository root and serves from
  // `packages/app`, so a relative path names a different file in each step.
  it('refuses to compose when SQLITE_PATH is relative', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hyper-sqlite-relative-'));
    close = () => rm(directory, { recursive: true, force: true });
    vi.stubEnv('SQLITE_PATH', relative(process.cwd(), join(directory, 'hyper.db')));
    const reported: unknown[] = [];

    await expect(
      createApp({
        wait: () => new Promise<void>(() => undefined),
        report: (cause) => reported.push(cause),
      }),
    ).rejects.toThrow('SQLITE_PATH must be an absolute path');
    expect(reported).toEqual([]);
  });

  it('establishes Default Content and serves the collection and Meta Space', async () => {
    const harness = await openSqliteRepository();
    const application = await createApp({
      database: harness.database,
      wait: () => new Promise<void>(() => undefined),
    });
    close = harness.close;

    const listed = await application.fetch(new Request('http://hyper.test/api/spaces'));
    expect(listed.status).toBe(200);
    const summaries = decodeSpaceSummaries(
      // SAFETY: JSON.parse is the HTTP body boundary; decodeSpaceSummaries parses next.
      JSON.parse(await listed.text()) as unknown,
    );
    expect(summaries).toEqual([expect.objectContaining({ title: 'New space' })]);
    const metaId = summaries[0]?.id;
    if (metaId === undefined) throw new Error('Expected a Space summary');

    const loaded = await application.fetch(new Request(`http://hyper.test/api/spaces/${metaId}`));
    expect(loaded.status).toBe(200);
    const body = decodeLoadedSpace(
      // SAFETY: JSON.parse is the HTTP body boundary; decodeLoadedSpace parses next.
      JSON.parse(await loaded.text()) as unknown,
    );
    expect(body.revision).toBe(0n);
    expect(body.snapshot.id).toBe(metaId);
    expect(body.snapshot.document.title).toBe('New space');
  });

  it('leaves an already-initialized file alone and still serves it after reopen', async () => {
    const harness = await openSqliteRepository();
    const first = await createApp({
      database: harness.database,
      wait: () => new Promise<void>(() => undefined),
    });
    const listed = await first.fetch(new Request('http://hyper.test/api/spaces'));
    const summaries = decodeSpaceSummaries(
      // SAFETY: JSON.parse is the HTTP body boundary; decodeSpaceSummaries parses next.
      JSON.parse(await listed.text()) as unknown,
    );
    const metaId = summaries[0]?.id;
    if (metaId === undefined) throw new Error('Expected a Space summary');
    await harness.database.close();

    const reopened = createSqliteDatabase(harness.path);
    close = async () => {
      await reopened.close();
      await harness.close();
    };
    const second = await createApp({
      database: reopened,
      wait: () => new Promise<void>(() => undefined),
    });
    const again = await second.fetch(new Request('http://hyper.test/api/spaces'));
    expect(again.status).toBe(200);
    expect(
      decodeSpaceSummaries(
        // SAFETY: JSON.parse is the HTTP body boundary; decodeSpaceSummaries parses next.
        JSON.parse(await again.text()) as unknown,
      ),
    ).toEqual([expect.objectContaining({ id: metaId, title: 'New space' })]);

    const loaded = await second.fetch(new Request(`http://hyper.test/api/spaces/${metaId}`));
    expect(loaded.status).toBe(200);
    expect(
      decodeLoadedSpace(
        // SAFETY: JSON.parse is the HTTP body boundary; decodeLoadedSpace parses next.
        JSON.parse(await loaded.text()) as unknown,
      ).snapshot.id,
    ).toBe(metaId);
  });

  it('persists a POST Edit through GET and reopen, and answers a stale revision as 409', async () => {
    const harness = await openSqliteRepository();
    const application = await createApp({
      database: harness.database,
      wait: () => new Promise<void>(() => undefined),
    });
    close = harness.close;

    const listed = await application.fetch(new Request('http://hyper.test/api/spaces'));
    const summaries = decodeSpaceSummaries(
      // SAFETY: JSON.parse is the HTTP body boundary; decodeSpaceSummaries parses next.
      JSON.parse(await listed.text()) as unknown,
    );
    const metaId = summaries[0]?.id;
    if (metaId === undefined) throw new Error('Expected a Space summary');
    const loaded = await application.fetch(new Request(`http://hyper.test/api/spaces/${metaId}`));
    const body = decodeLoadedSpace(
      // SAFETY: JSON.parse is the HTTP body boundary; decodeLoadedSpace parses next.
      JSON.parse(await loaded.text()) as unknown,
    );

    const edited = {
      ...body.snapshot,
      document: { ...body.snapshot.document, title: 'Edited over HTTP' },
    };
    const posted = await application.fetch(
      new Request('http://hyper.test/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          encodeCommitRequest({
            changes: [
              {
                kind: 'update',
                spaceId: metaId,
                snapshot: edited,
                expectedRevision: body.revision,
              },
            ],
          }),
        ),
      }),
    );
    expect(posted.status).toBe(200);
    expect(
      decodeCommitResponse(
        // SAFETY: JSON.parse is the HTTP body boundary; decodeCommitResponse parses next.
        JSON.parse(await posted.text()) as unknown,
      ),
    ).toEqual({
      kind: 'committed',
      revisions: [{ spaceId: metaId, revision: 1n }],
      deletedSpaceIds: [],
    });

    const reread = await application.fetch(new Request(`http://hyper.test/api/spaces/${metaId}`));
    expect(
      decodeLoadedSpace(
        // SAFETY: JSON.parse is the HTTP body boundary; decodeLoadedSpace parses next.
        JSON.parse(await reread.text()) as unknown,
      ).snapshot.document.title,
    ).toBe('Edited over HTTP');

    const stale = await application.fetch(
      new Request('http://hyper.test/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          encodeCommitRequest({
            changes: [
              {
                kind: 'update',
                spaceId: metaId,
                snapshot: edited,
                expectedRevision: 0n,
              },
            ],
          }),
        ),
      }),
    );
    expect(stale.status).toBe(409);
    expect(
      decodeCommitConflict(
        // SAFETY: JSON.parse is the HTTP body boundary; decodeCommitConflict parses next.
        JSON.parse(await stale.text()) as unknown,
      ).kind,
    ).toBe('conflict');

    await harness.database.close();
    const reopened = createSqliteDatabase(harness.path);
    close = async () => {
      await reopened.close();
      await harness.close();
    };
    const second = await createApp({
      database: reopened,
      wait: () => new Promise<void>(() => undefined),
    });
    const afterReopen = await second.fetch(new Request(`http://hyper.test/api/spaces/${metaId}`));
    expect(afterReopen.status).toBe(200);
    expect(
      decodeLoadedSpace(
        // SAFETY: JSON.parse is the HTTP body boundary; decodeLoadedSpace parses next.
        JSON.parse(await afterReopen.text()) as unknown,
      ).snapshot.document.title,
    ).toBe('Edited over HTTP');
  });
  // A real operational failure, not a mocked repository: the host's own SQLite
  // client is closed underneath it, so every read and the commit reach a driver
  // that can no longer answer. That is temporary from the client's side, and
  // the wire must say so as `persistence-unavailable` — never the 409 a revision
  // mismatch earns — and the production backend must read it as retryable.
  it('answers a closed database as retryable 503 persistence-unavailable, not 409', async () => {
    const harness = await openSqliteRepository();
    const application = await createApp({
      database: harness.database,
      wait: () => new Promise<void>(() => undefined),
    });
    close = harness.close;

    const listed = await application.fetch(new Request('http://hyper.test/api/spaces'));
    const summaries = decodeSpaceSummaries(
      // SAFETY: JSON.parse is the HTTP body boundary; decodeSpaceSummaries parses next.
      JSON.parse(await listed.text()) as unknown,
    );
    const metaId = summaries[0]?.id;
    if (metaId === undefined) throw new Error('Expected a Space summary');
    const loaded = await application.fetch(new Request(`http://hyper.test/api/spaces/${metaId}`));
    const body = decodeLoadedSpace(
      // SAFETY: JSON.parse is the HTTP body boundary; decodeLoadedSpace parses next.
      JSON.parse(await loaded.text()) as unknown,
    );
    const commit: SpaceCommit = {
      changes: [
        {
          kind: 'update',
          spaceId: metaId,
          snapshot: {
            ...body.snapshot,
            document: { ...body.snapshot.document, title: 'Never stored' },
          },
          expectedRevision: body.revision,
        },
      ],
    };

    await harness.database.close();

    const unavailable = problemCatalogue['persistence-unavailable'];
    const responses = [
      await application.fetch(new Request('http://hyper.test/api/spaces')),
      await application.fetch(new Request(`http://hyper.test/api/spaces/${metaId}`)),
      await application.fetch(new Request('http://hyper.test/api/aggregate')),
      await application.fetch(
        new Request('http://hyper.test/api/spaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(encodeCommitRequest(commit)),
        }),
      ),
    ];
    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(response.headers.get('content-type')).toBe('application/problem+json');
      const problem = decodeProblemDetails(
        // SAFETY: JSON.parse is the HTTP body boundary; decodeProblemDetails parses next.
        JSON.parse(await response.text()) as unknown,
      );
      expect(problem.type).toBe(unavailable.type);
      expect(problem.status).toBe(503);
    }

    const backend = new HttpSpaceBackend('http://hyper.test', {
      fetch: (input, init) => Promise.resolve(application.fetch(new Request(input, init))),
    });
    await expect(backend.commit(commit)).resolves.toMatchObject({
      kind: 'retryable-failure',
      code: 'unavailable',
    });
  });
});
