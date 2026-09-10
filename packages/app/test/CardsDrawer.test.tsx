import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type Card, type UUID } from '@project/core';
import { CardsDrawer, CARD_DRAG_TYPE } from '../src/components/CardsDrawer';

const id = (suffix: string) => uuidSchema.parse(`00000000-0000-4000-8000-${suffix}`);

const CARDS: readonly Card[] = [
  { id: id('000000000001'), title: 'Zulu', kind: 'markdown', body: '' },
  { id: id('000000000002'), title: 'Alpha', kind: 'space', spaceId: id('000000000012') },
  { id: id('000000000003'), title: 'Alpha', kind: 'markdown', body: '' },
  {
    id: id('000000000004'),
    title: 'Constraints',
    kind: 'alias',
    target: id('000000000003'),
  },
];

/** No target Space read yet, which is what a Space Card meets on the first render. */
const NO_SPACE_TITLES: ReadonlyMap<UUID, string> = new Map();

/** The composition the shell writes: a self-opening drawer beside the surface it feeds. */
function Fixture({
  cards = CARDS,
  allCards = CARDS,
  disabled = false,
  onAdd = vi.fn(),
  onDragStart = vi.fn(),
  spaceTitleById = NO_SPACE_TITLES,
}: {
  readonly cards?: readonly Card[];
  readonly allCards?: readonly Card[];
  readonly disabled?: boolean;
  readonly onAdd?: (card: Card, activation: 'keyboard' | 'pointer') => string | null;
  readonly onDragStart?: (cardId: Card['id']) => void;
  readonly spaceTitleById?: ReadonlyMap<UUID, string>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button">The canvas behind it</button>
      <CardsDrawer
        cards={cards}
        allCards={allCards}
        open={open}
        onOpenChange={setOpen}
        disabled={disabled}
        onAdd={onAdd}
        onDragStart={onDragStart}
        spaceTitleById={spaceTitleById}
      />
    </>
  );
}

const openDrawer = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
  return await screen.findByRole('dialog', { name: 'Cards' });
};

const cardButtons = () => screen.getAllByRole('button', { name: /^Add .* to Diagram$/ });

describe('CardsDrawer', () => {
  it('opens from its own trigger as a named dialog', async () => {
    render(<Fixture />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await openDrawer()).toBeVisible();
    // The drawer draws no *visible* heading (the spec's "no heading or
    // explanatory exposition"), but the title stays in the accessibility tree
    // as `sr-only` — the repo's pattern for exactly this, at `CardPane` and at
    // the `Sidebar` sheet. `hidden` would name the dialog and then withhold the
    // heading from anyone navigating by heading.
    const title = screen.getByRole('heading', { name: 'Cards' });
    expect(title).toHaveClass('sr-only');
  });

  it('withdraws its trigger without losing the surface it names', () => {
    render(<Fixture disabled />);

    expect(screen.getByRole('button', { name: 'Cards' })).toBeDisabled();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<Fixture />);
    const trigger = screen.getByRole('button', { name: 'Cards' });
    const popup = await openDrawer();

    fireEvent.keyDown(popup, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('closes from the control in its own header, not only from Escape or the trigger', async () => {
    render(<Fixture />);
    const popup = await openDrawer();

    fireEvent.click(within(popup).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('survives a press on the surface behind it, which is where every Card is dropped', async () => {
    render(<Fixture />);
    await openDrawer();

    const behind = screen.getByRole('button', { name: 'The canvas behind it' });
    act(() => {
      fireEvent.pointerDown(behind);
      fireEvent.mouseDown(behind);
      fireEvent.click(behind);
      behind.focus();
    });

    expect(screen.getByRole('dialog', { name: 'Cards' })).toBeVisible();
  });

  it('offers absent Cards alphabetically with stable Space order and no canvas handles', async () => {
    render(<Fixture />);
    await openDrawer();

    expect(cardButtons()).toHaveLength(4);
    expect(cardButtons().map((card) => card.textContent)).toEqual([
      'Alpha',
      'Alpha',
      'Constraints',
      'Zulu',
    ]);
    expect(document.querySelector('.react-flow__handle')).not.toBeInTheDocument();
  });

  it('filters by kind and search, then activates the matching Card', async () => {
    const onAdd = vi.fn();
    render(<Fixture onAdd={onAdd} />);
    await openDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'Filter cards by kind' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Markdown' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search cards' }), {
      target: { value: 'zul' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Zulu to Diagram' }), { detail: 1 });

    expect(onAdd).toHaveBeenCalledWith(CARDS[0], 'pointer');
    expect(screen.queryByRole('button', { name: 'Add Alpha to Diagram' })).not.toBeInTheDocument();
  });

  /**
   * A row names the Card it adds, so it names it by the Card's **name** — while
   * the search behind it still reads the whole Title (ADR 0083).
   *
   * The two halves are the same division `CardSearchCombobox` makes and for the
   * same reason: an author's recall does not respect which line they typed a
   * word on, and a control called `Add Auth\nHow a session begins to Diagram` is
   * a broken-looking label.
   */
  it('adds a Card by name and finds it by any line of its Title', async () => {
    const laddered: readonly Card[] = [
      { id: id('000000000005'), title: 'Auth\nHow a session begins', kind: 'markdown', body: '' },
      ...CARDS,
    ];
    render(<Fixture cards={laddered} allCards={laddered} />);
    await openDrawer();

    expect(screen.getByRole('button', { name: 'Add Auth to Diagram' })).toBeVisible();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search cards' }), {
      target: { value: 'session begins' },
    });

    expect(cardButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add Auth to Diagram',
    ]);
  });

  it('keeps an authoring refusal in the drawer that asked for the Card', async () => {
    render(<Fixture onAdd={() => 'This Card is no longer available.'} />);
    await openDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'Add Zulu to Diagram' }));

    expect(screen.getByRole('alert')).toHaveTextContent('This Card is no longer available.');
    expect(screen.getByRole('button', { name: 'Add Zulu to Diagram' })).toBeVisible();
  });

  it('carries the Card id on the drag it starts', async () => {
    const onDragStart = vi.fn();
    render(<Fixture onDragStart={onDragStart} />);
    await openDrawer();

    const setData = vi.fn();
    fireEvent.dragStart(screen.getByRole('button', { name: 'Add Zulu to Diagram' }), {
      dataTransfer: { setData, effectAllowed: 'none' },
    });

    expect(setData).toHaveBeenCalledWith(CARD_DRAG_TYPE, CARDS[0]?.id);
    expect(onDragStart).toHaveBeenCalledWith(CARDS[0]?.id);
  });

  it('exempts the Card list from the swipe that dismisses the drawer', async () => {
    render(<Fixture />);
    const popup = await openDrawer();

    // Base UI's swipe gesture and an HTML5 Card drag both begin with a press.
    // The list opts out for all input types so the press starts the drag.
    const list = popup.querySelector('[data-base-ui-swipe-ignore]');
    expect(list).not.toBeNull();
    expect(list).toContainElement(screen.getByRole('button', { name: 'Add Zulu to Diagram' }));
  });

  it('distinguishes an empty Space from a Diagram that already contains every Card', async () => {
    const view = render(<Fixture cards={[]} allCards={[]} />);
    await openDrawer();
    expect(screen.getByText('This Space has no Cards.')).toBeVisible();

    // Rerendering keeps the drawer open, so the second message is read in place
    // rather than through a toggle that would close it.
    view.rerender(<Fixture cards={[]} allCards={CARDS} />);
    expect(await screen.findByText('All Cards are in this Diagram.')).toBeVisible();
  });

  it('forgets its query and kind when it closes, so the next open lists everything', async () => {
    render(<Fixture />);
    await openDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'Filter cards by kind' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Markdown' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search cards' }), {
      target: { value: 'zul' },
    });
    expect(cardButtons()).toHaveLength(1);

    // Only the popup unmounts, so nothing resets the filter for us the way
    // unmounting the whole panel used to.
    fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await openDrawer();

    expect(screen.getByRole('textbox', { name: 'Search cards' })).toHaveValue('');
    expect(cardButtons()).toHaveLength(4);
  });

  it('finds an Alias by its Target title', async () => {
    render(<Fixture />);
    await openDrawer();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search cards' }), {
      target: { value: 'Alpha' },
    });

    expect(screen.getByRole('button', { name: 'Add Constraints to Diagram' })).toBeVisible();
  });

  /**
   * The corpus takes the Target's *whole* Title and not its name, which is the
   * same division the Card's own Title gets above and the same one
   * `CardSearchCombobox` makes (ADR 0083). An Alias is a second position for a
   * Card, so a reader recalls it by anything that named the Card it shows.
   */
  it('finds an Alias by a later line of its Target’s Title', async () => {
    const laddered: readonly Card[] = [
      { id: id('000000000003'), title: 'Alpha\nHow a session begins', kind: 'markdown', body: '' },
      { id: id('000000000004'), title: 'Constraints', kind: 'alias', target: id('000000000003') },
    ];
    render(<Fixture cards={laddered} allCards={laddered} />);
    await openDrawer();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search cards' }), {
      target: { value: 'session begins' },
    });

    expect(cardButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add Alpha to Diagram',
      'Add Constraints to Diagram',
    ]);
  });

  it('finds a Space Card by its target Space title', async () => {
    render(<Fixture spaceTitleById={new Map([[id('000000000012'), 'Roadmap']])} />);
    await openDrawer();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search cards' }), {
      target: { value: 'Roadmap' },
    });

    expect(screen.getByRole('button', { name: 'Add Alpha to Diagram' })).toBeVisible();
    expect(cardButtons()).toHaveLength(1);
  });

  /** The titles arrive from a read that outlives the mount, so the list has to recompute. */
  it('finds a Space Card by a target title that arrives after the first render', async () => {
    const view = render(<Fixture />);
    await openDrawer();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search cards' }), {
      target: { value: 'Roadmap' },
    });
    expect(screen.queryByRole('button', { name: /^Add .* to Diagram$/ })).not.toBeInTheDocument();

    view.rerender(<Fixture spaceTitleById={new Map([[id('000000000012'), 'Roadmap']])} />);

    expect(screen.getByRole('button', { name: 'Add Alpha to Diagram' })).toBeVisible();
  });

  it('lists an Alias whose Target is absent from allCards', async () => {
    const dangling: readonly Card[] = [
      { id: id('000000000005'), title: 'Stray', kind: 'alias', target: id('000000000009') },
    ];
    render(<Fixture cards={dangling} allCards={dangling} />);
    await openDrawer();

    expect(screen.getByRole('button', { name: 'Add Stray to Diagram' })).toHaveTextContent('Stray');
  });
});
