import {
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { titleName, type Thing, type ThingId, type UUID } from '@project/core';
import {
  Button,
  Alert,
  AlertDescription,
  AlertTitle,
  AliasIcon,
  ThingKindIcon,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  MarkdownIcon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchIcon,
  SpaceThingIcon,
  SpaceIcon,
  ToggleGroup,
  ToggleGroupItem,
} from '@project/ui';
import './things-popover.css';

export const THING_DRAG_TYPE = 'application/x-hyper-thing-id';

type Activation = 'keyboard' | 'pointer';

/**
 * What the list may show, as four independent switches.
 *
 * Three of them narrow the Things this Diagram does not place, by kind. The
 * fourth is not a kind at all: `spaces` adds a second **source** — every Space
 * in this Meta Space — and placing one of those authors the Space Thing that
 * frames it. They share a control because they answer one question for the
 * reader ("what am I looking at?") and because the pair that would otherwise
 * confuse them is drawn side by side here: the frame is a Space Thing already in
 * this Space, and the cube is a Space, whether or not this Space has ever
 * pointed at it.
 */
export type ThingsFilter = Thing['kind'] | 'spaces';

const FILTERS = ['markdown', 'alias', 'space', 'spaces'] as const satisfies readonly ThingsFilter[];

/**
 * Everything on, because the list's job is to show what is *not* on the canvas
 * and a filter that starts narrowed hides Things the reader has not been told
 * about. Toggling is subtractive from there: press one off to stop looking at
 * it, which is the gesture a reader reaches for when a kind is in the way.
 */
const ALL_FILTERS: readonly ThingsFilter[] = FILTERS;

/** One Space this Meta Space holds, as the list offers it. */
export interface ThingsPopoverSpace {
  readonly id: UUID;
  readonly title: string;
}

const FILTER_NAMES = {
  markdown: 'Markdown Things',
  alias: 'Aliases',
  space: 'Space Things in this Space',
  spaces: 'Spaces in this Meta Space',
} as const satisfies Record<ThingsFilter, string>;

const FilterGlyph = ({ filter }: { readonly filter: ThingsFilter }) => {
  if (filter === 'markdown') return <MarkdownIcon />;
  if (filter === 'alias') return <AliasIcon />;
  if (filter === 'space') return <SpaceThingIcon />;
  return <SpaceIcon />;
};

/**
 * Which side of its trigger the list opens on, matching the Dock's other
 * disclosures. The Dock supplies it from the edge it is docked to.
 */
export type ThingsPopoverSide = 'top' | 'bottom' | 'left' | 'right';

export interface ThingsPopoverProps {
  readonly things: readonly Thing[];
  readonly allThings: readonly Thing[];
  readonly open: boolean;
  /**
   * The reasons that close it, filtered — see the component's own note. The
   * second argument is Base UI's own dismissal reason, passed through.
   */
  readonly onOpenChange: (open: boolean) => void;
  /**
   * The trigger's id, which a controlled Base UI `Popover.Root` has to be told.
   *
   * Without `triggerId` on the root and the same `id` on the trigger, `open`
   * opens nothing at all and does it silently. The Dock mints it from
   * `useDockDisclosure`; a caller mounting this on its own may leave it out and
   * take Base UI's uncontrolled association.
   */
  readonly triggerId?: string | undefined;
  /** Withdraws the trigger without unmounting the surface it names. */
  readonly disabled?: boolean | undefined;
  readonly side?: ThingsPopoverSide | undefined;
  /**
   * The control the trigger draws as, and what it says.
   *
   * **Trigger and panel stay one component, and this is what lets them.** A
   * toggle whose `disabled` and whose surface are decided in two places is a
   * toggle that comes to disagree with what it names. The Dock hands in its own
   * `ToolbarButton` treatment — a plain `Button` in a `Toolbar` is a tab stop
   * the toolbar does not know about — and the catalogue's standalone stories
   * take the default.
   */
  readonly triggerRender?: ReactElement | undefined;
  /** What the trigger says, when the caller's own treatment names it differently. */
  readonly triggerLabel?: ReactNode | undefined;
  /** Returns a refusal that remains on this surface, or null after a completed Add. */
  readonly onAdd: (thing: Thing, activation: Activation) => string | null;
  readonly onDragStart: (thingId: ThingId) => void;
  readonly onDragEnd?: (() => void) | undefined;
  readonly revealedThingId?: ThingId | null | undefined;
  /**
   * The Title of every Space a Space Thing in this list references.
   *
   * Supplied rather than derived, for the reason the Alias titles beside it are
   * derived: an Alias's Target is a Thing of *this* Space and `allThings` holds
   * it, while a Space Thing's target is a different Space this surface cannot
   * read. A Space missing from the map is one the composition has not read yet.
   */
  readonly spaceTitleById?: ReadonlyMap<UUID, string> | undefined;
  /**
   * Every Space this Meta Space holds bar the one being authored.
   *
   * A second source rather than more Things: a Space is not in any Diagram, so
   * nothing here filters it against one, and placing it authors the Space Thing
   * that frames it (ADR 0074 — a Space exists because a Space Thing references
   * it, so this list is the one surface where both readings of "Space" are
   * offered together).
   */
  readonly spaces?: readonly ThingsPopoverSpace[] | undefined;
  /**
   * Place a Space by authoring the Space Thing that frames it.
   *
   * Answers a promise where {@link onAdd} answers at once, because this one is
   * a coordinated Edit across Spaces (ADR 0076) and the Thing's is a completion
   * on this Space's own session. The resolved value is a refusal to draw here,
   * or `null`.
   */
  readonly onAddSpace?: ((space: ThingsPopoverSpace) => Promise<string | null>) | undefined;
}

/**
 * The toggles of the filter, bound to the filter's own type.
 *
 * `ToggleGroupItem` is generic over its value and the group is generic over the
 * same one, but the type does not travel from group to children through JSX —
 * so the surface names it, once, here. That is what makes the value coming back
 * out of `onValueChange` a `ThingsFilter` in fact and not only in the group's
 * declaration, and it keeps a runtime re-parse from standing in for it.
 */
const FilterToggle = ToggleGroupItem<ThingsFilter>;

/** An Alias's Target title, `''` for the intake-guaranteed-unreachable case a Target does not resolve — the same convention `ThingNode` draws (ADR 0009). */
const targetTitle = (thing: Thing, titleById: ReadonlyMap<ThingId, string>): string =>
  thing.kind === 'alias' ? (titleById.get(thing.target) ?? '') : '';

const NO_SPACE_TITLES: ReadonlyMap<UUID, string> = new Map();
const NO_SPACES: readonly ThingsPopoverSpace[] = [];

/**
 * The Thing's own Title plus the Title of whatever it refers to, so a reader who
 * recalls a Thing by its Target or its Space finds it.
 *
 * Whole Titles on both sides, and wider than what the row shows on purpose, the
 * way `ThingSearchCombobox` filters on a whole Title and displays the name (ADR
 * 0083): an author's recall does not respect which line they typed a word on,
 * and a Thing findable here by a word from its subtitle and nowhere else reads as
 * broken search. A Space's own title is one line under that ADR, so there the
 * Title and the name are the same string.
 */
const searchableText = (
  thing: Thing,
  titleById: ReadonlyMap<ThingId, string>,
  spaceTitleById: ReadonlyMap<UUID, string>,
): string => {
  if (thing.kind === 'alias') return `${thing.title} ${targetTitle(thing, titleById)}`;
  if (thing.kind === 'space') return `${thing.title} ${spaceTitleById.get(thing.spaceId) ?? ''}`;
  return thing.title;
};

const emptyMessage = (available: number, inSpace: number): string =>
  inSpace === 0
    ? 'This Space has no Things.'
    : available === 0
      ? 'All Things are in this Diagram.'
      : 'No matching Things.';

/**
 * The dotted grip a row is dragged by.
 *
 * Three answers to "how does a Thing offer itself to be dragged" were compared in
 * the prototype — this strip-with-a-grip, the production Thing at row scale two
 * to a line, and a strip that raised into paper on hover. The grip won: a Thing
 * at row scale was mostly empty paper with a title too small to read at 117x66,
 * and an affordance that only arrives on hover arrives after the reader has
 * decided the list is not draggable.
 */
function RowGrip() {
  return <span className="things-popover__row-grip" aria-hidden="true" />;
}

/**
 * The Things View: existing Things absent from the selected Diagram.
 *
 * **The list is a Popover, and that is decided.**
 *
 * Three surfaces were compared — a Drawer from the screen edge, a Popover
 * anchored to its trigger, and a second dock of its own — over a Space with
 * twenty-nine unplaced Things, which is the scale that separates them. The
 * Popover won on the two things the comparison was for: it is anchored to the
 * control that opened it the way the menus beside it are, so the Dock reads as
 * one surface rather than a bar that sometimes summons a panel; and a drag out
 * of it survives its own dismissal, so adding several Things costs one
 * disclosure rather than one each.
 *
 * What the other two cost is why they went. The Drawer occludes the edge of the
 * canvas you are dropping onto, and it is a screen-level surface answering a
 * control-level question. The panel is furniture: it has to be positioned, it
 * stays until closed, and choosing it means choosing that once per list — two
 * docked docks plus two panels was more than the canvas could carry.
 *
 * That comparison was made in the Command Dock prototype, recorded above the
 * prototype's own list, and then deleted along with the code it was attached to
 * when the Dock was promoted — which is how the drawer came to ship against it.
 * It is written here, above the surface that won, and in
 * `.scratch/command-dock/issues/10-decide-the-cards-surface.md`. A decision
 * written inside the code it justifies dies with that code; losing this one now
 * takes two deliberate deletions.
 *
 * **It is deliberately non-modal and it does not close on an outside press.**
 * Dragging a Thing onto the canvas is the whole point of the surface, and a
 * plain non-modal popover closes both on an outside press and on focus leaving
 * it — which is exactly what dropping a Thing does. Adding several Things in a
 * row is the ordinary case, so the list ends on Escape, on its own trigger, or
 * because another of the Dock's disclosures opened, and never because the
 * reader touched the thing it exists to feed.
 */
export function ThingsPopover({
  things,
  allThings,
  open,
  onOpenChange,
  triggerId,
  disabled = false,
  side,
  triggerRender,
  triggerLabel,
  onAdd,
  onDragStart,
  onDragEnd,
  revealedThingId,
  spaceTitleById,
  spaces = NO_SPACES,
  onAddSpace,
}: ThingsPopoverProps) {
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState<readonly ThingsFilter[]>(ALL_FILTERS);
  const [refusal, setRefusal] = useState<string | null>(null);
  /**
   * Where the caret goes when a keyboard Add takes its own row away.
   *
   * **A deviation, recorded rather than assumed.** Base UI's popover has no
   * roving list, so when the activated row unmounts — which is what a completed
   * Add does, the Thing having joined the Diagram — it answers the focused
   * element disappearing by taking focus to the popup container: an inert box
   * the reader then has to Tab out of to reach anything.
   *
   * Considered: `ThingSearchCombobox`, whose listbox owns exactly this and is
   * the wrong shape — its rows are a *choice* that ends the interaction, and
   * these rows are a command the reader spends repeatedly. Base UI's `Menu`,
   * which has the roving focus but takes the arrow keys and typeahead the
   * filter field needs and dismisses on activating an item — the two reasons
   * this surface is a Popover and not a Menu in the first place.
   *
   * So one line rather than a second component: the caret lands back in the
   * filter, which is where a reader adding several Things is going next. That is
   * what the surface comparison bought — "adding several Things costs one
   * disclosure rather than one each" — and it is the whole of the custom
   * behaviour here. `ThingsPopover.test.tsx` and `things-popover.spec.ts` both
   * hold it.
   */
  const filterField = useRef<HTMLInputElement>(null);
  const titleById = useMemo(
    () => new Map(allThings.map((thing) => [thing.id, thing.title])),
    [allThings],
  );
  const spaceTitles = spaceTitleById ?? NO_SPACE_TITLES;
  const needle = query.trim().toLocaleLowerCase();
  /**
   * What each switch is contributing **right now**, search included.
   *
   * **The count answers the search and not just the source**, which is the one
   * thing that makes it worth drawing. A number that counted every Markdown
   * Thing in the Space while the list showed three would be a second claim about
   * the same set, disagreeing with the rows under it — and a count that
   * disagrees with the list is worse than no count.
   *
   * It ignores the switch's own pressed state, because a switch that is off has
   * to say what turning it on would bring back. A zero is drawn rather than
   * hidden: "none of these match" is the answer most worth having, and a
   * control that vanishes when empty teaches nothing.
   */
  const counts = useMemo(() => {
    const matched = (text: string) => text.toLocaleLowerCase().includes(needle);
    const ofKind = (kind: Thing['kind']) =>
      things.filter(
        (thing) => thing.kind === kind && matched(searchableText(thing, titleById, spaceTitles)),
      ).length;
    return {
      markdown: ofKind('markdown'),
      alias: ofKind('alias'),
      space: ofKind('space'),
      spaces: spaces.filter((space) => matched(space.title)).length,
    } satisfies Record<ThingsFilter, number>;
  }, [things, spaces, titleById, spaceTitles, needle]);

  /**
   * One list of rows over two sources, ordered by the name the reader scans.
   *
   * The Things and the Spaces are interleaved rather than sectioned. A section
   * per source is a second region to reason about and a place for the two to
   * disagree about ordering, and the reader is not looking for "a Thing" or "a
   * Space" — they are looking for a *name*. Each row carries the glyph that
   * says which it is, which is the same pair the filter above draws.
   */
  const visible = useMemo(() => {
    const matched = (text: string) => text.toLocaleLowerCase().includes(needle);
    const thingRows = things
      .map((thing, index) => ({ thing, index }))
      .filter(
        ({ thing }) =>
          shown.includes(thing.kind) && matched(searchableText(thing, titleById, spaceTitles)),
      )
      .map(({ thing, index }) => ({
        key: thing.id,
        // Ordered by name, which is the string the reader is scanning down
        // (ADR 0083): a Thing's later Title Lines would sort it by prose nobody
        // is reading in this list.
        name: titleName(thing.title),
        index,
        row: { kind: 'thing' as const, thing },
      }));
    const spaceRows = (shown.includes('spaces') ? spaces : [])
      .filter((space) => matched(space.title))
      .map((space, index) => ({
        key: space.id,
        name: space.title,
        index: things.length + index,
        row: { kind: 'space' as const, space },
      }));
    return [...thingRows, ...spaceRows].sort(
      (left, right) => left.name.localeCompare(right.name) || left.index - right.index,
    );
  }, [titleById, spaceTitles, things, spaces, shown, needle]);

  const beginDrag = (event: DragEvent<HTMLButtonElement>, thingId: ThingId): void => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(THING_DRAG_TYPE, thingId);
    onDragStart(thingId);
  };

  return (
    <Popover
      open={open}
      triggerId={triggerId}
      modal={false}
      onOpenChange={(next, details) => {
        // The two dismissals a drag out of this surface produces, declined by
        // name rather than by a blanket flag: an outside press is the reader
        // pressing the canvas they are dropping onto, and a focus-out is the
        // same gesture seen from the other side. Escape, the trigger and the
        // Dock's exclusivity all still close it.
        if (!next && (details.reason === 'outside-press' || details.reason === 'focus-out')) {
          return;
        }
        // Only the popup unmounts when the list closes, so the query and kind
        // would otherwise still be narrowing it the next time it opens — and the
        // reader would meet "No matching Things" with no memory of having typed
        // anything.
        if (!next) {
          setQuery('');
          setShown(ALL_FILTERS);
          setRefusal(null);
        }
        onOpenChange(next);
      }}
    >
      {/* React Flow's live Space-key pan activation subscription reaches this
          chrome button outside the canvas, so `.nokey` excludes it. */}
      <PopoverTrigger
        id={triggerId}
        disabled={disabled}
        render={
          triggerRender ?? (
            <Button
              className="nokey ml-auto"
              size="compact"
              variant={open ? 'default' : 'secondary'}
            />
          )
        }
      >
        {triggerLabel ?? 'Things'}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="center"
        sideOffset={6}
        className="nokey w-72 p-0"
        aria-label="Things"
      >
        {refusal === null ? null : (
          <Alert variant="destructive" className="m-2 mb-0">
            <AlertTitle>Thing not added</AlertTitle>
            <AlertDescription>{refusal}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-2 border-b p-2">
          {/* **The search is first and the toggles are under it.** Typing a name
              is what a reader reaches for, and it is the control that needs no
              prior decision; the toggles say what the list is *made of*, which
              is a thing you adjust once and leave. Putting the row of glyphs
              first made the reader answer a question they had not asked yet. */}
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              ref={filterField}
              aria-label="Search things"
              placeholder="Search things"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </InputGroup>
          {/* **A glyph and a count, in a control that looks like one.** Ten
              arrangements were drawn at this width and the comparison is in
              `.scratch/command-dock/issues/10-decide-the-cards-surface.md`. Two
              faults settled it. The first row shipped had no border and no
              ground, so four marks sat on the popover's paper looking like
              decoration — a control that can be pressed says so *before* it is
              pressed, which is what the box here buys and what leaves the fill
              free to mean only "on". The second is that a filter with no counts
              answers the wrong question: a reader wants to know whether the
              thing they are after is in here at all, and every labelled variant
              that could tell them cost a second line above the list this
              surface exists to show.

              Everything on, and pressing one **off** takes it out of the list.
              A filter that starts narrowed hides Things nobody has been told
              about; a filter that starts open and subtracts is legible from the
              control alone, because what is pressed is what you are looking at.
              The group is one tab stop with the arrows moving inside it, which
              is Base UI's. */}
          <ToggleGroup
            multiple
            aria-label="Filter the list by kind"
            value={shown}
            onValueChange={setShown}
            className="things-popover__filter"
          >
            {FILTERS.map((filter) => (
              <FilterToggle
                key={filter}
                value={filter}
                // The count is in the name rather than only in the badge: a
                // badge with a bare number in it contributes nothing to a
                // control that carries its own label, so a screen reader would
                // be told which kinds there are and never how many.
                aria-label={`${FILTER_NAMES[filter]}, ${String(counts[filter])}`}
                title={FILTER_NAMES[filter]}
                className="things-popover__toggle"
              >
                <FilterGlyph filter={filter} />
                <span className="things-popover__count" aria-hidden="true">
                  {counts[filter]}
                </span>
              </FilterToggle>
            ))}
          </ToggleGroup>
        </div>
        {visible.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            {emptyMessage(things.length, allThings.length)}
          </p>
        ) : (
          <ul className="things-popover__list">
            {visible.map(({ key, name, row }) => (
              <li key={key}>
                {/* **A row is a button, and the drag is the shortcut.** ADR 0082
                    binds that everything the surface offers is operable from the
                    keyboard alone, and names this case: a drag may be *a* way to
                    place a Thing into a Diagram and is never the only one.

                    A native button rather than a `div` with a role and a
                    `tabIndex`: Enter and Space activating a control is the
                    platform's, and the three attributes it would take to
                    reproduce that are three chances to reproduce it wrong. The
                    list stays open either way, so adding several Things costs one
                    disclosure.

                    **One row shape over two sources.** A Thing joins the Diagram;
                    a Space joins it by authoring the Space Thing that frames it.
                    What differs is the glyph and which completion the press
                    spends — not the control, the label or the gesture, because
                    to the reader both are "put this on the canvas". */}
                <Button
                  variant="ghost"
                  draggable={row.kind === 'thing'}
                  data-thing-id={row.kind === 'thing' ? row.thing.id : undefined}
                  data-space-id={row.kind === 'space' ? row.space.id : undefined}
                  aria-current={
                    row.kind === 'thing' && row.thing.id === revealedThingId ? 'true' : undefined
                  }
                  className="things-popover__row w-full justify-start"
                  aria-label={`Add ${name} to Diagram`}
                  title={
                    row.kind === 'thing'
                      ? 'Add to Diagram, or drag it onto the canvas'
                      : 'Add a Space Thing for this Space to the Diagram'
                  }
                  onDragStart={
                    row.kind === 'thing' ? (event) => beginDrag(event, row.thing.id) : undefined
                  }
                  onDragEnd={row.kind === 'thing' ? onDragEnd : undefined}
                  onClick={(event) => {
                    // `detail === 0` is the platform's own answer for a press
                    // that came from Enter or Space rather than a pointer.
                    const activation = event.detail === 0 ? 'keyboard' : 'pointer';
                    if (row.kind === 'thing') {
                      const next = onAdd(row.thing, activation);
                      if (next === null && activation === 'keyboard') filterField.current?.focus();
                      setRefusal(next);
                      return;
                    }
                    // The caret moves as soon as the row is spent rather than
                    // when the Edit lands: a coordinated Edit takes a round
                    // trip, and a reader held still for it would be waiting on
                    // a surface that looks finished. A refusal arrives here
                    // either way, on the list that asked for it.
                    if (activation === 'keyboard') filterField.current?.focus();
                    setRefusal(null);
                    void onAddSpace?.(row.space).then(setRefusal);
                  }}
                >
                  <RowGrip />
                  {row.kind === 'thing' ? <ThingKindIcon kind={row.thing.kind} /> : <SpaceIcon />}
                  {/* The name, not the whole Title: this is a row in a list
                      being scanned down, and ADR 0083 puts the ladder on the
                      Thing front rather than on every surface that names one. A
                      Space's own title is one line under that ADR, so there the
                      Title and the name are the same string. */}
                  <span className="things-popover__row-title">{name}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
