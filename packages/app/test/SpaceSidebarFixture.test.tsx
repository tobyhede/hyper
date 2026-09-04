import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
 * spec clicks its way into is Navigation's own: the selected Layout, the
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
  it('keeps the Layout a story selected when a prop changes under it', () => {
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
   * stops it naming a Layout the Space does not hold — so an instance that
   * outlives the prop it was built from must not have closed over the reader
   * that answered at mount. The row is drawn either way, because the sidebar's
   * list is derived from the prop directly; it is the click that would resolve
   * `Collection 3` against a Space with two Layouts and throw
   * `resolveLayout`'s own refusal.
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

  it('authors a title against the Space it is handed now', async () => {
    const edited = loadSpaceSnapshot(editedSnapshot);
    if (!edited.ok) throw new Error(edited.errors.map((error) => error.message).join('\n'));

    const { rerender } = render(<SpaceSidebarFixture />);
    rerender(<SpaceSidebarFixture space={edited.space} />);

    const collection = screen.getByRole('button', { name: 'Collection 3' });
    fireEvent.click(collection);
    fireEvent.click(collection);
    const title = screen.getByRole('textbox', { name: 'Layout name' });
    fireEvent.change(title, { target: { value: 'Renamed collection' } });
    fireEvent.keyDown(title, { key: 'Enter' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Renamed collection' })).toBeVisible(),
    );
  });

  /**
   * A rename begun from the actions menu leaves the caret somewhere a keyboard
   * can carry on from.
   *
   * The menu item is inside a popup that is gone by the time the editor
   * commits, so the row is re-found by its addressing attribute rather than
   * held on to — and both branches of the row carry that attribute, the editing
   * one on an unfocusable `div`. `onReturnFocus` fires from inside the key
   * handler, before React has swapped the branch back, so a selector that
   * stops at the addressed element focuses the `div` and the caret lands on
   * `<body>` when the editor unmounts. The row `<li>` is the element that
   * survives the swap, which is why the click path already focuses it.
   */
  it.each([
    {
      row: 'Layout',
      open: 'Actions for Layout Collection 1',
      field: 'Layout name',
      renamed: 'Renamed from the Layout menu',
    },
    {
      row: 'Graph',
      open: 'Actions for Graph Long',
      field: 'Graph name',
      renamed: 'Renamed from the Graph menu',
    },
  ])('returns focus to the $row row it renamed from the actions menu', async (subject) => {
    render(<SpaceSidebarFixture />);
    fireEvent.click(screen.getByRole('button', { name: subject.open }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    const title = await screen.findByRole('textbox', { name: subject.field });
    fireEvent.change(title, { target: { value: subject.renamed } });
    fireEvent.keyDown(title, { key: 'Enter' });

    const row = await screen.findByRole('button', { name: subject.renamed });
    expect(row.closest('li')).toHaveFocus();
  });

  /**
   * The fixture's Edits are behind production's condition, not a shorter one.
   *
   * `App.tsx` withdraws Rename and Delete Layout on two terms — the chrome
   * title edit being disabled, *and* no chrome title edit already running — so
   * a menu never offers a second start to the Edit already holding the caret.
   * The fixture read the first term only, which is exactly the kind of
   * divergence ADR 0052 has a story owe an application proof for: a menu in the
   * catalogue offering a command the application withholds is worse evidence
   * than no story.
   *
   * Observed on a *different* row, because the row being renamed withholds its
   * whole trigger anyway (`EntityActionsRow`), so it could never have shown the
   * difference.
   */
  it('withholds Rename from every row while a rename is already running', async () => {
    render(<SpaceSidebarFixture />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Layout Collection 1' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const title = await screen.findByRole('textbox', { name: 'Layout name' });

    // Blanked, so that opening the second menu cannot end the first Edit
    // underneath the assertion. `InlineTitleEditor` completes on blur, and a
    // blur is exactly what a popup taking focus produces — but a blank title is
    // refused, and a refused completion keeps the editor up with the caret in
    // it. The rename this is about is live either way; what the blank buys is
    // that it is *still* live at the moment the menu is read.
    fireEvent.change(title, { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Graph Long' }));

    // Copying stays: an address is a fact about the entity rather than an Edit,
    // so it is in front of this condition in production too.
    expect(await screen.findByRole('menuitem', { name: /^Copy link/ })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Layout name' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument();
  });
});
