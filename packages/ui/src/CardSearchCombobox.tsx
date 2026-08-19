import { useId, useRef, type InputHTMLAttributes, type Ref } from 'react';
import type { Card } from '@project/core';
import { CardKindIcon } from './CardKindIcon';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from './components/combobox';
import { InputGroupAddon } from './components/input-group';

export interface CardSearchComboboxProps {
  readonly label: string;
  readonly choices: readonly CardChoice[];
  readonly value: string | null;
  readonly onValueChange: (cardId: string) => void;
  readonly inputId?: string;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly inputAttributes?: InputHTMLAttributes<HTMLInputElement>;
  readonly testId?: string;
  readonly resultsTestId?: string;
  readonly placeholder?: string;
  readonly emptyMessage?: string;
}

/** One Card the production picker may offer, and why it cannot be chosen. */
export interface CardChoice {
  readonly id: string;
  readonly title: string;
  readonly kind: Card['kind'];
  readonly refusal?: string;
}

/**
 * The current stock shadcn Combobox over Cards: its one visible input displays
 * the selected Card and becomes the search field in place.
 */
export function CardSearchCombobox({
  label,
  choices,
  value,
  onValueChange,
  inputId,
  inputRef,
  inputAttributes,
  testId,
  resultsTestId,
  placeholder = 'Choose a Card',
  emptyMessage = 'No Cards found.',
}: CardSearchComboboxProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const emptyDescriptionId = useId();
  const chosen = choices.find((choice) => choice.id === value) ?? null;
  const unavailable = choices.length === 0;

  return (
    <div ref={fieldRef} className="w-full">
      <Combobox
        items={choices}
        openOnInputClick
        value={chosen}
        itemToStringLabel={(choice) => choice.title}
        itemToStringValue={(choice) => choice.title}
        onValueChange={(choice) => {
          if (choice !== null) onValueChange(choice.id);
        }}
      >
        <ComboboxInput
          {...inputAttributes}
          ref={inputRef}
          id={inputId}
          aria-label={label}
          aria-describedby={
            unavailable ? emptyDescriptionId : inputAttributes?.['aria-describedby']
          }
          data-testid={testId}
          placeholder={placeholder}
        >
          {chosen !== null && (
            <InputGroupAddon align="inline-start">
              <CardKindIcon kind={chosen.kind} />
            </InputGroupAddon>
          )}
        </ComboboxInput>
        <ComboboxContent
          anchor={fieldRef}
          sideOffset={0}
          data-card-search-combobox=""
          className="nokey"
        >
          <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
          <ComboboxList aria-label={label} data-testid={resultsTestId}>
            {(choice: CardChoice) => (
              <ComboboxItem key={choice.id} value={choice} disabled={choice.refusal !== undefined}>
                <CardKindIcon kind={choice.kind} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{choice.title}</span>
                  {choice.refusal !== undefined && (
                    <span className="text-xs text-muted-foreground">{choice.refusal}</span>
                  )}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {unavailable && (
        <span id={emptyDescriptionId} className="sr-only">
          {emptyMessage}
        </span>
      )}
    </div>
  );
}
