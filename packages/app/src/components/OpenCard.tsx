import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from 'react';
import { markdownCardSchema } from '@project/core';
import type { ResolvedContentCard } from '@project/graph';
import { Button, CardRenderer } from '@project/ui';

type ContentEditorProps<Card extends ResolvedContentCard> = {
  readonly displayTitle: string;
  readonly card: Card;
  readonly onComplete: (card: Card) => void;
  readonly onCancel: () => void;
};

type ContentEditorRegistry = {
  [Kind in ResolvedContentCard['kind']]: ComponentType<
    ContentEditorProps<Extract<ResolvedContentCard, { kind: Kind }>>
  >;
};

function MarkdownCardEditor({
  displayTitle,
  card,
  onComplete,
  onCancel,
}: ContentEditorProps<Extract<ResolvedContentCard, { kind: 'markdown' }>>) {
  const [description, setDescription] = useState(card.description ?? '');
  const [body, setBody] = useState(card.body);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    // Trimmed, so a description an author blanked is *absent* rather than a run
    // of spaces the schema's `min(1)` happily accepts. Every reader keys off the
    // presence of the key — the node draws its caption for any truthy value — so
    // a blank one leaves a paragraph that says nothing and no field to clear.
    // The body is not trimmed: leading and trailing whitespace is Markdown the
    // author wrote.
    const caption = description.trim();
    const parsed = markdownCardSchema.safeParse({
      id: card.id,
      title: card.title,
      ...(caption.length > 0 ? { description: caption } : {}),
      kind: 'markdown',
      body,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues.find((candidate) => candidate.path[0] === 'description');
      setDescriptionError(issue?.message ?? 'The Card could not be completed.');
      return;
    }
    setDescriptionError(null);
    onComplete(parsed.data);
  };

  return (
    <form
      className="open-card__editor"
      onSubmit={submit}
      // Escape is the editor's own cancel, and it has to be taken here rather
      // than left to bubble: the window listener that closes an opened Card
      // (`App.tsx`) is registered the whole time one is open, so the same key
      // both left the editor and destroyed the source typed into it — nothing
      // asked, nothing to undo. Stopping propagation keeps the two from
      // answering one keypress.
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
    >
      <h2 className="card__title">{displayTitle}</h2>
      <label className="open-card__field">
        <span>Description</span>
        <input
          autoFocus
          aria-invalid={descriptionError !== null}
          aria-describedby={descriptionError === null ? undefined : 'open-card-description-error'}
          value={description}
          onChange={(event) => {
            setDescription(event.currentTarget.value);
            setDescriptionError(null);
          }}
        />
      </label>
      {descriptionError !== null && (
        <span id="open-card-description-error" role="alert" className="open-card__field-error">
          {descriptionError}
        </span>
      )}
      <label className="open-card__field open-card__field--source">
        <span>Markdown source</span>
        <textarea value={body} onChange={(event) => setBody(event.currentTarget.value)} />
      </label>
      <div className="open-card__actions">
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

/** Adding a resolved content kind creates a compile-time editor obligation here. */
const CONTENT_EDITORS = {
  markdown: MarkdownCardEditor,
} satisfies ContentEditorRegistry;

function ResolvedContentEditor({
  displayTitle,
  card,
  onComplete,
  onCancel,
}: ContentEditorProps<ResolvedContentCard>) {
  const Editor = CONTENT_EDITORS[card.kind] as ComponentType<
    ContentEditorProps<ResolvedContentCard>
  >;
  return (
    <Editor displayTitle={displayTitle} card={card} onComplete={onComplete} onCancel={onCancel} />
  );
}

export interface OpenCardProps {
  title: string;
  content: ResolvedContentCard;
  /** Present only when the opened Card may author this resolved content. */
  onComplete?: (card: ResolvedContentCard) => void;
  /** Actions for this card — a close button, say. */
  footer: ReactNode;
}

/**
 * A card opened over the graph.
 *
 * The graph draws titles (ADR 0006); this is where a card is opened. Opening is
 * a view-source gesture — `CardRenderer` shows the Markdown verbatim, not
 * rendered (ADR 0011). Presenting is the other half of that distinction and is
 * where a card is drawn *rendered*; it walks the route on the graph canvas
 * rather than on a surface of its own (ADR 0024, 0027).
 */
export function OpenCard({ title, content, onComplete, footer }: OpenCardProps) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const restoreEditFocus = useRef(false);

  useEffect(() => {
    if (!editing && restoreEditFocus.current) {
      restoreEditFocus.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  const finishEditing = (): void => {
    restoreEditFocus.current = true;
    setEditing(false);
  };

  return (
    <div className="open-card" data-testid="open-card">
      <div className="open-card__panel">
        {editing && onComplete !== undefined ? (
          <ResolvedContentEditor
            displayTitle={title}
            card={content}
            onComplete={(completed) => {
              onComplete(completed);
              finishEditing();
            }}
            onCancel={finishEditing}
          />
        ) : (
          <>
            <div className="open-card__content">
              <CardRenderer title={title} markdown={content.body} variant="full" />
            </div>
            <div className="open-card__actions">
              {onComplete !== undefined && (
                <Button
                  ref={editButton}
                  type="button"
                  variant="default"
                  onClick={() => setEditing(true)}
                >
                  Edit Card
                </Button>
              )}
              {footer}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
