import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { Input } from './components/input';
import { Textarea } from './components/textarea';
import { Field, FieldError } from './components/field';
import { cn } from './lib/utils';

/**
 * Which surface the field is standing in.
 *
 * Two, since ADR 0082: a Card on the canvas and a name on the Command Dock.
 * There was a `'sidebar'` arm and it went with the Sidebar — a variant with no
 * caller is an invitation, and the next chrome control would reasonably have
 * been written against it and taken styling tuned for a sixteen-rem column.
 */
export type InlineTitleEditorVariant = 'card' | 'header';

/** The two controls this editor drives, which share every handler it writes. */
type TitleField = HTMLInputElement | HTMLTextAreaElement;

interface InlineTitleEditorBase {
  readonly title: string;
  readonly label: string;
  readonly variant: InlineTitleEditorVariant;
  readonly className?: string;
  /**
   * Whether this Title may be written on more than one line (ADR 0083).
   *
   * A capability the caller opts into rather than a reading of `variant`. A
   * Card's Title is Title Lines and the Card front draws the ladder; a Space,
   * Diagram or Graph title is a label in a list with no front to draw one on,
   * and giving all three the capability because they share a field type would
   * be the model following the implementation. Where a Title stands in that
   * decision is the mounting surface's to know, so `CanvasCard` sets this and
   * the Dock's header does not — which is also what keeps the answer
   * visible at the call site rather than buried in a `variant` check here.
   *
   * Unset, the control is a genuine single-line `Input` and `Enter` means
   * exactly what it has always meant. Set, it is a `Textarea` that grows with
   * its content, `Shift+Enter` inserts a line, and `Enter` still completes.
   */
  readonly multiline?: boolean;
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
 * Refusable title editing shared by Cards and named Space chrome, on one line
 * or on several.
 *
 * Custom-interaction deviation (ADR 0047):
 * - Existing Hyper components considered: `Input` and `Textarea`, composed here with `Field`
 *   and `FieldError`.
 * - shadcn/Base UI components considered: Input, Textarea and Field; the registry has no
 *   inline-edit item and no multiline-title item.
 * - Product requirement they cannot express: select-on-entry, Enter/blur completion, Escape
 *   cancellation, keyboard focus return, a refused draft that remains editable — and, for a
 *   Card's Title Lines (ADR 0083), `Shift+Enter` inserting a line inside all of that.
 * - Why composition alone is insufficient: Input, Textarea and Field provide control and
 *   validation semantics and own none of that edit lifecycle. `Textarea` supplies the growing
 *   field — `field-sizing: content` is why the height follows the content here rather than a
 *   measuring effect — and nothing else: a textarea's own `Enter` inserts a line, which is
 *   the opposite of what completing a Title needs, so which of the two `Enter` means is this
 *   component's to decide and `Shift` is what it decides on.
 * - Custom behavior: only that lifecycle, in the two shapes {@link InlineTitleEditorBase.multiline}
 *   selects; product identity and authorship stay in the caller.
 * - Tests: `InlineTitleEditor.test.tsx`, `CanvasCard.test.tsx` for the `card` variant and
 *   `SpaceApp.test.tsx` for the `header` one, which is where the Command Dock renames a
 *   Diagram and a Graph now that ADR 0082 has retired the Sidebar that used to; application
 *   Playwright in `e2e/editing.spec.ts` and Ladle Playwright in
 *   `ladle-e2e/command-dock.spec.ts`.
 */
export function InlineTitleEditor({
  title,
  label,
  variant,
  className,
  multiline = false,
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
  // A callback ref rather than one object handed to both controls: a ref object
  // is invariant in what it holds, so a `TitleField` one is not the
  // `HTMLInputElement` ref `Input` asks for, and narrowing it would be an
  // assertion standing in for a two-line callback.
  const field = useRef<TitleField | null>(null);
  const holdField = (node: TitleField | null): void => {
    field.current = node;
  };
  const closingByKey = useRef(false);
  const errorId = useId();

  useEffect(() => {
    field.current?.focus();
    // The whole Title, later lines included: `select` is the element's own and
    // knows nothing about how many lines the value carries.
    field.current?.select();
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

  const shared = {
    'aria-label': label,
    'aria-invalid': error !== null,
    'aria-describedby': error === null ? undefined : errorId,
    value: draft,
    onChange: (event: ChangeEvent<TitleField>) => {
      setDraft(event.currentTarget.value);
      setError(null);
      closingByKey.current = false;
    },
    onBlur: () => {
      if (closingByKey.current) {
        closingByKey.current = false;
        return;
      }
      if (complete() !== null) field.current?.focus();
    },
    onClick: (event: MouseEvent<TitleField>) => event.stopPropagation(),
    onPointerDown: (event: PointerEvent<TitleField>) => event.stopPropagation(),
    onKeyDown: (event: KeyboardEvent<TitleField>) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        // The one key whose meaning the capability changes. A single-line field
        // has no second line to reach, so `Shift` is not read there at all and
        // Enter completes however it was pressed.
        if (multiline && event.shiftKey) return;
        event.preventDefault();
        if (complete() === null) returnFocus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        returnFocus();
        onCancel();
      }
    },
  };

  const controlClassName = cn(
    variant === 'card' && 'card__title-input',
    variant === 'header' && 'h-7 rounded-md border-transparent px-1 py-0 font-medium',
  );

  const control = multiline ? (
    <Textarea
      ref={holdField}
      // `rows` is the resting height and `field-sizing-content` — the primitive's
      // own — is what grows and shrinks it from there, so the field is one line
      // at rest and exactly as tall as the Title while it is being written. The
      // two utilities are what a title field owes on top of that: no floor under
      // one line, and no drag handle offering a height the content already
      // decides.
      rows={1}
      className={cn('min-h-0 resize-none', controlClassName)}
      {...shared}
    />
  ) : (
    <Input ref={holdField} className={controlClassName} {...shared} />
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
