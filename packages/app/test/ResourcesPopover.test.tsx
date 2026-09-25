import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { resourceSchema, uuidSchema, type Resource, type UUID } from '@project/core';
import {
  ResourcesPopover,
  RESOURCE_DRAG_TYPE,
  SPACE_DRAG_TYPE,
} from '../src/components/ResourcesPopover';
import type { SettlePlacement, SettleResource } from '../src/resources-drag';

const id = (suffix: string) => uuidSchema.parse(`00000000-0000-4000-8000-${suffix}`);

const RESOURCES: readonly Resource[] = [
  { id: id('000000000001'), title: 'Zulu', kind: 'markdown', body: '' },
  {
    id: id('000000000002'),
    title: 'Alpha',
    kind: 'space',
    spaceId: id('000000000012'),
    map: id('000000000013'),
    graph: id('000000000014'),
  },
  { id: id('000000000003'), title: 'Alpha', kind: 'markdown', body: '' },
  {
    id: id('000000000004'),
    title: 'Constraints',
    kind: 'reference',
    target: id('000000000003'),
  },
];

type SpaceDragStart = (
  space: { readonly id: UUID; readonly title: string },
  settle: SettlePlacement,
) => void;

/** No target Space read yet, which is what a Space Resource meets on the first render. */
const NO_SPACE_TITLES: ReadonlyMap<UUID, string> = new Map();

/**
 * The composition the Dock writes: the list beside the surface it feeds.
 *
 * Everything below asserts that a popup or a row is **mounted** rather than
 * visible. Base UI's Positioner holds a popup at `opacity: 0` until it has
 * measured its anchor, and jsdom answers every measurement with zeroes, so
 * `toBeVisible` cannot pass for any popover in this tree. The visibility half of this evidence is
 * `ladle-e2e/resources-popover.spec.ts`, which runs in a real browser.
 */
function Fixture({
  resources = RESOURCES,
  allResources = RESOURCES,
  disabled = false,
  onAdd = vi.fn(),
  onDragStart = vi.fn(),
  spaceTitleById = NO_SPACE_TITLES,
  spaces,
  onAddSpace,
  onSpaceDragStart,
}: {
  readonly resources?: readonly Resource[];
  readonly allResources?: readonly Resource[];
  readonly disabled?: boolean;
  readonly onAdd?: (resource: Resource, activation: 'keyboard' | 'pointer') => string | null;
  readonly onDragStart?: (resourceId: Resource['id'], settle: SettleResource) => void;
  readonly spaceTitleById?: ReadonlyMap<UUID, string>;
  readonly spaces?: readonly { readonly id: UUID; readonly title: string }[];
  readonly onAddSpace?: (space: {
    readonly id: UUID;
    readonly title: string;
  }) => Promise<string | null>;
  readonly onSpaceDragStart?: SpaceDragStart;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button">The canvas behind it</button>
      <ResourcesPopover
        resources={resources}
        allResources={allResources}
        open={open}
        onOpenChange={setOpen}
        disabled={disabled}
        onAdd={onAdd}
        onDragStart={onDragStart}
        spaceTitleById={spaceTitleById}
        spaces={spaces}
        onAddSpace={onAddSpace}
        onSpaceDragStart={onSpaceDragStart}
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
  spaces,
  onAddSpace,
  onSpaceDragStart,
}: {
  readonly open: boolean;
  readonly onAdd?: (resource: Resource, activation: 'keyboard' | 'pointer') => string | null;
  readonly spaces?: readonly { readonly id: UUID; readonly title: string }[];
  readonly onAddSpace?: (space: {
    readonly id: UUID;
    readonly title: string;
  }) => Promise<string | null>;
  readonly onSpaceDragStart?: SpaceDragStart;
}) {
  return (
    <ResourcesPopover
      resources={RESOURCES}
      allResources={RESOURCES}
      open={open}
      onOpenChange={vi.fn()}
      onAdd={onAdd}
      onDragStart={vi.fn()}
      spaces={spaces}
      onAddSpace={onAddSpace}
      onSpaceDragStart={onSpaceDragStart}
    />
  );
}

const BLUEPRINT = { id: id('000000000020'), title: 'Blueprint' };

/**
 * The list as the application drives it: a completed Add **takes the row away**,
 * the Resource having joined the Map and left `resourcesOutsideSelectedMap`.
 *
 * A fixture that returns `null` and leaves `resources` alone cannot reproduce that,
 * so any claim about what happens when the row unmounts — which is the whole of
 * this surface's custom focus behaviour — would be asserted against a row that
 * is still mounted and could still hold focus itself.
 */
function PlacingFixture({ refusal = null }: { readonly refusal?: string | null }) {
  const [open, setOpen] = useState(false);
  const [outside, setOutside] = useState<readonly Resource[]>(RESOURCES);
  return (
    <>
      <button type="button">The canvas behind it</button>
      <ResourcesPopover
        resources={outside}
        allResources={RESOURCES}
        open={open}
        onOpenChange={setOpen}
        onAdd={(resource) => {
          if (refusal !== null) return refusal;
          setOutside((rows) => rows.filter(({ id: rowId }) => rowId !== resource.id));
          return null;
        }}
        onDragStart={vi.fn()}
      />
    </>
  );
}

const openList = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Resources' }));
  return await screen.findByRole('dialog', { name: 'Resources' });
};

const resourceButtons = () => screen.getAllByRole('button', { name: /^Add .* to Map$/ });

describe('ResourcesPopover', () => {
  it('opens from its own trigger, anchored and named', async () => {
    render(<Fixture />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const popup = await openList();
    // Named by the surface rather than by a heading inside it. The drawer this
    // replaced carried an `sr-only` title because a `Drawer` is a screen-level
    // dialog a reader may navigate to by heading; an anchored popover is
    // reached from the control that names it, and that control's word is the
    // name — one region, one caption, said once.
    expect(popup).toHaveAccessibleName('Resources');
  });

  it('withdraws its trigger without losing the surface it names', () => {
    render(<Fixture disabled />);

    expect(screen.getByRole('button', { name: 'Resources' })).toBeDisabled();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<Fixture />);
    const trigger = screen.getByRole('button', { name: 'Resources' });
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
    fireEvent.click(screen.getByRole('button', { name: 'Resources' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('survives a press on the surface behind it, which is where every Resource is dropped', async () => {
    render(<Fixture />);
    await openList();

    const behind = screen.getByRole('button', { name: 'The canvas behind it' });
    // Asynchronous, because the popup answers focus leaving it on a microtask
    // after the focus move; the list has to survive that answer too.
    await act(async () => {
      fireEvent.pointerDown(behind);
      fireEvent.mouseDown(behind);
      fireEvent.click(behind);
      behind.focus();
      await Promise.resolve();
    });

    expect(screen.getByRole('dialog', { name: 'Resources' })).toBeInTheDocument();
  });

  it('offers absent Resources alphabetically with stable Space order and no canvas handles', async () => {
    render(<Fixture />);
    await openList();

    expect(resourceButtons()).toHaveLength(4);
    expect(resourceButtons().map((resource) => resource.textContent)).toEqual([
      'Alpha',
      'Alpha',
      'Constraints',
      'Zulu',
    ]);
    expect(document.querySelector('.react-flow__handle')).not.toBeInTheDocument();
  });

  it('filters by kind and search, then activates the matching Resource', async () => {
    const onAdd = vi.fn();
    render(<Fixture onAdd={onAdd} />);
    await openList();

    // Everything starts on, so narrowing means pressing the kinds you do not
    // want to see *off*.
    fireEvent.click(screen.getByRole('button', { name: /^Reference Resources, \d+$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Space Resources in this Space, \d+$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Spaces in this Meta Space, \d+$/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search resources' }), {
      target: { value: 'zul' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Zulu to Map' }), { detail: 1 });

    expect(onAdd).toHaveBeenCalledWith(RESOURCES[0], 'pointer');
    expect(screen.queryByRole('button', { name: 'Add Alpha to Map' })).not.toBeInTheDocument();
  });

  /**
   * A row names the Resource it adds, so it names it by the Resource's **name** — while
   * the search behind it still reads the whole Title (ADR 0083).
   *
   * The two halves are the same division `ResourceSearchCombobox` makes and for the
   * same reason: an author's recall does not respect which line they typed a
   * word on, and a control called `Add Auth\nHow a session begins to Map` is
   * a broken-looking label.
   */
  it('adds a Resource by name and finds it by any line of its Title', async () => {
    const laddered: readonly Resource[] = [
      { id: id('000000000005'), title: 'Auth\nHow a session begins', kind: 'markdown', body: '' },
      ...RESOURCES,
    ];
    render(<Fixture resources={laddered} allResources={laddered} />);
    await openList();

    expect(screen.getByRole('button', { name: 'Add Auth to Map' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search resources' }), {
      target: { value: 'session begins' },
    });

    expect(resourceButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add Auth to Map',
    ]);
  });

  /**
   * The one piece of custom focus behaviour on this surface, and the reason it
   * exists is written above `filterField` in the component.
   */
  it('puts the caret back in the filter when a keyboard Add takes its own row away', async () => {
    render(<PlacingFixture />);
    await openList();

    const row = screen.getByRole('button', { name: 'Add Zulu to Map' });
    act(() => {
      row.focus();
    });
    fireEvent.click(row, { detail: 0 });

    // The row really is gone, which is what makes the focus claim mean
    // anything: Base UI answers the focused element disappearing by taking
    // focus to the popup container, and this is the line that prevents it.
    expect(screen.queryByRole('button', { name: 'Add Zulu to Map' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search resources' })).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Resources' })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Add Zulu to Map' }), { detail: 1 });

    expect(screen.queryByRole('button', { name: 'Add Zulu to Map' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search resources' })).not.toHaveFocus();
  });

  it('keeps an authoring refusal in the list that asked for the Resource', async () => {
    render(<Fixture onAdd={() => 'This Resource is no longer available.'} />);
    await openList();

    fireEvent.click(screen.getByRole('button', { name: 'Add Zulu to Map' }));

    expect(screen.getByRole('alert')).toHaveTextContent('This Resource is no longer available.');
    expect(screen.getByRole('button', { name: 'Add Zulu to Map' })).toBeInTheDocument();
  });

  it('carries the Resource id on the drag it starts', async () => {
    const onDragStart = vi.fn();
    render(<Fixture onDragStart={onDragStart} />);
    await openList();

    const setData = vi.fn();
    fireEvent.dragStart(screen.getByRole('button', { name: 'Add Zulu to Map' }), {
      dataTransfer: { setData, effectAllowed: 'none' },
    });

    expect(setData).toHaveBeenCalledWith(RESOURCE_DRAG_TYPE, RESOURCES[0]?.id);
    expect(onDragStart).toHaveBeenCalledWith(RESOURCES[0]?.id, expect.any(Function));
  });

  it('draws a dropped Resource’s refusal on the list that started the drag', async () => {
    let settle: SettleResource | null = null;
    render(
      <Fixture
        onDragStart={(_resourceId, given) => {
          settle = given;
        }}
      />,
    );
    await openList();
    fireEvent.dragStart(screen.getByRole('button', { name: 'Add Zulu to Map' }), {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'none' },
    });

    // A Resource's answer is synchronous, so it is drawn as the drop settles.
    act(() => {
      settle?.('This Resource is no longer available.');
    });

    expect(screen.getByRole('alert')).toHaveTextContent('This Resource is no longer available.');
  });

  it('clears a standing refusal when a Resource drop completes', async () => {
    let settle: SettleResource | null = null;
    render(
      <Fixture
        onAdd={() => 'This Resource is no longer available.'}
        onDragStart={(_resourceId, given) => {
          settle = given;
        }}
      />,
    );
    await openList();
    fireEvent.click(screen.getByRole('button', { name: 'Add Zulu to Map' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.dragStart(screen.getByRole('button', { name: 'Add Constraints to Map' }), {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'none' },
    });
    act(() => {
      settle?.(null);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps focus leaving it from dismissing it, which a drag out of it is', async () => {
    render(<Fixture />);
    await openList();

    // The other half of the press above, seen from the focus side: an HTML5
    // drag moves focus out of the list, and a plain non-modal popover treats
    // that as a dismissal. Adding several Resources in a row is the ordinary case.
    const behind = screen.getByRole('button', { name: 'The canvas behind it' });
    act(() => {
      behind.focus();
      fireEvent.focusOut(screen.getByRole('button', { name: 'Add Zulu to Map' }));
    });

    expect(screen.getByRole('dialog', { name: 'Resources' })).toBeInTheDocument();
  });

  it('distinguishes an empty Space from a Map that already contains every Resource', async () => {
    const view = render(<Fixture resources={[]} allResources={[]} />);
    await openList();
    expect(screen.getByText('This Space has no Resources.')).toBeInTheDocument();

    // Rerendering keeps the list open, so the second message is read in place
    // rather than through a toggle that would close it.
    view.rerender(<Fixture resources={[]} allResources={RESOURCES} />);
    expect(await screen.findByText('All Resources are in this Map.')).toBeInTheDocument();
  });

  it('forgets its query and kind when it closes, so the next open lists everything', async () => {
    render(<Fixture />);
    await openList();

    fireEvent.click(screen.getByRole('button', { name: /^Reference Resources, \d+$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Space Resources in this Space, \d+$/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search resources' }), {
      target: { value: 'zul' },
    });
    expect(resourceButtons()).toHaveLength(1);

    // Only the popup unmounts, so nothing resets the filter for us the way
    // unmounting the whole surface would.
    fireEvent.click(screen.getByRole('button', { name: 'Resources' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await openList();

    expect(screen.getByRole('textbox', { name: 'Search resources' })).toHaveValue('');
    expect(resourceButtons()).toHaveLength(4);
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
      <ControlledFixture open onAdd={() => 'This Resource is no longer available.'} />,
    );
    await screen.findByRole('dialog', { name: 'Resources' });

    fireEvent.click(screen.getByRole('button', { name: /^Reference Resources, \d+$/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search resources' }), {
      target: { value: 'zul' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Zulu to Map' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Another of the Dock's disclosures takes the slot: the prop goes false and
    // the handler is never called.
    view.rerender(<ControlledFixture open={false} onAdd={() => null} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    view.rerender(<ControlledFixture open onAdd={() => null} />);
    await screen.findByRole('dialog', { name: 'Resources' });

    expect(screen.getByRole('textbox', { name: 'Search resources' })).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(resourceButtons()).toHaveLength(4);
  });

  /**
   * The reset cannot clear what has not arrived yet.
   *
   * Only the popup unmounts, so this component — and its `refusal` — outlives
   * every close, and `onAddSpace` is a coordinated cross-Space Edit that settles
   * arbitrarily later. Press a Space row, close the list, and the refusal lands
   * behind the reset that was supposed to forget it: the next open draws a red
   * alert over a gesture the reader made against a list that is gone, which is
   * the state the reset exists to make unreachable. The Resource arm cannot reach
   * it, `onAdd` being synchronous.
   */
  it('drops a Space placement that settles after the list has closed', async () => {
    let settle: (refusal: string | null) => void = () => {
      throw new Error('The placement was never asked for');
    };
    const placement = new Promise<string | null>((resolve) => {
      settle = resolve;
    });
    const onAddSpace = vi.fn(() => placement);
    const view = render(<ControlledFixture open spaces={[BLUEPRINT]} onAddSpace={onAddSpace} />);
    await screen.findByRole('dialog', { name: 'Resources' });

    fireEvent.click(screen.getByRole('button', { name: 'Add Blueprint to Map' }), {
      detail: 1,
    });
    expect(onAddSpace).toHaveBeenCalledTimes(1);

    view.rerender(<ControlledFixture open={false} spaces={[BLUEPRINT]} onAddSpace={onAddSpace} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // The Edit answers only now, with the list already closed and reset.
    await act(async () => {
      settle('This Space is no longer stored.');
      await placement;
    });

    view.rerender(<ControlledFixture open spaces={[BLUEPRINT]} onAddSpace={onAddSpace} />);
    await screen.findByRole('dialog', { name: 'Resources' });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('finds a Reference Resource by its Target title', async () => {
    render(<Fixture />);
    await openList();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search resources' }), {
      target: { value: 'Alpha' },
    });

    expect(screen.getByRole('button', { name: 'Add Constraints to Map' })).toBeInTheDocument();
  });

  /**
   * The corpus takes the Target's *whole* Title and not its name, which is the
   * same division the Resource's own Title gets above and the same one
   * `ResourceSearchCombobox` makes (ADR 0083). A Reference Resource is a second position for a
   * Resource, so a reader recalls it by anything that named the Resource it shows.
   */
  it('finds a Reference Resource by a later line of its Target’s Title', async () => {
    const laddered: readonly Resource[] = [
      { id: id('000000000003'), title: 'Alpha\nHow a session begins', kind: 'markdown', body: '' },
      {
        id: id('000000000004'),
        title: 'Constraints',
        kind: 'reference',
        target: id('000000000003'),
      },
    ];
    render(<Fixture resources={laddered} allResources={laddered} />);
    await openList();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search resources' }), {
      target: { value: 'session begins' },
    });

    expect(resourceButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add Alpha to Map',
      'Add Constraints to Map',
    ]);
  });

  it('finds a Space Resource by its target Space title', async () => {
    render(<Fixture spaceTitleById={new Map([[id('000000000012'), 'Roadmap']])} />);
    await openList();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search resources' }), {
      target: { value: 'Roadmap' },
    });

    expect(screen.getByRole('button', { name: 'Add Alpha to Map' })).toBeInTheDocument();
    expect(resourceButtons()).toHaveLength(1);
  });

  /** The titles arrive from a read that outlives the mount, so the list has to recompute. */
  it('finds a Space Resource by a target title that arrives after the first render', async () => {
    const view = render(<Fixture />);
    await openList();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search resources' }), {
      target: { value: 'Roadmap' },
    });
    expect(screen.queryByRole('button', { name: /^Add .* to Map$/ })).not.toBeInTheDocument();

    view.rerender(<Fixture spaceTitleById={new Map([[id('000000000012'), 'Roadmap']])} />);

    expect(screen.getByRole('button', { name: 'Add Alpha to Map' })).toBeInTheDocument();
  });

  it('starts with every kind shown, so nothing is hidden before the reader asks', async () => {
    render(<Fixture />);
    await openList();

    // The name carries the count, because a badge with a bare number in it
    // contributes nothing to a control that has its own label.
    for (const [name, count] of [
      ['Markdown Resources', 2],
      ['Reference Resources', 1],
      ['Space Resources in this Space', 1],
      ['Spaces in this Meta Space', 0],
    ] as const) {
      const toggle = screen.getByRole('button', { name: `${name}, ${String(count)}` });
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
    }
  });

  it('uses OPEN for the All Spaces filter and cubes for Space Resources and individual Spaces', async () => {
    render(<Fixture spaces={[{ id: id('000000000020'), title: 'Blueprint' }]} />);
    await openList();

    const allSpaces = screen.getByRole('button', { name: 'Spaces in this Meta Space, 1' });
    expect(allSpaces.querySelector('[data-icon="parent"]')).toBeInTheDocument();
    expect(allSpaces.querySelector('[data-icon="space"]')).not.toBeInTheDocument();
    const spaceResources = screen.getByRole('button', { name: 'Space Resources in this Space, 1' });
    expect(spaceResources.querySelector('[data-icon="space"]')).toBeInTheDocument();
    const space = screen.getByRole('button', { name: 'Add Blueprint to Map' });
    expect(space.querySelector('[data-icon="space"]')).toBeInTheDocument();
  });

  /**
   * The count's whole job, and the cost the comparison recorded against it: a
   * number beside a name that disagrees with the rows under it is worse than no
   * number.
   */
  it('counts what each switch contributes under the current search, not what the Space holds', async () => {
    render(<Fixture spaces={[{ id: id('000000000020'), title: 'Blueprint' }]} />);
    await openList();

    expect(screen.getByRole('button', { name: 'Markdown Resources, 2' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Spaces in this Meta Space, 1' }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search resources' }), {
      target: { value: 'zul' },
    });

    // One Markdown Resource matches and nothing else does, and every switch says so
    // — including the ones that now contribute nothing, because a switch that is
    // off has to say what turning it on would bring back.
    expect(screen.getByRole('button', { name: 'Markdown Resources, 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reference Resources, 0' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Spaces in this Meta Space, 0' }),
    ).toBeInTheDocument();
    expect(resourceButtons()).toHaveLength(1);
  });

  /**
   * A switch that is off still counts, because the number is what tells the
   * reader whether turning it back on is worth the press.
   */
  it('goes on counting a kind the reader has switched off', async () => {
    render(<Fixture />);
    await openList();

    fireEvent.click(screen.getByRole('button', { name: /^Reference Resources, \d+$/ }));

    expect(screen.getByRole('button', { name: 'Reference Resources, 1' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      screen.queryByRole('button', { name: 'Add Constraints to Map' }),
    ).not.toBeInTheDocument();
  });

  /**
   * The pair the filter exists to keep apart: a Space Resource is one framed view
   * placed in a Map, and a Space is the volume such a view is a view of
   * (ADR 0074).
   */
  it('offers the Meta Space’s Spaces beside the Resources, interleaved by name', async () => {
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

    expect(resourceButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add Alpha to Map',
      'Add Alpha to Map',
      'Add Blueprint to Map',
      'Add Constraints to Map',
      'Add Yardstick to Map',
      'Add Zulu to Map',
    ]);
  });

  it('takes the Spaces away when their toggle is pressed off, and leaves the Resources', async () => {
    render(
      <Fixture
        spaces={[{ id: id('000000000020'), title: 'Blueprint' }]}
        onAddSpace={() => Promise.resolve(null)}
      />,
    );
    await openList();
    expect(screen.getByRole('button', { name: 'Add Blueprint to Map' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Spaces in this Meta Space, \d+$/ }));

    expect(screen.queryByRole('button', { name: 'Add Blueprint to Map' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Zulu to Map' })).toBeInTheDocument();
  });

  it('authors a Space Resource for a Space row, and keeps its refusal on this surface', async () => {
    const onAddSpace = vi.fn(() => Promise.resolve('This Space is no longer stored.'));
    render(
      <Fixture spaces={[{ id: id('000000000020'), title: 'Blueprint' }]} onAddSpace={onAddSpace} />,
    );
    await openList();

    fireEvent.click(screen.getByRole('button', { name: 'Add Blueprint to Map' }), {
      detail: 1,
    });

    expect(onAddSpace).toHaveBeenCalledWith({ id: id('000000000020'), title: 'Blueprint' });
    expect(await screen.findByRole('alert')).toHaveTextContent('This Space is no longer stored.');
  });

  /**
   * A break is not a refusal, and this surface is the only one that can say so.
   *
   * `addSpaceResourceFor` resolves the Map and spends a coordinated Edit across
   * Spaces, neither of which is inside a `try` on its side — so a missing
   * Map or a failed transport *rejects* rather than answering a refusal.
   * Without an arm here the promise is dropped: the row press does visibly
   * nothing, and the only trace is an unhandled rejection in the console.
   */
  it('words a rejected Space Resource Edit on the surface that asked for it', async () => {
    const onAddSpace = vi.fn(() => Promise.reject(new Error('Map not found')));
    render(
      <Fixture spaces={[{ id: id('000000000020'), title: 'Blueprint' }]} onAddSpace={onAddSpace} />,
    );
    await openList();

    fireEvent.click(screen.getByRole('button', { name: 'Add Blueprint to Map' }), {
      detail: 1,
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This Space Resource was not added: Map not found',
    );
  });

  /**
   * The caret rule stated the other way round, on the source it does not apply to.
   *
   * `filterField` exists because a completed Resource Add *unmounts* its own row,
   * and Base UI answers the focused element disappearing by taking focus to the
   * popup container. A Space row does not unmount: `referenceableSpaces`
   * withholds only the containing Space, so a Space stays offered however many
   * Space Resources frame it (ADR 0074's convergence). Moving the caret off it
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

    const row = screen.getByRole('button', { name: 'Add Blueprint to Map' });
    act(() => {
      row.focus();
    });
    fireEvent.click(row, { detail: 0 });

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(row).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Search resources' })).not.toHaveFocus();
  });

  /**
   * Both sources are dragged by the same grip, because both are "put this on
   * the canvas" to the reader — and the tooltip names both gestures on each.
   */
  it('draws the drag grip on every row', async () => {
    render(
      <Fixture
        spaces={[BLUEPRINT]}
        onAddSpace={() => Promise.resolve(null)}
        onSpaceDragStart={vi.fn()}
      />,
    );
    await openList();

    const resourceRow = screen.getByRole('button', { name: 'Add Zulu to Map' });
    const spaceRow = screen.getByRole('button', { name: 'Add Blueprint to Map' });

    for (const row of [resourceRow, spaceRow]) {
      expect(row).toHaveAttribute('draggable', 'true');
      expect(row.querySelector('.resources-popover__row-grip')).not.toBeNull();
    }
  });

  it('carries the Space on the drag it starts, under its own type', async () => {
    const onSpaceDragStart = vi.fn<SpaceDragStart>();
    render(<Fixture spaces={[BLUEPRINT]} onSpaceDragStart={onSpaceDragStart} />);
    await openList();

    const setData = vi.fn();
    fireEvent.dragStart(screen.getByRole('button', { name: 'Add Blueprint to Map' }), {
      dataTransfer: { setData, effectAllowed: 'none' },
    });

    expect(setData).toHaveBeenCalledWith(SPACE_DRAG_TYPE, BLUEPRINT.id);
    expect(setData).not.toHaveBeenCalledWith(RESOURCE_DRAG_TYPE, expect.anything());
    expect(onSpaceDragStart).toHaveBeenCalledWith(BLUEPRINT, expect.any(Function));
  });

  it('draws a dropped Space’s refusal on the list that started the drag', async () => {
    let settle: SettlePlacement | null = null;
    render(
      <Fixture
        spaces={[BLUEPRINT]}
        onSpaceDragStart={(_space, given) => {
          settle = given;
        }}
      />,
    );
    await openList();
    fireEvent.dragStart(screen.getByRole('button', { name: 'Add Blueprint to Map' }), {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'none' },
    });

    act(() => {
      settle?.(Promise.resolve('This Space is no longer stored.'));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('This Space is no longer stored.');
  });

  it('words a broken Space drop on the list that started the drag', async () => {
    let settle: SettlePlacement | null = null;
    render(
      <Fixture
        spaces={[BLUEPRINT]}
        onSpaceDragStart={(_space, given) => {
          settle = given;
        }}
      />,
    );
    await openList();
    fireEvent.dragStart(screen.getByRole('button', { name: 'Add Blueprint to Map' }), {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'none' },
    });

    act(() => {
      settle?.(Promise.reject(new Error('Map not found')));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This Space Resource was not added: Map not found',
    );
  });

  it('clears a standing refusal when a Space drop completes', async () => {
    let settle: SettlePlacement | null = null;
    render(
      <Fixture
        onAdd={() => 'This Resource is no longer available.'}
        spaces={[BLUEPRINT]}
        onSpaceDragStart={(_space, given) => {
          settle = given;
        }}
      />,
    );
    await openList();
    fireEvent.click(screen.getByRole('button', { name: 'Add Zulu to Map' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.dragStart(screen.getByRole('button', { name: 'Add Blueprint to Map' }), {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'none' },
    });
    await act(async () => {
      settle?.(Promise.resolve(null));
      await Promise.resolve();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  /**
   * The drop's answer is held to the opening that started the drag, exactly as
   * a press's is: the list being closed before the answer arrives is the one
   * case the sentence is dropped.
   */
  it('drops a Space drop’s answer that settles after the list has closed', async () => {
    let settle: SettlePlacement | null = null;
    const onSpaceDragStart: SpaceDragStart = (_space, given) => {
      settle = given;
    };
    const view = render(
      <ControlledFixture open spaces={[BLUEPRINT]} onSpaceDragStart={onSpaceDragStart} />,
    );
    await screen.findByRole('dialog', { name: 'Resources' });
    fireEvent.dragStart(screen.getByRole('button', { name: 'Add Blueprint to Map' }), {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'none' },
    });

    view.rerender(
      <ControlledFixture open={false} spaces={[BLUEPRINT]} onSpaceDragStart={onSpaceDragStart} />,
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await act(async () => {
      settle?.(Promise.resolve('This Space is no longer stored.'));
      await Promise.resolve();
    });

    view.rerender(
      <ControlledFixture open spaces={[BLUEPRINT]} onSpaceDragStart={onSpaceDragStart} />,
    );
    await screen.findByRole('dialog', { name: 'Resources' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  /**
   * The filter covers the domain, checked against the domain rather than a list
   * beside it.
   *
   * A `satisfies readonly ResourcesFilter[]` over a literal array checks
   * *membership* and not coverage, so a kind added to `Resource` and left out of
   * the filter compiles — and the rows of that kind are then invisible in this
   * list with no diagnostic anywhere, because the switch is `if`/`return` and
   * `switch-exhaustiveness-check` never sees it. The schema is the independent
   * source of truth for what kinds exist.
   */
  it('draws one toggle for every Resource kind the domain has, and one for the Spaces', async () => {
    render(<Fixture />);
    await openList();

    // The discriminator map, keyed by `kind`, so the kinds come off the schema
    // itself rather than off a list written beside it.
    const kinds = [...resourceSchema.optionsMap.keys()];
    const drawn = screen
      .getAllByRole('button', { pressed: true })
      .map((toggle) => toggle.getAttribute('title'));

    expect(kinds.length).toBeGreaterThan(0);
    expect(drawn).toHaveLength(kinds.length + 1);
    expect(drawn).toContain('Spaces in this Meta Space');
  });

  /**
   * "All Resources are in this Map." is a claim about the Resources, and it is false
   * as an account of an empty list the moment the second source is offering
   * something the search has taken away.
   */
  it('does not claim the Map holds everything while Spaces are still on offer', async () => {
    render(
      <Fixture
        resources={[]}
        allResources={RESOURCES}
        spaces={[{ id: id('000000000020'), title: 'Blueprint' }]}
        onAddSpace={() => Promise.resolve(null)}
      />,
    );
    await openList();

    // Nothing left from either source, but one of them had something to give.
    fireEvent.change(screen.getByRole('textbox', { name: 'Search resources' }), {
      target: { value: 'zzz' },
    });

    expect(screen.queryByText('All Resources are in this Map.')).not.toBeInTheDocument();
    expect(screen.getByText('No matching Resources.')).toBeInTheDocument();
  });

  it('lists a Reference Resource whose Target is absent from allResources', async () => {
    const dangling: readonly Resource[] = [
      { id: id('000000000005'), title: 'Stray', kind: 'reference', target: id('000000000009') },
    ];
    render(<Fixture resources={dangling} allResources={dangling} />);
    await openList();

    expect(screen.getByRole('button', { name: 'Add Stray to Map' })).toHaveTextContent('Stray');
  });
});

/** A Resource's Connect list: the Map's placed Resources bar the source. */
function ConnectFixture({
  resources = RESOURCES,
  refusalOf = () => null,
  onConnect = () => null,
  newResource = { refusal: null, onConnect: () => null },
  onAncestorKeyDown = vi.fn(),
}: {
  readonly resources?: readonly Resource[];
  readonly refusalOf?: (resource: Resource) => string | null;
  readonly onConnect?: (resource: Resource) => string | null;
  readonly newResource?: {
    readonly refusal: string | null;
    readonly onConnect: () => string | null;
  };
  readonly onAncestorKeyDown?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return (
    // Stands in for the canvas, a React ancestor of the list.
    <div onKeyDown={onAncestorKeyDown}>
      {/* Stands in for the Actions menu trigger the list hangs from. */}
      <button type="button" ref={setAnchor} onClick={() => setOpen(true)}>
        Actions for Source
      </button>
      <ResourcesPopover
        purpose="connect"
        from="Source"
        resources={resources}
        allResources={RESOURCES}
        open={open}
        onOpenChange={setOpen}
        anchor={anchor}
        refusalOf={refusalOf}
        onConnect={onConnect}
        newResource={newResource}
      />
    </div>
  );
}

const openConnectList = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Source' }));
  return await screen.findByRole('dialog', { name: 'Connect Source' });
};

describe('ResourcesPopover as a Connect list', () => {
  it('offers each Resource as a choice to connect to, with no drag and no Spaces source', async () => {
    render(<ConnectFixture />);
    await openConnectList();

    const rows = screen.getAllByRole('button', { name: /^Connect to (?!a new)/ });
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Connect to Alpha',
      'Connect to Alpha',
      'Connect to Constraints',
      'Connect to Zulu',
    ]);
    for (const row of rows) {
      expect(row).not.toHaveAttribute('draggable', 'true');
      expect(row.querySelector('.resources-popover__row-grip')).toBeNull();
    }
    // One toggle per kind, and none for the Spaces an Edge cannot end at.
    const toggles = screen
      .getAllByRole('button', { pressed: true })
      .map((toggle) => toggle.getAttribute('title'));
    expect(toggles).toHaveLength(resourceSchema.optionsMap.size);
    expect(toggles).not.toContain('Spaces in this Meta Space');
  });

  it('keeps a refused Resource listed, unavailable and reachable, with its reason', async () => {
    const onConnect = vi.fn(() => null);
    render(
      <ConnectFixture
        refusalOf={(resource) => (resource.title === 'Zulu' ? 'This Edge already exists.' : null)}
        onConnect={onConnect}
      />,
    );
    await openConnectList();

    const zulu = screen.getByRole('button', { name: 'Connect to Zulu' });
    expect(zulu).toHaveAttribute('aria-disabled', 'true');
    expect(zulu).toHaveAccessibleDescription('This Edge already exists.');
    act(() => zulu.focus());
    expect(zulu).toHaveFocus();

    fireEvent.click(zulu);

    expect(onConnect).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Connect to Constraints' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('draws the Edge to the chosen Resource and closes without taking the caret back', async () => {
    const onConnect = vi.fn(() => null);
    render(<ConnectFixture onConnect={onConnect} />);
    const anchor = screen.getByRole('button', { name: 'Actions for Source' });
    await openConnectList();

    fireEvent.click(screen.getByRole('button', { name: 'Connect to Zulu' }));

    expect(onConnect).toHaveBeenCalledWith(RESOURCES[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // The new Edge is where the author continues, not the Actions trigger.
    expect(anchor).not.toHaveFocus();
  });

  it('keeps the list open with the reason when drawing the Edge is refused', async () => {
    render(<ConnectFixture onConnect={() => 'This Edge already exists.'} />);
    await openConnectList();

    fireEvent.click(screen.getByRole('button', { name: 'Connect to Zulu' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Edge not drawn');
    expect(screen.getByRole('alert')).toHaveTextContent('This Edge already exists.');
    expect(screen.getByRole('dialog', { name: 'Connect Source' })).toBeInTheDocument();
  });

  it('narrows by kind and search, and keeps New Resource last whatever matches', async () => {
    const created = vi.fn(() => null);
    render(<ConnectFixture newResource={{ refusal: null, onConnect: created }} />);
    await openConnectList();

    fireEvent.click(screen.getByRole('button', { name: /^Reference Resources, \d+$/ }));
    expect(
      screen.queryByRole('button', { name: 'Connect to Constraints' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search resources' }), {
      target: { value: 'nothing like it' },
    });
    expect(screen.getByText('No matching Resources.')).toBeInTheDocument();

    const buttons = screen.getAllByRole('button');
    const last = buttons[buttons.length - 1];
    expect(last).toHaveAccessibleName('Connect to a new Resource');

    fireEvent.click(screen.getByRole('button', { name: 'Connect to a new Resource' }));

    expect(created).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('draws New Resource unavailable with its reason when it is refused', async () => {
    render(
      <ConnectFixture
        newResource={{ refusal: 'This Resource is not in this Map.', onConnect: () => null }}
      />,
    );
    await openConnectList();

    const row = screen.getByRole('button', { name: 'Connect to a new Resource' });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveAccessibleDescription('This Resource is not in this Map.');
  });

  it('says so when the Map holds nothing else to connect to', async () => {
    render(<ConnectFixture resources={[]} />);
    await openConnectList();

    expect(screen.getByText('No other Resources in this Map.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect to a new Resource' })).toBeInTheDocument();
  });

  it('has no trigger of its own', () => {
    render(<ConnectFixture />);

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Actions for Source',
    ]);
  });

  it('closes on Escape and returns focus to the control it hangs from', async () => {
    render(<ConnectFixture />);
    const anchor = screen.getByRole('button', { name: 'Actions for Source' });
    const popup = await openConnectList();

    fireEvent.keyDown(popup, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(anchor).toHaveFocus());
  });

  it('keeps keys typed in it from the canvas it is drawn in', async () => {
    const onAncestorKeyDown = vi.fn();
    render(<ConnectFixture onAncestorKeyDown={onAncestorKeyDown} />);
    await openConnectList();

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search resources' }), {
      key: 'ArrowRight',
    });

    expect(onAncestorKeyDown).not.toHaveBeenCalled();
  });
});

describe('ResourcesPopover membership capsules', () => {
  const OVERVIEW = id('000000000030');
  const DEEP_DIVE = id('000000000031');
  const memberships = new Map([
    [
      id('000000000001'),
      [
        {
          mapId: OVERVIEW,
          mapTitle: 'Overview',
          graphs: [
            { id: id('000000000032'), title: 'Main', color: '#1f77b4' },
            { id: id('000000000033'), title: 'Security', color: '#d62728' },
          ],
        },
        { mapId: DEEP_DIVE, mapTitle: 'Deep dive', graphs: [] },
      ],
    ],
  ]);

  const renderOpen = () =>
    render(
      <ResourcesPopover
        resources={RESOURCES}
        allResources={RESOURCES}
        open
        onOpenChange={vi.fn()}
        onAdd={vi.fn()}
        onDragStart={vi.fn()}
        memberships={memberships}
      />,
    );

  it('draws one capsule per other Map, holding that Map’s own Graphs', async () => {
    renderOpen();
    const row = await screen.findByRole('button', { name: 'Add Zulu to Map' });

    const overview = row.querySelector(`[data-map-id="${OVERVIEW}"]`);
    const deepDive = row.querySelector(`[data-map-id="${DEEP_DIVE}"]`);
    expect(overview?.querySelectorAll('[data-graph-id]')).toHaveLength(2);
    expect(deepDive?.querySelectorAll('[data-graph-id]')).toHaveLength(0);
  });

  it('says the same membership in words as the row’s description', async () => {
    renderOpen();
    const row = await screen.findByRole('button', { name: 'Add Zulu to Map' });

    expect(row).toHaveAccessibleDescription(
      'Also in Overview: Main, Security; Deep dive: on no Graph',
    );
  });

  it('names each Map in the tooltip in the very words of the row’s description', async () => {
    renderOpen();
    const row = await screen.findByRole('button', { name: 'Add Zulu to Map' });

    act(() => row.focus());
    const tooltip = await waitFor(
      () => {
        const content = document.querySelector('[data-slot="tooltip-content"]');
        expect(content).not.toBeNull();
        return content;
      },
      { timeout: 2000 },
    );
    expect(tooltip).toHaveTextContent('Overview: Main, Security');
    expect(tooltip).toHaveTextContent('Deep dive: on no Graph');
  });

  it('draws at most three capsules and counts the rest, while the description names every Map', async () => {
    const maps = ['A', 'B', 'C', 'D', 'E'].map((title, index) => ({
      mapId: id(`00000000004${index}`),
      mapTitle: title,
      graphs: [],
    }));
    render(
      <ResourcesPopover
        resources={RESOURCES}
        allResources={RESOURCES}
        open
        onOpenChange={vi.fn()}
        onAdd={vi.fn()}
        onDragStart={vi.fn()}
        memberships={new Map([[id('000000000001'), maps]])}
      />,
    );
    const row = await screen.findByRole('button', { name: 'Add Zulu to Map' });

    expect(row.querySelectorAll('[data-map-id]')).toHaveLength(3);
    expect(row.querySelector('[data-more-maps]')).toHaveTextContent('+2');
    expect(row).toHaveAccessibleDescription(
      'Also in A: on no Graph; B: on no Graph; C: on no Graph; D: on no Graph; E: on no Graph',
    );
  });

  it('draws at most three dots in a capsule and counts the rest, while the description names every Graph', async () => {
    const graphs = ['G1', 'G2', 'G3', 'G4', 'G5'].map((title, index) => ({
      id: id(`00000000005${index}`),
      title,
      color: '#123456',
    }));
    const mapId = id('000000000060');
    render(
      <ResourcesPopover
        resources={RESOURCES}
        allResources={RESOURCES}
        open
        onOpenChange={vi.fn()}
        onAdd={vi.fn()}
        onDragStart={vi.fn()}
        memberships={new Map([[id('000000000001'), [{ mapId, mapTitle: 'A', graphs }]]])}
      />,
    );
    const row = await screen.findByRole('button', { name: 'Add Zulu to Map' });

    const capsule = row.querySelector(`[data-map-id="${mapId}"]`);
    expect(capsule?.querySelectorAll('[data-graph-id]')).toHaveLength(3);
    expect(capsule?.querySelector('[data-more-graphs]')).toHaveTextContent('+2');
    expect(row).toHaveAccessibleDescription('Also in A: G1, G2, G3, G4, G5');
  });

  it('draws a hollow ring in the capsule of a Map that places the Resource on no Graph', async () => {
    renderOpen();
    const row = await screen.findByRole('button', { name: 'Add Zulu to Map' });

    const deepDive = row.querySelector(`[data-map-id="${DEEP_DIVE}"]`);
    const overview = row.querySelector(`[data-map-id="${OVERVIEW}"]`);
    expect(deepDive?.querySelectorAll('[data-no-graph]')).toHaveLength(1);
    expect(overview?.querySelectorAll('[data-no-graph]')).toHaveLength(0);
  });

  it('draws nothing extra on a Resource no other Map places', async () => {
    renderOpen();
    const row = await screen.findByRole('button', { name: 'Add Constraints to Map' });

    expect(row.querySelector('[data-map-id]')).toBeNull();
    expect(row).not.toHaveAttribute('aria-describedby');
  });
});

describe('ResourcesPopover row hint', () => {
  const hintOf = async (name: string) => {
    const row = await screen.findByRole('button', { name });
    act(() => row.focus());
    return waitFor(
      () => {
        const content = document.querySelector('[data-slot="tooltip-content"]');
        expect(content).not.toBeNull();
        return content;
      },
      { timeout: 2000 },
    );
  };

  it.each(['Add Zulu to Map', 'Add Blueprint to Map'])(
    'says where %s lands, one hint for every row that drags',
    async (name) => {
      render(<Fixture spaces={[BLUEPRINT]} onAddSpace={vi.fn()} onSpaceDragStart={vi.fn()} />);
      await openList();
      expect(await hintOf(name)).toHaveTextContent(
        /^Add to Map: click to centre on canvas, drag to place$/,
      );
    },
  );

  it('names no drag on a Space row nothing takes the drag of', async () => {
    render(<ControlledFixture open spaces={[BLUEPRINT]} onAddSpace={vi.fn()} />);
    expect(await hintOf('Add Blueprint to Map')).toHaveTextContent(
      /^Add to Map: click to centre on canvas$/,
    );
  });
});
