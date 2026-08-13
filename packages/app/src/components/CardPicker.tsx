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
  const fieldId = useId();

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
      <label className="card-picker__label" htmlFor={fieldId}>
        {label}
      </label>
      <Command
        label={label}
        filter={(value, query) => {
          const card = cards.find((candidate) => candidate.id === value);
          if (card === undefined) return 0;
          return card.title.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
        }}
      >
        <CommandInput
          id={fieldId}
          // Declared only where the surface said this field is what it opens
          // on; the helper answers nothing otherwise, so `CardPane` falls back
          // to its first focusable.
          {...paneInitialFocus(initialFocus)}
          data-testid="card-picker-search"
          placeholder="Search"
          value={search}
          onValueChange={setSearch}
        />
        {cards.length === 0 ? (
          <p className="card-picker__unavailable" role="status">
            {emptyMessage}
          </p>
        ) : (
          <CommandList data-testid="card-picker-results">
            <CommandEmpty>No Card matches that search.</CommandEmpty>
            {cards.map((card) => (
              <CommandItem key={card.id} value={card.id} onSelect={() => onSelect(card.id)}>
                <CardKindIcon kind={card.kind} />
                <span className="card-picker__title">{card.title}</span>
                {card.id === selectedId && <CheckIcon />}
              </CommandItem>
            ))}
          </CommandList>
        )}
      </Command>
    </div>
  );
}
