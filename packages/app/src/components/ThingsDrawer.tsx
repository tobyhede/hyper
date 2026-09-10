import { useMemo, useState, type DragEvent, type ReactElement, type ReactNode } from 'react';
import { titleName, type Thing, type ThingId, type UUID } from '@project/core';
import {
  Button,
  Alert,
  AlertDescription,
  AlertTitle,
  CanvasThing,
  ChevronDownIcon,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerPopup,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
  DrawerViewport,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  FALLBACK_GRAPH_COLOR,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  SearchIcon,
} from '@project/ui';
import { thingSizeVars } from '../thing';

export const THING_DRAG_TYPE = 'application/x-hyper-thing-id';

type KindFilter = 'all' | Thing['kind'];
type Activation = 'keyboard' | 'pointer';

export interface ThingsDrawerProps {
  readonly things: readonly Thing[];
  readonly allThings: readonly Thing[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Withdraws the trigger without unmounting the surface it names. */
  readonly disabled?: boolean;
  /**
   * The control the trigger draws as, and what it says.
   *
   * **Trigger and panel stay one component, and this is what lets them.** The
   * Command Dock's Things cluster is where the trigger belongs now, and a toolbar
   * has its own control treatment and its own roving order — a `Button` in there
   * is a tab stop the toolbar does not know about. Splitting the component in
   * two so the caller could draw its own trigger is the other way to do it and
   * is the wrong one: the toggle's `disabled` and the surface it names would
   * then be decided in two places, which is exactly what putting them together
   * fixed.
   *
   * Omitted, it draws the secondary `Button` it always did — which is what the
   * catalogue's own stories mount it as, standing on their own rather than
   * inside a Dock.
   */
  readonly triggerRender?: ReactElement | undefined;
  /** What the trigger says, when the caller's own treatment names it differently. */
  readonly triggerLabel?: ReactNode;
  /** Returns a refusal that remains on this surface, or null after a completed Add. */
  readonly onAdd: (thing: Thing, activation: Activation) => string | null;
  readonly onDragStart: (thingId: ThingId) => void;
  readonly onDragEnd?: () => void;
  readonly revealedThingId?: ThingId | null;
  /**
   * The Title of every Space a Space Thing in this list references.
   *
   * Supplied rather than derived, for the reason the Alias titles beside it are
   * derived: an Alias's Target is a Thing of *this* Space and `allThings` holds
   * it, while a Space Thing's target is a different Space this surface cannot
   * read. A Space missing from the map is one the composition has not read yet.
   */
  readonly spaceTitleById?: ReadonlyMap<UUID, string>;
}

/**
 * The kind rows of the filter menu, bound to the filter's own type.
 *
 * `DropdownMenuRadioItem` is generic over its value and the group is generic
 * over the same one, but the type does not travel from group to children
 * through JSX — so the surface names it, once, here. That is what makes the
 * value coming back out of `onValueChange` a `KindFilter` in fact and not only
 * in the group's declaration, and it retires the runtime re-parse that used to
 * stand in for it.
 */
const KindFilterItem = DropdownMenuRadioItem<KindFilter>;

/** An Alias's Target title, `''` for the intake-guaranteed-unreachable case a Target does not resolve — the same convention `ThingNode` draws (ADR 0009). */
const targetTitle = (thing: Thing, titleById: ReadonlyMap<ThingId, string>): string =>
  thing.kind === 'alias' ? (titleById.get(thing.target) ?? '') : '';

const frontOf = (thing: Thing) => {
  if (thing.kind === 'alias') return { kind: 'alias' as const, source: '', open: false };
  // Closed, always: this list draws Things that are *not* on the canvas, so no
  // entry here carries the Diagram's Open state and none offers the selections
  // an Open Space Thing authors.
  if (thing.kind === 'space') return { kind: 'space' as const, open: false };
  return { kind: 'markdown' as const, source: thing.body, open: false as const };
};

const NO_SPACE_TITLES: ReadonlyMap<UUID, string> = new Map();

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
 * The Things View: existing Things absent from the selected Diagram.
 *
 * A `Drawer` rather than a second `Sidebar` — ADR 0053 gave the one Sidebar the
 * left edge, and composing another on the right made this panel share the
 * shell's `SidebarProvider`, its open state and its `Ctrl/Cmd-B` shortcut while
 * still having no dismissal, focus or naming contract of its own. ADR 0082 then
 * retired the Sidebar entirely and `.scratch/command-dock/issues/08` deleted the
 * primitive, so the alternative this paragraph argues against no longer exists.
 * The reasoning is kept because it is why this is a `Drawer` rather than
 * anything else, and it survives the surface it was written against.
 *
 * It is deliberately **non-modal and pointer-dismissal-free**. Dragging a Thing
 * onto the canvas is the whole point of the surface, so a backdrop would defeat
 * it — and a plain non-modal Base UI drawer closes both on an outside press and
 * on focus leaving it, which is exactly what dropping a Thing does. Adding
 * several Things in a row is the ordinary case, so the drawer ends on its own
 * control, on the trigger, on Escape or on a swipe, and never because the
 * reader touched the thing it exists to feed.
 */
export function ThingsDrawer({
  things,
  allThings,
  open,
  onOpenChange,
  disabled = false,
  triggerRender,
  triggerLabel,
  onAdd,
  onDragStart,
  onDragEnd,
  revealedThingId,
  spaceTitleById,
}: ThingsDrawerProps) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [refusal, setRefusal] = useState<string | null>(null);
  const titleById = useMemo(
    () => new Map(allThings.map((thing) => [thing.id, thing.title])),
    [allThings],
  );
  const spaceTitles = spaceTitleById ?? NO_SPACE_TITLES;
  const visible = useMemo(
    () =>
      things
        .map((thing, index) => ({ thing, index }))
        .filter(
          ({ thing }) =>
            (kind === 'all' || thing.kind === kind) &&
            searchableText(thing, titleById, spaceTitles)
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()),
        )
        // Ordered by name, which is the string the reader is scanning down
        // (ADR 0083): a Thing's later Title Lines would sort it by prose nobody
        // is reading in this list.
        .sort(
          (left, right) =>
            titleName(left.thing.title).localeCompare(titleName(right.thing.title)) ||
            left.index - right.index,
        )
        .map(({ thing }) => thing),
    [titleById, spaceTitles, things, kind, query],
  );

  const beginDrag = (event: DragEvent<HTMLButtonElement>, thingId: ThingId): void => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(THING_DRAG_TYPE, thingId);
    onDragStart(thingId);
  };

  return (
    <Drawer
      open={open}
      // Only the popup unmounts when the drawer closes, so unlike the panel this
      // replaced, the query and kind would otherwise still be narrowing the list
      // the next time it opens — and the reader would meet "No matching Things"
      // with no memory of having typed anything.
      onOpenChange={(next) => {
        if (!next) {
          setQuery('');
          setKind('all');
          setRefusal(null);
        }
        onOpenChange(next);
      }}
      modal={false}
      disablePointerDismissal
      swipeDirection="right"
    >
      {/* React Flow's live Space-key pan activation subscription reaches this
          chrome button outside the canvas, so `.nokey` excludes it. */}
      <DrawerTrigger
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
      </DrawerTrigger>
      <DrawerPortal>
        <DrawerViewport>
          {/* The popup is portalled outside the canvas, so it carries `.nokey`
              for React Flow's own `useKeyPress` subscriptions the same way every
              other portalled surface in the tree does. */}
          <DrawerPopup className="nokey">
            <DrawerHeader>
              {/* `sr-only`, not `hidden`: the spec asks for no *visible*
                  heading, and `hidden` would take the title out of the
                  accessibility tree while still naming the dialog through
                  `aria-labelledby` — leaving a reader navigating by heading
                  nothing at all. */}
              <DrawerTitle className="sr-only">Things</DrawerTitle>
            </DrawerHeader>
            <DrawerContent>
              {refusal === null ? null : (
                <Alert variant="destructive" className="m-4 mb-0 shrink-0">
                  <AlertTitle>Thing not added</AlertTitle>
                  <AlertDescription>{refusal}</AlertDescription>
                </Alert>
              )}
              <div className="shrink-0 space-y-2 border-b p-4">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="secondary"
                        className="w-full justify-between px-3"
                        aria-label="Filter things by kind"
                      />
                    }
                  >
                    Filter
                    <ChevronDownIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="nokey">
                    <DropdownMenuRadioGroup value={kind} onValueChange={setKind}>
                      <KindFilterItem value="all">All kinds</KindFilterItem>
                      <KindFilterItem value="markdown">Markdown</KindFilterItem>
                      <KindFilterItem value="space">Space</KindFilterItem>
                      <KindFilterItem value="alias">Alias</KindFilterItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label="Search things"
                    placeholder="Search things"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </InputGroup>
              </div>
              {/* Base UI's swipe-to-dismiss and an HTML5 Thing drag both begin
                  with a press, and this list is where every Thing drag starts, so
                  it opts out of the gesture for all input types. The drawer's
                  own chrome above still swipes it shut. */}
              <div
                data-base-ui-swipe-ignore
                className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
                style={thingSizeVars}
              >
                {visible.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {emptyMessage(things.length, allThings.length)}
                  </p>
                ) : (
                  visible.map((thing) => (
                    <button
                      key={thing.id}
                      type="button"
                      draggable
                      data-thing-id={thing.id}
                      aria-current={thing.id === revealedThingId ? 'true' : undefined}
                      onDragStart={(event) => beginDrag(event, thing.id)}
                      onDragEnd={onDragEnd}
                      onClick={(event) =>
                        setRefusal(onAdd(thing, event.detail === 0 ? 'keyboard' : 'pointer'))
                      }
                      className="block rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      aria-label={`Add ${titleName(thing.title)} to Diagram`}
                    >
                      {/* The whole Title, because this *is* a Thing front and
                          the front is the one surface that draws the ladder —
                          Open, Closed, and here (ADR 0083). The row around it
                          is what names the Thing, and that says the name. */}
                      <CanvasThing
                        front={frontOf(thing)}
                        title={thing.title}
                        state="rest"
                        graphColor={FALLBACK_GRAPH_COLOR}
                      />
                    </button>
                  ))
                )}
              </div>
            </DrawerContent>
          </DrawerPopup>
        </DrawerViewport>
      </DrawerPortal>
    </Drawer>
  );
}
