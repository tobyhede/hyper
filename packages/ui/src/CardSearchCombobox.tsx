import { useId, useRef, type InputHTMLAttributes, type Ref } from 'react';
import { titleName, type Card, type CardId } from '@project/core';
import { CardKindIcon } from './CardKindIcon';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxFilter,
} from './components/combobox';
import { InputGroupAddon } from './components/input-group';
import './card-search-combobox.css';

export interface CardSearchComboboxProps {
  readonly label: string;
  readonly choices: readonly CardChoice[];
  readonly value: CardId | null;
  readonly onValueChange: (cardId: CardId) => void;
  readonly inputId?: string;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly inputAttributes?: InputHTMLAttributes<HTMLInputElement>;
  readonly testId?: string;
  readonly resultsTestId?: string;
  readonly placeholder?: string;
  readonly emptyMessage?: string;
}

/**
 * One Card the production picker may offer, and why it cannot be chosen.
 *
 * `id` is a `CardId` rather than a plain string, and that is what keeps the
 * boundary answered once: every caller builds a choice from a `Card`, so a
 * widened id here only bought each of them a parse or an assertion on the way
 * back out of `onValueChange`.
 */
export interface CardChoice {
  readonly id: CardId;
  /**
   * The Card's Title, **whole** — every line of it, as the Card stores it.
   *
   * The picker narrows the two apart itself (see below), so a caller hands over
   * what the Card has and never decides here which part of it a reader sees.
   */
  readonly title: string;
  readonly kind: Card['kind'];
  readonly refusal?: string;
}

/** What a row and the field display: the Card's name (ADR 0083). */
const displayed = (choice: CardChoice): string => titleName(choice.title);

/** What a search reads: the whole Title, every line of it (ADR 0083). */
const searched = (choice: CardChoice): string => choice.title;

/**
 * The current stock shadcn Combobox over Cards: its one visible input displays
 * the selected Card and becomes the search field in place.
 *
 * It **displays a Card's name and searches its whole Title** (ADR 0083). Those
 * are the same string for the ordinary single-line Title, and this is the one
 * surface where they are deliberately allowed to differ.
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
  /*
   * The one place a Card's name and its Title come apart on purpose (ADR 0083).
   *
   * `Combobox.Root` displays *and* filters through `itemToStringLabel` unless a
   * `filter` is supplied, so displaying the name alone would have made a Card's
   * later Title Lines unsearchable — and an author's recall does not respect
   * which line they typed a word on. A Card visibly named `Auth` that cannot be
   * found by a word from its own subtitle reads as broken search.
   *
   * The replacement is the primitive's own matcher pointed at a different
   * string, not a second matching rule: `contains` is the same `Intl.Collator`
   * comparison Base UI would have run, so case, accents and punctuation behave
   * here exactly as they do in every other list.
   */
  const { contains } = useComboboxFilter();
  const chosen = choices.find((choice) => choice.id === value) ?? null;
  const unavailable = choices.length === 0;
  /*
   * The empty-list note is an addition to the caller's description, never a
   * replacement for it. The two are true at once on a real screen: an Alias
   * whose Target has left the Space is refused *and* has no eligible Card left
   * to choose, so the field carries a `FieldError` and an empty list together.
   * Overwriting left `aria-invalid="true"` announcing a problem whose sentence
   * no assistive technology could reach.
   *
   * The caller's id leads, because `aria-describedby` is announced in the order
   * it names: a refusal is what the author has to act on, and the note saying
   * the list is empty is the context under it.
   */
  const descriptions = [
    inputAttributes?.['aria-describedby'],
    unavailable ? emptyDescriptionId : undefined,
  ].filter((id) => id !== undefined && id !== '');

  return (
    <div ref={fieldRef} className="w-full">
      <Combobox
        items={choices}
        openOnInputClick
        value={chosen}
        filter={(choice: CardChoice, query: string) => contains(choice, query, searched)}
        itemToStringLabel={displayed}
        itemToStringValue={displayed}
        onValueChange={(choice) => {
          if (choice !== null) onValueChange(choice.id);
        }}
      >
        <ComboboxInput
          {...inputAttributes}
          ref={inputRef}
          id={inputId}
          aria-label={label}
          aria-describedby={descriptions.length === 0 ? undefined : descriptions.join(' ')}
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
          // React Flow's live Space-key pan activation subscription reaches
          // this portalled picker, so its own `.nokey` ancestor excludes it.
          className="nokey"
        >
          <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
          <ComboboxList aria-label={label} data-testid={resultsTestId}>
            {(choice: CardChoice) => (
              <ComboboxItem key={choice.id} value={choice} disabled={choice.refusal !== undefined}>
                <CardKindIcon kind={choice.kind} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{displayed(choice)}</span>
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
