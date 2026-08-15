import { useState } from 'react';
import { ChevronDownIcon } from './icons';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from './Command';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

/** One Card a picker may offer, and why it cannot be chosen. */
export interface CardChoice {
  readonly id: string;
  readonly title: string;
  /** The rule this choice would run into, shown on the disabled row. */
  readonly refusal?: string;
}

export interface CardComboboxProps {
  /** What this field names — "From", "To", "Connect to". */
  readonly label: string;
  readonly choices: readonly CardChoice[];
  /** The Card currently named, or `null` while nothing has been chosen. */
  readonly value: string | null;
  readonly onValueChange: (cardId: string) => void;
  readonly testId?: string;
  readonly placeholder?: string;
}

/**
 * Choose one Card from a collapsed trigger — the shared field behind keyboard
 * connection and the Edge popover's endpoints.
 *
 * **shadcn's Combobox composition, which is a Popover over a Command** rather
 * than a picker model of its own. The repo has exactly one item list model, and
 * this is the collapsed presentation of it; `app`'s `CardPicker` is the inline
 * one a pane draws with its list always open. Both are cmdk `Command` over the
 * same rows, so the search, the active item, the arrow keys and the
 * `combobox`/`listbox` pairing come from the primitive in both places. A Radix
 * `Select` stood here first and was the second model: type-ahead instead of
 * search, and no way to filter a Space's worth of Cards.
 *
 * Three things are this component's, each for a reason the primitives cannot
 * know.
 *
 * **The filter.** cmdk scores its default fuzzy match against each row's
 * `value`, and a value here is a Card's UUID — so searching `a` matches every id
 * carrying a hex `a` and ranks by noise. The title is what an author is
 * searching, so the match is a plain case-insensitive substring of it. The id
 * stays the value because that is what the caller is handed back, and two Cards
 * may legitimately share a title.
 *
 * **The refused row stays.** A choice the author cannot make keeps its place and
 * **says why in the row**, rather than being filtered out of a list they expected
 * to find it in. `title` is kept as a redundant affordance for a truncated
 * reason, not as the way the reason is conveyed — a tooltip needs a hover a
 * keyboard author never makes, and a disabled row is the one a pointer is least
 * likely to rest on.
 *
 * **The two accessible names.** The trigger is the `combobox` the field is known
 * by; cmdk's input is a second one inside the popover, so it is named `Search` to
 * keep the field's own name unambiguous.
 */
export function CardCombobox({
  label,
  choices,
  value,
  onValueChange,
  testId,
  placeholder = 'Choose a Card',
}: CardComboboxProps) {
  const [open, setOpen] = useState(false);
  const chosen = choices.find((choice) => choice.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        // `role`/`aria-expanded` are shadcn's own Combobox trigger contract, and
        // Radix supplies `data-state`, which is what a containing surface reads
        // to know this layer owns the next Escape.
        role="combobox"
        aria-expanded={open}
        aria-label={label}
        title={label}
        data-testid={testId}
        className="nokey flex w-full items-center justify-between gap-[7px] rounded-[6px] border border-[var(--border)] bg-[var(--secondary)] px-[9px] py-[6px] text-[13px] text-[var(--foreground)] outline-none hover:border-[var(--accent)] focus:border-[var(--accent)]"
      >
        <span className="max-w-[9rem] truncate">{chosen?.title ?? placeholder}</span>
        <ChevronDownIcon />
      </PopoverTrigger>
      <PopoverContent className="w-[214px] p-[0.4rem]" align="start">
        <div className="px-[8px] pt-[3px] pb-[5px] font-mono text-[10px] tracking-[0.12em] text-[var(--muted-foreground)] uppercase">
          {label}
        </div>
        <Command
          label="Search"
          filter={(candidate, query) => {
            const choice = choices.find((each) => each.id === candidate);
            if (choice === undefined) return 0;
            return choice.title.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search" data-testid={`${testId ?? 'card'}-search`} />
          <CommandList label={label}>
            <CommandEmpty>No Card matches that search.</CommandEmpty>
            {choices.map((choice) => (
              <CommandItem
                key={choice.id}
                value={choice.id}
                disabled={choice.refusal !== undefined}
                onSelect={() => {
                  setOpen(false);
                  onValueChange(choice.id);
                }}
                {...(choice.refusal !== undefined ? { title: choice.refusal } : {})}
              >
                <span className="flex flex-col gap-[2px]">
                  <span>{choice.title}</span>
                  {choice.refusal !== undefined && (
                    <span className="text-[11px] text-[var(--muted-foreground)]">
                      {choice.refusal}
                    </span>
                  )}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
