import type { SpaceAggregateError, SpaceError } from '@project/graph';
import type { SpaceSessionState } from '@project/persistence';
import type { AuthoringRefusal, EdgeEndpoint, StoredSpaceRefusal } from './space-authoring';
import type {
  SpaceThingLifecycleResult,
  SpaceThingTargetUnavailableReason,
} from './space-thing-lifecycle';
import { failureMessage } from './failure-message';

/** Why a coordinated Space Thing lifecycle operation refused (ADR 0076). */
export type SpaceThingRefusal = Extract<SpaceThingLifecycleResult, { kind: 'refused' }>['refusal'];

type PresentedAuthoringRefusal =
  AuthoringRefusal | { readonly code: 'placement-failed'; readonly error: Error };

/**
 * The one sentence for a Diagram the Space no longer holds.
 *
 * Both switches in this module answer that fact — an ordinary Authoring
 * refusal and a coordinated Space Thing one — and a Diagram that has gone means
 * the same thing either way. It is written here rather than in each arm for
 * the reason the Space Thing translation below states for aggregate refusals:
 * the two can reach the author on the same screen, so one of them reading
 * differently would be a difference nothing could explain.
 */
const DIAGRAM_NO_LONGER_IN_SPACE = 'This Diagram is no longer part of the Space.';

/** Application-owned copy for a stable Authoring refusal identity. */
export const describeAuthoringRefusal = (refusal: PresentedAuthoringRefusal): string => {
  switch (refusal.code) {
    case 'placement-failed':
      return `This view could not place its Things: ${refusal.error.message}`;
    case 'placement-pending':
      return 'This view has not finished placing its Things, so there is nowhere to write yet.';
    case 'diagram-not-found':
      return DIAGRAM_NO_LONGER_IN_SPACE;
    case 'diagram-required':
      if (refusal.operation === 'added-thing-to-diagram')
        return 'Select a Diagram to add an existing Thing to it.';
      if (refusal.operation === 'removed-thing-from-diagram')
        return 'Select a Diagram to remove a Thing from it.';
      if (
        refusal.operation === 'renamed-graph' ||
        refusal.operation === 'recolored-graph' ||
        refusal.operation === 'deleted-graph'
      )
        return 'Select a Diagram to manage its Graphs.';
      return 'Select a Diagram to edit its Edges.';
    case 'thing-not-found':
      return 'This Thing is no longer part of the Space.';
    case 'thing-kind-immutable':
      return 'A Thing keeps the kind it was created with.';
    case 'alias-target-immutable':
      return 'An Alias keeps the Target it was created with.';
    case 'space-thing-target-immutable':
      return 'A Space Thing keeps the target Space it was created with.';
    case 'space-thing-deletion-unsupported':
      return 'Deleting this Space Thing requires a coordinated multi-Space Edit, which this control cannot perform.';
    case 'thing-title-required':
      return 'A Thing title is required.';
    case 'diagram-title-required':
      return 'A Diagram title is required.';
    case 'space-title-required':
      return 'A Space title is required.';
    case 'space-must-keep-diagram':
      return 'A Space keeps at least one Diagram.';
    case 'alias-target-not-found':
      return 'That Target is no longer part of the Space.';
    case 'alias-target-must-own-content':
      return 'An Alias must target a Thing that owns its content.';
    case 'thing-already-in-diagram':
      return 'This Thing is already in this Diagram.';
    case 'thing-not-in-diagram':
      return 'This Thing is not in this Diagram.';
    case 'thing-not-expanded':
      return 'Open this Thing before resizing it.';
    case 'thing-has-aliases':
      return `Delete the Aliases of this Thing first: ${refusal.aliasTitles.join(', ')}.`;
    case 'graph-title-required':
      return 'A Graph title is required.';
    case 'diagram-must-keep-graph':
      return 'A Diagram keeps at least one Graph.';
    case 'graph-not-owned':
      return 'That Graph is not one this Diagram owns.';
    case 'edge-not-found':
      return 'That Edge is no longer in this Graph.';
    case 'edge-thing-outside-diagram':
      return 'An Edge can only join Things in this Diagram.';
    case 'edge-already-exists':
      return 'These Things are already connected in this Graph.';
    case 'diagram-active-graph-required':
      return 'This Diagram has no active Graph for the connection to join.';
  }
};

type AuthoringRefusalCode = AuthoringRefusal['code'];

type AuthoringRefusalErrors<Field extends string> = {
  readonly fields: Partial<Readonly<Record<Field, string>>>;
  readonly form?: string;
};

const presentRefusal = <Field extends string>(
  refusal: AuthoringRefusal,
  placements: Readonly<Record<AuthoringRefusalCode, Field | null>>,
): AuthoringRefusalErrors<Field> => {
  const message = describeAuthoringRefusal(refusal);
  const field = placements[refusal.code];
  if (field === null) return { fields: {}, form: message };
  const fields: Partial<Record<Field, string>> = {};
  fields[field] = message;
  return { fields };
};

const form = null;

/** Alias creation owns Title and Target, and nothing else. */
const titleAndTargetPlacements = {
  'placement-pending': form,
  'diagram-not-found': form,
  'diagram-required': form,
  'thing-not-found': form,
  'thing-kind-immutable': form,
  'alias-target-immutable': form,
  'space-thing-target-immutable': form,
  'space-thing-deletion-unsupported': form,
  'thing-title-required': 'title',
  'diagram-title-required': form,
  'space-title-required': form,
  'space-must-keep-diagram': form,
  'alias-target-not-found': 'target',
  'alias-target-must-own-content': 'target',
  'thing-already-in-diagram': form,
  'thing-not-in-diagram': form,
  'thing-not-expanded': form,
  'thing-has-aliases': form,
  'graph-title-required': form,
  'diagram-must-keep-graph': form,
  'graph-not-owned': form,
  'edge-not-found': form,
  'edge-thing-outside-diagram': form,
  'edge-already-exists': form,
  'diagram-active-graph-required': form,
} as const satisfies Readonly<Record<AuthoringRefusalCode, 'title' | 'target' | null>>;

/**
 * Error placement for a creation pane, which owns Title and Target.
 *
 * One type for both kinds of creation. It is `thing-creation.ts`'s refusal
 * type, which is what lets that module hold one state machine rather than one
 * generic over two refusal unions.
 */
export type ThingCreationRefusalErrors = AuthoringRefusalErrors<'title' | 'target'>;

/** Error placement for Alias creation, which owns Title and Target. */
export const presentNewAliasRefusal = (refusal: AuthoringRefusal): ThingCreationRefusalErrors =>
  presentRefusal(refusal, titleAndTargetPlacements);

/**
 * Whether choosing another Thing would answer this refusal.
 *
 * A picker refusal is *correctable* exactly when it is about the choice: the
 * Thing lies outside this Diagram, or the Edge it would produce is one the Graph
 * already holds. Everything else — a placement still resolving, a Diagram or
 * Graph the Space no longer holds, an Edge that has gone — describes the
 * subject rather than the choice, and no row in either list would fix it.
 *
 * Endpoint editing names two Things and cannot correct a stale subject. The
 * record is exhaustive over the codes rather than a list of the two that are
 * true, so a new refusal has to be decided here before it will compile.
 */
const correctableByThingChoice = {
  'placement-pending': false,
  'diagram-not-found': false,
  'diagram-required': false,
  'thing-not-found': false,
  'thing-kind-immutable': false,
  'alias-target-immutable': false,
  'space-thing-target-immutable': false,
  'space-thing-deletion-unsupported': false,
  'thing-title-required': false,
  'diagram-title-required': false,
  'space-title-required': false,
  'space-must-keep-diagram': false,
  'alias-target-not-found': false,
  'alias-target-must-own-content': false,
  'thing-already-in-diagram': false,
  'thing-not-in-diagram': false,
  'thing-not-expanded': false,
  'thing-has-aliases': false,
  'graph-title-required': false,
  'diagram-must-keep-graph': false,
  'graph-not-owned': false,
  'edge-not-found': false,
  'edge-thing-outside-diagram': true,
  'edge-already-exists': true,
  'diagram-active-graph-required': false,
} as const satisfies Readonly<Record<AuthoringRefusalCode, boolean>>;

export type EdgeEndpointRefusalErrors = AuthoringRefusalErrors<EdgeEndpoint>;

/**
 * A refused Delete, which owns a form channel and no field.
 *
 * `form` is required rather than optional, and that is the surface's contract
 * rather than a convenience: Delete offers nothing to correct, so every code
 * reaches the form and the controls always have a sentence to draw.
 */
export interface EdgeDeletionRefusalErrors {
  readonly fields: Readonly<Record<never, string>>;
  readonly form: string;
}

/** The channel a refusal takes when no field on the surface could answer it. */
const formChannel = <Field extends string>(
  refusal: AuthoringRefusal,
): AuthoringRefusalErrors<Field> => ({ fields: {}, form: describeAuthoringRefusal(refusal) });

/**
 * Error placement for endpoint editing, which owns From and To.
 *
 * **Only the endpoint the author attempted is marked invalid.** The other one
 * names a Thing the Edit never questioned, and marking it would ask for a
 * correction to a value nothing refused.
 */
export const presentEdgeEndpointRefusal = (
  refusal: AuthoringRefusal,
  endpoint: EdgeEndpoint,
): EdgeEndpointRefusalErrors =>
  correctableByThingChoice[refusal.code]
    ? { fields: { [endpoint]: describeAuthoringRefusal(refusal) } }
    : formChannel(refusal);

/**
 * Error placement for a refused Delete, which stays on the controls that asked.
 *
 * Total by construction rather than by an exhaustive record: a surface with no
 * field has nowhere else for a code to go, so a second twenty-two-line table
 * saying `form` twenty-two times would be a thing to keep in step and never a
 * thing to decide.
 */
export const presentEdgeDeletionRefusal = (
  refusal: AuthoringRefusal,
): EdgeDeletionRefusalErrors => ({
  fields: {},
  form: describeAuthoringRefusal(refusal),
});

/**
 * What each aggregate refusal means, in the author's terms rather than the
 * repository's.
 *
 * A refusal kind is a stable domain identity (ADR 0057), which is exactly why
 * it is the wrong thing to show: `space-thing-target-missing` names the fact for
 * a caller matching on it, and says nothing to the person who has just been
 * told their work would not save. The identity stays on the wire; only this
 * translation is user-facing.
 *
 * Deliberately without ids. Every one of these carries at least a Space id and
 * some carry three, and a message reciting UUIDs is less legible than one
 * sentence about what is wrong.
 *
 * It lives here rather than beside the persistence dialog that first needed it
 * because a coordinated Edit is refused in two places now — as a rejected
 * commit, and as a Space Thing lifecycle operation that never got to commit at
 * all — and one refusal reading differently in the two would be a difference
 * the author could see and nothing could explain.
 */
const AGGREGATE_REFUSAL_REASONS = {
  'invalid-space-snapshot': 'A space in this edit is not valid.',
  'duplicate-space-id': 'Two spaces in this edit share one identity.',
  'duplicate-thing-id': 'Two spaces in this edit claim the same thing.',
  'meta-space-missing': 'The repository’s Meta Space is missing.',
  'space-thing-target-missing': 'A space thing points at a space that no longer exists.',
  'space-thing-reference-cycle': 'A space thing would make a space contain itself.',
  'ordinary-space-unreferenced': 'A space would be left with nothing pointing at it.',
  'space-thing-diagram-missing': 'A space thing points at a Diagram that no longer exists.',
  'space-thing-graph-missing': 'A space thing points at a Graph that no longer exists.',
  'space-thing-graph-outside-diagram': 'A space thing names a Graph that its Diagram does not own.',
  // `satisfies` rather than an annotation: it still fails the moment a refusal
  // kind is added without a sentence, and it keeps each value's literal type
  // instead of widening the map to an open dictionary.
} satisfies Record<SpaceAggregateError['kind'], string>;

/**
 * One sentence for a refused aggregate, however many errors it carries.
 *
 * Deduplicated because one refusal commonly repeats across several Spaces, and
 * the same sentence three times reads as three problems rather than one.
 */
export const describeAggregateRefusal = (errors: readonly SpaceAggregateError[]): string =>
  [...new Set(errors.map((error) => AGGREGATE_REFUSAL_REASONS[error.kind]))].join(' ');

/**
 * The sentence, without the detail that only some intake errors can supply.
 */
const STORED_SPACE_INVALID = 'The remote space is invalid and was not accepted.';

/**
 * How many references the sentence recites before counting the rest.
 *
 * The alert announces what it contains, so the recital is a handle for a bug
 * report rather than an inventory: three ids identify the failure, and thirty
 * read aloud is the illegibility the aggregate table is written to avoid,
 * arriving by another route.
 */
const STORED_SPACE_REFS_RECITED = 3;

/**
 * What the application can name about one intake error: the id that failed to
 * resolve, the thing file that would not parse, or nothing.
 *
 * Never `error.message`. Intake writes those for a CLI and a log, in
 * `@project/graph`'s vocabulary, and a sentence the application did not write
 * is the thing ADR 0057 exists to keep off the screen. A shape or version
 * error names nothing here because there is nothing in it to name — the
 * document as a whole is what failed.
 *
 * It reads the fields rather than switching on `kind` because the identity is
 * carried by two shapes across fifteen-odd kinds, and a switch would be that
 * list written out to say one of two things. The cost is that the compiler
 * does not hold the sentence above: an arm added with its identity under a
 * third field name returns `null` here and no test fails. The sentence still
 * stands on its own in that case, which is why this is a legibility loss
 * rather than a defect.
 */
const namedInStoredSpace = (error: SpaceError): string | null =>
  'ref' in error ? error.ref : 'path' in error ? error.path : null;

/**
 * Why accepting the stored side of a conflict was refused, in the author's
 * terms.
 *
 * Both sentences say what to do next, because both leave the conflict standing
 * and every control on screen.
 */
export const describeStoredSpaceRefusal = (refusal: StoredSpaceRefusal): string => {
  switch (refusal.code) {
    case 'stored-space-deleted':
      return 'This Space was deleted while the coordinated edit was saving. Keep your local version to restore it.';
    case 'stored-space-invalid': {
      const named = [
        ...new Set(refusal.errors.map(namedInStoredSpace).filter((ref) => ref !== null)),
      ];
      if (named.length === 0) return STORED_SPACE_INVALID;
      const recited = named.slice(0, STORED_SPACE_REFS_RECITED);
      const remaining = named.length - recited.length;
      const more = remaining === 0 ? '' : ` and ${remaining} more`;
      return `${STORED_SPACE_INVALID} Affected: ${recited.join(', ')}${more}.`;
    }
  }
};

/**
 * What accepting the stored side of a conflict would do, which is not one
 * thing.
 *
 * `reload` is the ordinary case: the repository answered with a newer Space.
 * `revert` is a participant the conflict never named — the coordinated edit did
 * not commit, so what is stored for this Space is the baseline it held before
 * the edit, and accepting it discards the edit's effect here. `none` is the
 * Space with no stored snapshot. Accepting the stored side still coordinates
 * recovery across every participant, while keeping local work re-commits this
 * Space as a create.
 *
 * Which of the three a conflict is stays with the surface that reads the two
 * snapshots; only the sentences are here, beside every other sentence the
 * author reads.
 */
export type ConflictRecovery = 'reload' | 'revert' | 'none';

const CONFLICT_DESCRIPTIONS = {
  reload:
    'A newer version of this space is available. Reload discards your local changes; keeping your local version tries to save it again.',
  revert:
    'A related space changed while this coordinated edit was saving. Reload returns this space to how it was before the edit; keeping your local version tries to save it again.',
  none: 'There is no stored version of this space. Keep your local version to restore it.',
} satisfies Record<ConflictRecovery, string>;

/** Application-owned copy for the recovery a conflict offers. */
export const describeConflictRecovery = (recovery: ConflictRecovery): string =>
  CONFLICT_DESCRIPTIONS[recovery];

/**
 * Every persistence failure that reaches the author as a code rather than a
 * structured refusal — the retryable four and the permanent four.
 *
 * Derived from the session state rather than imported as a union, because
 * `CommitResult` is not on `@project/persistence`'s surface and the two states
 * that carry these failures are.
 */
type Persistence = SpaceSessionState['persistence'];
type Rejected = Extract<Persistence, { kind: 'rejected' }>['failure'];
export type PersistenceFailure =
  | Extract<Persistence, { kind: 'failed' }>['failure']
  | Exclude<Rejected, { kind: 'aggregate-refused' }>;

/**
 * What each persistence failure means, in the author's terms rather than the
 * transport's.
 *
 * Every one of these also carries a `message`, and that message is the wire's:
 * `problem.detail` from the server, or a thrown `Error`'s own text. ADR 0057
 * rejected `{ message: string }` by name for exactly this — the code is the
 * identity that crosses the seam and the sentence is the application's, so the
 * message is a diagnostic and never what the author reads.
 *
 * The sentences complement their surfaces rather than repeating them. A
 * retryable failure is drawn under "Changes not saved" beside a Retry button
 * and a rejection under "Changes couldn't be saved", so no entry here restates
 * either.
 */
const PERSISTENCE_FAILURE_REASONS = {
  network: 'Your device could not reach the server.',
  timeout: 'The server did not respond in time.',
  unavailable: 'The server is temporarily unable to store changes.',
  'rate-limited':
    'Changes were sent faster than the server accepts. Wait a moment before retrying.',
  'invalid-commit': 'These changes are not in a form the server can store.',
  forbidden: 'You do not have permission to save this space.',
  // The limit is on the whole change, not one Thing: a Space can exceed it on
  // Thing count with nothing long in it. And the rejection dialog offers only
  // Continue editing, so this names no retry.
  'payload-too-large':
    'This space is larger than the server accepts in one save. Shortening its longest things is what brings it under the limit.',
  protocol: 'The application and the server disagree about how changes are saved.',
  // `satisfies` for the reason the aggregate table above gives: it still fails
  // the moment a code is added without a sentence, without widening the map.
} satisfies Record<PersistenceFailure['code'], string>;

/** Application-owned copy for a stable persistence failure identity. */
export const describePersistenceFailure = (failure: PersistenceFailure): string =>
  PERSISTENCE_FAILURE_REASONS[failure.code];

/**
 * Why the Space a new Space Thing was pointed at could not supply a selection.
 *
 * `not-initialized` is the one that ends in advice, because it is the one a
 * second attempt can answer: the Space is there and readable and the commit
 * that would have given it a Diagram simply did not land. The other two are
 * permanent for that target, so their sentences stop at what happened and leave
 * the Target field beside them to say what to do instead.
 *
 * `satisfies` rather than an annotation, as `AGGREGATE_REFUSAL_REASONS` above:
 * a reason added without a sentence fails here rather than at the call.
 */
const TARGET_UNAVAILABLE_REASONS = {
  missing: 'That Space no longer exists, so nothing was created.',
  unreadable: 'That Space could not be read, so nothing was created.',
  'not-initialized':
    'That Space could not be prepared to be shown here, so nothing was created. Try again.',
} satisfies Record<SpaceThingTargetUnavailableReason, string>;

/** Why a coordinated Space Thing operation refused, in the author's terms. */
export const describeSpaceThingRefusal = (refusal: SpaceThingRefusal): string => {
  switch (refusal.code) {
    case 'diagram-not-found':
      return DIAGRAM_NO_LONGER_IN_SPACE;
    case 'space-thing-not-found':
      return 'This Space Thing is no longer part of the Space.';
    case 'persistence-recovery-required':
      return refusal.recovery === 'retry'
        ? 'A Space in this edit has not saved. Retry that save first.'
        : 'A Space in this edit has a conflict. Resolve it first.';
    case 'aggregate-refused':
      return describeAggregateRefusal(refusal.errors);
    case 'persistence-read-failed':
      return 'The stored Spaces could not be read, so this edit was not attempted.';
    case 'space-thing-target-unavailable':
      return TARGET_UNAVAILABLE_REASONS[refusal.reason];
  }
};

/** The refusals the Target field answers — see {@link presentNewSpaceThingRefusal}. */
const TARGET_FIELD_REFUSALS: ReadonlySet<SpaceThingRefusal['code']> = new Set([
  'aggregate-refused',
  'space-thing-target-unavailable',
]);

/**
 * Error placement for Space Thing creation, which owns Title and Target.
 *
 * Two codes reach the Target field, and they are the two that have to: a cycle,
 * a target that has gone and a Diagram the target no longer holds are all
 * answered by choosing a different Space, and so is a target that could not be
 * prepared to be shown. The rest describe the containing Space or the
 * repository, which no row in that list would fix.
 */
export const presentNewSpaceThingRefusal = (
  refusal: SpaceThingRefusal,
): ThingCreationRefusalErrors =>
  TARGET_FIELD_REFUSALS.has(refusal.code)
    ? { fields: { target: describeSpaceThingRefusal(refusal) } }
    : { fields: {}, form: describeSpaceThingRefusal(refusal) };

/**
 * What a rejected creation says, on the channel a refusal with no field takes.
 *
 * A rejection is not a refusal: the lifecycle refuses for everything it can
 * name, so reaching here means an invariant broke and there is no field to
 * correct. The sentence is written from what threw rather than from a refusal
 * code invented to carry it, because a refusal code is a stable domain identity
 * (ADR 0057) and this is not one. It lives here rather than on the pane so that
 * `authoring-refusal.ts` remains the only place a creation's prose is written.
 *
 * The rejection is `unknown` because a `throw` can carry anything, and that is
 * the caught-error boundary the parsing rules exempt — named here rather than
 * written at the parameter, the way `ObserverErrorReporter` names its own.
 * What it says is `failureMessage`'s; what it means is written here.
 */
export type ThingCreationBreak = (failure: unknown) => ThingCreationRefusalErrors;

/** @see ThingCreationBreak */
export const presentThingCreationBreak: ThingCreationBreak = (failure) => ({
  fields: {},
  form: `This Thing was not created: ${failureMessage(failure)}`,
});

/**
 * What a rejected Space Thing placement says, where a refusal would have been.
 *
 * The Things list places a Space by spending a coordinated Edit across Spaces,
 * and neither the Diagram it resolves first nor the transport under it is a
 * refusal channel: both *reject*. A rejection is not a refusal for the reason
 * `presentThingCreationBreak` gives — the lifecycle refuses for everything it
 * can name, so reaching here means an invariant broke — but the reader pressed
 * a row and is owed a sentence either way, and the list draws one string rather
 * than the pane's fielded errors.
 *
 * Here rather than on the surface, because a Space Thing's prose is written in
 * this module or nowhere. The rejection is `unknown` for `ThingCreationBreak`'s
 * reason and named the same way — at the type rather than at a parameter, which
 * is what lets a rejection arm take it without writing the annotation the
 * parsing rules reserve for an I/O boundary.
 */
export type SpaceThingBreak = (failure: unknown) => string;

/** @see SpaceThingBreak */
export const describeSpaceThingBreak: SpaceThingBreak = (failure) =>
  `This Space Thing was not added: ${failureMessage(failure)}`;

/**
 * What a choices read that threw says, rather than what a creation says.
 *
 * A read that failed attempted no Edit, so `presentThingCreationBreak`'s
 * sentence would be false on this path. Both stay here for the reason the one
 * above gives: a creation's prose is written in this module or nowhere.
 */
export const presentThingChoicesBreak: ThingCreationBreak = (failure) => ({
  fields: {},
  form: `The choices for this Thing could not be read: ${failureMessage(failure)}`,
});
