import { useRef, type Ref } from 'react';
import { CardKindIcon } from './CardKindIcon';
import type { CardChoice } from './CardCombobox';
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
  readonly testId?: string;
  readonly placeholder?: string;
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
  testId,
  placeholder = 'Choose a Card',
}: CardSearchComboboxProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const chosen = choices.find((choice) => choice.id === value) ?? null;

  return (
    <div ref={fieldRef} className="w-full">
      <Combobox
        items={choices}
        value={chosen}
        itemToStringLabel={(choice) => choice.title}
        itemToStringValue={(choice) => choice.title}
        onValueChange={(choice) => {
          if (choice !== null) onValueChange(choice.id);
        }}
      >
        <ComboboxInput
          ref={inputRef}
          id={inputId}
          aria-label={label}
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
          <ComboboxEmpty>No Cards found.</ComboboxEmpty>
          <ComboboxList>
            {(choice: CardChoice) => (
              <ComboboxItem key={choice.id} value={choice} disabled={choice.refusal !== undefined}>
                <CardKindIcon kind={choice.kind} />
                {choice.title}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
