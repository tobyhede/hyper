import {
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { markdownCardSchema, uuidSchema, type Card, type CardId } from '@project/core';
import type { ResolvedContentCard } from '@project/graph';
import {
  Button,
  CardSearchCombobox,
  CloseIcon,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Textarea,
} from '@project/ui';
import { CardPane } from './CardPane';
import { paneInitialFocus } from './pane-focus';

/**
 * The two values the Card dialog authors. Description remains valid domain
 * metadata, but it is not Card-front copy and it is not duplicated in this
 * writing surface.
 */
type MarkdownDraft = {
  readonly title: string;
  readonly body: string;
  readonly titleError: string | null;
};

type MarkdownCard = Extract<ResolvedContentCard, { kind: 'markdown' }>;

const seedMarkdown = (card: MarkdownCard): MarkdownDraft => ({
  title: card.title,
  body: card.body,
  titleError: null,
});

function settleMarkdown(
  card: MarkdownCard,
  draft: MarkdownDraft,
):
  | { readonly ok: true; readonly card: MarkdownCard }
  | { readonly ok: false; readonly draft: MarkdownDraft; readonly refusal: string | null } {
  // The title is trimmed for the same reason as the graph's inline editor:
  // `min(1)` counts spaces. The Markdown body is preserved byte-for-byte.
  const named = draft.title.trim();
  const parsed = markdownCardSchema.safeParse({
    ...card,
    title: named,
    body: draft.body,
  });
  if (parsed.success) return { ok: true, card: parsed.data };

  const forTitle = parsed.error.issues.find((candidate) => candidate.path[0] === 'title');
  const titleError =
    forTitle === undefined
      ? null
      : named.length === 0
        ? 'A Card title is required.'
        : forTitle.message;
  const unattributed = parsed.error.issues.some((candidate) => candidate.path[0] !== 'title');
  return {
    ok: false,
    draft: { ...draft, titleError },
    refusal: unattributed ? 'The Card could not be completed.' : null,
  };
}

/**
 * A Card opened on its own content — the ordinary case, and one Card.
 *
 * `through` is declared absent so this variant cannot also be an Alias open.
 */
interface DirectOpen {
  /** The Card that was opened, which owns the content this pane authors. */
  readonly card: ResolvedContentCard;
  /** Active Graph colour carried from the canvas into the Card's writing rail. */
  readonly graphColor?: string;
  readonly through?: never;
  readonly occurrence?: never;
  readonly onComplete: (card: ResolvedContentCard) => string | null;
}

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
  readonly onEdit: (change: { readonly title: string; readonly target: CardId }) => string | null;
}

/**
 * An Alias opened on its own metadata.
 */
interface AliasOpen {
  /** The Alias whose own metadata this pane authors. */
  readonly through: Extract<Card, { kind: 'alias' }>;
  /** Active Graph colour carried from the canvas into the Card's writing rail. */
  readonly graphColor?: string;
  /** The one canonical capability for changing its title and Target. */
  readonly occurrence: OccurrenceAuthoring;
  readonly card?: never;
  readonly onComplete?: never;
}

/**
 * What the pane was opened on, in exactly one of its two forms. A content Card
 * carries its completion; an Alias carries only the capability that authors
 * its metadata. The props cannot express content authoring through an Alias.
 */
export type OpenCardProps = {
  /** Close this pane; invoked after a completed Done action as well as cancellation. */
  readonly onCancel: () => void;
} & (DirectOpen | AliasOpen);

/**
 * The stable Card-writing surface shared by every Card kind.
 *
 * It owns dialog and form presentation only. Each kind-specific editor owns
 * its draft, validation and completion so a field that belongs to one kind
 * cannot accidentally appear on another.
 */
function CardEditorShell({
  subjectTitle,
  graphColor,
  title,
  titleError,
  titleStartsFocused,
  onTitleChange,
  onTitleEnter,
  children,
  refusal,
  refusalId,
  onSubmit,
  onCancel,
}: {
  readonly subjectTitle: string;
  readonly graphColor: string;
  readonly title: string;
  readonly titleError: string | null;
  readonly titleStartsFocused: boolean;
  readonly onTitleChange: (title: string) => void;
  readonly onTitleEnter?: () => void;
  readonly children: ReactNode;
  readonly refusal: string | null;
  readonly refusalId: string;
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
        style={{ '--card-editor-graph': graphColor } as CSSProperties}
        aria-invalid={refusal !== null}
        aria-describedby={refusal === null ? undefined : refusalId}
        onSubmit={onSubmit}
        onKeyDown={submitShortcut}
      >
        <FieldGroup className="card-editor__fields">
          <header className="card-editor__rail">
            <Field className="card-editor__title-field" data-invalid={titleError !== null}>
              <FieldLabel className="sr-only" htmlFor="open-card-title">
                Title
              </FieldLabel>
              <input
                id="open-card-title"
                className="card-editor__title"
                aria-invalid={titleError !== null}
                aria-describedby={titleError === null ? undefined : 'open-card-title-error'}
                value={title}
                {...paneInitialFocus(titleStartsFocused)}
                onChange={(event) => onTitleChange(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (
                    event.key !== 'Enter' ||
                    event.metaKey ||
                    event.ctrlKey ||
                    onTitleEnter === undefined
                  ) {
                    return;
                  }
                  event.preventDefault();
                  onTitleEnter();
                }}
              />
              <FieldError id="open-card-title-error">{titleError}</FieldError>
            </Field>
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
          </header>
          {children}
        </FieldGroup>
        {refusal !== null && (
          <FieldError id={refusalId} className="card-editor__refusal">
            {refusal}
          </FieldError>
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

/**
 * The content Card's form. Every field belongs to that one Card.
 */
function MarkdownCardEditor({
  content,
  graphColor,
  onComplete,
  onCancel,
}: {
  readonly content: MarkdownCard;
  readonly graphColor: string;
  readonly onComplete: (card: ResolvedContentCard) => string | null;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = useState<MarkdownDraft>(() => seedMarkdown(content));
  const [contentRefusal, setContentRefusal] = useState<string | null>(null);
  const body = useRef<HTMLTextAreaElement>(null);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const settled = settleMarkdown(content, draft);
    if (!settled.ok) {
      setDraft(settled.draft);
      setContentRefusal(settled.refusal);
      return;
    }
    const refusal = onComplete(settled.card);
    if (refusal !== null) {
      setContentRefusal(refusal);
      return;
    }
    onCancel();
  };

  const titleStartsFocused = true;

  return (
    <CardEditorShell
      subjectTitle={content.title}
      graphColor={graphColor}
      title={draft.title}
      titleError={draft.titleError}
      titleStartsFocused={titleStartsFocused}
      onTitleChange={(title) => {
        setDraft({ ...draft, title, titleError: null });
        setContentRefusal(null);
      }}
      onTitleEnter={() => body.current?.focus()}
      refusal={contentRefusal}
      refusalId="open-card-refusal"
      onSubmit={submit}
      onCancel={onCancel}
    >
      <Field className="card-editor__body">
        <FieldLabel className="sr-only" htmlFor="open-card-markdown">
          Markdown source
        </FieldLabel>
        <Textarea
          ref={body}
          id="open-card-markdown"
          className="card-editor__markdown"
          value={draft.body}
          {...paneInitialFocus(!titleStartsFocused)}
          onChange={(event) => {
            setDraft({ ...draft, body: event.currentTarget.value });
            setContentRefusal(null);
          }}
        />
      </Field>
    </CardEditorShell>
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
  const [refusal, setRefusal] = useState<string | null>(null);
  const targetInput = useRef<HTMLInputElement>(null);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const reason = occurrence.onEdit({ title: title.trim(), target });
    if (reason !== null) {
      setRefusal(reason);
      return;
    }
    // A completed Done closes the pane through the same callback as Cancel.
    onCancel();
  };

  return (
    <CardEditorShell
      subjectTitle={alias.title}
      graphColor={graphColor}
      title={title}
      titleError={null}
      titleStartsFocused={false}
      onTitleChange={(nextTitle) => {
        setTitle(nextTitle);
        setRefusal(null);
      }}
      onTitleEnter={() => targetInput.current?.focus()}
      refusal={refusal}
      refusalId="open-alias-refusal"
      onSubmit={submit}
      onCancel={onCancel}
    >
      <Field className="card-editor__body card-editor__alias-target">
        <FieldLabel className="card-editor__alias-label" htmlFor="open-alias-target">
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
          emptyMessage="This Space holds no other Card that owns its content."
          onValueChange={(chosen) => {
            const parsed = uuidSchema.safeParse(chosen);
            if (!parsed.success) return;
            setTarget(parsed.data);
            setRefusal(null);
          }}
        />
      </Field>
    </CardEditorShell>
  );
}

/**
 * A card opened over the graph — one editable surface, and the only one.
 *
 * Opening a card *is* editing it (ADR 0037). There was a reading state in front
 * of this, and it drew the same bytes in the same order: a `CardRenderer` put
 * the Markdown source in a `<pre>`, the editor puts it in a `<textarea>`, and
 * the only difference was whether the caret could enter. The mode around that
 * non-difference is gone, along with the action that crossed it — and so, now,
 * is the component, which outlived its last caller by one release.
 *
 * The surface it is drawn on — the covering panel, its focus trap and its
 * Escape — is `CardPane`, a Base UI Dialog shared with the Alias creation state.
 * What is left here is what the pane is *for*: which Card is being authored, by
 * which fields, and what one commit over them means.
 *
 * Source, still — not rendered prose. ADR 0011 removed the reading pane's
 * Markdown renderer so a card could not read one way and present another, and
 * that half holds: presenting remains the one place a card is drawn rendered.
 *
 * A content Card authors its title and Markdown. Description metadata is left
 * untouched. An Alias authors only its own title and Target; its Target must be
 * opened separately to author that Card's content.
 */
export function OpenCard(props: OpenCardProps) {
  const { onCancel } = props;

  return props.through === undefined ? (
    <MarkdownCardEditor
      key={props.card.id}
      content={props.card}
      graphColor={props.graphColor ?? '#6ea8fe'}
      onComplete={props.onComplete}
      onCancel={onCancel}
    />
  ) : (
    <AliasCardEditor
      key={props.through.id}
      alias={props.through}
      graphColor={props.graphColor ?? '#6ea8fe'}
      occurrence={props.occurrence}
      onCancel={onCancel}
    />
  );
}
