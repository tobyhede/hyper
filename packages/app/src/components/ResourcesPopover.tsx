import {
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { titleName, type Resource, type ResourceId, type UUID } from '@project/core';
import { describeSpaceResourceBreak, type SpaceResourceBreak } from '../authoring-refusal';
import type { SettlePlacement } from '../resources-drag';
import {
  Button,
  Alert,
  AlertDescription,
  AlertTitle,
  ReferenceIcon,
  ResourceKindIcon,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  MarkdownIcon,
  ParentIcon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchIcon,
  SpaceResourceIcon,
  SpaceIcon,
  ToggleGroup,
  ToggleGroupItem,
} from '@project/ui';
import './resources-popover.css';

export const RESOURCE_DRAG_TYPE = 'application/x-hyper-resource-id';
/**
 * A Space row's drag carries the Space's id under its own type, so the canvas
 * can tell which source a drop came from before it reads the id.
 */
export const SPACE_DRAG_TYPE = 'application/x-hyper-space-id';

type Activation = 'keyboard' | 'pointer';

/**
 * What the list may show, as four independent switches.
 *
 * Three of them narrow the Resources this Map does not place, by kind. The
 * fourth is not a kind at all: `spaces` adds a second **source** — every Space
 * in this Meta Space — and placing one of those authors the Space Resource that
 * frames it. They share a control because they answer one question for the
 * reader ("what am I looking at?"). The All Spaces filter uses the Opener/Meta
 * OPEN mark for the collection; Space Resources and individual Space rows keep
 * their cube glyph.
 */
export type ResourcesFilter = Resource['kind'] | 'spaces';

/**
 * Every filter exactly once, in the order they are drawn — **coverage**, not
 * membership.
 *
 * `as const satisfies readonly ResourcesFilter[]` says each entry *is* a filter and
 * says nothing about any being absent, so a kind added to `Resource` and left out
 * here would compile and its Resources would simply not appear in this list. The
 * intersection makes the omission a `TS2345` where the array is written: with
 * every member present `ResourcesFilter extends T[number]` holds and the parameter
 * is `T`, and with one missing it is `never`, which no array satisfies.
 *
 * The `if`/`return` cascade a filter's glyph would otherwise use is why this is
 * needed rather than left to lint: `switch-exhaustiveness-check` never sees a
 * cascade, and `FILTER_GLYPHS` below closes the same hole the same way.
 */
const everyFilter = <const T extends readonly ResourcesFilter[]>(
  filters: T & (ResourcesFilter extends T[number] ? unknown : never),
): T => filters;

const FILTERS = everyFilter(['markdown', 'reference', 'space', 'spaces']);

/**
 * Everything on, because the list's job is to show what is *not* on the canvas
 * and a filter that starts narrowed hides Resources the reader has not been told
 * about. Toggling is subtractive from there: press one off to stop looking at
 * it, which is the gesture a reader reaches for when a kind is in the way.
 */
const ALL_FILTERS: readonly ResourcesFilter[] = FILTERS;

/** One Space this Meta Space holds, as the list offers it. */
export interface ResourcesPopoverSpace {
  readonly id: UUID;
  readonly title: string;
}

const FILTER_NAMES = {
  markdown: 'Markdown Resources',
  reference: 'Reference Resources',
  space: 'Space Resources in this Space',
  spaces: 'Spaces in this Meta Space',
} as const satisfies Record<ResourcesFilter, string>;

/**
 * A record rather than a cascade, for the reason `everyFilter` exists: a
 * fall-through `return <SpaceIcon />` absorbs every unhandled filter, so a new
 * one would silently draw a Space cube. Keyed by the union, a miss is a
 * compile error where the record is written. Same idiom as `ResourceKindIcon`.
 */
const FILTER_GLYPHS = {
  markdown: MarkdownIcon,
  reference: ReferenceIcon,
  space: SpaceResourceIcon,
  spaces: ParentIcon,
} satisfies Record<ResourcesFilter, ComponentType>;

const FilterGlyph = ({ filter }: { readonly filter: ResourcesFilter }) => {
  const Glyph = FILTER_GLYPHS[filter];
  return <Glyph />;
};

/**
 * Which side of its trigger the list opens on, matching the Dock's other
 * disclosures. The Dock supplies it from the edge it is docked to.
 */
export type ResourcesPopoverSide = 'top' | 'bottom' | 'left' | 'right';

export interface ResourcesPopoverProps {
  readonly resources: readonly Resource[];
  readonly allResources: readonly Resource[];
  readonly open: boolean;
  /**
   * Asks the owner of {@link open} to change it, with the dismissals this
   * surface declines already filtered out — see the component's own note.
   *
   * Base UI's own dismissal reason is read here and **not** passed on: it is
   * what decides which closes are declined, and a caller has no use for the
   * ones that survive. What resets the list is `open` going false, not this
   * being called, because the Dock closes the list by changing the prop.
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
  readonly side?: ResourcesPopoverSide | undefined;
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
  readonly onAdd: (resource: Resource, activation: Activation) => string | null;
  readonly onDragStart: (resourceId: ResourceId) => void;
  readonly onDragEnd?: (() => void) | undefined;
  readonly revealedResourceId?: ResourceId | null | undefined;
  /**
   * The Title of every Space a Space Resource in this list references.
   *
   * Supplied rather than derived, for the reason the Reference Resource titles beside it are
   * derived: a Reference Resource's Target is a Resource of *this* Space and `allResources` holds
   * it, while a Space Resource's target is a different Space this surface cannot
   * read. A Space missing from the map is one the composition has not read yet.
   */
  readonly spaceTitleById?: ReadonlyMap<UUID, string> | undefined;
  /**
   * Every Space this Meta Space holds bar the one being authored.
   *
   * A second source rather than more Resources: a Space is not in any Map, so
   * nothing here filters it against one, and placing it authors the Space Resource
   * that frames it (ADR 0074 — a Space exists because a Space Resource references
   * it, so this list is the one surface where both readings of "Space" are
   * offered together).
   */
  readonly spaces?: readonly ResourcesPopoverSpace[] | undefined;
  /**
   * Place a Space by authoring the Space Resource that frames it.
   *
   * Answers a promise where {@link onAdd} answers at once, because this one is
   * a coordinated Edit across Spaces (ADR 0076) and the Resource's is a completion
   * on this Space's own session. The resolved value is a refusal to draw here,
   * or `null`.
   */
  readonly onAddSpace?: ((space: ResourcesPopoverSpace) => Promise<string | null>) | undefined;
  /**
   * A Space row has left the list on a drag.
   *
   * `settle` is where the drop's answer comes back: it is the settlement a
   * press on the same row spends, bound to the opening the drag started from,
   * so a refusal lands on the list that asked for it — see
   * {@link StandingRefusal}. Without this a Space row is pressed only, and draws
   * no grip.
   */
  readonly onSpaceDragStart?:
    ((space: ResourcesPopoverSpace, settle: SettlePlacement) => void) | undefined;
}

/**
 * The toggles of the filter, bound to the filter's own type.
 *
 * `ToggleGroupItem` is generic over its value and the group is generic over the
 * same one, but the type does not travel from group to children through JSX —
 * so the surface names it, once, here. That is what makes the value coming back
 * out of `onValueChange` a `ResourcesFilter` in fact and not only in the group's
 * declaration, and it keeps a runtime re-parse from standing in for it.
 */
const FilterToggle = ToggleGroupItem<ResourcesFilter>;

/** A Reference Resource's Target title, `''` for the intake-guaranteed-unreachable case a Target does not resolve — the same convention `ResourceNode` draws (ADR 0009). */
const targetTitle = (resource: Resource, titleById: ReadonlyMap<ResourceId, string>): string =>
  resource.kind === 'reference' ? (titleById.get(resource.target) ?? '') : '';

const NO_SPACE_TITLES: ReadonlyMap<UUID, string> = new Map();
const NO_SPACES: readonly ResourcesPopoverSpace[] = [];

/**
 * The Resource's own Title plus the Title of whatever it refers to, so a reader who
 * recalls a Resource by its Target or its Space finds it.
 *
 * Whole Titles on both sides, and wider than what the row shows on purpose, the
 * way `ResourceSearchCombobox` filters on a whole Title and displays the name (ADR
 * 0083): an author's recall does not respect which line they typed a word on,
 * and a Resource findable here by a word from its subtitle and nowhere else reads as
 * broken search. A Space's own title is one line under that ADR, so there the
 * Title and the name are the same string.
 */
const searchableText = (
  resource: Resource,
  titleById: ReadonlyMap<ResourceId, string>,
  spaceTitleById: ReadonlyMap<UUID, string>,
): string => {
  if (resource.kind === 'reference') return `${resource.title} ${targetTitle(resource, titleById)}`;
  if (resource.kind === 'space')
    return `${resource.title} ${spaceTitleById.get(resource.spaceId) ?? ''}`;
  return resource.title;
};

/**
 * Why the list is empty, over **both** sources.
 *
 * The two standing sentences are claims about the Resources — that the Space has
 * none, and that the Map already holds them all — and either is false as an
 * account of an empty list while the Spaces source is switched on with
 * something to give. So both are withheld the moment it is: what the reader is
 * looking at then is a search that matched nothing, which is what the third
 * sentence says.
 */
const emptyMessage = (available: number, inSpace: number, offeredSpaces: number): string =>
  offeredSpaces > 0
    ? 'No matching Resources.'
    : inSpace === 0
      ? 'This Space has no Resources.'
      : available === 0
        ? 'All Resources are in this Map.'
        : 'No matching Resources.';

/**
 * The dotted grip a row is dragged by.
 *
 * Three answers to "how does a Resource offer itself to be dragged" were compared in
 * the prototype — this strip-with-a-grip, the production Resource at row scale two
 * to a line, and a strip that raised into paper on hover. The grip won: a Resource
 * at row scale was mostly empty paper with a title too small to read at 117x66,
 * and an affordance that only arrives on hover arrives after the reader has
 * decided the list is not draggable.
 */
function RowGrip() {
  return <span className="resources-popover__row-grip" aria-hidden="true" />;
}

/**
 * The sentence standing on the list, and which opening of it asked for one.
 *
 * **The reset cannot clear a refusal that has not arrived yet.** Only the popup
 * unmounts, so the component and this state outlive every close, and
 * `onAddSpace` is a coordinated cross-Space Edit that settles arbitrarily
 * later: press a Space row, press Escape, and the answer lands *behind* the
 * reset that was supposed to forget it. The next open would then draw a red
 * alert with no gesture behind it — precisely the state the reset exists to
 * make unreachable. So a placement carries the opening it was asked from, and a
 * settlement is applied only where that opening is still the one on screen.
 *
 * **The counter rides on the same state as the sentence** rather than on a ref,
 * which is what lets a late settlement be dropped in the updater — comparing
 * against a ref would mean reading and writing one during render, which is what
 * `react-hooks/refs` is right to reject and what the reset would have to do.
 *
 * A counter rather than the open flag, because the list can be reopened while
 * an Edit is still in flight, and that opening did not ask for it either.
 *
 * A Space row dragged onto the canvas asks from the opening it left: the
 * settlement handed out at its dragstart is bound to that opening, so the drop
 * reports exactly as a press made at that moment would.
 *
 * The Resource arm needs none of this: `onAdd` answers synchronously, so its
 * refusal is installed by the press that caused it.
 */
interface StandingRefusal {
  readonly opening: number;
  readonly said: string | null;
}

const NOTHING_REFUSED: StandingRefusal = { opening: 0, said: null };

/**
 * The Resources View: existing Resources absent from the selected Map.
 *
 * **The list is a Popover, and that is decided.**
 *
 * Three surfaces were compared — a Drawer from the screen edge, a Popover
 * anchored to its trigger, and a second dock of its own — over a Space with
 * twenty-nine unplaced Resources, which is the scale that separates them. The
 * Popover won on the two criteria in the comparison: it is anchored to the
 * control that opened it the way the menus beside it are, so the Dock reads as
 * one surface rather than a bar that sometimes summons a panel; and a drag out
 * of it survives its own dismissal, so adding several Resources costs one
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
 * Dragging a Resource onto the canvas is the whole point of the surface, and a
 * plain non-modal popover closes both on an outside press and on focus leaving
 * it — which is exactly what dropping a Resource does. Adding several Resources in a
 * row is the ordinary case, so the list ends on Escape, on its own trigger, or
 * because another of the Dock's disclosures opened, and never because the
 * reader touched the surface it exists to feed.
 */
export function ResourcesPopover({
  resources,
  allResources,
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
  revealedResourceId,
  spaceTitleById,
  spaces = NO_SPACES,
  onAddSpace,
  onSpaceDragStart,
}: ResourcesPopoverProps) {
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState<readonly ResourcesFilter[]>(ALL_FILTERS);
  const [standing, setStanding] = useState<StandingRefusal>(NOTHING_REFUSED);
  const refusal = standing.said;
  const setRefusal = (said: string | null): void =>
    setStanding((current) => ({ ...current, said }));
  /**
   * Where the caret goes when a keyboard Add takes its own row away.
   *
   * **A deviation, recorded rather than assumed.** Base UI's popover has no
   * roving list, so when the activated row unmounts — which is what a completed
   * Add does, the Resource having joined the Map — it answers the focused
   * element disappearing by taking focus to the popup container: an inert box
   * the reader then has to Tab out of to reach anything.
   *
   * Considered: `ResourceSearchCombobox`, whose listbox owns exactly this and is
   * the wrong shape — its rows are a *choice* that ends the interaction, and
   * these rows are a command the reader spends repeatedly. Base UI's `Menu`,
   * which has the roving focus but takes the arrow keys and typeahead the
   * filter field needs and dismisses on activating an item — the two reasons
   * this surface is a Popover and not a Menu in the first place.
   *
   * So one line rather than a second component: the caret lands back in the
   * filter, which is where a reader adding several Resources is going next. That is
   * what the surface comparison bought — "adding several Resources costs one
   * disclosure rather than one each" — and it is the whole of the custom
   * behaviour here. `ResourcesPopover.test.tsx` and `resources-popover.spec.ts` both
   * hold it.
   */
  const filterField = useRef<HTMLInputElement>(null);
  /**
   * Everything narrowing or interrupting the list is forgotten when it closes.
   *
   * Only the popup unmounts, so the query, the kind toggles and a standing
   * refusal would otherwise still be there the next time it opens — and the
   * reader would meet "No matching Resources" over a red alert with no memory of
   * having caused either.
   *
   * **Keyed off `open` going false rather than off `onOpenChange`, because the
   * surface does not decide most of its own closes.** The Dock holds `open` as
   * a prop and changes it directly from two paths — another disclosure taking
   * the one slot, and the list being withdrawn while presenting — and neither
   * invokes the handler. A reset hanging off the handler would cover the
   * trigger press and Escape only, which is the third way it closes and the one
   * the reader is least likely to have left state behind on.
   *
   * **During render rather than in an effect**, which is React's own answer for
   * adjusting state when a prop changes: the reset is applied before anything
   * is drawn, so no frame shows the stale query, and `react-hooks` is right to
   * reject the effect that would show one and then correct it.
   */
  const [lastOpen, setLastOpen] = useState(open);
  if (lastOpen !== open) {
    setLastOpen(open);
    if (!open) {
      setQuery('');
      setShown(ALL_FILTERS);
      // The sentence goes, and the opening it belonged to is spent: a placement
      // still in flight answers onto a list that is no longer there, and
      // {@link StandingRefusal} is where that is dropped.
      setStanding((current) => ({ opening: current.opening + 1, said: null }));
    }
  }
  const titleById = useMemo(
    () => new Map(allResources.map((resource) => [resource.id, resource.title])),
    [allResources],
  );
  const spaceTitles = spaceTitleById ?? NO_SPACE_TITLES;
  const needle = query.trim().toLocaleLowerCase();
  /**
   * What each switch is contributing **right now**, search included.
   *
   * **The count answers the search and not just the source**, which is the one
   * reason that makes it worth drawing. A number that counted every Markdown
   * Resource in the Space while the list showed three would be a second claim about
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
    const ofKind = (kind: Resource['kind']) =>
      resources.filter(
        (resource) =>
          resource.kind === kind && matched(searchableText(resource, titleById, spaceTitles)),
      ).length;
    return {
      markdown: ofKind('markdown'),
      reference: ofKind('reference'),
      space: ofKind('space'),
      spaces: spaces.filter((space) => matched(space.title)).length,
    } satisfies Record<ResourcesFilter, number>;
  }, [resources, spaces, titleById, spaceTitles, needle]);

  /**
   * One list of rows over two sources, ordered by the name the reader scans.
   *
   * The Resources and the Spaces are interleaved rather than sectioned. A section
   * per source is a second region to reason about and a place for the two to
   * disagree about ordering, and the reader is not looking for "a Resource" or "a
   * Space" — they are looking for a *name*. Each row carries the glyph that
   * says which it is, which is the same pair the filter above draws.
   */
  const visible = useMemo(() => {
    const matched = (text: string) => text.toLocaleLowerCase().includes(needle);
    const resourceRows = resources
      .map((resource, index) => ({ resource, index }))
      .filter(
        ({ resource }) =>
          shown.includes(resource.kind) &&
          matched(searchableText(resource, titleById, spaceTitles)),
      )
      .map(({ resource, index }) => ({
        key: resource.id,
        // Ordered by name, which is the string the reader is scanning down
        // (ADR 0083): a Resource's later Title Lines would sort it by prose nobody
        // is reading in this list.
        name: titleName(resource.title),
        index,
        row: { kind: 'resource' as const, resource },
      }));
    const spaceRows = (shown.includes('spaces') ? spaces : [])
      .filter((space) => matched(space.title))
      .map((space, index) => ({
        key: space.id,
        name: space.title,
        index: resources.length + index,
        row: { kind: 'space' as const, space },
      }));
    return [...resourceRows, ...spaceRows].sort(
      (left, right) => left.name.localeCompare(right.name) || left.index - right.index,
    );
  }, [titleById, spaceTitles, resources, spaces, shown, needle]);

  /**
   * What a Space placement answered, drawn only on the opening that asked for
   * it — see {@link StandingRefusal}.
   */
  const showSettlement =
    (asked: number) =>
    (said: string | null): void => {
      setStanding((current) => (current.opening === asked ? { ...current, said } : current));
    };
  /**
   * The rejection arm of a Space placement, hoisted so the caught value takes
   * its type from {@link SpaceResourceBreak} rather than from an annotation written
   * at the `then`.
   */
  const showBreak =
    (asked: number): SpaceResourceBreak =>
    (failure) => {
      const said = describeSpaceResourceBreak(failure);
      showSettlement(asked)(said);
      return said;
    };

  /**
   * The one way a Space placement's answer reaches this list, whether a press
   * or a drop asked for it: a standing sentence goes as the placement is asked
   * for, and whatever it answers is drawn on the opening `asked` names.
   */
  const settlementFor =
    (asked: number): SettlePlacement =>
    (answer) => {
      showSettlement(asked)(null);
      void answer.then(showSettlement(asked), showBreak(asked));
    };

  const beginDrag = (event: DragEvent<HTMLButtonElement>, resourceId: ResourceId): void => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(RESOURCE_DRAG_TYPE, resourceId);
    onDragStart(resourceId);
  };

  const beginSpaceDrag = (
    event: DragEvent<HTMLButtonElement>,
    space: ResourcesPopoverSpace,
    started: (space: ResourcesPopoverSpace, settle: SettlePlacement) => void,
  ): void => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(SPACE_DRAG_TYPE, space.id);
    started(space, settlementFor(standing.opening));
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
        {triggerLabel ?? 'Resources'}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="center"
        sideOffset={6}
        className="nokey w-72 p-0"
        aria-label="Resources"
      >
        {refusal === null ? null : (
          <Alert variant="destructive" className="m-2 mb-0">
            <AlertTitle>Resource not added</AlertTitle>
            <AlertDescription>{refusal}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-2 border-b p-2">
          {/* **The search is first and the toggles are under it.** Typing a name
              is what a reader reaches for, and it is the control that needs no
              prior decision; the toggles say what the list is *made of*, which
              is a setting you adjust once and leave. Putting the row of glyphs
              first made the reader answer a question they had not asked yet. */}
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              ref={filterField}
              aria-label="Search resources"
              placeholder="Search resources"
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
              resource they are after is in here at all, and every labelled variant
              that could tell them cost a second line above the list this
              surface exists to show.

              Everything on, and pressing one **off** takes it out of the list.
              A filter that starts narrowed hides Resources nobody has been told
              about; a filter that starts open and subtracts is legible from the
              control alone, because what is pressed is what you are looking at.
              The group is one tab stop with the arrows moving inside it, which
              is Base UI's. */}
          <ToggleGroup
            multiple
            aria-label="Filter the list by kind"
            value={shown}
            onValueChange={setShown}
            className="resources-popover__filter"
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
                className="resources-popover__toggle"
              >
                <FilterGlyph filter={filter} />
                <span className="resources-popover__count" aria-hidden="true">
                  {counts[filter]}
                </span>
              </FilterToggle>
            ))}
          </ToggleGroup>
        </div>
        {visible.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            {emptyMessage(
              resources.length,
              allResources.length,
              shown.includes('spaces') ? spaces.length : 0,
            )}
          </p>
        ) : (
          <ul className="resources-popover__list">
            {visible.map(({ key, name, row }) => (
              <li key={key}>
                {/* **A row is a button, and the drag is the shortcut.** ADR 0082
                    binds that everything the surface offers is operable from the
                    keyboard alone, and names this case: a drag may be *a* way to
                    place a Resource into a Map and is never the only one.

                    A native button rather than a `div` with a role and a
                    `tabIndex`: Enter and Space activating a control is the
                    platform's, and the three attributes it would take to
                    reproduce that are three chances to reproduce it wrong. The
                    list stays open either way, so adding several Resources costs one
                    disclosure.

                    **One row shape over two sources.** A Resource joins the Map;
                    a Space joins it by authoring the Space Resource that frames it.
                    What differs is the glyph and which completion the press or
                    the drop spends — not the control, the label or the gestures,
                    because to the reader both are "put this on the canvas". */}
                <Button
                  variant="ghost"
                  draggable={row.kind === 'resource' || onSpaceDragStart !== undefined}
                  data-resource-id={row.kind === 'resource' ? row.resource.id : undefined}
                  data-space-id={row.kind === 'space' ? row.space.id : undefined}
                  aria-current={
                    row.kind === 'resource' && row.resource.id === revealedResourceId
                      ? 'true'
                      : undefined
                  }
                  className="resources-popover__row w-full justify-start"
                  aria-label={`Add ${name} to Map`}
                  title={
                    row.kind === 'resource'
                      ? 'Add to Map, or drag it onto the canvas'
                      : onSpaceDragStart === undefined
                        ? 'Add a Space Resource for this Space to the Map'
                        : 'Add a Space Resource for this Space to the Map, or drag it onto the canvas'
                  }
                  onDragStart={
                    row.kind === 'resource'
                      ? (event) => beginDrag(event, row.resource.id)
                      : onSpaceDragStart === undefined
                        ? undefined
                        : (event) => beginSpaceDrag(event, row.space, onSpaceDragStart)
                  }
                  onDragEnd={onDragEnd}
                  onClick={(event) => {
                    // `detail === 0` is the platform's own answer for a press
                    // that came from Enter or Space rather than a pointer.
                    const activation = event.detail === 0 ? 'keyboard' : 'pointer';
                    if (row.kind === 'resource') {
                      const next = onAdd(row.resource, activation);
                      if (next === null && activation === 'keyboard') filterField.current?.focus();
                      setRefusal(next);
                      return;
                    }
                    // **The caret stays put here, where a Resource Add moves it.**
                    // The rule is the one written above `filterField`, not an
                    // exception to it: the caret moves because a completed Add
                    // takes its own row away, and a Space row is not taken
                    // away. `referenceableSpaces` withholds only the containing
                    // Space, so a Space stays offered however many Space Resources
                    // frame it — ADR 0074's convergence, which is why two Resources
                    // may reference one Space. Moving the caret off a row that
                    // is still there costs the reader their place in the list
                    // and claims a completion the surface cannot see.
                    //
                    // A refusal still arrives here either way, on the list that
                    // asked for it.
                    //
                    // `settlementFor` takes a rejection arm as well as a
                    // resolution one: a caller that breaks rather than refusing
                    // would otherwise leave this row having visibly done
                    // nothing, with the only trace an unhandled rejection nobody
                    // reads. `App` reports the same break on its own channel;
                    // this is what the reader who pressed the row sees — as long
                    // as they are still reading the list they asked from, which
                    // the opening this press was made on is what decides. A drop
                    // spends the same settlement, bound at its dragstart.
                    if (onAddSpace === undefined) {
                      setRefusal(null);
                      return;
                    }
                    settlementFor(standing.opening)(onAddSpace(row.space));
                  }}
                >
                  {/* Only where a drag actually starts: a grip on a row with
                      no `onSpaceDragStart` behind it would promise a gesture
                      that fires no `dragstart` and answers with nothing. */}
                  {row.kind === 'resource' || onSpaceDragStart !== undefined ? <RowGrip /> : null}
                  {row.kind === 'resource' ? (
                    <ResourceKindIcon kind={row.resource.kind} />
                  ) : (
                    <SpaceIcon />
                  )}
                  {/* The name, not the whole Title: this is a row in a list
                      being scanned down, and ADR 0083 puts the ladder on the
                      Resource front rather than on every surface that names one. A
                      Space's own title is one line under that ADR, so there the
                      Title and the name are the same string. */}
                  <span className="resources-popover__row-title">{name}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
