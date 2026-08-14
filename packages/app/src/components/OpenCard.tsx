import { useState, type ComponentType, type FormEvent, type ReactNode } from 'react';
import { markdownCardSchema, type Card, type CardId } from '@project/core';
import type { ResolvedContentCard } from '@project/graph';
import { Button } from '@project/ui';
import { CardPane } from './CardPane';
import { CardPicker } from './CardPicker';

/**
 * What a content kind holds while it is being authored: the pending values, and
 * whatever the last `Done` refused about them.
 *
 * A discriminated union with one member per resolved content kind, which is
 * half of the registry's compile-time obligation — the other half is
 * `CONTENT_FIELDS` below. Errors live in here rather than beside it because a
 * refusal *is* pending state: it describes the values on screen and goes stale
 * the moment one of them is edited.
 */
type MarkdownDraft = {
  readonly kind: 'markdown';
  readonly title: string;
  readonly description: string;
  readonly body: string;
  readonly titleError: string | null;
  readonly descriptionError: string | null;
};

type ContentDraft = MarkdownDraft;

/**
 * `Content` rather than `Card`, which is the domain type imported above: a
 * parameter shadowing it reads as that type at every use and is not one.
 */
type ContentFieldsProps<Draft extends ContentDraft> = {
  readonly draft: Draft;
  readonly onChange: (draft: Draft) => void;
};

/**
 * A content kind's field group: fields that hold nothing, a seed, and one pure
 * validation the pane's single `Done` runs (ADR 0048).
 *
 * The pane owns the `<form>`, submit and actions, so a content kind supplies
 * values and validity — never a completion of its own.
 */
interface ContentFieldGroup<Content extends ResolvedContentCard, Draft extends ContentDraft> {
  /** The pending values the pane opens with. */
  readonly seed: (card: Content) => Draft;
  readonly Fields: ComponentType<ContentFieldsProps<Draft>>;
  /**
   * Validate at `Done`: the whole Card to complete, or the draft carrying the
   * refusals to draw.
   */
  readonly settle: (
    card: Content,
    draft: Draft,
  ) =>
    { readonly ok: true; readonly card: Content } | { readonly ok: false; readonly draft: Draft };
}

type ContentFieldRegistry = {
  [Kind in ResolvedContentCard['kind']]: ContentFieldGroup<
    Extract<ResolvedContentCard, { kind: Kind }>,
    Extract<ContentDraft, { kind: Kind }>
  >;
};

type MarkdownCard = Extract<ResolvedContentCard, { kind: 'markdown' }>;

const markdownFields: ContentFieldGroup<MarkdownCard, MarkdownDraft> = {
  seed: (card) => ({
    kind: 'markdown',
    title: card.title,
    description: card.description ?? '',
    body: card.body,
    titleError: null,
    descriptionError: null,
  }),

  settle: (card, draft) => {
    // Both trimmed, and for the same reason the graph's inline editor trims:
    // `min(1)` counts characters and a space is one, so a title of spaces draws
    // as nothing and a description of spaces leaves a caption that says nothing
    // and no field left to clear. The body is *not* trimmed — leading and
    // trailing whitespace there is Markdown the author wrote.
    //
    const named = draft.title.trim();
    const caption = draft.description.trim();
    const parsed = markdownCardSchema.safeParse({
      id: card.id,
      title: named,
      ...(caption.length > 0 ? { description: caption } : {}),
      kind: 'markdown',
      body: draft.body,
    });
    if (parsed.success) return { ok: true, card: parsed.data };

    const forTitle = parsed.error.issues.find((candidate) => candidate.path[0] === 'title');
    const forDescription = parsed.error.issues.find(
      (candidate) => candidate.path[0] === 'description',
    );
    const titleError =
      forTitle === undefined
        ? null
        : named.length === 0
          ? 'A Card title is required.'
          : forTitle.message;
    return {
      ok: false,
      draft: {
        ...draft,
        titleError,
        descriptionError:
          forDescription?.message ??
          (forTitle === undefined ? 'The Card could not be completed.' : null),
      },
    };
  },

  Fields: ({ draft, onChange }) => (
    <>
      <label className="card-pane__field">
        <span>Title</span>
        <input
          className="card-pane__title-input"
          aria-invalid={draft.titleError !== null}
          aria-describedby={draft.titleError === null ? undefined : 'open-card-title-error'}
          value={draft.title}
          onChange={(event) =>
            onChange({ ...draft, title: event.currentTarget.value, titleError: null })
          }
        />
      </label>
      {draft.titleError !== null && (
        <span id="open-card-title-error" role="alert" className="card-pane__field-error">
          {draft.titleError}
        </span>
      )}
      <label className="card-pane__field">
        <span>Description</span>
        <input
          aria-invalid={draft.descriptionError !== null}
          aria-describedby={
            draft.descriptionError === null ? undefined : 'open-card-description-error'
          }
          value={draft.description}
          onChange={(event) =>
            onChange({ ...draft, description: event.currentTarget.value, descriptionError: null })
          }
        />
      </label>
      {draft.descriptionError !== null && (
        <span id="open-card-description-error" role="alert" className="card-pane__field-error">
          {draft.descriptionError}
        </span>
      )}
      <label className="card-pane__field card-pane__field--source">
        <span>Markdown source</span>
        <textarea
          value={draft.body}
          onChange={(event) => onChange({ ...draft, body: event.currentTarget.value })}
        />
      </label>
    </>
  ),
};

/** Adding a resolved content kind creates a compile-time obligation here. */
const CONTENT_FIELDS = {
  markdown: markdownFields,
} satisfies ContentFieldRegistry;

/**
 * A Card opened on its own content — the ordinary case, and one Card.
 *
 * `through` is declared absent so this variant cannot also be an Alias open.
 */
interface DirectOpen {
  /** The Card that was opened, which owns the content this pane authors. */
  readonly card: ResolvedContentCard;
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
  /** Close without completing. */
  readonly onCancel: () => void;
} & (DirectOpen | AliasOpen);

function EditorForm({
  children,
  refusal,
  refusalId,
  onSubmit,
  onCancel,
}: {
  readonly children: ReactNode;
  readonly refusal: string | null;
  readonly refusalId: string;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onCancel: () => void;
}) {
  return (
    <form
      className="card-pane__editor"
      aria-invalid={refusal !== null}
      aria-describedby={refusal === null ? undefined : refusalId}
      onSubmit={onSubmit}
    >
      {/* The fields scroll; the actions below them do not. */}
      <div className="card-pane__fields">{children}</div>
      {refusal !== null && (
        <span id={refusalId} role="alert" className="card-pane__field-error">
          {refusal}
        </span>
      )}
      <div className="card-pane__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="default">
          Done
        </Button>
      </div>
    </form>
  );
}

/**
 * The content Card's form. Every field belongs to that one Card.
 */
function CardEditorForm({
  content,
  onComplete,
  onCancel,
}: {
  readonly content: ResolvedContentCard;
  readonly onComplete: (card: ResolvedContentCard) => string | null;
  readonly onCancel: () => void;
}) {
  // The one dynamic dispatch, and deliberately uncast. With one resolved content
  // kind the indexed access resolves to that kind's group and everything below
  // it typechecks exactly. A second kind makes this a union of groups over a
  // union of cards, which stops compiling here — which is the obligation working,
  // and the place to answer it rather than to widen it away.
  const group = CONTENT_FIELDS[content.kind];
  const [draft, setDraft] = useState<ContentDraft>(() => group.seed(content));
  const [contentRefusal, setContentRefusal] = useState<string | null>(null);

  /**
   * Validate locally, then author the one Card this pane owns.
   */
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const settled = group.settle(content, draft);
    if (!settled.ok) {
      setDraft(settled.draft);
      return;
    }
    const refusal = onComplete(settled.card);
    if (refusal !== null) {
      setContentRefusal(refusal);
      return;
    }
    onCancel();
  };

  return (
    <EditorForm
      refusal={contentRefusal}
      refusalId="open-card-refusal"
      onSubmit={submit}
      onCancel={onCancel}
    >
      <group.Fields
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          setContentRefusal(null);
        }}
      />
    </EditorForm>
  );
}

/** The Alias pane authors one Card too: the Alias, never its Target. */
function AliasEditorForm({
  alias,
  occurrence,
  onCancel,
}: {
  readonly alias: Extract<Card, { kind: 'alias' }>;
  readonly occurrence: OccurrenceAuthoring;
  readonly onCancel: () => void;
}) {
  const [title, setTitle] = useState(alias.title);
  const [target, setTarget] = useState<CardId>(alias.target);
  const [refusal, setRefusal] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const reason = occurrence.onEdit({ title, target });
    if (reason !== null) {
      setRefusal(reason);
      return;
    }
    onCancel();
  };

  return (
    <EditorForm
      refusal={refusal}
      refusalId="open-alias-refusal"
      onSubmit={submit}
      onCancel={onCancel}
    >
      <label className="card-pane__field">
        <span>Title</span>
        <input
          className="card-pane__title-input"
          value={title}
          onChange={(event) => {
            setTitle(event.currentTarget.value);
            setRefusal(null);
          }}
        />
      </label>
      <CardPicker
        label="Target"
        cards={occurrence.targets}
        selectedId={target}
        initialFocus={false}
        onSelect={(chosen) => {
          setTarget(chosen);
          setRefusal(null);
        }}
        emptyMessage="This Space holds no other Card that owns its content."
      />
    </EditorForm>
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
 * which fields, and what one `Done` over them means.
 *
 * Source, still — not rendered prose. ADR 0011 removed the reading pane's
 * Markdown renderer so a card could not read one way and present another, and
 * that half holds: presenting remains the one place a card is drawn rendered.
 *
 * A content Card authors its title, description and content. An Alias authors
 * only its own title and Target; its Target must be opened separately to author
 * that Card's content.
 */
export function OpenCard(props: OpenCardProps) {
  const { onCancel } = props;
  const opened = props.through ?? props.card;

  return (
    <CardPane
      testId="open-card"
      onDismiss={onCancel}
      // Named for the Card, which is the only thing distinguishing one opened
      // Card from another. Directly opened, that title is also the first
      // field, so a screen reader hears the name and then lands on the
      // control that changes it.
      ariaLabel={opened.title}
    >
      {props.through === undefined ? (
        <CardEditorForm
          key={props.card.id}
          content={props.card}
          onComplete={props.onComplete}
          onCancel={onCancel}
        />
      ) : (
        <AliasEditorForm
          key={props.through.id}
          alias={props.through}
          occurrence={props.occurrence}
          onCancel={onCancel}
        />
      )}
    </CardPane>
  );
}
