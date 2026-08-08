import { uuidSchema, type SpaceSnapshot } from '@project/core';
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

/**
 * The Layout id every graph-filter scenario seeds. One shared constant because
 * two tests asserting against two different literals that happen to match reads
 * as coincidence.
 */
export const FILTERED_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

/**
 * Seed the opened Space with a single Layout whose graph filter is empty, then
 * read it back.
 *
 * A Layout carrying `graphs: []` draws no Graph at all (ADR 0026), which is the
 * state both the empty-filter and the suppressed-creation scenarios need. This
 * goes through the same HTTP boundary the browser uses rather than reaching past
 * it, so the seeded revision is one the app will actually observe — hence the
 * read-back: the caller asserts against the revision the commit produced.
 */
export async function seedGraphLessLayout(
  page: Page,
  title: string,
  positionsFor: (snapshot: SpaceSnapshot) => Record<string, { x: number; y: number }>,
): Promise<HttpLoadedSpace> {
  const summariesResponse = await page.request.get('/api/spaces');
  expect(summariesResponse.ok()).toBe(true);
  const summaries = (await summariesResponse.json()) as readonly { readonly id: string }[];
  const spaceId = summaries[0]?.id;
  expect(spaceId).toBeDefined();

  const loadedResponse = await page.request.get(`/api/spaces/${spaceId}`);
  expect(loadedResponse.ok()).toBe(true);
  const loaded = (await loadedResponse.json()) as HttpLoadedSpace;

  const snapshot: SpaceSnapshot = {
    ...loaded.snapshot,
    document: {
      ...loaded.snapshot.document,
      layouts: [
        {
          id: FILTERED_LAYOUT_ID,
          title,
          kind: 'positioned',
          positions: positionsFor(loaded.snapshot),
          graphs: [],
        },
      ],
      defaultView: FILTERED_LAYOUT_ID,
    },
  };
  const commitResponse = await page.request.put(`/api/spaces/${spaceId}`, {
    data: { snapshot, expectedRevision: loaded.revision },
  });
  expect(commitResponse.ok()).toBe(true);

  const seededResponse = await page.request.get(`/api/spaces/${spaceId}`);
  expect(seededResponse.ok()).toBe(true);
  return (await seededResponse.json()) as HttpLoadedSpace;
}

/** Every Card on a five-wide grid, so a multi-Card fixture stays legible. */
export const allCardsOnAGrid = (
  snapshot: SpaceSnapshot,
): Record<string, { x: number; y: number }> =>
  Object.fromEntries(
    snapshot.cards.map((card, index) => [
      card.id,
      { x: (index % 5) * 320, y: Math.floor(index / 5) * 200 },
    ]),
  );
