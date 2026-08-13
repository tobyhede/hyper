import { useState, type ComponentType, type FormEvent } from 'react';
import { markdownCardSchema, type Card, type CardId } from '@project/core';
import type { ResolvedContentCard } from '@project/graph';
import { Button } from '@project/ui';
import { CardPane } from './CardPane';
import { CardPicker } from './CardPicker';

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
      className="card-pane__editor"
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
          <label className="card-pane__field">
            <span>Title</span>
            <input
              className="card-pane__title-input"
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
            <span id="open-card-title-error" role="alert" className="card-pane__field-error">
              {titleError}
            </span>
          )}
        </>
      )}
      <label className="card-pane__field">
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
        <span id="open-card-description-error" role="alert" className="card-pane__field-error">
          {descriptionError}
        </span>
      )}
      <label className="card-pane__field card-pane__field--source">
        <span>{titleEditable ? 'Markdown source' : `Markdown source of ${card.title}`}</span>
        <textarea value={body} onChange={(event) => setBody(event.currentTarget.value)} />
      </label>
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
  readonly occurrence?: never;
}

/**
 * Authoring the occurrence itself, from the editor it was opened in.
 *
 * `through` below names the Card the content was reached through; this is what
 * may be authored *on* it — its own title, and which Card it points at. Offered
 * by the caller rather than derived from the opened Card's kind, for the same
 * reason delegation itself is declared: an occurrence that resolves its content
 * elsewhere is not necessarily one whose title and pointer an author may move.
 * Absent, the pane authors the content and nothing else.
 *
 * One capability rather than two optional props, because both are offered on
 * exactly one fact — this occurrence is an Alias (ADR 0009) — and a caller able
 * to supply the Target without the Title is a caller able to rebuild the pane
 * that could retarget an Alias it could not rename.
 */
interface OccurrenceAuthoring {
  /**
   * Rename the occurrence, answering the sentence to show when the Space
   * refused it. Its own edit subject: the title is the occurrence's and the
   * fields under it are the content owner's, so this completes nothing there.
   */
  readonly onRename: (title: string) => string | null;
  /** The Cards this occurrence may point at — non-Alias Cards (ADR 0009). */
  readonly targets: readonly Card[];
  /** Retarget, answering the sentence to show when the Space refused it. */
  readonly onRetarget: (target: CardId) => string | null;
}

/**
 * The occurrence's own title — the Alias's, never the content owner's.
 *
 * Committed on Enter and on blur, which is the rule the graph's in-place rename
 * already follows (`CardTitleEditor`), and cancelled by an Escape that restores
 * the stored title where there is a draft to restore — and only then, on a
 * second press, closes the pane out from over it. It is deliberately not
 * carried by the pane's `Done`: that button completes the *content* Card, and
 * the Target beside this field already commits the moment it is chosen, so the
 * occurrence's two fields settle as they are edited and the content editor
 * keeps its own submit.
 *
 * A draft equal to the stored title is not submitted at all. Authoring would
 * answer `unchanged`, which is the same nothing — this only spares the round
 * trip a blur makes every time an author tabs past an untouched field.
 */
function OccurrenceTitleEditor({
  title,
  onRename,
  onCancel,
}: {
  readonly title: string;
  readonly onRename: (title: string) => string | null;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = useState(title);
  const [error, setError] = useState<string | null>(null);

  const complete = (): void => {
    setError(draft === title ? null : onRename(draft));
  };

  return (
    <>
      <label className="card-pane__field">
        <span>Title</span>
        <input
          className="card-pane__title-input"
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : 'open-card-occurrence-title-error'}
          value={draft}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setError(null);
          }}
          onBlur={complete}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              complete();
              return;
            }
            if (event.key !== 'Escape') return;
            // Taken here rather than left to bubble, for the reason the content
            // editor takes it: the window listener that closes an opened Card is
            // registered the whole time one is open, and one keypress may only
            // be consumed by one owner.
            event.preventDefault();
            event.stopPropagation();
            // Which owner that is depends on whether this field is holding
            // anything: "Dirty field restores value before surface closes". A
            // draft takes the first Escape and puts back what the Card is
            // stored as — the message from a refused rename with it, since an
            // alert describing a draft outlives it otherwise — and only a field
            // with nothing to restore hands the gesture on to the pane.
            if (draft !== title) {
              setDraft(title);
              setError(null);
              return;
            }
            onCancel();
          }}
        />
      </label>
      {error !== null && (
        <span id="open-card-occurrence-title-error" role="alert" className="card-pane__field-error">
          {error}
        </span>
      )}
    </>
  );
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
  /**
   * The one canonical place an Alias's own title and Target change (ADR 0009's
   * storyboard). Optional, because delegation and authoring the occurrence are
   * different capabilities: the pane draws the two fields when it is given one
   * and nothing when it is not.
   */
  readonly occurrence?: OccurrenceAuthoring;
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
 * The surface it is drawn on — the covering panel and its focus containment —
 * is `CardPane`, shared with the Alias creation state. What is left here is
 * what the pane is *for*: which Card is being authored, and by which editor.
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
  // The one place the variant is read. A direct open is one Card being its own
  // content, so the pair below cannot disagree; a delegated one carries two,
  // and `delegated` is what the caller declared rather than a `kind` this
  // component reads back off a Card.
  const { delegated, opened, content } =
    props.through === undefined
      ? { delegated: false, opened: props.card, content: props.card }
      : { delegated: true, opened: props.through, content: props.content };
  const occurrence = props.through === undefined ? undefined : props.occurrence;
  const [retargetRefusal, setRetargetRefusal] = useState<string | null>(null);

  return (
    <CardPane
      testId="open-card"
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
      ariaLabel={
        delegated ? `${opened.title} — editing content on ${content.title}` : content.title
      }
    >
      {delegated && (
        <div className="card-pane__delegation">
          <span>Opened through {opened.title}</span>
          <span>Editing content on {content.title}</span>
        </div>
      )}
      {occurrence !== undefined && (
        // The occurrence's own two fields, above the content the Target owns:
        // what this Card is called and *which* Card it shows come before the
        // fields that author that Card (ADR 0009's Frame 4).
        <div className="card-pane__occurrence">
          {/* Keyed by the occurrence, so a second Alias of the same content
              cannot inherit the first one's draft — the same reason the content
              editor below is keyed by both ids. */}
          <OccurrenceTitleEditor
            key={opened.id}
            title={opened.title}
            onRename={occurrence.onRename}
            onCancel={onCancel}
          />
          <CardPicker
            label="Target"
            cards={occurrence.targets}
            selectedId={content.id}
            // Frame 4 asks for no focus change, so the pane's ordinary rule
            // holds and the open lands on the Title above this.
            initialFocus={false}
            onSelect={(target) => setRetargetRefusal(occurrence.onRetarget(target))}
            // Escape past an empty search is the pane's to answer, exactly as
            // it is in every other field here.
            onCancel={onCancel}
            emptyMessage="This Space holds no other Card that owns its content."
          />
          {retargetRefusal !== null && (
            <span role="alert" className="card-pane__field-error">
              {retargetRefusal}
            </span>
          )}
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
    </CardPane>
  );
}
