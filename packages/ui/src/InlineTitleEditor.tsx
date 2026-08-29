import { useEffect, useId, useRef, useState } from 'react';
import { Input } from './components/input';
import { Field, FieldError } from './components/field';
import { cn } from './lib/utils';

export type InlineTitleEditorVariant = 'card' | 'sidebar' | 'header';

interface InlineTitleEditorBase {
  readonly title: string;
  readonly label: string;
  readonly variant: InlineTitleEditorVariant;
  readonly className?: string;
  readonly onComplete: (title: string) => string | null;
  readonly onCancel: () => void;
  readonly onReturnFocus: () => void;
}

/**
 * The draft and its refusal, held by the caller.
 *
 * One shape rather than four independent optional props: a caller that supplied
 * a change handler and no value got an editor that mounted blank instead of
 * pre-filled with the title, selected nothing, and submitted `''` on the first
 * Enter — a refusal for a rename the author never typed. Pairing them makes
 * that unrepresentable rather than merely unlikely.
 */
interface InlineTitleEditorControlled {
  readonly draft: string;
  readonly error: string | null;
  readonly onDraftChange: (draft: string) => void;
  readonly onErrorChange: (error: string | null) => void;
}

/** The editor keeps the draft itself, which is what a Card's Title does. */
interface InlineTitleEditorUncontrolled {
  readonly draft?: never;
  readonly error?: never;
  readonly onDraftChange?: never;
  readonly onErrorChange?: never;
}

export type InlineTitleEditorProps = InlineTitleEditorBase &
  (InlineTitleEditorControlled | InlineTitleEditorUncontrolled);

/**
 * One-line, refusable title editing shared by Cards and named Space chrome.
 *
 * Custom-interaction deviation (ADR 0047):
 * - Existing Hyper component considered: `Input`, composed here with `Field` and `FieldError`.
 * - shadcn/Base UI component considered: Input and Field; the registry has no inline-edit item.
 * - Product requirement they cannot express: select-on-entry, Enter/blur completion, Escape
 *   cancellation, keyboard focus return, and a refused draft that remains editable.
 * - Why composition alone is insufficient: Input and Field provide control and validation
 *   semantics, but own none of that edit lifecycle.
 * - Custom behavior: only that lifecycle; product identity and authorship stay in the caller.
 * - Tests: `CanvasCard.test.tsx`, `SpaceSidebar.test.tsx`, application and Ladle Playwright.
 */
export function InlineTitleEditor({
  title,
  label,
  variant,
  className,
  draft: controlledDraft,
  error: controlledError,
  onDraftChange,
  onErrorChange,
  onComplete,
  onCancel,
  onReturnFocus,
}: InlineTitleEditorProps) {
  const [localDraft, setLocalDraft] = useState(title);
  const [localError, setLocalError] = useState<string | null>(null);
  // Keyed on the value, not on whether a handler happened to be passed. The
  // props type pairs the two, so `controlledDraft` is present exactly when
  // `onDraftChange` is, and one test answers both.
  const controlled = controlledDraft !== undefined;
  const draft = controlled ? controlledDraft : localDraft;
  const error = controlled ? (controlledError ?? null) : localError;
  const input = useRef<HTMLInputElement>(null);
  const closingByKey = useRef(false);
  const errorId = useId();

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const setDraft = (next: string): void => {
    if (!controlled) setLocalDraft(next);
    onDraftChange?.(next);
  };
  const setError = (next: string | null): void => {
    if (!controlled) setLocalError(next);
    onErrorChange?.(next);
  };
  const complete = (): string | null => {
    const refusal = onComplete(draft);
    setError(refusal);
    return refusal;
  };
  const returnFocus = (): void => {
    closingByKey.current = true;
    onReturnFocus();
  };

  const control = (
    <Input
      ref={input}
      className={cn(
        variant === 'card' && 'card__title-input',
        variant === 'sidebar' && 'h-7 rounded-md px-2 py-0 text-sm',
        variant === 'header' && 'h-7 rounded-md border-transparent px-1 py-0 font-medium',
      )}
      aria-label={label}
      aria-invalid={error !== null}
      aria-describedby={error === null ? undefined : errorId}
      value={draft}
      onChange={(event) => {
        setDraft(event.currentTarget.value);
        setError(null);
        closingByKey.current = false;
      }}
      onBlur={() => {
        if (closingByKey.current) {
          closingByKey.current = false;
          return;
        }
        if (complete() !== null) input.current?.focus();
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          if (complete() === null) returnFocus();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          returnFocus();
          onCancel();
        }
      }}
    />
  );
  if (variant === 'card') {
    return (
      <div className={cn('card__title-editor nodrag nopan nowheel min-w-0', className)}>
        {control}
        {error !== null && (
          <span id={errorId} role="alert" className="card__field-error">
            {error}
          </span>
        )}
      </div>
    );
  }
  return (
    <Field
      data-invalid={error !== null}
      className={cn('nodrag nopan nowheel min-w-0 gap-1', className)}
    >
      {control}
      <FieldError id={errorId} className="text-xs">
        {error}
      </FieldError>
    </Field>
  );
}
