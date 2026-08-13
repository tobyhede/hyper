import { useId, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Card, CardId } from '@project/core';
import {
  CardKindIcon,
  CheckIcon,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@project/ui';
import { paneInitialFocus } from './pane-focus';

export interface CardPickerProps {
  /** What the field is called — **Target** for an Alias (ADR 0009). */
  readonly label: string;
  /** The Cards this field may name, already narrowed to the eligible ones. */
  readonly cards: readonly Card[];
  /** The Card the field currently names, marked in the list. */
  readonly selectedId: CardId | null;
  /**
   * Whether this field is where the pane puts focus when it opens.
   *
   * Answered by the caller rather than assumed here, because the same picker
   * means different things in the two surfaces that draw it. The Alias creation
   * state opens *on* its Target (ADR 0009's Frame 1) and says so; inside an
   * opened Alias the Target is one field among several and the pane's ordinary
   * rule — the first focusable — is the right answer. Declared unconditionally,
   * it took the caret off the Title above it on every open.
   *
   * Required rather than defaulted, so the next surface to reach for this
   * decides rather than inherits.
   */
  readonly initialFocus: boolean;
  readonly onSelect: (cardId: CardId) => void;
  /**
   * Escape with no search text: the field draft is already empty, so the
   * surface's own cancellation is what is left to run.
   */
  readonly onCancel: () => void;
  /** What to say when the Space holds no Card this field could ever name. */
  readonly emptyMessage: string;
}

/**
 * Choose a Card by searching for it — the Alias Target field today, and the
 * shape the Edge endpoint pickers reuse.
 *
 * Built on cmdk through `@project/ui`'s Command, so the search field, the active
 * item, the arrow keys and the `combobox`/`listbox` pairing are the primitive's
 * (AGENTS.md). Two things are this component's, and each is here for a reason
 * the primitive cannot know:
 *
 * **The filter.** cmdk scores its default fuzzy match against each item's
 * `value`, and a Card's value here is its UUID — so searching `a` would match
 * every id carrying a hex `a` and rank the results by noise. The visible name is
 * the title and the title is what an author is searching, so the match is a
 * plain case-insensitive substring of it. The id stays the value because that is
 * what `onSelect` hands back, and two Cards may legitimately share a title.
 *
 * **Escape.** cmdk leaves Escape to the containing surface, and the authoring
 * contract splits it: a field draft consumes the first Escape, and only then may
 * the surface consume the next. Clearing the search is that first consumption —
 * which is also, for a retarget, what "restore the current Target" means, since
 * an unfiltered list is the one showing it.
 *
 * **The list is always rendered, including with nothing in it.** cmdk mints the
 * list's id on the Command root and puts it on the input as `aria-controls`,
 * beside a hardcoded `aria-expanded="true"` — so a field drawn without its list
 * is an expanded combobox pointing at an element that does not exist. Swapping
 * the list out for a paragraph did exactly that. Emptiness is a matter for
 * `Command.Empty` inside the list, never for whether the list is there.
 */
export function CardPicker({
  label,
  cards,
  selectedId,
  initialFocus,
  onSelect,
  onCancel,
  emptyMessage,
}: CardPickerProps) {
  const [search, setSearch] = useState('');
  /** Nothing to offer at all, as against a search that happened to match none. */
  const unavailable = cards.length === 0;
  /**
   * The empty message's id, so the field can be *described* by it.
   *
   * `Command.Empty` is `role="presentation"` inside the `role="listbox"`, so a
   * reader who lands on the field otherwise hears an expanded combobox with no
   * options and no reason for it. A live region is the wrong instrument: this
   * pane mounts with the message already inside it, and a live region inserted
   * already populated is the least reliably announced form there is. A
   * description is read when focus arrives, which is where this picker puts it.
   */
  const messageId = useId();

  const cancel = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    // Stopped either way: the surface listens for Escape too, and one keypress
    // may only be consumed by one owner. With text in the field this is the
    // draft's own cancellation; with none it is this component handing the
    // gesture on deliberately rather than by letting it bubble.
    event.stopPropagation();
    if (search.length > 0) {
      setSearch('');
      return;
    }
    onCancel();
  };

  return (
    <div className="card-picker" onKeyDown={cancel}>
      {/* Not a `<label>`, because it cannot be one that works. cmdk spreads the
          caller's props and then writes its own `id` over them, so a `for`
          minted here names an element that never exists — and an orphan label
          is worse than none: the pane's focus containment prevents the
          mousedown default on it, on the stated grounds that a label focuses
          what it names, so the click did nothing at all. The real label is
          cmdk's own, rendered visually hidden from the `label` prop below and
          referenced by `aria-labelledby`, which is what gives the field its
          accessible name. This is the visible echo of it. */}
      <span className="card-picker__label">{label}</span>
      <Command
        label={label}
        filter={(value, query) => {
          const card = cards.find((candidate) => candidate.id === value);
          if (card === undefined) return 0;
          return card.title.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
        }}
      >
        <CommandInput
          // Survives cmdk's spread, unlike `id`, `role` and every `aria-` it
          // writes for itself.
          aria-describedby={unavailable ? messageId : undefined}
          // Declared only where the surface said this field is what it opens
          // on; the helper answers nothing otherwise, so `CardPane` falls back
          // to its first focusable.
          {...paneInitialFocus(initialFocus)}
          data-testid="card-picker-search"
          placeholder="Search"
          value={search}
          onValueChange={setSearch}
        />
        <CommandList data-testid="card-picker-results">
          {/* One empty affordance for both ways of having nothing to show, and
              it is the primitive's own. `Command.Empty` renders on a filtered
              count of zero, which with no Card registered is true of every
              search including the empty one — so a hand-rolled paragraph for
              the unavailable case would stack above this rather than replace
              it. The class is the only thing that differs: a Space that cannot
              hold an Alias yet is explained in a box, and a search that matched
              nothing is a quiet line. */}
          <CommandEmpty
            id={messageId}
            className={unavailable ? 'card-picker__unavailable' : undefined}
          >
            {unavailable ? emptyMessage : 'No Card matches that search.'}
          </CommandEmpty>
          {cards.map((card) => (
            <CommandItem key={card.id} value={card.id} onSelect={() => onSelect(card.id)}>
              <CardKindIcon kind={card.kind} />
              <span className="card-picker__title">{card.title}</span>
              {card.id === selectedId && <CheckIcon />}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </div>
  );
}
