import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { markdownCardSchema, type Card } from '@project/core';
import type { ResolvedContentCard } from '@project/graph';
import { Button } from '@project/ui';

/**
 * Exactly the three element kinds the pane contains, all of them always enabled
 * and always tabbable. Links, explicit `tabindex` and a `disabled` filter would
 * each guard a state no editor here can reach; add them back alongside whatever
 * introduces one.
 *
 * One selector, because the two things it answers have to agree: what `Tab`
 * cycles through, and what a mousedown is allowed to move focus onto. A control
 * missing from one list and present in the other is either unreachable by
 * keyboard or a way out of the pane by pointer.
 */
const PANE_FOCUSABLE = 'input, textarea, button';

/**
 * Everything inside the pane a `Tab` can land on, in document order.
 *
 * Queried on each `Tab` rather than cached: the editor grows and loses field
 * errors as an author types, and a cached list would send focus to a node that
 * has since been unmounted.
 */
const focusableWithin = (root: HTMLElement): readonly HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>(PANE_FOCUSABLE),
];

/**
 * `Content` rather than `Card`, which is the domain type imported above: a
 * parameter shadowing it reads as that type at every use and is not one.
 */
type ContentEditorProps<Content extends ResolvedContentCard> = {
  readonly card: Content;
  /**
   * Whether the title is authored here as well. False when the content was
   * reached through another occurrence, which keeps its own title on the graph
   * and is not the Card this editor writes to. The editor's remaining fields
   * then name the Card they author, because the occurrence behind the pane
   * carries a title and a description of its own that they do not touch.
   */
  readonly titleEditable: boolean;
  readonly onComplete: (card: Content) => void;
  readonly onCancel: () => void;
};

type ContentEditorRegistry = {
  [Kind in ResolvedContentCard['kind']]: ComponentType<
    ContentEditorProps<Extract<ResolvedContentCard, { kind: Kind }>>
  >;
};

function MarkdownCardEditor({
  card,
  titleEditable,
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
    //
    // The title is trimmed only where it is authored. A delegated open renders
    // no title field and no node to report a refused title, so trimming a stored
    // title of spaces — which `min(1)` accepts at rest, and an import can
    // therefore store — refused the whole edit into a node this pane does not
    // draw: `Done` did nothing, said nothing, and left no way to find out why.
    // What the author cannot see, they cannot have broken; the stored title was
    // validated when it was stored, so passing it through cannot fail here.
    const named = titleEditable ? title.trim() : card.title;
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
      // A refusal has to land somewhere the author can see it. The title's own
      // node is the right home for a title issue — but only where the title is
      // authored here, because a delegated open draws neither that field nor
      // that node, so a title issue reported there is reported nowhere and
      // `Done` goes quiet. That is the same silent no-op the trimming rule
      // above removed, reached from the other side, and nothing can reach it
      // today: `markdownCardDocumentSchema` *is* `markdownCardSchema` less its
      // id, so a stored title has already passed this exact rule and the
      // delegated path passes it straight through. What makes it unreachable is
      // an equality between two schemas that nothing enforces, and the day they
      // diverge the symptom is a button that does nothing — so a refusal with
      // nowhere of its own to go falls through to the generic message.
      const reportedInPlace = titleEditable && forTitle !== undefined;
      setDescriptionError(
        forDescription?.message ?? (reportedInPlace ? null : 'The Card could not be completed.'),
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
      {titleEditable && (
        <>
          <label className="open-card__field">
            <span>Title</span>
            <input
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
        </>
      )}
      <label className="open-card__field">
        <span>{titleEditable ? 'Description' : `Description of ${card.title}`}</span>
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
        <span>{titleEditable ? 'Markdown source' : `Markdown source of ${card.title}`}</span>
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
  titleEditable,
  onComplete,
  onCancel,
}: ContentEditorProps<ResolvedContentCard>) {
  const Editor = CONTENT_EDITORS[card.kind] as ComponentType<
    ContentEditorProps<ResolvedContentCard>
  >;
  return (
    <Editor card={card} titleEditable={titleEditable} onComplete={onComplete} onCancel={onCancel} />
  );
}

/**
 * A Card opened on its own content — the ordinary case, and one Card.
 *
 * `content` and `through` are declared absent rather than left off, so a caller
 * cannot quietly hand this variant a second Card: the pair is refused by
 * assignability, not by an excess-property check a spread or an intermediate
 * variable would slip past.
 */
interface DirectOpen {
  /** The Card that was opened, which owns the content this pane authors. */
  readonly card: ResolvedContentCard;
  readonly through?: never;
  readonly content?: never;
}

/**
 * A Card opened through another occurrence of its content — an Alias today
 * (ADR 0039), and whatever later kind resolves its content elsewhere.
 */
interface DelegatedOpen {
  /**
   * The authored Card whose occurrence was opened; an Alias remains intact
   * here. Named for what the pane says — "Opened through A again" — because
   * that is the relation this prop records: the Card the author reached the
   * content *through*, which keeps its own title on the graph.
   */
  readonly through: Card;
  /** The Card that owns the content reached through the occurrence above. */
  readonly content: ResolvedContentCard;
  readonly card?: never;
}

/**
 * What the pane was opened on, in exactly one of its two forms.
 *
 * This was two independent props — `opened: Card` and `content:
 * ResolvedContentCard` — with the relation `content === resolveContentCard(
 * space, opened.id)` holding only because every caller happened to establish
 * it. Any two Cards typechecked, and a mismatched pair silently authored a Card
 * the author never opened. A direct open now names one Card, so that pair
 * cannot be written down.
 *
 * The second thing the union buys is that **delegation is declared, not
 * derived**. `opened.kind === 'alias'` answered the question by proxy and would
 * answer it wrong for any later Card kind whose content resolves elsewhere: the
 * pane would draw a Title field, that field would rename the *content* owner,
 * and the graph behind it would go on drawing the *opened* Card's title — two
 * cards' titles, one field, which is exactly the negative ADR 0039 records.
 * Callers pick a variant from the relation — whether the Card that was opened
 * is the Card that owns its content — never from the opened Card's kind.
 */
export type OpenCardProps = {
  /** Complete the one whole Card that owns the resolved content. */
  readonly onComplete: (card: ResolvedContentCard) => void;
  /** Close without completing. */
  readonly onCancel: () => void;
} & (DirectOpen | DelegatedOpen);

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
 * A directly opened Card authors its title here and on the graph, with only one
 * surface visible at a time. An Alias keeps its own title on the graph and this
 * surface identifies, but does not rename, the Card whose content it delegates.
 */
export function OpenCard(props: OpenCardProps) {
  const { onComplete, onCancel } = props;
  const panel = useRef<HTMLDivElement>(null);
  // The one place the variant is read. A direct open is one Card being its own
  // content, so the pair below cannot disagree; a delegated one carries two,
  // and `delegated` is what the caller declared rather than a `kind` this
  // component reads back off a Card.
  const { delegated, opened, content } =
    props.through === undefined
      ? { delegated: false, opened: props.card, content: props.card }
      : { delegated: true, opened: props.through, content: props.content };

  /**
   * The pane takes focus while it is open. Where focus goes when it *closes* is
   * not this component's to decide — see `App`, which returns it to the Card.
   *
   * Restoring from here was tried and is wrong twice over. The obvious capture,
   * `document.activeElement` on mount, is the control that opened the Card — and
   * the app unmounts that control while a Card is open, since `titleEditingEnabled`
   * goes false and the affordance goes with it, so by closing time the captured
   * element is detached and focus lands on `<body>`. Worse, a cleanup that only
   * restores is not idempotent, which `StrictMode` requires rather than prefers:
   * React double-invokes effects as mount → cleanup → mount, so the restore ran
   * *immediately* after opening, moved focus to a control about to be removed,
   * and left the pane with no focus at all — `containTab` never fired, because it
   * is bound to the panel.
   *
   * Focus is taken here rather than by `autoFocus` on the field for that same
   * reason: `autoFocus` fires once, on the real mount, so it cannot answer a
   * simulated cleanup that follows it. Taking focus in the setup half can.
   */
  useEffect(() => {
    const pane = panel.current;
    if (pane !== null) focusableWithin(pane)[0]?.focus();
  }, []);

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

  /**
   * Keep the pointer from putting focus where `containTab` cannot see it.
   *
   * `containTab` is bound to the panel, so it only ever answers a `Tab` pressed
   * while focus is already inside — and a mousedown on anything unfocusable
   * moves focus to `<body>`, where it never fires at all. `Tab` then walks the
   * document from the top, into the toolbar and on to the Card nodes the pane
   * covers, which is the escape the containment exists to close. Two surfaces
   * reach it: the backdrop, always visible because the panel letterboxes inside
   * it, and the panel's own padding and gaps.
   *
   * Preventing the default leaves focus where it already was, which is the one
   * answer that needs no opinion about where it should go instead. It is
   * prevented only where the default would take focus *out* of the pane: a
   * mousedown on a control keeps its default, or clicking a field would not put
   * the caret in it. A label's text is not a control and is prevented, and the
   * field still focuses — a label focuses what it names on `click`, which this
   * does not cancel. The cost is that the pane's static text no longer
   * drag-selects; it is two spans of banner and three field labels.
   */
  const containFocus = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    const target = event.target;
    if (target instanceof Element && target.closest(PANE_FOCUSABLE) !== null) return;
    event.preventDefault();
  }, []);

  return (
    <div className="open-card" data-testid="open-card" onMouseDown={containFocus}>
      <div
        ref={panel}
        className="open-card__panel"
        role="dialog"
        aria-modal="true"
        // Named for the Card, which is the only thing distinguishing one opened
        // Card from another. Directly opened, that title is also the first
        // field, so a screen reader hears the name and then lands on the
        // control that changes it.
        //
        // Delegated, the two Cards are different Cards and the name has to say
        // both: named only for the content owner, opening `A′` announced a
        // dialog called `A`, which is neither what the author opened nor
        // something this pane lets them rename. The delegation banner is the
        // only other signal and it is plain text, so a reader landing on
        // Description hears no name at all for the occurrence it came from.
        // `aria-describedby` onto that banner was the alternative and it fixes
        // the wrong half: a description is heard after the name, and the name
        // would still be a Card the author did not open.
        aria-label={
          delegated ? `${opened.title} — editing content on ${content.title}` : content.title
        }
        onKeyDown={containTab}
      >
        {delegated && (
          <div className="open-card__delegation">
            <span>Opened through {opened.title}</span>
            <span>Editing content on {content.title}</span>
          </div>
        )}
        {/* Keyed by opened occurrence and content owner, because the draft is
            seeded once and then owned by the editor. Reusing one would carry a
            previous Card's draft under the next Card's identity. */}
        <ResolvedContentEditor
          key={`${opened.id}:${content.id}`}
          card={content}
          titleEditable={!delegated}
          onComplete={(completed) => {
            onComplete(completed);
            onCancel();
          }}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
