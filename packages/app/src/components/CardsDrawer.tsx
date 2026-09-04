import { useMemo, useState, type DragEvent } from 'react';
import type { Card, CardId, UUID } from '@project/core';
import {
  Button,
  Alert,
  AlertDescription,
  AlertTitle,
  CanvasCard,
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
import { cardSizeVars } from '../card';

export const CARD_DRAG_TYPE = 'application/x-hyper-card-id';

type KindFilter = 'all' | Card['kind'];
type Activation = 'keyboard' | 'pointer';

export interface CardsDrawerProps {
  readonly cards: readonly Card[];
  readonly allCards: readonly Card[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Withdraws the trigger without unmounting the surface it names. */
  readonly disabled?: boolean;
  /** Returns a refusal that remains on this surface, or null after a completed Add. */
  readonly onAdd: (card: Card, activation: Activation) => string | null;
  readonly onDragStart: (cardId: CardId) => void;
  readonly onDragEnd?: () => void;
  readonly revealedCardId?: CardId | null;
  /**
   * The Title of every Space a Space Card in this list references.
   *
   * Supplied rather than derived, for the reason the Alias titles beside it are
   * derived: an Alias's Target is a Card of *this* Space and `allCards` holds
   * it, while a Space Card's target is a different Space this surface cannot
   * read. A Space missing from the map is one the composition has not read yet.
   */
  readonly spaceTitleById?: ReadonlyMap<UUID, string>;
}

const isKindFilter = (value: string): value is KindFilter =>
  value === 'all' || value === 'markdown' || value === 'space' || value === 'alias';

/** An Alias's Target title, `''` for the intake-guaranteed-unreachable case a Target does not resolve — the same convention `CardNode` draws (ADR 0009). */
const targetTitle = (card: Card, titleById: ReadonlyMap<CardId, string>): string =>
  card.kind === 'alias' ? (titleById.get(card.target) ?? '') : '';

const frontOf = (
  card: Card,
  titleById: ReadonlyMap<CardId, string>,
  spaceTitleById: ReadonlyMap<UUID, string>,
) => {
  if (card.kind === 'alias')
    return {
      kind: 'alias' as const,
      aliasOf: targetTitle(card, titleById),
      source: '',
      open: false,
    };
  // Closed, always: this list draws Cards that are *not* on the canvas, so no
  // entry here carries the Layout's Open state and none offers the selections
  // an Open Space Card authors.
  if (card.kind === 'space')
    return {
      kind: 'space' as const,
      spaceTitle: spaceTitleById.get(card.spaceId) ?? '',
      open: false,
    };
  return { kind: 'markdown' as const, source: card.body, open: false as const };
};

const NO_SPACE_TITLES: ReadonlyMap<UUID, string> = new Map();

const searchableText = (card: Card, titleById: ReadonlyMap<CardId, string>): string =>
  card.kind === 'alias' ? `${card.title} ${targetTitle(card, titleById)}` : card.title;

const emptyMessage = (available: number, inSpace: number): string =>
  inSpace === 0
    ? 'This Space has no Cards.'
    : available === 0
      ? 'All Cards are in this Layout.'
      : 'No matching Cards.';

/**
 * The Cards View: existing Cards absent from the selected Layout.
 *
 * A `Drawer` rather than a second `Sidebar` — ADR 0053 gives the one Sidebar the
 * left edge, and composing another on the right made this panel share the
 * shell's `SidebarProvider`, its open state and its `Ctrl/Cmd-B` shortcut while
 * still having no dismissal, focus or naming contract of its own.
 *
 * It is deliberately **non-modal and pointer-dismissal-free**. Dragging a Card
 * onto the canvas is the whole point of the surface, so a backdrop would defeat
 * it — and a plain non-modal Base UI drawer closes both on an outside press and
 * on focus leaving it, which is exactly what dropping a Card does. Adding
 * several Cards in a row is the ordinary case, so the drawer ends on its own
 * control, on the trigger, on Escape or on a swipe, and never because the
 * reader touched the thing it exists to feed.
 */
export function CardsDrawer({
  cards,
  allCards,
  open,
  onOpenChange,
  disabled = false,
  onAdd,
  onDragStart,
  onDragEnd,
  revealedCardId,
  spaceTitleById,
}: CardsDrawerProps) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [refusal, setRefusal] = useState<string | null>(null);
  const titleById = useMemo(
    () => new Map(allCards.map((card) => [card.id, card.title])),
    [allCards],
  );
  const visible = useMemo(
    () =>
      cards
        .map((card, index) => ({ card, index }))
        .filter(
          ({ card }) =>
            (kind === 'all' || card.kind === kind) &&
            searchableText(card, titleById)
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()),
        )
        .sort(
          (left, right) =>
            left.card.title.localeCompare(right.card.title) || left.index - right.index,
        )
        .map(({ card }) => card),
    [titleById, cards, kind, query],
  );

  const beginDrag = (event: DragEvent<HTMLButtonElement>, cardId: CardId): void => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(CARD_DRAG_TYPE, cardId);
    onDragStart(cardId);
  };

  return (
    <Drawer
      open={open}
      // Only the popup unmounts when the drawer closes, so unlike the panel this
      // replaced, the query and kind would otherwise still be narrowing the list
      // the next time it opens — and the reader would meet "No matching Cards"
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
          <Button
            className="nokey ml-auto"
            size="compact"
            variant={open ? 'default' : 'secondary'}
          />
        }
      >
        Cards
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
              <DrawerTitle className="sr-only">Cards</DrawerTitle>
            </DrawerHeader>
            <DrawerContent>
              {refusal === null ? null : (
                <Alert variant="destructive" className="m-4 mb-0 shrink-0">
                  <AlertTitle>Card not added</AlertTitle>
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
                        aria-label="Filter cards by kind"
                      />
                    }
                  >
                    Filter
                    <ChevronDownIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="nokey">
                    <DropdownMenuRadioGroup
                      value={kind}
                      onValueChange={(value) => {
                        const filter = String(value);
                        if (isKindFilter(filter)) setKind(filter);
                      }}
                    >
                      <DropdownMenuRadioItem value="all">All kinds</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="markdown">Markdown</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="space">Space</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="alias">Alias</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label="Search cards"
                    placeholder="Search cards"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </InputGroup>
              </div>
              {/* Base UI's swipe-to-dismiss and an HTML5 Card drag both begin
                  with a press, and this list is where every Card drag starts, so
                  it opts out of the gesture for all input types. The drawer's
                  own chrome above still swipes it shut. */}
              <div
                data-base-ui-swipe-ignore
                className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
                style={cardSizeVars}
              >
                {visible.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {emptyMessage(cards.length, allCards.length)}
                  </p>
                ) : (
                  visible.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      draggable
                      data-card-id={card.id}
                      aria-current={card.id === revealedCardId ? 'true' : undefined}
                      onDragStart={(event) => beginDrag(event, card.id)}
                      onDragEnd={onDragEnd}
                      onClick={(event) =>
                        setRefusal(onAdd(card, event.detail === 0 ? 'keyboard' : 'pointer'))
                      }
                      className="block rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      aria-label={`Add ${card.title} to Layout`}
                    >
                      <CanvasCard
                        front={frontOf(card, titleById, spaceTitleById ?? NO_SPACE_TITLES)}
                        title={card.title}
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
