import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type Card, type UUID } from '@project/core';
import type { SpaceCardTarget } from '../src/space-card-lifecycle';
import { useSpaceCardTargets } from '../src/space-card-targets';

const SPACE_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const TARGET_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const OTHER_SPACE_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const OTHER_TARGET_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const OTHER_TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');

const target: SpaceCardTarget = {
  id: TARGET_ID,
  title: 'Architecture',
  layouts: [
    {
      id: TARGET_LAYOUT_ID,
      title: 'Layout 1',
      graphs: [{ id: TARGET_GRAPH_ID, title: 'Graph 1' }],
    },
  ],
};

const otherTarget: SpaceCardTarget = {
  id: OTHER_TARGET_ID,
  title: 'Roadmap',
  layouts: [
    {
      id: OTHER_TARGET_LAYOUT_ID,
      title: 'Layout 1',
      graphs: [{ id: OTHER_TARGET_GRAPH_ID, title: 'Graph 1' }],
    },
  ],
};

/** The Cards a completed Edit hands the canvas: one Space Card, a fresh array. */
const cards = (): readonly Card[] => [
  { id: SPACE_CARD_ID, title: 'Nested', kind: 'space', spaceId: TARGET_ID },
];

/** The same canvas with a second Space Card, pointed at a second target Space. */
const twoCards = (): readonly Card[] => [
  ...cards(),
  { id: OTHER_SPACE_CARD_ID, title: 'Also nested', kind: 'space', spaceId: OTHER_TARGET_ID },
];

interface ProbeProps {
  readonly read: (spaceId: UUID) => Promise<SpaceCardTarget | undefined>;
  readonly cards: readonly Card[];
}

/** What the hook answers, drawn so a test can read it out of the DOM. */
function Probe({ read, cards: value }: ProbeProps) {
  // `read` is one stable reference for the life of a test, exactly as the
  // production callback is for the life of a composition.
  const targets = useSpaceCardTargets(value, read);
  return <p data-testid="titles">{[...targets.values()].map(({ title }) => title).join(' ')}</p>;
}

/**
 * The read that has to survive the mount it was started in.
 *
 * `StrictMode` is the application's own composition (`startup.tsx`) and
 * development is the only environment there is, so its setup → cleanup → setup
 * is the ordinary mounting sequence rather than a test-only shape. A Space Card
 * already on the canvas when the app mounts is read once in that first setup,
 * and nothing after it changes the set of referenced Spaces — so an answer
 * discarded by the remount is an answer nothing asks for again, and every Space
 * Card on the canvas draws without its target for the life of the page.
 */
describe('reading the Spaces a canvas references', () => {
  it('answers a target present at mount, through StrictMode’s double mount', async () => {
    const read = vi.fn(() => Promise.resolve(target));

    render(
      <StrictMode>
        <Probe read={read} cards={cards()} />
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByTestId('titles')).toHaveTextContent('Architecture'));
  });

  /**
   * A rejected read is not an answer, so it must not stand as one.
   *
   * `loadSpace` rejects on a non-OK status, a network failure or the transport
   * timeout. Recording the set as read regardless would leave every Space Card
   * without its target for the life of the page, long after the network came
   * back — so the request is released and the next render that still wants the
   * set asks again.
   */
  it('asks again after a read that rejected', async () => {
    const read = vi
      .fn<(spaceId: UUID) => Promise<SpaceCardTarget | undefined>>()
      .mockRejectedValueOnce(new Error('the transport timed out'))
      .mockResolvedValue(target);

    const view = render(<Probe read={read} cards={cards()} />);
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    expect(screen.getByTestId('titles')).toBeEmptyDOMElement();

    // A completed Edit in this Space is what re-renders the canvas with a fresh
    // Cards array, and this is the render that finds the set still unread.
    view.rerender(<Probe read={read} cards={cards()} />);

    await waitFor(() => expect(screen.getByTestId('titles')).toHaveTextContent('Architecture'));
  });

  /**
   * One unavailable target does not blank the Space Cards pointed elsewhere.
   *
   * Each target is a separate read of a separate Space, so their outcomes are
   * separate answers: a Space deleted, refusing intake or briefly unreachable
   * says nothing about the one the Card beside it points at. Failing the batch
   * would hold every Space Card on the canvas without its title and selectors
   * until the next completed Edit, and again on every retry the one bad target
   * keeps failing.
   */
  it('keeps the targets that were read when another target’s read rejects', async () => {
    const read = vi.fn((spaceId: UUID) =>
      spaceId === TARGET_ID
        ? Promise.reject(new Error('the transport timed out'))
        : Promise.resolve(otherTarget),
    );

    render(<Probe read={read} cards={twoCards()} />);

    await waitFor(() => expect(screen.getByTestId('titles')).toHaveTextContent('Roadmap'));
  });

  /**
   * A failed read is still not an answer, so the answer it had stands.
   *
   * The set is re-read whole once a failure has released the request, which
   * puts targets already drawn back through a read that can fail this time. The
   * previous answer is what the Card keeps drawing meanwhile — the alternative
   * is a Card blanking because a *different* Space was edited.
   */
  it('carries a target already read through a batch its own read fails in', async () => {
    let firstTargetFails = false;
    const read = vi.fn((spaceId: UUID) => {
      if (spaceId !== TARGET_ID) return Promise.resolve(otherTarget);
      return firstTargetFails
        ? Promise.reject(new Error('the transport timed out'))
        : Promise.resolve(target);
    });

    const view = render(<Probe read={read} cards={cards()} />);
    await waitFor(() => expect(screen.getByTestId('titles')).toHaveTextContent('Architecture'));

    // A second Space Card is a new set of referenced Spaces, so both are read
    // again — and this time the first target's Space cannot be reached.
    firstTargetFails = true;
    view.rerender(<Probe read={read} cards={twoCards()} />);

    await waitFor(() =>
      expect(screen.getByTestId('titles')).toHaveTextContent('Architecture Roadmap'),
    );
  });

  /**
   * A target that answers “gone” is dropped, where one that failed is kept.
   *
   * `target` resolves `undefined` for a Space that is deleted or no longer
   * passes intake, which is an answer about that Space and not a failure to get
   * one — so the entry a previous read installed must not survive it.
   */
  it('drops a target whose read answers that it is gone', async () => {
    let targetIsGone = false;
    const read = vi.fn((spaceId: UUID) => {
      if (spaceId !== TARGET_ID) return Promise.resolve(otherTarget);
      return Promise.resolve(targetIsGone ? undefined : target);
    });

    const view = render(<Probe read={read} cards={cards()} />);
    await waitFor(() => expect(screen.getByTestId('titles')).toHaveTextContent('Architecture'));

    targetIsGone = true;
    view.rerender(<Probe read={read} cards={twoCards()} />);

    await waitFor(() => expect(screen.getByTestId('titles')).toHaveTextContent('Roadmap'));
    expect(screen.getByTestId('titles')).not.toHaveTextContent('Architecture');
  });
});
