import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type Card } from '@project/core';
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

/** The composition the shell writes: a self-opening drawer beside the surface it feeds. */
function Fixture({
  cards = CARDS,
  allCards = CARDS,
  disabled = false,
  onAdd = vi.fn(),
  onDragStart = vi.fn(),
}: {
  readonly cards?: readonly Card[];
  readonly allCards?: readonly Card[];
  readonly disabled?: boolean;
  readonly onAdd?: (card: Card, activation: 'keyboard' | 'pointer') => string | null;
  readonly onDragStart?: (cardId: Card['id']) => void;
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
      />
    </>
  );
}

const openDrawer = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
  return await screen.findByRole('dialog', { name: 'Cards' });
};

const cardButtons = () => screen.getAllByRole('button', { name: /^Add .* to Layout$/ });

describe('CardsDrawer', () => {
  it('opens from its own trigger as a named dialog', async () => {
    render(<Fixture />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await openDrawer()).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Cards' })).not.toBeInTheDocument();
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
      'ConstraintsAlpha',
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
    fireEvent.click(screen.getByRole('button', { name: 'Add Zulu to Layout' }), { detail: 1 });

    expect(onAdd).toHaveBeenCalledWith(CARDS[0], 'pointer');
    expect(screen.queryByRole('button', { name: 'Add Alpha to Layout' })).not.toBeInTheDocument();
  });

  it('keeps an authoring refusal in the drawer that asked for the Card', async () => {
    render(<Fixture onAdd={() => 'This Card is no longer available.'} />);
    await openDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'Add Zulu to Layout' }));

    expect(screen.getByRole('alert')).toHaveTextContent('This Card is no longer available.');
    expect(screen.getByRole('button', { name: 'Add Zulu to Layout' })).toBeVisible();
  });

  it('carries the Card id on the drag it starts', async () => {
    const onDragStart = vi.fn();
    render(<Fixture onDragStart={onDragStart} />);
    await openDrawer();

    const setData = vi.fn();
    fireEvent.dragStart(screen.getByRole('button', { name: 'Add Zulu to Layout' }), {
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
    expect(list).toContainElement(screen.getByRole('button', { name: 'Add Zulu to Layout' }));
  });

  it('distinguishes an empty Space from a Layout that already contains every Card', async () => {
    const view = render(<Fixture cards={[]} allCards={[]} />);
    await openDrawer();
    expect(screen.getByText('This Space has no Cards.')).toBeVisible();

    // Rerendering keeps the drawer open, so the second message is read in place
    // rather than through a toggle that would close it.
    view.rerender(<Fixture cards={[]} allCards={CARDS} />);
    expect(await screen.findByText('All Cards are in this Layout.')).toBeVisible();
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

  it('finds an Alias by its visible Target title', async () => {
    render(<Fixture />);
    await openDrawer();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search cards' }), {
      target: { value: 'Alpha' },
    });

    expect(screen.getByRole('button', { name: 'Add Constraints to Layout' })).toBeVisible();
  });

  it('shows no Target name for an Alias whose Target is absent from allCards', async () => {
    const dangling: readonly Card[] = [
      { id: id('000000000005'), title: 'Stray', kind: 'alias', target: id('000000000009') },
    ];
    render(<Fixture cards={dangling} allCards={dangling} />);
    await openDrawer();

    const card = screen.getByRole('button', { name: 'Add Stray to Layout' });
    expect(card).not.toHaveTextContent('Unavailable Card');
  });
});
