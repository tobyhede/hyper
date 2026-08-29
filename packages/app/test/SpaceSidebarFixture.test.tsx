import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadSpaceSnapshot } from '@project/graph';
import { editedSnapshot } from '../stories/support/spaces';
import { SpaceSidebarFixture } from '../stories/support/SpaceSidebarFixture';

/**
 * jsdom ships none, and the Sidebar primitive observes its own container.
 * `SpaceSidebar.test.tsx` installs the same stub for the same reason.
 */
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
});

afterAll(() => vi.unstubAllGlobals());

/**
 * The story fixture composes **production** Navigation, so the state a Ladle
 * spec clicks its way into is Navigation's own: the selected renderer, the
 * Active Graph and the mode (ADR 0052, ADR 0053).
 *
 * That instance has to outlive a re-render. It was held in a `useMemo` keyed on
 * the fixture's props, which is two problems at once — React is free to discard
 * a memo, since a memo is a caching hint rather than a place to keep state, and
 * a key that changes rebuilds it outright. Either way every click the spec had
 * already made is silently undone, and the story then draws a Space nobody
 * navigated to.
 */
describe('the Space Sidebar story fixture', () => {
  it('keeps the renderer a story selected when a prop changes under it', () => {
    const { rerender } = render(<SpaceSidebarFixture />);
    fireEvent.click(screen.getByRole('button', { name: 'Collection 2' }));
    expect(screen.getByTestId('selected-canvas')).toHaveTextContent('Collection 2');

    rerender(<SpaceSidebarFixture presenting />);

    expect(screen.getByTestId('selected-canvas')).toHaveTextContent('Collection 2');
  });

  /**
   * Holding Navigation in state is what takes `presenting` out of a dependency
   * list, so the prop needs somewhere else to be honoured — a prop that quietly
   * stops meaning anything once a story is mounted is worse than the rebuild it
   * replaced. Both directions, because the prop is a mode and not a trigger.
   *
   * The Graph-section button is the observable: the sidebar draws an exit action
   * while a traversal is on, and `Present` otherwise.
   */
  it('still starts and ends presenting when the prop that says so changes', () => {
    const { rerender } = render(<SpaceSidebarFixture />);
    expect(screen.getByTestId('present-button')).toBeInTheDocument();

    rerender(<SpaceSidebarFixture presenting />);
    expect(screen.getByTestId('exit-presenting-button')).toBeInTheDocument();

    rerender(<SpaceSidebarFixture />);
    expect(screen.getByTestId('present-button')).toBeInTheDocument();
  });

  /**
   * The other half of holding Navigation across a re-render: it goes on reading
   * whichever Space the fixture is handed *now*.
   *
   * Navigation resolves every selection against `currentSpace()` — that is what
   * stops it naming a renderer the Space does not hold — so an instance that
   * outlives the prop it was built from must not have closed over the reader
   * that answered at mount. The row is drawn either way, because the sidebar's
   * list is derived from the prop directly; it is the click that would resolve
   * `Collection 3` against a Space with two Layouts and throw
   * `resolveRenderer`'s own refusal.
   *
   * `RetryableSpaceSidebarFixture` is the case in the catalogue: its Space
   * changes under the story when the session's submission lands. It supplies a
   * stable `currentSpace` of its own and so never depended on this — which is
   * exactly why nothing would have reported the loss.
   */
  it('resolves a selection against the Space it is handed now', () => {
    const edited = loadSpaceSnapshot(editedSnapshot);
    if (!edited.ok) throw new Error(edited.errors.map((error) => error.message).join('\n'));

    const { rerender } = render(<SpaceSidebarFixture />);
    rerender(<SpaceSidebarFixture space={edited.space} />);

    fireEvent.click(screen.getByRole('button', { name: 'Collection 3' }));

    expect(screen.getByTestId('selected-canvas')).toHaveTextContent('Collection 3');
  });
});
