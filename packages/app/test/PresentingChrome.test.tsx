import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import { PresentingChrome, type PresentingChromeProps } from '../src/components/PresentingChrome';
import type { Move } from '../src/navigation';

/**
 * The presenting chrome at its own interface.
 *
 * It is controlled: Navigation owns the moves, the selected branch, Traversal
 * history and every operation, and this component draws them and calls back. So
 * what belongs here is what the interface promises — the semantics of the
 * controls, which callback each one runs, what is announced, where focus lands
 * when a control it owns destroys itself, and which keyboard commands the
 * guidance claims are available. Whether a traversal arrives at the right Card
 * is Navigation's own test (`navigation.test.ts`) and is not repeated here.
 */

const CARD_IDS = [
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000006',
].map((id) => uuidSchema.parse(id));

/** The moves Navigation answers: the outgoing Edges in author order, one marked. */
const movesTo = (titles: readonly string[], selectedIndex: number): readonly Move[] =>
  titles.map((title, index) => {
    const cardId = CARD_IDS[index];
    if (cardId === undefined) throw new Error('The fixture declares no id for this move.');
    return { cardId, title, selected: index === selectedIndex };
  });

const chrome = (props: Partial<PresentingChromeProps> = {}) => (
  <PresentingChrome
    moves={movesTo(['B'], 0)}
    canRetreat={false}
    onSelectBranch={() => undefined}
    onAdvance={() => undefined}
    onRetreat={() => undefined}
    onExit={() => undefined}
    onCopyLink={() => undefined}
    {...props}
  />
);

const moveButtons = () => within(screen.getByTestId('presenting-moves')).getAllByRole('button');

/** What the guidance currently claims is bound, one entry per command. */
const guidance = () =>
  within(screen.getByTestId('presenting-keys'))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('PresentingChrome', () => {
  it('names a sink as the end of the active Graph', () => {
    render(chrome({ moves: [] }));

    expect(screen.getByTestId('presenting-end')).toHaveTextContent(/^End of Graph$/);
    expect(screen.queryByTestId('presenting-moves')).toBeNull();
  });

  /**
   * Choosing is not going, and the control says which it is.
   *
   * Selection alone is not the completed action, so a move is never a radio, a
   * toggle or a destination that disables itself once chosen — every one of them
   * is a button that performs what its name says.
   */
  it('names the action each move performs rather than the state it is in', () => {
    render(chrome({ moves: movesTo(['B', 'C', 'D'], 1) }));

    expect(moveButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Choose B',
      'Go to C',
      'Choose D',
    ]);
    for (const button of moveButtons()) {
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute('aria-pressed');
      expect(button).not.toHaveAttribute('aria-checked');
      expect(button).not.toHaveAttribute('role');
    }
    // The visible text stays the Card's title, so what is written on the control
    // is still sayable — the accessible name puts the verb in front of it.
    expect(moveButtons().map((button) => button.textContent)).toEqual(['B', 'C', 'D']);
  });

  /**
   * The chrome owns the indexed list it drew, so it answers `selectBranch` in
   * the signed places Navigation takes rather than making its caller re-derive
   * where the selection sits.
   */
  it('moves the selection by the delta from the selected move', () => {
    const onSelectBranch = vi.fn();
    const onAdvance = vi.fn();
    render(chrome({ moves: movesTo(['B', 'C', 'D'], 1), onSelectBranch, onAdvance }));

    fireEvent.click(screen.getByRole('button', { name: 'Choose D' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose B' }));

    expect(onSelectBranch.mock.calls).toEqual([[1], [-1]]);
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('advances down the selected move rather than reselecting it', () => {
    const onSelectBranch = vi.fn();
    const onAdvance = vi.fn();
    render(chrome({ moves: movesTo(['B', 'C'], 0), onSelectBranch, onAdvance }));

    fireEvent.click(screen.getByRole('button', { name: 'Go to B' }));

    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(onSelectBranch).not.toHaveBeenCalled();
  });

  /**
   * Back exposes a capability Arrow Left already had, to pointer and assistive
   * technology users. It is the same Navigation operation rather than a second
   * retreat behaviour, so it is offered on exactly the condition that operation
   * can act on.
   */
  it('offers Back only where Traversal history can retreat', () => {
    const onRetreat = vi.fn();
    const { rerender } = render(chrome({ canRetreat: false, onRetreat }));
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

    rerender(chrome({ canRetreat: true, onRetreat }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onRetreat).toHaveBeenCalledTimes(1);
  });

  it('leaves presentation through Overview', () => {
    const onExit = vi.fn();
    render(chrome({ onExit }));

    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('copies the exact presentation point through its own command', () => {
    const onCopyLink = vi.fn();
    render(chrome({ onCopyLink }));

    fireEvent.click(screen.getByRole('button', { name: 'Copy link to this presentation point' }));

    expect(onCopyLink).toHaveBeenCalledOnce();
  });

  it('guards its chrome controls from React Flow document shortcuts', () => {
    render(chrome());

    expect(
      screen
        .getByRole('button', { name: 'Copy link to this presentation point' })
        .closest('.nokey'),
    ).not.toBeNull();
  });

  /**
   * One polite region over the moves and the end state, because they are one
   * thing: what the presenter can do from the Card they are on. A changed choice
   * set is announced where it changed rather than by focus being moved to it.
   */
  it('announces the choice set and the end of the Graph in one polite region', () => {
    const { rerender } = render(chrome({ moves: movesTo(['B', 'C'], 0) }));
    const region = screen.getByTestId('presenting-choices');

    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(within(region).getAllByRole('button')).toHaveLength(2);

    rerender(chrome({ moves: [] }));

    expect(within(region).getByTestId('presenting-end')).toBeVisible();
  });

  /**
   * A changed selection is announced, and moving focus is not how it is said.
   *
   * Up and Down move the selection without moving the camera or focus, and they
   * rewrite only `aria-label` and the variant class — neither of which is a text
   * change, so the region reads nothing for them. A screen-reader presenter would
   * arrow across a fork in silence and commit down a branch they were never told
   * they had chosen. The region carries the selection as text so the press has
   * something to announce.
   */
  it('announces the selected move when the selection changes', () => {
    const { rerender } = render(chrome({ moves: movesTo(['B', 'C', 'D'], 0) }));
    const region = screen.getByTestId('presenting-choices');
    expect(region).toHaveTextContent('Go to B');

    rerender(chrome({ moves: movesTo(['B', 'C', 'D'], 2) }));

    expect(region).toHaveTextContent('Go to D');
    expect(region).not.toHaveTextContent('Go to B');
  });

  /**
   * The control that performs a shortcut is the one that announces it
   * (`docs/agents/ui.md`, as `AddCardControl` does). The visible `Kbd` guidance is
   * presentation only, so without this the binding reaches nobody who cannot see it.
   *
   * Only the non-native keys. Space and Enter activate any focused button by
   * themselves, so announcing them would tell a screen-reader user what its own
   * button semantics already say. An unselected move performs no key of its own:
   * Up and Down move the selection rather than acting on one choice.
   */
  it('announces on each control the key that performs it', () => {
    render(chrome({ moves: movesTo(['B', 'C'], 0), canRetreat: true }));

    expect(screen.getByRole('button', { name: 'Go to B' })).toHaveAttribute(
      'aria-keyshortcuts',
      'ArrowRight',
    );
    expect(screen.getByRole('button', { name: 'Choose C' })).not.toHaveAttribute(
      'aria-keyshortcuts',
    );
    expect(screen.getByRole('button', { name: 'Back' })).toHaveAttribute(
      'aria-keyshortcuts',
      'ArrowLeft',
    );
    expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Escape',
    );
  });

  /** Only the commands the presenter can actually run from where they are. */
  it('lists the keyboard commands currently available and no others', () => {
    const { rerender } = render(chrome({ moves: movesTo(['B', 'C'], 0), canRetreat: true }));
    expect(guidance()).toEqual(['↑↓choose', '→go', '←back', 'Escoverview']);

    rerender(chrome({ moves: movesTo(['B'], 0), canRetreat: false }));
    expect(guidance()).toEqual(['→go', 'Escoverview']);

    rerender(chrome({ moves: [], canRetreat: true }));
    expect(guidance()).toEqual(['←back', 'Escoverview']);

    rerender(chrome({ moves: [], canRetreat: false }));
    expect(guidance()).toEqual(['Escoverview']);
  });

  /**
   * Presentation begins with focus on the control that carries it forward.
   *
   * Entry is a mouse click on the Sidebar's Present button, and that button is
   * the same DOM node that relabels to Overview — so React keeps focus on it and
   * the presenter is left focused on the control that *leaves*. Space, which
   * advances, would then defer to it and drop straight back to the overview. The
   * chrome claims focus as it mounts, which is what makes Space advance.
   */
  it('takes focus onto its primary control when presentation begins', () => {
    render(chrome({ moves: movesTo(['B', 'C'], 0) }));

    expect(screen.getByRole('button', { name: 'Go to B' })).toHaveFocus();
  });

  /**
   * Advancing and retreating destroy the control that ran them — the move list
   * is rebuilt from the Card arrived at — so the chrome owes focus to whatever
   * took their place.
   */
  it('restores focus to the newly selected move after advancing from the chrome', () => {
    const { rerender } = render(chrome({ moves: movesTo(['B'], 0) }));

    fireEvent.click(screen.getByRole('button', { name: 'Go to B' }));
    rerender(chrome({ moves: movesTo(['C', 'D'], 0), canRetreat: true }));

    expect(screen.getByRole('button', { name: 'Go to C' })).toHaveFocus();
  });

  it('restores focus to Back when advancing arrives at a sink it can leave', () => {
    const { rerender } = render(chrome({ moves: movesTo(['B'], 0) }));

    fireEvent.click(screen.getByRole('button', { name: 'Go to B' }));
    rerender(chrome({ moves: [], canRetreat: true }));

    expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
  });

  it('restores focus to Overview at a sink with nowhere to go back to', () => {
    const { rerender } = render(chrome({ moves: movesTo(['B'], 0) }));

    fireEvent.click(screen.getByRole('button', { name: 'Go to B' }));
    rerender(chrome({ moves: [], canRetreat: false }));

    expect(screen.getByRole('button', { name: 'Overview' })).toHaveFocus();
  });

  it('restores focus to the move it came back to after Back', () => {
    const { rerender } = render(chrome({ moves: [], canRetreat: true }));

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    rerender(chrome({ moves: movesTo(['C', 'D'], 1), canRetreat: false }));

    expect(screen.getByRole('button', { name: 'Go to D' })).toHaveFocus();
  });

  /**
   * The debt is the chrome's own, and only the chrome's. A traversal run from
   * the global arrow keys leaves focus where the presenter left it; taking it
   * into the chrome merely because Navigation changed is exactly what the shared
   * live region above exists to avoid.
   */
  it('leaves focus alone when the traversal did not start here', () => {
    const { rerender } = render(chrome({ moves: movesTo(['B'], 0) }));
    screen.getByRole('button', { name: 'Overview' }).focus();

    rerender(chrome({ moves: movesTo(['C', 'D'], 0), canRetreat: true }));

    expect(screen.getByRole('button', { name: 'Overview' })).toHaveFocus();
  });

  /**
   * A Graph's out-degree has no bound, so the choices are one row that scrolls
   * rather than a block that wraps over the Card being presented. A selection
   * changed with the arrow keys can therefore be off screen, and the row brings
   * it back.
   */
  /**
   * And only when it changes. `App` calls `navigation.moves()` during render, so
   * the array identity is fresh every time — keyed on that, the row re-scrolled
   * on every unrelated re-render and a presenter who had scrolled a wide fork
   * sideways to read a distant choice had it snapped back under them.
   */
  it('leaves the choices row alone when the selection did not change', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { rerender } = render(chrome({ moves: movesTo(['B', 'C', 'D'], 1) }));
    const before = scrollIntoView.mock.calls.length;

    // The same selection over a fresh array, which is what every App render hands it.
    rerender(chrome({ moves: movesTo(['B', 'C', 'D'], 1) }));

    expect(scrollIntoView.mock.calls.length).toBe(before);
  });

  it('scrolls the selected choice into view when the selection changes', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { rerender } = render(chrome({ moves: movesTo(['B', 'C', 'D'], 0) }));
    const before = scrollIntoView.mock.calls.length;

    rerender(chrome({ moves: movesTo(['B', 'C', 'D'], 2) }));

    expect(scrollIntoView.mock.calls.length).toBeGreaterThan(before);
    expect(scrollIntoView.mock.instances.at(-1)).toBe(
      screen.getByRole('button', { name: 'Go to D' }),
    );
  });
});
