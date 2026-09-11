import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { thingSchema, uuidSchema, type Thing, type UUID } from '@project/core';
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

/**
 * The composition the Dock actually writes: `open` is a **prop**, held by the
 * Dock's one-disclosure-at-a-time slot rather than by the list.
 *
 * `Fixture` above closes by routing through `onOpenChange`, which is only one
 * of the three ways this surface closes. The Dock closes it by changing this
 * prop — when another disclosure takes the slot, and when the list is withdrawn
 * — and neither of those invokes the handler.
 */
function ControlledFixture({
  open,
  onAdd = vi.fn(),
}: {
  readonly open: boolean;
  readonly onAdd?: (thing: Thing, activation: 'keyboard' | 'pointer') => string | null;
}) {
  return (
    <ThingsPopover
      things={THINGS}
      allThings={THINGS}
      open={open}
      onOpenChange={vi.fn()}
      onAdd={onAdd}
      onDragStart={vi.fn()}
    />
  );
}

/**
 * The list as the application drives it: a completed Add **takes the row away**,
 * the Thing having joined the Diagram and left `thingsOutsideSelectedDiagram`.
 *
 * A fixture that returns `null` and leaves `things` alone cannot reproduce that,
 * so any claim about what happens when the row unmounts — which is the whole of
 * this surface's custom focus behaviour — would be asserted against a row that
 * is still mounted and could still hold focus itself.
 */
function PlacingFixture({ refusal = null }: { readonly refusal?: string | null }) {
  const [open, setOpen] = useState(false);
  const [outside, setOutside] = useState<readonly Thing[]>(THINGS);
  return (
    <>
      <button type="button">The canvas behind it</button>
      <ThingsPopover
        things={outside}
        allThings={THINGS}
        open={open}
        onOpenChange={setOpen}
        onAdd={(thing) => {
          if (refusal !== null) return refusal;
          setOutside((rows) => rows.filter(({ id: rowId }) => rowId !== thing.id));
          return null;
        }}
        onDragStart={vi.fn()}
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
    render(<PlacingFixture />);
    await openList();

    const row = screen.getByRole('button', { name: 'Add Zulu to Diagram' });
    act(() => {
      row.focus();
    });
    fireEvent.click(row, { detail: 0 });

    // The row really is gone, which is what makes the focus claim mean
    // anything: Base UI answers the focused element disappearing by taking
    // focus to the popup container, and this is the line that prevents it.
    expect(screen.queryByRole('button', { name: 'Add Zulu to Diagram' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search things' })).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Things' })).toBeInTheDocument();
  });

  it('leaves the caret alone when a pointer Add takes a row away', async () => {
    render(<PlacingFixture />);
    await openList();

    // The list opens with the caret already in its filter, so the claim only
    // means anything from somewhere else: a pointer Add moves focus nowhere,
    // where a keyboard Add puts it back.
    act(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Zulu to Diagram' }), { detail: 1 });

    expect(screen.queryByRole('button', { name: 'Add Zulu to Diagram' })).not.toBeInTheDocument();
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

  /**
   * The same claim as above, made where the Dock makes it.
   *
   * Closing is a *prop* change here, not a dismissal the surface decided, so a
   * reset that hangs off `onOpenChange` never runs: the reader who left the
   * list narrowed and refused meets that state again on the next open, with no
   * memory of having caused it.
   */
  it('forgets its query, kind and refusal when the Dock closes it', async () => {
    const view = render(
      <ControlledFixture open onAdd={() => 'This Thing is no longer available.'} />,
    );
    await screen.findByRole('dialog', { name: 'Things' });

    fireEvent.click(screen.getByRole('button', { name: /^Aliases, \d+$/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search things' }), {
      target: { value: 'zul' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Zulu to Diagram' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Another of the Dock's disclosures takes the slot: the prop goes false and
    // the handler is never called.
    view.rerender(<ControlledFixture open={false} onAdd={() => null} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    view.rerender(<ControlledFixture open onAdd={() => null} />);
    await screen.findByRole('dialog', { name: 'Things' });

    expect(screen.getByRole('textbox', { name: 'Search things' })).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

  /**
   * A break is not a refusal, and this surface is the only one that can say so.
   *
   * `addSpaceThingFor` resolves the Diagram and spends a coordinated Edit across
   * Spaces, neither of which is inside a `try` on its side — so a missing
   * Diagram or a failed transport *rejects* rather than answering a refusal.
   * Without an arm here the promise is dropped: the row press does visibly
   * nothing, and the only trace is an unhandled rejection in the console.
   */
  it('words a rejected Space Thing Edit on the surface that asked for it', async () => {
    const onAddSpace = vi.fn(() => Promise.reject(new Error('Diagram not found')));
    render(
      <Fixture spaces={[{ id: id('000000000020'), title: 'Blueprint' }]} onAddSpace={onAddSpace} />,
    );
    await openList();

    fireEvent.click(screen.getByRole('button', { name: 'Add Blueprint to Diagram' }), {
      detail: 1,
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This Space Thing was not added: Diagram not found',
    );
  });

  /**
   * The caret rule stated the other way round, on the source it does not apply to.
   *
   * `filterField` exists because a completed Thing Add *unmounts* its own row,
   * and Base UI answers the focused element disappearing by taking focus to the
   * popup container. A Space row does not unmount: `referenceableSpaces`
   * withholds only the containing Space, so a Space stays offered however many
   * Space Things frame it (ADR 0074's convergence). Moving the caret off it
   * costs the reader their place in the list and says the row was spent when
   * the surface has no way to know that it was.
   */
  it('leaves the caret on a Space row, which a completed Add does not take away', async () => {
    render(
      <Fixture
        spaces={[{ id: id('000000000020'), title: 'Blueprint' }]}
        onAddSpace={() => Promise.resolve(null)}
      />,
    );
    await openList();

    const row = screen.getByRole('button', { name: 'Add Blueprint to Diagram' });
    act(() => {
      row.focus();
    });
    fireEvent.click(row, { detail: 0 });

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(row).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Search things' })).not.toHaveFocus();
  });

  /**
   * The grip says "drag me", so it is drawn only where a drag starts.
   *
   * A Space row is not `draggable`: placing a Space authors a Space Thing
   * through a coordinated Edit, which is a press and not a drop. Drawn on one
   * anyway, the grip and the grab cursor promise a gesture that fires no
   * `dragstart` and gives no feedback of any kind — the opposite of what the
   * grip's own rationale says it is for.
   */
  it('draws the drag grip only on the rows that can be dragged', async () => {
    render(
      <Fixture
        spaces={[{ id: id('000000000020'), title: 'Blueprint' }]}
        onAddSpace={() => Promise.resolve(null)}
      />,
    );
    await openList();

    const thingRow = screen.getByRole('button', { name: 'Add Zulu to Diagram' });
    const spaceRow = screen.getByRole('button', { name: 'Add Blueprint to Diagram' });

    expect(thingRow).toHaveAttribute('draggable', 'true');
    expect(thingRow.querySelector('.things-popover__row-grip')).not.toBeNull();
    expect(spaceRow).not.toHaveAttribute('draggable', 'true');
    expect(spaceRow.querySelector('.things-popover__row-grip')).toBeNull();
  });

  /**
   * The filter covers the domain, checked against the domain rather than a list
   * beside it.
   *
   * A `satisfies readonly ThingsFilter[]` over a literal array checks
   * *membership* and not coverage, so a kind added to `Thing` and left out of
   * the filter compiles — and the rows of that kind are then invisible in this
   * list with no diagnostic anywhere, because the switch is `if`/`return` and
   * `switch-exhaustiveness-check` never sees it. The schema is the independent
   * source of truth for what kinds exist.
   */
  it('draws one toggle for every Thing kind the domain has, and one for the Spaces', async () => {
    render(<Fixture />);
    await openList();

    // The discriminator map, keyed by `kind`, so the kinds come off the schema
    // itself rather than off a list written beside it.
    const kinds = [...thingSchema.optionsMap.keys()];
    const drawn = screen
      .getAllByRole('button', { pressed: true })
      .map((toggle) => toggle.getAttribute('title'));

    expect(kinds.length).toBeGreaterThan(0);
    expect(drawn).toHaveLength(kinds.length + 1);
    expect(drawn).toContain('Spaces in this Meta Space');
  });

  /**
   * "All Things are in this Diagram." is a claim about the Things, and it is false
   * as an account of an empty list the moment the second source is offering
   * something the search has taken away.
   */
  it('does not claim the Diagram holds everything while Spaces are still on offer', async () => {
    render(
      <Fixture
        things={[]}
        allThings={THINGS}
        spaces={[{ id: id('000000000020'), title: 'Blueprint' }]}
        onAddSpace={() => Promise.resolve(null)}
      />,
    );
    await openList();

    // Nothing left from either source, but one of them had something to give.
    fireEvent.change(screen.getByRole('textbox', { name: 'Search things' }), {
      target: { value: 'zzz' },
    });

    expect(screen.queryByText('All Things are in this Diagram.')).not.toBeInTheDocument();
    expect(screen.getByText('No matching Things.')).toBeInTheDocument();
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
