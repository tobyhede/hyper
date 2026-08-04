import { useState, type ComponentType, type FormEvent } from 'react';
import { markdownCardSchema } from '@project/core';
import type { ResolvedContentCard } from '@project/graph';
import { Button } from '@project/ui';

type ContentEditorProps<Card extends ResolvedContentCard> = {
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
  card,
  onComplete,
  onCancel,
}: ContentEditorProps<Extract<ResolvedContentCard, { kind: 'markdown' }>>) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? '');
  const [body, setBody] = useState(card.body);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    // Both trimmed, and for the same reason the graph's inline editor trims:
    // `min(1)` counts characters and a space is one, so a title of spaces draws
    // as nothing and a description of spaces leaves a caption that says nothing
    // and no field left to clear. The body is *not* trimmed — leading and
    // trailing whitespace there is Markdown the author wrote.
    const named = title.trim();
    const caption = description.trim();
    const parsed = markdownCardSchema.safeParse({
      id: card.id,
      title: named,
      ...(caption.length > 0 ? { description: caption } : {}),
      kind: 'markdown',
      body,
    });
    if (!parsed.success) {
      const forTitle = parsed.error.issues.find((candidate) => candidate.path[0] === 'title');
      const forDescription = parsed.error.issues.find(
        (candidate) => candidate.path[0] === 'description',
      );
      setTitleError(
        forTitle === undefined
          ? null
          : named.length === 0
            ? 'A Card title is required.'
            : forTitle.message,
      );
      setDescriptionError(
        forDescription?.message ??
          (forTitle === undefined ? 'The Card could not be completed.' : null),
      );
      return;
    }
    setTitleError(null);
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
      <label className="open-card__field">
        <span>Title</span>
        <input
          autoFocus
          className="open-card__title-input"
          aria-invalid={titleError !== null}
          aria-describedby={titleError === null ? undefined : 'open-card-title-error'}
          value={title}
          onChange={(event) => {
            setTitle(event.currentTarget.value);
            setTitleError(null);
          }}
        />
      </label>
      {titleError !== null && (
        <span id="open-card-title-error" role="alert" className="open-card__field-error">
          {titleError}
        </span>
      )}
      <label className="open-card__field">
        <span>Description</span>
        <input
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
  card,
  onComplete,
  onCancel,
}: ContentEditorProps<ResolvedContentCard>) {
  const Editor = CONTENT_EDITORS[card.kind] as ComponentType<
    ContentEditorProps<ResolvedContentCard>
  >;
  return <Editor card={card} onComplete={onComplete} onCancel={onCancel} />;
}

export interface OpenCardProps {
  content: ResolvedContentCard;
  /** Complete one whole Card. Absent only if the Card owns nothing to author. */
  onComplete?: (card: ResolvedContentCard) => void;
  /** Close without completing. */
  onCancel: () => void;
}

/**
 * A card opened over the graph — one editable surface, and the only one.
 *
 * Opening a card *is* editing it (ADR 0037). There was a reading state in front
 * of this, and it drew the same bytes in the same order: `CardRenderer` put the
 * Markdown source in a `<pre>`, the editor puts it in a `<textarea>`, and the
 * only difference was whether the caret could enter. The mode around that
 * non-difference is gone, along with the action that crossed it.
 *
 * Source, still — not rendered prose. ADR 0011 removed the reading pane's
 * Markdown renderer so a card could not read one way and present another, and
 * that half holds: presenting remains the one place a card is drawn rendered.
 *
 * The title is authored here *and* on the graph, which is safe because only one
 * is ever on screen: title editing is withdrawn while a card is open. Both write
 * the same card through Space Authoring.
 */
export function OpenCard({ content, onComplete, onCancel }: OpenCardProps) {
  return (
    <div className="open-card" data-testid="open-card">
      <div className="open-card__panel">
        {onComplete === undefined ? null : (
          <ResolvedContentEditor
            card={content}
            onComplete={(completed) => {
              onComplete(completed);
              onCancel();
            }}
            onCancel={onCancel}
          />
        )}
      </div>
    </div>
  );
}
