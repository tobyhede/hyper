import { describe, expect, it } from 'vitest';
import { openImportedWorkspace } from '../src/open-workspace';

const SPACE_ID = '00000000-0000-4000-8000-000000000001';
const CARD_ID = '00000000-0000-4000-8000-000000000002';

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
