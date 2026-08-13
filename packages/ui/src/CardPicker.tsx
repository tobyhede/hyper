import { Select, SelectContent, SelectItem } from './Select';
import { SelectorTrigger } from './SelectorTrigger';

/** One Card a picker may offer, and why it cannot be chosen. */
export interface CardChoice {
  readonly id: string;
  readonly title: string;
  /** The rule this choice would run into, shown on the disabled item. */
  readonly refusal?: string;
}

export interface CardPickerProps {
  /** What this field names — "Target", "From", "To". */
  readonly label: string;
  readonly choices: readonly CardChoice[];
  /** The Card currently named, or `null` while nothing has been chosen. */
  readonly value: string | null;
  readonly onValueChange: (cardId: string) => void;
  readonly testId?: string;
  readonly placeholder?: string;
}

/**
 * Choose one Card from a list — the shared field behind keyboard connection and
 * the Edge popover's endpoints.
 *
 * A Radix Select rather than a hand-rolled listbox: type-ahead, arrow keys,
 * Escape and focus return are the primitive's, and a known-refused choice is
 * `disabled` rather than absent, so an author who expected a Card can see it
 * and read why it is unavailable.
 */
export function CardPicker({
  label,
  choices,
  value,
  onValueChange,
  testId,
  placeholder = 'Choose a Card',
}: CardPickerProps) {
  const chosen = choices.find((choice) => choice.id === value);

  return (
    <Select value={value ?? ''} onValueChange={onValueChange}>
      <SelectorTrigger
        accessibleName={label}
        {...(testId !== undefined ? { testId } : {})}
        label={chosen?.title ?? placeholder}
      />
      <SelectContent className="w-[214px]">
        <div className="px-[8px] pt-[7px] pb-[5px] font-mono text-[10px] tracking-[0.12em] text-[var(--muted)] uppercase">
          {label}
        </div>
        {choices.map((choice) => (
          <SelectItem
            key={choice.id}
            value={choice.id}
            disabled={choice.refusal !== undefined}
            className="px-[8px] py-[7px] text-[13px]"
            {...(choice.refusal !== undefined ? { title: choice.refusal } : {})}
          >
            {choice.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
