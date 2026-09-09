import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import type { LoadedSpace } from '@project/persistence';
import { PersistenceControl, PersistenceNotice } from '../src/components/PersistenceControl';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a1');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a2');
const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a3');

const SNAPSHOT: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'Stored space' },
  cards: [],
};

const STORED: LoadedSpace = { snapshot: SNAPSHOT, revision: 5n, exportedRevision: null };

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

  it('can accept the stored side when no stored Space remains', () => {
    const onAcceptRemote = vi.fn(() => null);
    render(
      <PersistenceControl
        persistence={{ kind: 'conflicted', current: undefined, baseline: undefined }}
        onAcceptRemote={onAcceptRemote}
        onKeepLocal={vi.fn()}
      />,
    );

    const reload = screen.getByRole('button', { name: 'Reload' });
    expect(reload).toBeEnabled();
    expect(screen.getByText(/there is no stored version of this space/i)).toBeVisible();

    fireEvent.click(reload);
    expect(onAcceptRemote).toHaveBeenCalledTimes(1);
  });

  it('offers a revert to the baseline for a Space the conflict never named', () => {
    const onAcceptRemote = vi.fn(() => null);
    render(
      <PersistenceControl
        persistence={{
          kind: 'conflicted',
          current: undefined,
          baseline: {
            id: SPACE_ID,
            document: { version: 1, title: 'Before the coordinated edit' },
            cards: [],
          },
        }}
        onAcceptRemote={onAcceptRemote}
        onKeepLocal={vi.fn()}
      />,
    );

    // The coordinated edit never committed, so the baseline is what is stored
    // and reloading it is an ordinary discard rather than a dead end.
    const reload = screen.getByRole('button', { name: 'Reload' });
    expect(reload).toBeEnabled();
    expect(screen.getByText(/returns this space to how it was before the edit/i)).toBeVisible();

    fireEvent.click(reload);
    expect(onAcceptRemote).toHaveBeenCalledTimes(1);
  });

  /**
   * The rejection dialog's other arm. An aggregate refusal is structured and
   * already described from its errors; a permanent failure carries only a code
   * and the transport's message, and until now the message is what showed.
   */
  it('explains a permanent rejection from its code rather than the wire’s message', () => {
    render(
      <PersistenceControl
        persistence={{
          kind: 'rejected',
          failure: { kind: 'permanent-failure', code: 'forbidden', message: 'Permission denied' },
        }}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    expect(screen.getByText('You do not have permission to save this space.')).toBeVisible();
    expect(screen.queryByText('Permission denied')).toBeNull();
  });

  /**
   * The three recoveries a conflict can offer, each with its own sentence.
   *
   * Written before the copy moved out of the component, so the move is proved
   * to change nothing the author reads. Which recovery a conflict is remains
   * derived from the two snapshots it carries: a newer stored Space reloads, a
   * participant the conflict never named reverts to its baseline, and a Space
   * with neither has nothing stored to accept.
   */
  it.each([
    [
      'reload',
      { current: STORED, baseline: undefined },
      /A newer version of this space is available/,
    ],
    [
      'revert',
      { current: undefined, baseline: SNAPSHOT },
      /A related space changed while this coordinated edit was saving/,
    ],
    [
      'none',
      { current: undefined, baseline: undefined },
      /There is no stored version of this space/,
    ],
  ] as const)('explains the %s recovery a conflict offers', (_recovery, conflict, sentence) => {
    render(
      <PersistenceControl
        persistence={{ kind: 'conflicted', ...conflict }}
        onAcceptRemote={vi.fn(() => null)}
        onKeepLocal={vi.fn()}
      />,
    );

    expect(screen.getByText(sentence)).toBeVisible();
  });
});

/**
 * The standing notice behind the toolbar's red dot.
 *
 * A retryable failure's `message` is whatever the transport had to hand —
 * `problem.detail` from the server, or a thrown `Error`'s own text — so it
 * arrives in the server's voice, or in none at all. The author reads the
 * application's sentence for the code instead (ADR 0057).
 */
describe('PersistenceNotice', () => {
  it('explains a retryable failure from its code rather than the wire’s message', () => {
    render(
      <PersistenceNotice
        persistence={{
          kind: 'failed',
          failure: { kind: 'retryable-failure', code: 'network', message: 'Failed to fetch' },
        }}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('Your device could not reach the server.')).toBeVisible();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
  });
});
