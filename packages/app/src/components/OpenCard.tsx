import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { markdownCardSchema } from '@project/core';
import type { ResolvedContentCard } from '@project/graph';
import { Button } from '@project/ui';

/**
 * Everything inside the pane a `Tab` can land on, in document order.
 *
 * Queried on each `Tab` rather than cached: the editor grows and loses field
 * errors as an author types, and a cached list would send focus to a node that
 * has since been unmounted.
 */
const focusableWithin = (root: HTMLElement): readonly HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>('input, textarea, button, [href], [tabindex]')].filter(
    (element) => !element.hasAttribute('disabled') && element.tabIndex !== -1,
  );

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
 * of this, and it drew the same bytes in the same order: a `CardRenderer` put
 * the Markdown source in a `<pre>`, the editor puts it in a `<textarea>`, and
 * the only difference was whether the caret could enter. The mode around that
 * non-difference is gone, along with the action that crossed it — and so, now,
 * is the component, which outlived its last caller by one release.
 *
 * A modal dialog, because it covers the graph and the graph stays focusable:
 * React Flow measures its nodes and keeps them in the tab order, so `inert` is
 * not available and the containment is this component's own.
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
  const panel = useRef<HTMLDivElement>(null);

  // Captured during the first render and restored on unmount, so closing returns
  // the author to the control they opened the Card from.
  //
  // Read here rather than in an effect because the title field carries
  // `autoFocus`, which React applies while committing — before any effect runs.
  // An effect therefore asks after the pane already owns focus and answers with
  // the pane's own field, which restores nothing. Render happens before the
  // commit, so this is the last moment the opener is still the active element.
  const [opener] = useState<Element | null>(() => document.activeElement);
  useEffect(
    () => () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    },
    [opener],
  );

  /**
   * Keep `Tab` inside the pane.
   *
   * The graph behind is not `inert` — React Flow needs its nodes measurable, and
   * a node keeps `tabIndex=0` outside presenting — so without this, `Tab` walks
   * out of the editor onto Cards that answer `Enter` by opening themselves.
   * Wrapping at both ends is the whole of it; the pane's controls are few and
   * always present.
   */
  const containTab = useCallback((event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab' || panel.current === null) return;
    const focusable = focusableWithin(panel.current);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    // The handler sits on the panel, so the active element is always inside it.
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  return (
    <div className="open-card" data-testid="open-card">
      <div
        ref={panel}
        className="open-card__panel"
        role="dialog"
        aria-modal="true"
        // Named for the Card, which is the only thing distinguishing one opened
        // Card from another. The title is also the first field, so a screen
        // reader hears the name and then lands on the control that changes it.
        aria-label={content.title}
        onKeyDown={containTab}
      >
        {onComplete === undefined ? null : (
          // Keyed by Card, because the draft is seeded from `card` once and then
          // owned by the editor. Without this, opening a second Card without
          // closing the first reuses the same element in the same position: the
          // draft survives while `card.id` changes underneath it, and `Done`
          // writes the first Card's title and body onto the second.
          <ResolvedContentEditor
            key={content.id}
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
