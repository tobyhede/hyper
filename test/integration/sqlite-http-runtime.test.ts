import { decodeLoadedSpace, decodeSpaceSummaries } from '@project/persistence';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/http/sqlite-http-runtime';
import { createSqliteDatabase } from '../../src/sqlite/db';
import { openSqliteRepository } from '../support/sqlite-harness';

describe('SQLite HTTP runtime', () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
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
});
