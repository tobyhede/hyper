import {
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { uuidSchema, type Card, type CardId } from '@project/core';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Button,
  CardRail,
  CardSearchCombobox,
  CloseIcon,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
} from '@project/ui';
import { CardPane } from './CardPane';
import './card-editor.css';
import { paneInitialFocus } from './pane-focus';
import { presentAliasCardRefusal } from '../authoring-refusal';
import { GRAPH_PALETTE } from '../colors';
import type { AuthoringRefusal } from '../space-authoring';

/**
 * Authoring the Alias itself: its title, and which Card it points at.
 *
 * One capability rather than two optional props, because both are offered on
 * exactly one fact — this occurrence is an Alias (ADR 0009) — and a caller able
 * to supply the Target without the Title is a caller able to rebuild the pane
 * that could retarget an Alias it could not rename.
 */
interface OccurrenceAuthoring {
  /** The Cards this occurrence may point at — non-Alias Cards (ADR 0009). */
  readonly targets: readonly Card[];
  /**
   * Author the occurrence's own title and Target, answering the sentence to show
   * when the Space refused it.
   *
   * **One call carrying both**, because both fields pend to the pane's one
   * `Done` (ADR 0048) and an Alias whose title and Target both moved is one
   * authored fact. Two calls would be two Edits and two commits over one press.
   * This capability completes nothing on the Target.
   */
  readonly onEdit: (change: {
    readonly title: string;
    readonly target: CardId;
  }) => AuthoringRefusal | null;
}

/**
 * An Alias opened on its own metadata.
 */
export interface OpenCardProps {
  /** The Alias whose own metadata this pane authors. */
  readonly through: Extract<Card, { kind: 'alias' }>;
  /** Active Graph colour carried from the canvas into the Card's writing rail. */
  readonly graphColor?: string;
  /** The one canonical capability for changing its title and Target. */
  readonly occurrence: OccurrenceAuthoring;
  /** Close this pane; invoked after a completed Done action as well as cancellation. */
  readonly onCancel: () => void;
}

/**
 * The Alias metadata form. Markdown Cards author their front in `CanvasCard`.
 */
function AliasEditorForm({
  subjectTitle,
  graphColor,
  title,
  titleError,
  onTitleChange,
  onTitleEnter,
  children,
  error,
  onSubmit,
  onCancel,
}: {
  readonly subjectTitle: string;
  readonly graphColor: string;
  readonly title: string;
  readonly titleError: string | null;
  readonly onTitleChange: (title: string) => void;
  readonly onTitleEnter: () => void;
  readonly children: ReactNode;
  readonly error: string | null;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onCancel: () => void;
}) {
  const submitShortcut = (event: KeyboardEvent<HTMLFormElement>): void => {
    if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    event.currentTarget.requestSubmit();
  };

  return (
    <CardPane
      ariaLabel={subjectTitle}
      testId="open-card"
      variant="card-editor"
      onDismiss={onCancel}
    >
      <form
        className="card-editor"
        // SAFETY: CSSProperties doesn't type CSS custom properties (`--*`);
        // this one is read only by the stylesheet, which is its actual contract.
        style={{ '--card-editor-graph': graphColor } as CSSProperties}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : 'open-alias-error'}
        onSubmit={onSubmit}
        onKeyDown={submitShortcut}
      >
        <CardRail kind="alias" graphColor={graphColor} className="card-editor__rail">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="card-editor__close"
            aria-label="Close Card editor"
            onClick={onCancel}
          >
            <CloseIcon />
          </Button>
        </CardRail>
        <FieldGroup className="card-editor__fields">
          <Field className="card-editor__title-field" data-invalid={titleError !== null}>
            <FieldLabel className="card-editor__label" htmlFor="open-card-title">
              Title
            </FieldLabel>
            <Input
              id="open-card-title"
              className="card-editor__title"
              aria-invalid={titleError !== null}
              aria-describedby={titleError === null ? undefined : 'open-card-title-error'}
              value={title}
              onChange={(event) => onTitleChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.metaKey || event.ctrlKey) {
                  return;
                }
                event.preventDefault();
                onTitleEnter();
              }}
            />
            <FieldError id="open-card-title-error">{titleError}</FieldError>
          </Field>
          {children}
        </FieldGroup>
        {error !== null && (
          <Alert id="open-alias-error" variant="destructive" className="card-editor__error">
            <AlertIcon />
            <AlertTitle>Couldn’t save changes</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <footer className="card-editor__footer">
          <Button type="button" variant="ghost" className="card-editor__cancel" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="commit" className="card-editor__commit">
            Done
          </Button>
        </footer>
      </form>
    </CardPane>
  );
}

/** The Alias pane authors one Card too: the Alias, never its Target. */
function AliasCardEditor({
  alias,
  graphColor,
  occurrence,
  onCancel,
}: {
  readonly alias: Extract<Card, { kind: 'alias' }>;
  readonly graphColor: string;
  readonly occurrence: OccurrenceAuthoring;
  readonly onCancel: () => void;
}) {
  const [title, setTitle] = useState(alias.title);
  const [target, setTarget] = useState<CardId>(alias.target);
  const [authoringRefusal, setAuthoringRefusal] = useState<AuthoringRefusal | null>(null);
  const targetInput = useRef<HTMLInputElement>(null);
  const errors =
    authoringRefusal === null ? { fields: {} } : presentAliasCardRefusal(authoringRefusal);
  const titleError = errors.fields.title ?? null;
  const targetError = errors.fields.target ?? null;
  const formError = errors.form ?? null;

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const refusal = occurrence.onEdit({ title: title.trim(), target });
    if (refusal !== null) {
      setAuthoringRefusal(refusal);
      return;
    }
    // A completed Done closes the pane through the same callback as Cancel.
    onCancel();
  };

  return (
    <AliasEditorForm
      subjectTitle={alias.title}
      graphColor={graphColor}
      title={title}
      titleError={titleError}
      onTitleChange={(nextTitle) => {
        setTitle(nextTitle);
        setAuthoringRefusal(null);
      }}
      onTitleEnter={() => targetInput.current?.focus()}
      error={formError}
      onSubmit={submit}
      onCancel={onCancel}
    >
      <Field
        className="card-editor__body card-editor__alias-target"
        data-invalid={targetError !== null}
      >
        <FieldLabel className="card-editor__label" htmlFor="open-alias-target">
          Alias of
        </FieldLabel>
        <CardSearchCombobox
          label="Target"
          testId="alias-target"
          resultsTestId="card-picker-results"
          inputId="open-alias-target"
          choices={occurrence.targets.map((card) => ({
            id: card.id,
            title: card.title,
            kind: card.kind,
          }))}
          value={target}
          inputRef={targetInput}
          inputAttributes={{
            ...paneInitialFocus(true),
            'aria-invalid': targetError !== null,
            'aria-describedby': targetError === null ? undefined : 'open-alias-target-error',
          }}
          emptyMessage="This Space holds no other Card that owns its content."
          onValueChange={(chosen) => {
            const parsed = uuidSchema.safeParse(chosen);
            if (!parsed.success) return;
            setTarget(parsed.data);
            setAuthoringRefusal(null);
          }}
        />
        <FieldError id="open-alias-target-error">{targetError}</FieldError>
      </Field>
    </AliasEditorForm>
  );
}

/** The modal metadata editor retained for Alias Cards, which have no open front. */
export function OpenCard({ through, graphColor, occurrence, onCancel }: OpenCardProps) {
  return (
    <AliasCardEditor
      key={through.id}
      alias={through}
      graphColor={graphColor ?? GRAPH_PALETTE[0]}
      occurrence={occurrence}
      onCancel={onCancel}
    />
  );
}
