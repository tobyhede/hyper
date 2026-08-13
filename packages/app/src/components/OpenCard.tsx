import { useState, type ComponentType, type FormEvent } from 'react';
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
type ContentFieldsProps<Content extends ResolvedContentCard, Draft extends ContentDraft> = {
  readonly card: Content;
  /**
   * Whether the title is authored here as well. False when the content was
   * reached through another occurrence, which keeps its own title on the graph
   * and is not the Card this group writes to. The remaining fields then name the
   * Card they author, because the occurrence behind the pane carries a title and
   * a description of its own that they do not touch.
   */
  readonly titleEditable: boolean;
  readonly draft: Draft;
  readonly onChange: (draft: Draft) => void;
};

/**
 * A content kind's field group: fields that hold nothing, a seed, and one pure
 * validation the pane's single `Done` runs (ADR 0048).
 *
 * The group used to be an editor that owned the `<form>`, the submit and the
 * actions, with the occurrence's own fields rendered above and outside it. One
 * Done over all four fields means the pane owns the form, so what a content kind
 * supplies is values and validity — never a completion of its own.
 */
interface ContentFieldGroup<Content extends ResolvedContentCard, Draft extends ContentDraft> {
  /** The pending values the pane opens with. */
  readonly seed: (card: Content) => Draft;
  readonly Fields: ComponentType<ContentFieldsProps<Content, Draft>>;
  /**
   * Validate at `Done`: the whole Card to complete, or the draft carrying the
   * refusals to draw.
   */
  readonly settle: (
    card: Content,
    titleEditable: boolean,
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

  settle: (card, titleEditable, draft) => {
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
    const named = titleEditable ? draft.title.trim() : card.title;
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
    // A refusal has to land somewhere the author can see it. The title's own
    // node is the right home for a title issue — but only where the title is
    // authored here, because a delegated open draws neither that field nor that
    // node, so a title issue reported there is reported nowhere and `Done` goes
    // quiet. That is the same silent no-op the trimming rule above removed,
    // reached from the other side, and nothing can reach it today:
    // `markdownCardDocumentSchema` *is* `markdownCardSchema` less its id, so a
    // stored title has already passed this exact rule and the delegated path
    // passes it straight through. What makes it unreachable is an equality
    // between two schemas that nothing enforces, and the day they diverge the
    // symptom is a button that does nothing — so a refusal with nowhere of its
    // own to go falls through to the generic message.
    const reportedInPlace = titleEditable && forTitle !== undefined;
    return {
      ok: false,
      draft: {
        ...draft,
        titleError,
        descriptionError:
          forDescription?.message ?? (reportedInPlace ? null : 'The Card could not be completed.'),
      },
    };
  },

  Fields: ({ card, titleEditable, draft, onChange }) => (
    <>
      {titleEditable && (
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
        </>
      )}
      <label className="card-pane__field">
        <span>{titleEditable ? 'Description' : `Description of ${card.title}`}</span>
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
        <span>{titleEditable ? 'Markdown source' : `Markdown source of ${card.title}`}</span>
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
  /** The Cards this occurrence may point at — non-Alias Cards (ADR 0009). */
  readonly targets: readonly Card[];
  /**
   * Author the occurrence's own title and Target, answering the sentence to show
   * when the Space refused it.
   *
   * **One call carrying both**, because both fields pend to the pane's one
   * `Done` (ADR 0048) and an Alias whose title and Target both moved is one
   * authored fact. Two calls would be two Edits and two commits over one press.
   * Its own edit subject: the fields under it are the content owner's, so this
   * completes nothing there.
   */
  readonly onEdit: (change: { readonly title: string; readonly target: CardId }) => string | null;
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
  /**
   * Complete the one whole Card that owns the resolved content, answering the
   * sentence to show when the Space refused it — the same contract as
   * `OccurrenceAuthoring.onEdit`, because both halves of one `Done` have to be
   * able to say no in a way the author can see.
   */
  readonly onComplete: (card: ResolvedContentCard) => string | null;
  /** Close without completing. */
  readonly onCancel: () => void;
} & (DirectOpen | DelegatedOpen);

/**
 * Everything the pane is holding, and the one submit that settles all of it.
 *
 * Four fields pend here — the occurrence's Title and Target, and the content
 * kind's own group — and `Done` commits them together (ADR 0048). Nothing
 * commits on blur, on Enter or on a picker's selection, which is what lets an
 * author retarget an Alias without the content editor beneath being remounted
 * out from under a paragraph they were typing.
 *
 * Keyed by the caller on the pair of ids, so a different open is a different
 * form and no draft is ever shown under another Card's identity.
 */
function CardEditorForm({
  opened,
  content,
  delegated,
  occurrence,
  onComplete,
  onCancel,
}: {
  readonly opened: Card;
  readonly content: ResolvedContentCard;
  readonly delegated: boolean;
  readonly occurrence: OccurrenceAuthoring | undefined;
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
  const [occurrenceTitle, setOccurrenceTitle] = useState(opened.title);
  const [target, setTarget] = useState<CardId>(content.id);
  /**
   * The Space's refusal of the occurrence's Edit, drawn once for the pair.
   *
   * Not tied to either field by `aria-describedby`: `Done` submits the Title and
   * the Target as one Edit, so the sentence describes both and naming one of
   * them would send an author to the wrong field half the time. The content
   * group's own refusals stay linked to their fields, where each one really does
   * belong to one value.
   */
  const [occurrenceRefusal, setOccurrenceRefusal] = useState<string | null>(null);
  /**
   * And the Space's refusal of the content Card's Edit, which is the other half
   * of the same press and has nowhere else to be said — the content group's own
   * error nodes belong to values it validated itself.
   */
  const [contentRefusal, setContentRefusal] = useState<string | null>(null);

  /**
   * Validate locally, then author — in that order, so a refusal this pane can
   * see for itself stops both Edits before either is made.
   *
   * Two completions and no more (ADR 0048): `edited-card` on the occurrence, and
   * `edited-card` on the Card that owns the content. The occurrence goes first
   * because it is the pane's top half; nothing about it can invalidate the Card
   * underneath, which the Alias merely points at.
   *
   * **What that does not buy is atomicity across the two.** There is no dry run
   * for a completion, so the Space's own refusal of the second is only knowable
   * by making the first — and the two Edits are two commits either way (ADR
   * 0030). What is guaranteed is that neither goes unreported: both answer the
   * sentence they were refused with, the pane stays open holding every draft,
   * and the message says which half stands.
   */
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const settled = group.settle(content, !delegated, draft);
    if (!settled.ok) {
      setDraft(settled.draft);
      return;
    }
    if (occurrence !== undefined) {
      // Submitted whatever the author left there, including values equal to the
      // stored ones: Authoring answers `unchanged`, which is the same nothing,
      // and comparing here would be a second copy of a rule that already exists
      // where the Space is.
      const refusal = occurrence.onEdit({ title: occurrenceTitle, target });
      if (refusal !== null) {
        setOccurrenceRefusal(refusal);
        return;
      }
    }
    const refusal = onComplete(settled.card);
    if (refusal !== null) {
      setContentRefusal(refusal);
      return;
    }
    onCancel();
  };

  return (
    <form className="card-pane__editor" onSubmit={submit}>
      {/* The fields scroll; the actions below them do not. Cancel and Done have
          to stay reachable at any point in a long card, and the frame around
          this clips at a fixed 16/9 whose width is clamped by viewport height —
          so on a short window there is more here than fits. */}
      <div className="card-pane__fields">
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
            <label className="card-pane__field">
              <span>Title</span>
              <input
                className="card-pane__title-input"
                value={occurrenceTitle}
                onChange={(event) => {
                  setOccurrenceTitle(event.currentTarget.value);
                  setOccurrenceRefusal(null);
                }}
              />
            </label>
            <CardPicker
              label="Target"
              cards={occurrence.targets}
              selectedId={target}
              // Frame 4 asks for no focus change, so the pane's ordinary rule
              // holds and the open lands on the Title above this.
              initialFocus={false}
              onSelect={(chosen) => {
                setTarget(chosen);
                setOccurrenceRefusal(null);
              }}
              emptyMessage="This Space holds no other Card that owns its content."
            />
            {occurrenceRefusal !== null && (
              <span role="alert" className="card-pane__field-error">
                {occurrenceRefusal}
              </span>
            )}
          </div>
        )}
        {/* A pending Target does not preview: these fields go on authoring the
            Card the occurrence points at *today*, and their labels go on naming
            it, until Done moves the pointer and closes the pane. */}
        <group.Fields
          card={content}
          titleEditable={!delegated}
          draft={draft}
          onChange={(next) => {
            setDraft(next);
            setContentRefusal(null);
          }}
        />
      </div>
      {/* Outside the scrolling fields, beside the button that produced it: this
          one refuses the whole press, so it must not be somewhere an author has
          to scroll to find out why `Done` did nothing. */}
      {contentRefusal !== null && (
        <span role="alert" className="card-pane__field-error">
          {contentRefusal}
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
 * Escape — is `CardPane`, a Radix Dialog shared with the Alias creation state.
 * What is left here is what the pane is *for*: which Card is being authored, by
 * which fields, and what one `Done` over them means.
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

  return (
    <CardPane
      testId="open-card"
      onDismiss={onCancel}
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
      {/* Keyed by opened occurrence and content owner, because every draft this
          form holds is seeded once and then owned by it. Reusing one would carry
          a previous Card's draft under the next Card's identity, and a draft
          surviving into another Card's fields is committed to that Card on Done.
          Two tests hold the key for that reason.

          Nothing an author does to this pane changes either id any more: the
          Target pends to `Done`, which closes the pane, so a retarget no longer
          remounts the fields underneath it (ADR 0048). Do not answer the next
          remount by relaxing the key — the early commit was the defect. */}
      <CardEditorForm
        key={`${opened.id}:${content.id}`}
        opened={opened}
        content={content}
        delegated={delegated}
        occurrence={occurrence}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    </CardPane>
  );
}
