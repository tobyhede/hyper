import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import { PersistenceControl } from '../src/components/PersistenceControl';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a1');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a2');
const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a3');

describe('PersistenceControl', () => {
  it('explains an aggregate refusal instead of naming its error kinds', () => {
    render(
      <PersistenceControl
        persistence={{
          kind: 'rejected',
          failure: {
            kind: 'aggregate-refused',
            errors: [
              {
                kind: 'space-card-target-missing',
                spaceId: SPACE_ID,
                cardId: CARD_ID,
                targetSpaceId: TARGET_ID,
              },
              { kind: 'ordinary-space-unreferenced', spaceId: TARGET_ID },
            ],
          },
        }}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    expect(screen.getByText(/space card points at a space that no longer exists/i)).toBeVisible();
    expect(screen.getByText(/nothing pointing at it/i)).toBeVisible();
    // The domain identity stays in the domain: a refusal code is a stable name
    // for the repository to answer with, not a sentence to show an author.
    expect(screen.queryByText(/space-card-target-missing/)).toBeNull();
    expect(screen.queryByText(/ordinary-space-unreferenced/)).toBeNull();
  });

  it('repeats a shared explanation once however many errors carry it', () => {
    render(
      <PersistenceControl
        persistence={{
          kind: 'rejected',
          failure: {
            kind: 'aggregate-refused',
            errors: [
              { kind: 'ordinary-space-unreferenced', spaceId: SPACE_ID },
              { kind: 'ordinary-space-unreferenced', spaceId: TARGET_ID },
            ],
          },
        }}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/nothing pointing at it/i)).toHaveLength(1);
  });

  it('does not offer an unavailable remote snapshot for a coordinated conflict', () => {
    render(
      <PersistenceControl
        persistence={{ kind: 'conflicted', current: undefined }}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Reload' })).toBeDisabled();
    expect(screen.getByText(/related space changed/i)).toBeVisible();
  });
});
