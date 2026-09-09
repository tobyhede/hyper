import type { SpaceAggregateError, SpaceError } from '@project/graph';
import type { SpaceSessionState } from '@project/persistence';
import type { AuthoringRefusal, EdgeEndpoint, StoredSpaceRefusal } from './space-authoring';
import type { SpaceCardLifecycleResult } from './space-card-lifecycle';
import { failureMessage } from './failure-message';

/** Why a coordinated Space Card lifecycle operation refused (ADR 0076). */
export type SpaceCardRefusal = Extract<SpaceCardLifecycleResult, { kind: 'refused' }>['refusal'];

type PresentedAuthoringRefusal =
  AuthoringRefusal | { readonly code: 'placement-failed'; readonly error: Error };

/**
 * The one sentence for a Layout the Space no longer holds.
 *
 * Both switches in this module answer that fact — an ordinary Authoring
 * refusal and a coordinated Space Card one — and a Layout that has gone means
 * the same thing either way. It is written here rather than in each arm for
 * the reason the Space Card translation below states for aggregate refusals:
 * the two can reach the author on the same screen, so one of them reading
 * differently would be a difference nothing could explain.
 */
const LAYOUT_NO_LONGER_IN_SPACE = 'This Layout is no longer part of the Space.';

/** Application-owned copy for a stable Authoring refusal identity. */
export const describeAuthoringRefusal = (refusal: PresentedAuthoringRefusal): string => {
  switch (refusal.code) {
    case 'placement-failed':
      return `This view could not place its Cards: ${refusal.error.message}`;
    case 'placement-pending':
      return 'This view has not finished placing its Cards, so there is nowhere to write yet.';
    case 'layout-not-found':
      return LAYOUT_NO_LONGER_IN_SPACE;
    case 'layout-required':
      if (refusal.operation === 'added-card-to-layout')
        return 'Select a Layout to add an existing Card to it.';
      if (refusal.operation === 'removed-card-from-layout')
        return 'Select a Layout to remove a Card from it.';
      if (
        refusal.operation === 'renamed-graph' ||
        refusal.operation === 'recolored-graph' ||
        refusal.operation === 'deleted-graph'
      )
        return 'Select a Layout to manage its Graphs.';
      return 'Select a Layout to edit its Edges.';
    case 'card-not-found':
      return 'This Card is no longer part of the Space.';
    case 'card-kind-immutable':
      return 'A Card keeps the kind it was created with.';
    case 'alias-target-immutable':
      return 'An Alias keeps the Target it was created with.';
    case 'space-card-target-immutable':
      return 'A Space Card keeps the target Space it was created with.';
    case 'space-card-deletion-unsupported':
      return 'Deleting this Space Card requires a coordinated multi-Space Edit, which this control cannot perform.';
    case 'card-title-required':
      return 'A Card title is required.';
    case 'layout-title-required':
      return 'A Layout title is required.';
    case 'space-must-keep-layout':
      return 'A Space keeps at least one Layout.';
    case 'alias-target-not-found':
      return 'That Target is no longer part of the Space.';
    case 'alias-target-must-own-content':
      return 'An Alias must target a Card that owns its content.';
    case 'card-already-in-layout':
      return 'This Card is already in this Layout.';
    case 'card-not-in-layout':
      return 'This Card is not in this Layout.';
    case 'card-not-expanded':
      return 'Open this Card before resizing it.';
    case 'card-has-aliases':
      return `Delete the Aliases of this Card first: ${refusal.aliasTitles.join(', ')}.`;
    case 'graph-title-required':
      return 'A Graph title is required.';
    case 'layout-must-keep-graph':
      return 'A Layout keeps at least one Graph.';
    case 'graph-not-owned':
      return 'That Graph is not one this Layout owns.';
    case 'edge-not-found':
      return 'That Edge is no longer in this Graph.';
    case 'edge-card-outside-layout':
      return 'An Edge can only join Cards in this Layout.';
    case 'edge-already-exists':
      return 'These Cards are already connected in this Graph.';
    case 'layout-active-graph-required':
      return 'This Layout has no active Graph for the connection to join.';
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
  'layout-not-found': form,
  'layout-required': form,
  'card-not-found': form,
  'card-kind-immutable': form,
  'alias-target-immutable': form,
  'space-card-target-immutable': form,
  'space-card-deletion-unsupported': form,
  'card-title-required': 'title',
  'layout-title-required': form,
  'space-must-keep-layout': form,
  'alias-target-not-found': 'target',
  'alias-target-must-own-content': 'target',
  'card-already-in-layout': form,
  'card-not-in-layout': form,
  'card-not-expanded': form,
  'card-has-aliases': form,
  'graph-title-required': form,
  'layout-must-keep-graph': form,
  'graph-not-owned': form,
  'edge-not-found': form,
  'edge-card-outside-layout': form,
  'edge-already-exists': form,
  'layout-active-graph-required': form,
} as const satisfies Readonly<Record<AuthoringRefusalCode, 'title' | 'target' | null>>;

/**
 * Error placement for a creation pane, which owns Title and Target.
 *
 * One type for both kinds of creation. It is `card-creation.ts`'s refusal
 * type, which is what lets that module hold one state machine rather than one
 * generic over two refusal unions.
 */
export type CardCreationRefusalErrors = AuthoringRefusalErrors<'title' | 'target'>;

/** Error placement for Alias creation, which owns Title and Target. */
export const presentNewAliasRefusal = (refusal: AuthoringRefusal): CardCreationRefusalErrors =>
  presentRefusal(refusal, titleAndTargetPlacements);

/**
 * Whether choosing another Card would answer this refusal.
 *
 * A picker refusal is *correctable* exactly when it is about the choice: the
 * Card lies outside this Layout, or the Edge it would produce is one the Graph
 * already holds. Everything else — a placement still resolving, a Layout or
 * Graph the Space no longer holds, an Edge that has gone — describes the
 * subject rather than the choice, and no row in either list would fix it.
 *
 * Endpoint editing names two Cards and cannot correct a stale subject. The
 * record is exhaustive over the codes rather than a list of the two that are
 * true, so a new refusal has to be decided here before it will compile.
 */
const correctableByCardChoice = {
  'placement-pending': false,
  'layout-not-found': false,
  'layout-required': false,
  'card-not-found': false,
  'card-kind-immutable': false,
  'alias-target-immutable': false,
  'space-card-target-immutable': false,
  'space-card-deletion-unsupported': false,
  'card-title-required': false,
  'layout-title-required': false,
  'space-must-keep-layout': false,
  'alias-target-not-found': false,
  'alias-target-must-own-content': false,
  'card-already-in-layout': false,
  'card-not-in-layout': false,
  'card-not-expanded': false,
  'card-has-aliases': false,
  'graph-title-required': false,
  'layout-must-keep-graph': false,
  'graph-not-owned': false,
  'edge-not-found': false,
  'edge-card-outside-layout': true,
  'edge-already-exists': true,
  'layout-active-graph-required': false,
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
 * names a Card the Edit never questioned, and marking it would ask for a
 * correction to a value nothing refused.
 */
export const presentEdgeEndpointRefusal = (
  refusal: AuthoringRefusal,
  endpoint: EdgeEndpoint,
): EdgeEndpointRefusalErrors =>
  correctableByCardChoice[refusal.code]
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
 * it is the wrong thing to show: `space-card-target-missing` names the fact for
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
 * commit, and as a Space Card lifecycle operation that never got to commit at
 * all — and one refusal reading differently in the two would be a difference
 * the author could see and nothing could explain.
 */
const AGGREGATE_REFUSAL_REASONS = {
  'invalid-space-snapshot': 'A space in this edit is not valid.',
  'duplicate-space-id': 'Two spaces in this edit share one identity.',
  'duplicate-card-id': 'Two spaces in this edit claim the same card.',
  'meta-space-missing': 'The repository’s Meta Space is missing.',
  'space-card-target-missing': 'A space card points at a space that no longer exists.',
  'space-card-reference-cycle': 'A space card would make a space contain itself.',
  'ordinary-space-unreferenced': 'A space would be left with nothing pointing at it.',
  'space-card-layout-missing': 'A space card points at a Layout that no longer exists.',
  'space-card-graph-missing': 'A space card points at a Graph that no longer exists.',
  'space-card-graph-outside-layout': 'A space card names a Graph that its Layout does not own.',
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
 * resolve, the card file that would not parse, or nothing.
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
 * structured refusal — the retryable four and the permanent three.
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
  'payload-too-large': 'These changes are too large to save. Shorten a long card and try again.',
  protocol: 'The application and the server disagree about how changes are saved.',
  // `satisfies` for the reason the aggregate table above gives: it still fails
  // the moment a code is added without a sentence, without widening the map.
} satisfies Record<PersistenceFailure['code'], string>;

/** Application-owned copy for a stable persistence failure identity. */
export const describePersistenceFailure = (failure: PersistenceFailure): string =>
  PERSISTENCE_FAILURE_REASONS[failure.code];

/** Why a coordinated Space Card operation refused, in the author's terms. */
export const describeSpaceCardRefusal = (refusal: SpaceCardRefusal): string => {
  switch (refusal.code) {
    case 'layout-not-found':
      return LAYOUT_NO_LONGER_IN_SPACE;
    case 'space-card-not-found':
      return 'This Space Card is no longer part of the Space.';
    case 'persistence-recovery-required':
      return refusal.recovery === 'retry'
        ? 'A Space in this edit has not saved. Retry that save first.'
        : 'A Space in this edit has a conflict. Resolve it first.';
    case 'aggregate-refused':
      return describeAggregateRefusal(refusal.errors);
    case 'persistence-read-failed':
      return 'The stored Spaces could not be read, so this edit was not attempted.';
  }
};

/**
 * Error placement for Space Card creation, which owns Title and Target.
 *
 * Only `aggregate-refused` reaches the Target field, and it is the one that
 * has to: a cycle, a target that has gone and a Layout the target no
 * longer holds are all answered by choosing a different Space. The rest
 * describe the containing Space or the repository, which no row in that list
 * would fix.
 */
export const presentNewSpaceCardRefusal = (refusal: SpaceCardRefusal): CardCreationRefusalErrors =>
  refusal.code === 'aggregate-refused'
    ? { fields: { target: describeSpaceCardRefusal(refusal) } }
    : { fields: {}, form: describeSpaceCardRefusal(refusal) };

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
export type CardCreationBreak = (failure: unknown) => CardCreationRefusalErrors;

/** @see CardCreationBreak */
export const presentCardCreationBreak: CardCreationBreak = (failure) => ({
  fields: {},
  form: `This Card was not created: ${failureMessage(failure)}`,
});

/**
 * What a choices read that threw says, rather than what a creation says.
 *
 * A read that failed attempted no Edit, so `presentCardCreationBreak`'s
 * sentence would be false on this path. Both stay here for the reason the one
 * above gives: a creation's prose is written in this module or nowhere.
 */
export const presentCardChoicesBreak: CardCreationBreak = (failure) => ({
  fields: {},
  form: `The choices for this Card could not be read: ${failureMessage(failure)}`,
});
