import { useState } from 'react';
import type { Card } from '@project/core';
import { CardKindIcon } from './CardKindIcon';
import { ChevronDownIcon } from './icons';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './Command';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

/** One Card a picker may offer, and why it cannot be chosen. */
export interface CardChoice {
  readonly id: string;
  readonly title: string;
  readonly kind: Card['kind'];
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
 * A compact, button-triggered Card picker for Edge controls.
 *
 * The Card editor uses `CardSearchCombobox`, whose visible field is the stock
 * shadcn searchable input. This compact presentation deliberately keeps a
 * trigger because Edge controls must show an endpoint without becoming a text
 * field until the author opens them.
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
        role="combobox"
        aria-expanded={open}
        aria-label={label}
        title={label}
        data-testid={testId}
        className="nokey flex w-full items-center justify-between gap-[7px] rounded-[6px] border border-[var(--border)] bg-[var(--secondary)] px-[9px] py-[6px] text-[13px] text-[var(--foreground)] outline-none hover:border-[var(--accent)] focus:border-[var(--accent)]"
      >
        <span className="flex min-w-0 items-center gap-[9px]">
          {chosen !== undefined && <CardKindIcon kind={chosen.kind} />}
          <span className="truncate">{chosen?.title ?? placeholder}</span>
        </span>
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
            <CommandGroup>
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
                  <CardKindIcon kind={choice.kind} />
                  <span className="flex min-w-0 flex-col gap-[2px]">
                    <span className="truncate">{choice.title}</span>
                    {choice.refusal !== undefined && (
                      <span className="text-[11px] text-[var(--muted-foreground)]">
                        {choice.refusal}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
