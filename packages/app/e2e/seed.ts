import { uuidSchema } from '@project/core';
import type { CardPlacement, SpaceSnapshot } from '@project/core';
import { expect, type Page } from './fixtures';

/**
 * The wire shape `GET /api/spaces/:id` answers with. Revisions cross as decimal
 * strings because `JSON.stringify` throws on a `bigint`, so they stay strings
 * here and go back out unchanged as `expectedRevision`.
 */
export interface HttpLoadedSpace {
  readonly snapshot: SpaceSnapshot;
  readonly revision: string;
  readonly exportedRevision: string | null;
}

/** The Layout id every seeded scenario writes, so no test asserts against a literal of its own. */
export const SEEDED_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

/**
 * The Graph that Layout owns. A Layout owns at least one (ADR 0040), and seeding
 * one that is empty is what a conversion would have produced — the seeded Layout
 * stands in for the Layout an author's first edit creates, so it starts with
 * nothing authored into it.
 */
export const SEEDED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000098');

/**
 * Seed the opened Space with a single positioned Layout, then read it back.
 *
 * What it buys a test is an app that opens in an authored Layout rather than an
 * default Layout. This goes through the same HTTP boundary the browser uses
 * rather than reaching past it, so the seeded revision is one the app will
 * actually observe — hence the read-back: the caller asserts against the
 * revision the commit produced.
 */
export async function seedPositionedLayout(
  page: Page,
  title: string,
  positionsFor: (snapshot: SpaceSnapshot) => Record<string, CardPlacement>,
): Promise<HttpLoadedSpace> {
  const summariesResponse = await page.request.get('/api/spaces');
  expect(summariesResponse.ok()).toBe(true);
  // SAFETY: this E2E helper trusts the running app's own `/api/spaces`
  // response shape rather than importing its Zod schema here — the read is
  // narrow (just `id`), and a real shape mismatch fails the assertion below.
  const summaries = (await summariesResponse.json()) as readonly { readonly id: string }[];
  const spaceId = summaries[0]?.id;
  expect(spaceId).toBeDefined();

  const loadedResponse = await page.request.get(`/api/spaces/${spaceId}`);
  expect(loadedResponse.ok()).toBe(true);
  // SAFETY: `HttpLoadedSpace` is this app's own wire type for a GET
  // `/api/spaces/:id` response — the server producing it is this same
  // codebase, not third-party JSON.
  const loaded = (await loadedResponse.json()) as HttpLoadedSpace;

  const snapshot: SpaceSnapshot = {
    ...loaded.snapshot,
    document: {
      ...loaded.snapshot.document,
      layouts: [
        {
          id: SEEDED_LAYOUT_ID,
          title,
          kind: 'positioned',
          positions: positionsFor(loaded.snapshot),
          graphs: [{ id: SEEDED_GRAPH_ID, title: 'Graph 1', edges: [] }],
        },
      ],
      defaultLayout: SEEDED_LAYOUT_ID,
    },
  };
  const commitResponse = await page.request.post('/api/spaces', {
    data: {
      changes: [
        {
          kind: 'update',
          spaceId,
          snapshot,
          expectedRevision: loaded.revision,
        },
      ],
    },
  });
  expect(commitResponse.ok()).toBe(true);

  const seededResponse = await page.request.get(`/api/spaces/${spaceId}`);
  expect(seededResponse.ok()).toBe(true);
  // SAFETY: same as `loaded` above — this app's own wire response, not
  // third-party JSON.
  return (await seededResponse.json()) as HttpLoadedSpace;
}
