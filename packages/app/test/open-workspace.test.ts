import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend } from '@project/persistence';
import { openImportedWorkspace, openStoredWorkspace } from '../src/open-workspace';

const SPACE_ID = '00000000-0000-4000-8000-000000000001';
const CARD_ID = '00000000-0000-4000-8000-000000000002';
const OTHER_SPACE_ID = '00000000-0000-4000-8000-000000000003';
const ROUTE_ID = '00000000-0000-4000-8000-000000000004';
const MISSING_CARD_A = '00000000-0000-4000-8000-000000000005';
const MISSING_CARD_B = '00000000-0000-4000-8000-000000000006';

const storedSnapshot: SpaceSnapshot = {
  id: uuidSchema.parse(SPACE_ID),
  document: { version: 2, title: 'Stored space', routes: [] },
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

describe('openStoredWorkspace', () => {
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

    const opened = await openStoredWorkspace(backend, uuidSchema.parse(SPACE_ID));

    expect(opened.space.title).toBe('Stored space');
    expect(opened.space.cardsById.get(uuidSchema.parse(CARD_ID))?.title).toBe('Start here');
    expect(opened.spaceSession.getState().acknowledgedRevision).toBe(revision);
  });

  it('reports the exact requested id when the stored space is missing', async () => {
    const backend = new MemorySpaceBackend();

    await expect(openStoredWorkspace(backend, uuidSchema.parse(SPACE_ID))).rejects.toThrow(
      `The backend could not load space ${SPACE_ID}`,
    );
  });

  it('reports every normal intake diagnostic for an invalid stored aggregate', async () => {
    const backend = new MemorySpaceBackend([
      {
        snapshot: {
          id: uuidSchema.parse(SPACE_ID),
          document: {
            version: 2,
            title: 'Invalid stored space',
            routes: [
              {
                id: uuidSchema.parse(ROUTE_ID),
                title: 'Dangling route',
                edges: [
                  {
                    from: uuidSchema.parse(MISSING_CARD_A),
                    to: uuidSchema.parse(MISSING_CARD_B),
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

    await expect(openStoredWorkspace(backend, uuidSchema.parse(SPACE_ID))).rejects.toThrow(
      `The backend returned an invalid space:\n` +
        `  - Route "${ROUTE_ID}" edge 0 references missing card "${MISSING_CARD_A}" as its from\n` +
        `  - Route "${ROUTE_ID}" edge 0 references missing card "${MISSING_CARD_B}" as its to`,
    );
  });
});

describe('openImportedWorkspace', () => {
  it('opens a valid import through the memory backend and session seam', async () => {
    const opened = await openImportedWorkspace(
      { version: 2, id: SPACE_ID, title: 'New space', routes: [] },
      cardFiles,
    );

    expect(opened.space.title).toBe('New space');
    expect(opened.space.cards.map((card) => card.title)).toEqual(['Start here']);
    expect(opened.spaceSession.getState().working.document.title).toBe('New space');
  });

  it('rejects an unsupported version with the complete validation detail', async () => {
    await expect(
      openImportedWorkspace(
        { version: 1, id: SPACE_ID, title: 'Legacy space', routes: [] },
        cardFiles,
      ),
    ).rejects.toThrow(
      'The bundled space failed to import:\n  - version: Invalid literal value, expected 2',
    );
  });
});
