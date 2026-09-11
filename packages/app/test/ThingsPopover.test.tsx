import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type Thing, type UUID } from '@project/core';
import { ThingsPopover, THING_DRAG_TYPE } from '../src/components/ThingsPopover';

const id = (suffix: string) => uuidSchema.parse(`00000000-0000-4000-8000-${suffix}`);

const THINGS: readonly Thing[] = [
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

/** No target Space read yet, which is what a Space Thing meets on the first render. */
const NO_SPACE_TITLES: ReadonlyMap<UUID, string> = new Map();

/**
 * The composition the Dock writes: the list beside the surface it feeds.
 *
 * Everything below asserts that a popup or a row is **mounted** rather than
 * visible. Base UI's Positioner holds a popup at `opacity: 0` until it has
 * measured its anchor, and jsdom answers every measurement with zeroes, so
 * `toBeVisible` cannot pass for any popover in this tree — `SelectedEdgeControls`
 * reads the same way. The visibility half of this evidence is
 * `ladle-e2e/things-popover.spec.ts`, which runs in a real browser.
 */
function Fixture({
  things = THINGS,
  allThings = THINGS,
  disabled = false,
  onAdd = vi.fn(),
  onDragStart = vi.fn(),
  spaceTitleById = NO_SPACE_TITLES,
  spaces,
  onAddSpace,
}: {
  readonly things?: readonly Thing[];
  readonly allThings?: readonly Thing[];
  readonly disabled?: boolean;
  readonly onAdd?: (thing: Thing, activation: 'keyboard' | 'pointer') => string | null;
  readonly onDragStart?: (thingId: Thing['id']) => void;
  readonly spaceTitleById?: ReadonlyMap<UUID, string>;
  readonly spaces?: readonly { readonly id: UUID; readonly title: string }[];
  readonly onAddSpace?: (space: {
    readonly id: UUID;
    readonly title: string;
  }) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button">The canvas behind it</button>
      <ThingsPopover
        things={things}
        allThings={allThings}
        open={open}
        onOpenChange={setOpen}
        disabled={disabled}
        onAdd={onAdd}
        onDragStart={onDragStart}
        spaceTitleById={spaceTitleById}
        spaces={spaces}
        onAddSpace={onAddSpace}
      />
    </>
  );
}

const openList = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Things' }));
  return await screen.findByRole('dialog', { name: 'Things' });
};

const thingButtons = () => screen.getAllByRole('button', { name: /^Add .* to Diagram$/ });

describe('ThingsPopover', () => {
  it('opens from its own trigger, anchored and named', async () => {
    render(<Fixture />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const popup = await openList();
    // Named by the surface rather than by a heading inside it. The drawer this
    // replaced carried an `sr-only` title because a `Drawer` is a screen-level
    // dialog a reader may navigate to by heading; an anchored popover is
    // reached from the control that names it, and that control's word is the
    // name — one region, one caption, said once.
    expect(popup).toHaveAccessibleName('Things');
  });

  it('withdraws its trigger without losing the surface it names', () => {
    render(<Fixture disabled />);

    expect(screen.getByRole('button', { name: 'Things' })).toBeDisabled();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<Fixture />);
    const trigger = screen.getByRole('button', { name: 'Things' });
    const popup = await openList();

    fireEvent.keyDown(popup, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('closes from the trigger that opened it, which is the control that names it', async () => {
    render(<Fixture />);
    await openList();

    // No Close inside the surface, and that is the shape rather than a gap in
    // it: a drawer is a screen-level panel that owes a way out of itself, while
    // an anchored popover is dismissed from the control it hangs off — the same
    // way every menu in the Dock beside it is.
    fireEvent.click(screen.getByRole('button', { name: 'Things' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('survives a press on the surface behind it, which is where every Thing is dropped', async () => {
    render(<Fixture />);
    await openList();

    const behind = screen.getByRole('button', { name: 'The canvas behind it' });
    act(() => {
      fireEvent.pointerDown(behind);
      fireEvent.mouseDown(behind);
      fireEvent.click(behind);
      behind.focus();
    });

    expect(screen.getByRole('dialog', { name: 'Things' })).toBeInTheDocument();
  });

  it('offers absent Things alphabetically with stable Space order and no canvas handles', async () => {
    render(<Fixture />);
    await openList();

    expect(thingButtons()).toHaveLength(4);
    expect(thingButtons().map((thing) => thing.textContent)).toEqual([
      'Alpha',
      'Alpha',
      'Constraints',
      'Zulu',
    ]);
    expect(document.querySelector('.react-flow__handle')).not.toBeInTheDocument();
  });

  it('filters by kind and search, then activates the matching Thing', async () => {
    const onAdd = vi.fn();
    render(<Fixture onAdd={onAdd} />);
    await openList();

    // Everything starts on, so narrowing means pressing the kinds you do not
    // want to see *off*.
    fireEvent.click(screen.getByRole('button', { name: /^Aliases, \d+$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Space Things in this Space, \d+$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Spaces in this Meta Space, \d+$/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search things' }), {
      target: { value: 'zul' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Zulu to Diagram' }), { detail: 1 });

    expect(onAdd).toHaveBeenCalledWith(THINGS[0], 'pointer');
    expect(screen.queryByRole('button', { name: 'Add Alpha to Diagram' })).not.toBeInTheDocument();
  });

  /**
   * A row names the Thing it adds, so it names it by the Thing's **name** — while
   * the search behind it still reads the whole Title (ADR 0083).
   *
   * The two halves are the same division `ThingSearchCombobox` makes and for the
   * same reason: an author's recall does not respect which line they typed a
   * word on, and a control called `Add Auth\nHow a session begins to Diagram` is
   * a broken-looking label.
   */
  it('adds a Thing by name and finds it by any line of its Title', async () => {
    const laddered: readonly Thing[] = [
      { id: id('000000000005'), title: 'Auth\nHow a session begins', kind: 'markdown', body: '' },
      ...THINGS,
    ];
    render(<Fixture things={laddered} allThings={laddered} />);
    await openList();

    expect(screen.getByRole('button', { name: 'Add Auth to Diagram' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search things' }), {
      target: { value: 'session begins' },
    });

    expect(thingButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add Auth to Diagram',
    ]);
  });

  /**
   * The one piece of custom focus behaviour on this surface, and the reason it
   * exists is written above `filterField` in the component.
   */
  it('puts the caret back in the filter when a keyboard Add takes its own row away', async () => {
    render(<Fixture onAdd={() => null} />);
    await openList();

    const row = screen.getByRole('button', { name: 'Add Zulu to Diagram' });
    act(() => {
      row.focus();
    });
    fireEvent.click(row, { detail: 0 });

    expect(screen.getByRole('textbox', { name: 'Search things' })).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Things' })).toBeInTheDocument();
  });

  it('leaves the caret alone when a pointer Add takes a row away', async () => {
    render(<Fixture onAdd={() => null} />);
    await openList();

    // The list opens with the caret already in its filter, so the claim only
    // means anything from somewhere else: a pointer Add moves focus nowhere,
    // where a keyboard Add puts it back.
    act(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Zulu to Diagram' }), { detail: 1 });

    expect(screen.getByRole('textbox', { name: 'Search things' })).not.toHaveFocus();
  });

  it('keeps an authoring refusal in the list that asked for the Thing', async () => {
    render(<Fixture onAdd={() => 'This Thing is no longer available.'} />);
    await openList();

    fireEvent.click(screen.getByRole('button', { name: 'Add Zulu to Diagram' }));

    expect(screen.getByRole('alert')).toHaveTextContent('This Thing is no longer available.');
    expect(screen.getByRole('button', { name: 'Add Zulu to Diagram' })).toBeInTheDocument();
  });

  it('carries the Thing id on the drag it starts', async () => {
    const onDragStart = vi.fn();
    render(<Fixture onDragStart={onDragStart} />);
    await openList();

    const setData = vi.fn();
    fireEvent.dragStart(screen.getByRole('button', { name: 'Add Zulu to Diagram' }), {
      dataTransfer: { setData, effectAllowed: 'none' },
    });

    expect(setData).toHaveBeenCalledWith(THING_DRAG_TYPE, THINGS[0]?.id);
    expect(onDragStart).toHaveBeenCalledWith(THINGS[0]?.id);
  });

  it('keeps focus leaving it from dismissing it, which a drag out of it is', async () => {
    render(<Fixture />);
    await openList();

    // The other half of the press above, seen from the focus side: an HTML5
    // drag moves focus out of the list, and a plain non-modal popover treats
    // that as a dismissal. Adding several Things in a row is the ordinary case.
    const behind = screen.getByRole('button', { name: 'The canvas behind it' });
    act(() => {
      behind.focus();
      fireEvent.focusOut(screen.getByRole('button', { name: 'Add Zulu to Diagram' }));
    });

    expect(screen.getByRole('dialog', { name: 'Things' })).toBeInTheDocument();
  });

  it('distinguishes an empty Space from a Diagram that already contains every Thing', async () => {
    const view = render(<Fixture things={[]} allThings={[]} />);
    await openList();
    expect(screen.getByText('This Space has no Things.')).toBeInTheDocument();

    // Rerendering keeps the list open, so the second message is read in place
    // rather than through a toggle that would close it.
    view.rerender(<Fixture things={[]} allThings={THINGS} />);
    expect(await screen.findByText('All Things are in this Diagram.')).toBeInTheDocument();
  });

  it('forgets its query and kind when it closes, so the next open lists everything', async () => {
    render(<Fixture />);
    await openList();

    fireEvent.click(screen.getByRole('button', { name: /^Aliases, \d+$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Space Things in this Space, \d+$/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search things' }), {
      target: { value: 'zul' },
    });
    expect(thingButtons()).toHaveLength(1);

    // Only the popup unmounts, so nothing resets the filter for us the way
    // unmounting the whole surface would.
    fireEvent.click(screen.getByRole('button', { name: 'Things' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await openList();

    expect(screen.getByRole('textbox', { name: 'Search things' })).toHaveValue('');
    expect(thingButtons()).toHaveLength(4);
  });

  it('finds an Alias by its Target title', async () => {
    render(<Fixture />);
    await openList();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search things' }), {
      target: { value: 'Alpha' },
    });

    expect(screen.getByRole('button', { name: 'Add Constraints to Diagram' })).toBeInTheDocument();
  });

  /**
   * The corpus takes the Target's *whole* Title and not its name, which is the
   * same division the Thing's own Title gets above and the same one
   * `ThingSearchCombobox` makes (ADR 0083). An Alias is a second position for a
   * Thing, so a reader recalls it by anything that named the Thing it shows.
   */
  it('finds an Alias by a later line of its Target’s Title', async () => {
    const laddered: readonly Thing[] = [
      { id: id('000000000003'), title: 'Alpha\nHow a session begins', kind: 'markdown', body: '' },
      { id: id('000000000004'), title: 'Constraints', kind: 'alias', target: id('000000000003') },
    ];
    render(<Fixture things={laddered} allThings={laddered} />);
    await openList();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search things' }), {
      target: { value: 'session begins' },
    });

    expect(thingButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add Alpha to Diagram',
      'Add Constraints to Diagram',
    ]);
  });

  it('finds a Space Thing by its target Space title', async () => {
    render(<Fixture spaceTitleById={new Map([[id('000000000012'), 'Roadmap']])} />);
    await openList();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search things' }), {
      target: { value: 'Roadmap' },
    });

    expect(screen.getByRole('button', { name: 'Add Alpha to Diagram' })).toBeInTheDocument();
    expect(thingButtons()).toHaveLength(1);
  });

  /** The titles arrive from a read that outlives the mount, so the list has to recompute. */
  it('finds a Space Thing by a target title that arrives after the first render', async () => {
    const view = render(<Fixture />);
    await openList();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search things' }), {
      target: { value: 'Roadmap' },
    });
    expect(screen.queryByRole('button', { name: /^Add .* to Diagram$/ })).not.toBeInTheDocument();

    view.rerender(<Fixture spaceTitleById={new Map([[id('000000000012'), 'Roadmap']])} />);

    expect(screen.getByRole('button', { name: 'Add Alpha to Diagram' })).toBeInTheDocument();
  });

  it('starts with every kind shown, so nothing is hidden before the reader asks', async () => {
    render(<Fixture />);
    await openList();

    // The name carries the count, because a badge with a bare number in it
    // contributes nothing to a control that has its own label.
    for (const [name, count] of [
      ['Markdown Things', 2],
      ['Aliases', 1],
      ['Space Things in this Space', 1],
      ['Spaces in this Meta Space', 0],
    ] as const) {
      const toggle = screen.getByRole('button', { name: `${name}, ${String(count)}` });
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
    }
  });

  /**
   * The count's whole job, and the cost the comparison recorded against it: a
   * number beside a name that disagrees with the rows under it is worse than no
   * number.
   */
  it('counts what each switch contributes under the current search, not what the Space holds', async () => {
    render(<Fixture spaces={[{ id: id('000000000020'), title: 'Blueprint' }]} />);
    await openList();

    expect(screen.getByRole('button', { name: 'Markdown Things, 2' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Spaces in this Meta Space, 1' }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search things' }), {
      target: { value: 'zul' },
    });

    // One Markdown Thing matches and nothing else does, and every switch says so
    // — including the ones that now contribute nothing, because a switch that is
    // off has to say what turning it on would bring back.
    expect(screen.getByRole('button', { name: 'Markdown Things, 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aliases, 0' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Spaces in this Meta Space, 0' }),
    ).toBeInTheDocument();
    expect(thingButtons()).toHaveLength(1);
  });

  /**
   * A switch that is off still counts, because the number is what tells the
   * reader whether turning it back on is worth the press.
   */
  it('goes on counting a kind the reader has switched off', async () => {
    render(<Fixture />);
    await openList();

    fireEvent.click(screen.getByRole('button', { name: /^Aliases, \d+$/ }));

    expect(screen.getByRole('button', { name: 'Aliases, 1' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      screen.queryByRole('button', { name: 'Add Constraints to Diagram' }),
    ).not.toBeInTheDocument();
  });

  /**
   * The pair the filter exists to keep apart: a Space Thing is one framed view
   * placed in a Diagram, and a Space is the volume such a view is a view of
   * (ADR 0074).
   */
  it('offers the Meta Space’s Spaces beside the Things, interleaved by name', async () => {
    render(
      <Fixture
        spaces={[
          { id: id('000000000020'), title: 'Blueprint' },
          { id: id('000000000021'), title: 'Yardstick' },
        ]}
        onAddSpace={() => Promise.resolve(null)}
      />,
    );
    await openList();

    expect(thingButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add Alpha to Diagram',
      'Add Alpha to Diagram',
      'Add Blueprint to Diagram',
      'Add Constraints to Diagram',
      'Add Yardstick to Diagram',
      'Add Zulu to Diagram',
    ]);
  });

  it('takes the Spaces away when their toggle is pressed off, and leaves the Things', async () => {
    render(
      <Fixture
        spaces={[{ id: id('000000000020'), title: 'Blueprint' }]}
        onAddSpace={() => Promise.resolve(null)}
      />,
    );
    await openList();
    expect(screen.getByRole('button', { name: 'Add Blueprint to Diagram' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Spaces in this Meta Space, \d+$/ }));

    expect(
      screen.queryByRole('button', { name: 'Add Blueprint to Diagram' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Zulu to Diagram' })).toBeInTheDocument();
  });

  it('authors a Space Thing for a Space row, and keeps its refusal on this surface', async () => {
    const onAddSpace = vi.fn(() => Promise.resolve('This Space is no longer stored.'));
    render(
      <Fixture spaces={[{ id: id('000000000020'), title: 'Blueprint' }]} onAddSpace={onAddSpace} />,
    );
    await openList();

    fireEvent.click(screen.getByRole('button', { name: 'Add Blueprint to Diagram' }), {
      detail: 1,
    });

    expect(onAddSpace).toHaveBeenCalledWith({ id: id('000000000020'), title: 'Blueprint' });
    expect(await screen.findByRole('alert')).toHaveTextContent('This Space is no longer stored.');
  });

  it('lists an Alias whose Target is absent from allThings', async () => {
    const dangling: readonly Thing[] = [
      { id: id('000000000005'), title: 'Stray', kind: 'alias', target: id('000000000009') },
    ];
    render(<Fixture things={dangling} allThings={dangling} />);
    await openList();

    expect(screen.getByRole('button', { name: 'Add Stray to Diagram' })).toHaveTextContent('Stray');
  });
});
