import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { openImportedSpace, openStoredSpace } from '../src/open-space';

const SPACE_ID = '00000000-0000-4000-8000-000000000001';
const CARD_ID = '00000000-0000-4000-8000-000000000002';
const OTHER_SPACE_ID = '00000000-0000-4000-8000-000000000003';
const GRAPH_ID = '00000000-0000-4000-8000-000000000004';
const MISSING_CARD_A = '00000000-0000-4000-8000-000000000005';
const MISSING_CARD_B = '00000000-0000-4000-8000-000000000006';
const LAYOUT_ID = '00000000-0000-4000-8000-000000000007';

const storedSnapshot: SpaceSnapshot = {
  id: uuidSchema.parse(SPACE_ID),
  document: { version: 1, title: 'Stored space' },
  cards: [
    {
      id: uuidSchema.parse(CARD_ID),
      document: { title: 'Start here', kind: 'markdown', body: 'Stored body' },
    },
  ],
};

const cardFiles = [
  {
    path: 'cards/start.md',
    text: `---
id: ${CARD_ID}
title: Start here
kind: markdown
---
`,
  },
];

describe('openStoredSpace', () => {
  it('opens the requested stored space with its acknowledged revision', async () => {
    const revision = BigInt(Number.MAX_SAFE_INTEGER) + 17n;
    const backend = new MemorySpaceBackend([
      {
        snapshot: {
          ...storedSnapshot,
          id: uuidSchema.parse(OTHER_SPACE_ID),
          document: { ...storedSnapshot.document, title: 'Other space' },
        },
        revision: 1n,
        exportedRevision: null,
      },
      { snapshot: storedSnapshot, revision, exportedRevision: revision },
    ]);

    const opened = await openStoredSpace(backend, uuidSchema.parse(SPACE_ID));

    expect(opened.space.title).toBe('Stored space');
    expect(opened.space.lookup.card(uuidSchema.parse(CARD_ID))?.title).toBe('Start here');
    expect(opened.spaceSession.getState().acknowledgedRevision).toBe(revision);
  });

  it('reports the exact requested id when the stored space is missing', async () => {
    const backend = new MemorySpaceBackend();

    await expect(openStoredSpace(backend, uuidSchema.parse(SPACE_ID))).rejects.toThrow(
      `The backend could not load space ${SPACE_ID}`,
    );
  });

  it('reports every normal intake diagnostic for an invalid stored aggregate', async () => {
    const backend = new MemorySpaceBackend([
      {
        snapshot: {
          id: uuidSchema.parse(SPACE_ID),
          document: {
            version: 1,
            title: 'Invalid stored space',
            // A Layout owning a Graph whose Edge names neither of the Cards it
            // positions — and it positions none (ADR 0040), so both endpoints
            // fail closure and both are reported.
            layouts: [
              {
                id: uuidSchema.parse(LAYOUT_ID),
                title: 'Layout',
                kind: 'positioned',
                positions: {},
                graphs: [
                  {
                    id: uuidSchema.parse(GRAPH_ID),
                    title: 'Dangling graph',
                    edges: [
                      {
                        from: uuidSchema.parse(MISSING_CARD_A),
                        to: uuidSchema.parse(MISSING_CARD_B),
                      },
                    ],
                  },
                ],
              },
            ],
          },
          cards: [],
        },
        revision: 0n,
        exportedRevision: null,
      },
    ]);

    await expect(openStoredSpace(backend, uuidSchema.parse(SPACE_ID))).rejects.toThrow(
      `The backend returned an invalid space:\n` +
        `  - Graph "${GRAPH_ID}" edge 0 names "${MISSING_CARD_A}" as its from, which the space does not hold\n` +
        `  - Graph "${GRAPH_ID}" edge 0 names "${MISSING_CARD_B}" as its to, which the space does not hold`,
    );
  });
});

describe('openImportedSpace', () => {
  it('opens a valid import through the memory backend and session seam', async () => {
    const opened = await openImportedSpace(
      { version: 1, id: SPACE_ID, title: 'New space' },
      cardFiles,
    );

    expect(opened.space.title).toBe('New space');
    expect(opened.space.cards.map((card) => card.title)).toEqual(['Start here']);
    expect(opened.spaceSession.getState().working.document.title).toBe('New space');
  });

  it('rejects an unsupported version with the complete validation detail', async () => {
    // Version 2 is the disposable pre-release shape, rejected by name rather
    // than migrated (ADR 0040) — one error naming the version that arrived,
    // instead of the cascade its space-level `graphs` would earn.
    await expect(
      openImportedSpace({ version: 2, id: SPACE_ID, title: 'Legacy space', graphs: [] }, cardFiles),
    ).rejects.toThrow(
      'The bundled space failed to import:\n' +
        '  - Space document version 2 is not supported; this build reads version 1',
    );
  });
});
