import { useState } from 'react';
import { uuidSchema, type UUID } from '@project/core';
import type { SpaceSummary } from '@project/persistence';
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@project/ui';
import { CardPane } from './CardPane';
import { paneInitialFocus } from './pane-focus';
import { presentNewSpaceCardRefusal, type SpaceCardRefusal } from '../authoring-refusal';

/**
 * The one value that is not a Space id: create a Space rather than reference
 * one.
 *
 * A sentinel in the list rather than a mode switch beside it, because both
 * choices produce the same Card and differ only in whether the Space it names
 * already exists (ADR 0068). A radio pair above the list would have said there
 * were two kinds of Space Card.
 */
const NEW_SPACE = 'new';

/** Escape and the backdrop while an Edit runs, which is the one time they do nothing. */
const NOTHING_TO_DISMISS = (): void => undefined;

/**
 * The Spaces this Card may reference, and why there may be none to offer.
 *
 * A list rather than an array, because an empty array cannot say which of three
 * things it means. The read happens when the pane opens, so "nothing to offer"
 * is a repository with no other Space, a read still in flight, or a read that
 * failed — and the first is the only one in which the author has seen what is
 * stored. Creating a Space against either of the other two makes a duplicate of
 * a Space they meant to reference, and a Space Card is never retargeted
 * (ADR 0068), so the mistake is not one the pane can offer to undo afterwards.
 *
 * `pending` and `unreadable` are held apart rather than folded into one
 * "unavailable", because they are said differently: a wait is an ordinary wait
 * and reporting it as a failure would cry wolf on every opening, while a failed
 * read is the caller's refusal and keeps the sentence the coordination uses.
 */
export type SpaceCardTargetListing =
  | { readonly kind: 'pending' }
  | { readonly kind: 'read'; readonly spaces: readonly SpaceSummary[] }
  | { readonly kind: 'unreadable' };

/**
 * Why the last attempt produced no Card, or nothing yet has been attempted.
 *
 * Two arms rather than one message, because only one of them is an answer. A
 * refusal is composed by the coordination and knows a cycle from an unreadable
 * repository, so `presentNewSpaceCardRefusal` can put it beside the Target that
 * corrects it. A break is not an answer: the lifecycle refuses for everything it
 * can name, so a rejection means an invariant it does not name has gone and
 * there is nothing to correct — only what threw, said as it was thrown.
 * Deliberately not translated into a refusal code, because a refusal code is a
 * stable domain identity (ADR 0057) and nothing here answers to one; this is
 * the reasoning `DeleteCardControl` follows for the same class of failure.
 *
 * One value rather than two nullable props so the two cannot both stand: one
 * press of Create has one outcome, and a pane carrying a refusal beside a break
 * would say a single attempt had failed twice.
 */
export type SpaceCardAttemptFailure =
  | { readonly kind: 'refused'; readonly refusal: SpaceCardRefusal }
  | { readonly kind: 'broke'; readonly message: string };

export interface NewSpaceCardProps {
  /**
   * Every Space this Card may reference — the containing Space is already
   * withheld — and, until the read answers, the fact that there is not yet a
   * list to choose from.
   */
  readonly targets: SpaceCardTargetListing;
  /** Why the last attempt produced no Card, or `null`. */
  readonly failure: SpaceCardAttemptFailure | null;
  /** Whether a coordinated Edit from this pane is still in flight. */
  readonly busy: boolean;
  /**
   * Create the Space Card, against a Space that exists or a Space this creates.
   *
   * `null` is the create case rather than an absent argument, so the two
   * outcomes of one control stay one parameter and a caller cannot forget the
   * second.
   */
  readonly onCreate: (targetSpaceId: UUID | null, title: string) => void;
  readonly onCancel: () => void;
  /**
   * The failure above describes an attempt, and editing either field begins a
   * different one — so the message stops describing anything on screen and is
   * withdrawn. Announced rather than cleared here because the failure is the
   * caller's state: this pane knows *when* it went stale and never what it said.
   */
  readonly onFailureStale: () => void;
}

/**
 * Adding a Space Card: the Card editor, opened on a Card that does not exist yet.
 *
 * **One typed title seeds two things** — this Card and the Space it references
 * — and from the moment they exist both are renamed independently. That is why
 * the title leads the pane and why there is no second field for the Space's
 * name: asking twice would suggest they were separate decisions at creation,
 * which they are not. The new Space's first Markdown Card is *not* one of them:
 * it takes the neutral `Card 1` the one Space initializer mints, because a
 * Card titled after the Space it lives in only reads as deliberate until the
 * first rename makes the pair disagree.
 *
 * Unlike Alias creation, choosing the target is *not* the completion. An Alias
 * without a Target is not a valid Card, so the choice is the last thing missing;
 * a Space Card always has a valid target available — a new Space — so what is
 * missing until the author says so is the title. Hence a Create button, and
 * hence it stays disabled while the title is blank.
 *
 * It stays disabled for a second reason too: until the target list has actually
 * been read. "A new Space" is on offer from the first frame and is a complete
 * answer on its own, so without that the author can title the Card and create a
 * Space before the list has said the Space they wanted is already stored — the
 * duplicate the failure message exists to prevent, made against a list that had
 * simply not landed yet.
 *
 * The kind is fixed from the outset. This is not a Markdown Card that will later
 * become a Space Card — a Card keeps the kind it was created with — so the pane
 * says which kind it is creating rather than offering a control that changes it.
 * Neither is the *target*: a Space Card is never retargeted (ADR 0068), so this
 * is the only surface in the application on which that choice is made.
 *
 * Escape closes it, creating nothing, and no key handler here says so: the
 * Dialog dismisses on Escape and that *is* Cancel's meaning on this pane
 * (ADR 0048). While a coordinated Edit is in flight it closes nothing, for the
 * reason Cancel is disabled: the Edit would complete against a pane the author
 * was told had abandoned it.
 */
export function NewSpaceCard({
  targets,
  failure,
  busy,
  onCreate,
  onCancel,
  onFailureStale,
}: NewSpaceCardProps) {
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState<string>(NEW_SPACE);
  const errors = failure?.kind === 'refused' ? presentNewSpaceCardRefusal(failure.refusal) : null;
  const titleError = errors?.fields.title ?? null;
  const targetError = errors?.fields.target ?? null;
  // What a break says is this pane's sentence rather than the caller's: the
  // caller has an exception and knows nothing about the Card that was not
  // created, and a bare `Error` message standing alone in the form channel
  // reads as debris beside the whole sentences the refusals put there.
  const formError =
    failure?.kind === 'broke'
      ? `This Space Card was not created: ${failure.message}`
      : (errors?.form ?? null);
  const named = title.trim().length > 0;
  const spaces = targets.kind === 'read' ? targets.spaces : [];
  // A read list and nothing else. An empty one is an answer — this is the only
  // Space stored — and the two states that are not answers withhold the
  // completion instead of letting it be made against a list of one row.
  const choosable = targets.kind === 'read';
  const chosen = spaces.find((space) => space.id === target);

  const create = (): void => {
    // Re-stated rather than left to the disabled button, because the guard is
    // the rule and the button is only how it is shown.
    if (!named || busy || !choosable) return;
    if (target === NEW_SPACE) {
      onCreate(null, title.trim());
      return;
    }
    // Parsed rather than asserted: the value came back out of a `Select`, whose
    // vocabulary is strings, and this is the boundary that turns one back into
    // an identity (ADR 0062).
    const parsed = uuidSchema.safeParse(target);
    if (parsed.success) onCreate(parsed.data, title.trim());
  };

  return (
    <CardPane
      ariaLabel="New Space Card"
      testId="new-space-card"
      onDismiss={busy ? NOTHING_TO_DISMISS : onCancel}
      busy={busy}
    >
      {/* One `onChange` for both fields rather than two handlers, because React
          bubbles change through its own tree. Editing either field is the same
          fact — the refused attempt is over. */}
      <div className="card-pane__editor" onChange={failure === null ? undefined : onFailureStale}>
        <FieldGroup className="card-pane__fields">
          {/* The kind is stated rather than offered, because a Card keeps the
              kind it was created with. */}
          <Field className="card-pane__heading">
            <FieldTitle>New Space Card</FieldTitle>
            <FieldDescription>
              A Space Card shows another Space, through the Layout and Graph it selects.
            </FieldDescription>
          </Field>
          <Field className="card-pane__field" data-invalid={titleError !== null}>
            <FieldLabel htmlFor="new-space-card-title">Title</FieldLabel>
            <Input
              id="new-space-card-title"
              data-testid="new-space-card-title"
              value={title}
              aria-invalid={titleError !== null}
              aria-describedby={titleError === null ? undefined : 'new-space-card-title-error'}
              {...paneInitialFocus(true)}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
            <FieldError id="new-space-card-title-error">{titleError}</FieldError>
          </Field>
          <Field className="card-pane__field" data-invalid={targetError !== null}>
            <FieldLabel htmlFor="new-space-card-target">Space</FieldLabel>
            <Select
              value={target}
              onValueChange={(value: string | null) => {
                // Base UI spells a controlled empty selection as `null`, and
                // this list has no clear action — there is always a Space
                // selected, because creating one is itself a row.
                if (value === null) return;
                setTarget(value);
                if (failure !== null) onFailureStale();
              }}
            >
              <SelectTrigger
                id="new-space-card-target"
                data-testid="new-space-card-target"
                className="w-full"
                aria-invalid={targetError !== null}
                aria-describedby={targetError === null ? undefined : 'new-space-card-target-error'}
              >
                <SelectValue>{chosen === undefined ? 'A new Space' : chosen.title}</SelectValue>
              </SelectTrigger>
              {/* `nokey` because the popup is portalled out of this pane and
                  React Flow subscribes its delete key on `document`
                  (docs/agents/ui.md). */}
              <SelectContent className="nokey" data-testid="new-space-card-target-options">
                <SelectItem value={NEW_SPACE}>A new Space</SelectItem>
                {spaces.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Said on the field the wait is about, and as a description rather
                than an error: the read has not failed, it has not answered yet,
                and the pane would otherwise show a one-row list with nothing
                saying it is still growing. The failed read is not repeated here
                — it is the caller's refusal and already stands in the form
                channel below, worded as the coordination words it. */}
            {targets.kind === 'pending' && (
              <FieldDescription>Reading the stored Spaces…</FieldDescription>
            )}
            <FieldError id="new-space-card-target-error">{targetError}</FieldError>
          </Field>
          {failure === null && (
            <FieldDescription className="card-pane__hint">
              A new Space begins with one Markdown Card. Referencing an existing Space adds a second
              way to reach it, and never a copy.
            </FieldDescription>
          )}
        </FieldGroup>
        {formError !== null && (
          <FieldError className="card-pane__field-error">{formError}</FieldError>
        )}
        <div className="card-pane__actions">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="new-space-card-create"
            onClick={create}
            disabled={!named || busy || !choosable}
          >
            Create
          </Button>
        </div>
      </div>
    </CardPane>
  );
}
