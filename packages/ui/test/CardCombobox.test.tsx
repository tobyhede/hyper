import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CardCombobox, type CardChoice } from '../src/index';

/**
 * Radix's popover positions itself through Popper, which measures. jsdom ships
 * neither `ResizeObserver` nor pointer capture, and both are reached before the
 * popover can open at all.
 */
beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
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

const CHOICES: readonly CardChoice[] = [
  { id: 'card-a', title: 'Alpha', kind: 'markdown' },
  { id: 'card-b', title: 'Beta', kind: 'alias' },
  {
    id: 'card-c',
    title: 'Gamma',
    kind: 'markdown',
    refusal: 'That Edge already exists.',
  },
];

function open(onValueChange = vi.fn()) {
  render(
    <CardCombobox
      label="To"
      testId="edge-to"
      choices={CHOICES}
      value="card-a"
      onValueChange={onValueChange}
    />,
  );
  fireEvent.click(screen.getByRole('combobox', { name: 'To' }));
  return onValueChange;
}

describe('CardCombobox', () => {
  /**
   * The collapsed trigger names the field and shows what it currently holds, so
   * an Edge editor drawn over the canvas says which Card each endpoint is
   * without opening anything.
   */
  it('names the field and shows the chosen Card before it is opened', () => {
    render(
      <CardCombobox label="To" choices={CHOICES} value="card-a" onValueChange={() => undefined} />,
    );

    expect(screen.getByRole('combobox', { name: 'To' })).toHaveTextContent('Alpha');
  });

  /**
   * A refused choice keeps its place and says why *in the row*. Filtering it out
   * would leave an author searching for a Card the list simply does not show;
   * a tooltip needs a hover a keyboard author never makes.
   */
  it('keeps a refused choice in the list, disabled, with its reason on the row', () => {
    open();

    const refused = screen.getByRole('option', { name: /Gamma/ });
    expect(refused).toHaveAttribute('data-disabled', 'true');
    expect(refused).toHaveTextContent('That Edge already exists.');
  });

  /**
   * The eligible rows carry `data-disabled="false"` rather than no attribute at
   * all — cmdk writes it on every row. Pinned because a selector that tests for
   * the attribute's *absence* silently matches nothing, which is how the e2e
   * picked an eligible option only by luck.
   */
  it('marks an eligible choice with an explicit false', () => {
    open();

    expect(screen.getByRole('option', { name: /Beta/ })).toHaveAttribute('data-disabled', 'false');
  });

  it('answers the chosen Card and closes', () => {
    const onValueChange = open();

    fireEvent.click(screen.getByRole('option', { name: /Beta/ }));

    expect(onValueChange).toHaveBeenCalledWith('card-b');
    expect(screen.queryByRole('option', { name: /Beta/ })).not.toBeInTheDocument();
  });

  /**
   * The search matches the **title**, not the value. Every row's value is a
   * Card's UUID, so cmdk's default fuzzy score over the value would rank a
   * one-letter search by hex noise.
   */
  it('searches titles rather than the ids behind them', () => {
    open();

    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'gam' } });

    expect(screen.getByRole('option', { name: /Gamma/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Alpha/ })).not.toBeInTheDocument();
  });

  /**
   * Two comboboxes exist while the popover is open — the trigger and cmdk's
   * input — so the input is named `Search` to keep the field's own name
   * unambiguous to a reader and to a `getByRole` locator.
   */
  it('leaves the field name on the trigger alone when the list is open', () => {
    open();

    expect(screen.getAllByRole('combobox', { name: 'To' })).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: 'Search' })).toBeInTheDocument();
  });

  /**
   * The popup is portalled out of React Flow's `.nokey` canvas subtree, so the
   * popup itself carries the key guard. Escape remains the ordinary close and
   * returns a keyboard author to the field that opened it.
   */
  it('guards its portalled popup and returns focus to the trigger after Escape', async () => {
    render(
      <CardCombobox
        label="To"
        testId="edge-to"
        choices={CHOICES}
        value="card-a"
        onValueChange={vi.fn()}
      />,
    );

    // Browsers focus a pressed button before dispatching its click; fireEvent
    // does not, so make the keyboard path explicit in jsdom. This is also what
    // `FloatingFocusManager` records as the element to return focus to.
    const trigger = screen.getByRole('combobox', { name: 'To' });
    trigger.focus();
    fireEvent.click(trigger);

    const search = screen.getByRole('combobox', { name: 'Search' });
    expect(search.closest('.nokey')).not.toBeNull();

    /*
     * The popup does not take focus **in jsdom**, and that is the environment
     * rather than the component: Base UI's default `initialFocus` resolves to
     * `true`, which asks `tabbable` for the first tabbable descendant, and
     * `tabbable` needs layout — every element in jsdom measures 0×0 with no
     * `offsetParent`, so it finds none and focus stays on the trigger. A real
     * browser lands on this search input. Putting focus there by hand is what
     * makes the return leg below a round trip instead of a tautology: with the
     * trigger still focused, `toHaveFocus()` at the end passes whether or not
     * anything ever returned it, which is exactly how this test used to pass
     * with focus restoration switched off entirely.
     */
    search.focus();
    expect(search).toHaveFocus();

    fireEvent.keyDown(search, { key: 'Escape' });

    expect(screen.queryByRole('combobox', { name: 'Search' })).not.toBeInTheDocument();
    // The restore is deferred: the focus manager's cleanup reads the close type
    // and then focuses the return element from a `queueMicrotask`, so focus is
    // still on `<body>` for the rest of this tick.
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
