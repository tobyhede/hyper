import type { SpaceAggregateError, SpaceError } from '@project/graph';
import type { SaveBlock, SpaceSessionState } from '@project/persistence';
import type { ConnectionResult } from './connection-completion';
import type { AuthoringRefusal, StoredSpaceRefusal } from './space-authoring';
import type {
  SpaceResourceRefusal,
  SpaceResourceTargetUnavailableReason,
} from './space-resource-lifecycle';
import { failureMessage } from './failure-message';

/**
 * Why a coordinated Space Resource lifecycle operation refused (ADR 0076).
 *
 * Named by the lifecycle now rather than extracted from one of its results: the
 * three operations no longer share a result type, and a union reachable through
 * `create` alone would be a second reading of a refusal `delete` can also make.
 */
export type { SpaceResourceRefusal };

type PresentedAuthoringRefusal =
  AuthoringRefusal | { readonly code: 'placement-failed'; readonly error: Error };

/**
 * The one sentence for a Map the Space no longer holds.
 *
 * Both switches in this module answer that fact — an ordinary Authoring
 * refusal and a coordinated Space Resource one — and a Map that has gone means
 * the same message either way. It is written here rather than in each arm for
 * the reason the Space Resource translation below states for aggregate refusals:
 * the two can reach the author on the same screen, so one of them reading
 * differently would be a difference nothing could explain.
 */
const MAP_NO_LONGER_IN_SPACE = 'This Map is no longer part of the Space.';

/** Application-owned copy for a stable Authoring refusal identity. */
export const describeAuthoringRefusal = (refusal: PresentedAuthoringRefusal): string => {
  switch (refusal.code) {
    case 'placement-failed':
      return `This view could not place its Resources: ${refusal.error.message}`;
    case 'map-not-found':
      return MAP_NO_LONGER_IN_SPACE;
    case 'map-required':
      if (refusal.operation === 'added-resource-to-map')
        return 'Select a Map to add an existing Resource to it.';
      if (refusal.operation === 'removed-resource-from-map')
        return 'Select a Map to remove a Resource from it.';
      if (
        refusal.operation === 'renamed-graph' ||
        refusal.operation === 'recolored-graph' ||
        refusal.operation === 'deleted-graph'
      )
        return 'Select a Map to manage its Graphs.';
      return 'Select a Map to edit its Edges.';
    case 'resource-not-found':
      return 'This Resource is no longer part of the Space.';
    case 'resource-kind-immutable':
      return 'A Resource keeps the kind it was created with.';
    case 'reference-target-immutable':
      return 'A Reference Resource keeps the Target it was created with.';
    case 'space-resource-target-immutable':
      return 'A Space Resource keeps the target Space it was created with.';
    case 'space-resource-deletion-unsupported':
      return 'Deleting this Space Resource requires a coordinated multi-Space Edit, which this control cannot perform.';
    case 'resource-title-required':
      return 'A Resource title is required.';
    case 'map-title-required':
      return 'A Map title is required.';
    case 'space-title-required':
      return 'A Space title is required.';
    case 'space-must-keep-map':
      return 'A Space keeps at least one Map.';
    case 'reference-target-not-found':
      return 'That Target is no longer part of the Space.';
    case 'reference-target-must-own-content':
      return 'A Reference Resource cannot target another Reference Resource.';
    case 'resource-already-in-map':
      return 'This Resource is already in this Map.';
    case 'resource-not-in-map':
      return 'This Resource is not in this Map.';
    case 'resource-not-expanded':
      return 'Open this Resource before resizing it.';
    case 'resource-has-references':
      return `Delete the Reference Resources of this Resource first: ${refusal.referenceTitles.join(', ')}.`;
    case 'graph-title-required':
      return 'A Graph title is required.';
    case 'map-must-keep-graph':
      return 'A Map keeps at least one Graph.';
    case 'graph-not-owned':
      return 'That Graph is not one this Map owns.';
    case 'edge-not-found':
      return 'That Edge is no longer in this Graph.';
    case 'edge-resource-outside-map':
      return 'An Edge can only join Resources in this Map.';
    case 'edge-already-exists':
      return 'These Resources are already connected in this Graph.';
    case 'map-active-graph-required':
      return 'This Map has no active Graph for the connection to join.';
    case 'edge-title-one-line':
      return 'An Edge title must be one line.';
    case 'edge-title-required':
      return 'Give this Edge a title before hiding it.';
  }
};

/**
 * What each aggregate refusal means, in the author's terms rather than the
 * repository's.
 *
 * A refusal kind is a stable domain identity (ADR 0057), which is exactly why
 * it is the wrong resource to show: `space-resource-target-missing` names the fact for
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
 * commit, and as a Space Resource lifecycle operation that never got to commit at
 * all — and one refusal reading differently in the two would be a difference
 * the author could see and nothing could explain.
 */
const AGGREGATE_REFUSAL_REASONS = {
  'invalid-space-snapshot': 'A space in this edit is not valid.',
  'duplicate-space-id': 'Two spaces in this edit share one identity.',
  'duplicate-resource-id': 'Two spaces in this edit claim the same resource.',
  'meta-space-missing': 'The repository’s Meta Space is missing.',
  'space-resource-target-missing': 'A space resource points at a space that no longer exists.',
  'space-resource-reference-cycle': 'A space resource would make a space contain itself.',
  'ordinary-space-unreferenced': 'A space would be left with nothing pointing at it.',
  'space-resource-map-missing': 'A space resource points at a Map that no longer exists.',
  'space-resource-graph-missing': 'A space resource points at a Graph that no longer exists.',
  'space-resource-graph-outside-map': 'A space resource names a Graph that its Map does not own.',
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
 * What the Connect list says after a choice, or `null` once the Edge is drawn.
 * The list closes on `null`, so `unavailable` must answer a sentence.
 */
export const describeConnectChoice = (result: ConnectionResult): string | null => {
  switch (result.kind) {
    case 'completed':
      return null;
    case 'refused':
      return describeAuthoringRefusal(result.refusal);
    case 'unavailable':
      return 'The canvas is not ready to draw an Edge yet. Try again in a moment.';
  }
};

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
 * resolve, the resource file that would not parse, or nothing.
 *
 * Never `error.message`. Intake writes those for a CLI and a log, in
 * `@project/graph`'s vocabulary, and a sentence the application did not write
 * is the outcome ADR 0057 exists to keep off the screen. A shape or version
 * error names nothing here because there is nothing in it to name — the
 * document as a whole is what failed.
 *
 * It reads the fields rather than switching on `kind` because the identity is
 * carried by two shapes across fifteen-odd kinds, and a switch would be that
 * list written out to carry one of two meanings. The cost is that the compiler
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
 * resource.
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
    'A newer version of this space is available. Reload discards your local changes, including unsaved text you have typed into an open Resource. Keep local and retry preserves that editing and tries to save it again.',
  revert:
    'A related space changed while this coordinated edit was saving. Reload returns this space to how it was before the edit and discards unsaved text typed into an open Resource. Keep local and retry preserves that editing and tries to save it again.',
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
 * that carry these failures are. An aggregate refusal is excluded by
 * construction now rather than by `Exclude`: `rejected`'s `failure` no longer
 * carries it, `refused` does (`v1-release/17`), and `describeAggregateRefusal`
 * is that state's own translation.
 */
type Persistence = SpaceSessionState['persistence'];
export type PersistenceFailure =
  | Extract<Persistence, { kind: 'failed' }>['failure']
  | Extract<Persistence, { kind: 'rejected' }>['failure'];

/**
 * What each persistence failure means, in the author's terms rather than the
 * transport's.
 *
 * None of these carries prose of the transport's: ADR 0057 rejected
 * `{ message: string }` by name — the code is the identity that crosses the
 * seam and the sentence is the application's. A `protocol` failure's `fault`
 * is typed context for a diagnostic and never what the author reads, so every
 * fault reads the one `protocol` sentence.
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
  // The limit is on the whole request, which for a coordinated save carries
  // every participating Space, so this promises nothing per Space or Resource.
  // It is drawn beside Retry, so it says what to do before retrying.
  'payload-too-large':
    'This save is larger than the server accepts in one request, counting every space it includes. Shorten or remove content, then retry.',
  protocol: 'The application and the server disagree about how changes are saved.',
  // `satisfies` for the reason the aggregate table above gives: it still fails
  // the moment a code is added without a sentence, without widening the map.
} satisfies Record<PersistenceFailure['code'], string>;

/** Application-owned copy for a stable persistence failure identity. */
export const describePersistenceFailure = (failure: PersistenceFailure): string =>
  PERSISTENCE_FAILURE_REASONS[failure.code];

/**
 * Why the save that would recover these changes never reached the server.
 *
 * Drawn under "Changes not saved" beside Retry, so each sentence says what
 * stands in the way and where it is resolved, and leaves the retry to the
 * button. A blocking Space is named because the author has to go there.
 */
export const describeSaveBlock = (block: SaveBlock): string => {
  if (block.code === 'persistence-read-failed') {
    return 'The stored Spaces could not be read, so these changes were not sent.';
  }
  return block.recovery === 'resolve-conflict'
    ? `${block.title} has a conflict to resolve before these changes can be saved. Resolve it there, then retry here.`
    : `${block.title} has a failed save to retry before these changes can be saved. Retry it there, then retry here.`;
};

/**
 * Why the Space a new Space Resource was pointed at could not supply a selection.
 *
 * `not-initialized` is the one that ends in advice, because it is the one a
 * second attempt can answer: the Space is there and readable and the commit
 * that would have given it a Map simply did not land. The other two are
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
} satisfies Record<SpaceResourceTargetUnavailableReason, string>;

/** Why a coordinated Space Resource operation refused, in the author's terms. */
export const describeSpaceResourceRefusal = (refusal: SpaceResourceRefusal): string => {
  switch (refusal.code) {
    case 'map-not-found':
      return MAP_NO_LONGER_IN_SPACE;
    case 'space-resource-not-found':
      return 'This Space Resource is no longer part of the Space.';
    case 'persistence-recovery-required':
      return refusal.recovery === 'retry'
        ? 'A Space in this edit has not saved. Retry that save first.'
        : 'A Space in this edit has a conflict. Resolve it first.';
    case 'aggregate-refused':
      return describeAggregateRefusal(refusal.errors);
    case 'persistence-read-failed':
      return 'The stored Spaces could not be read, so this edit was not attempted.';
    case 'space-resource-target-unavailable':
      return TARGET_UNAVAILABLE_REASONS[refusal.reason];
    // Same wording Authoring's own `deleted-resource` refuses a Markdown or
    // Reference Resource's Reference Resources with (ADR 0070) — one sentence for
    // one meaning, whichever seam the deletion reached it through.
    case 'resource-has-references':
      return `Delete the Reference Resources of this Resource first: ${refusal.referenceTitles.join(', ')}.`;
  }
};

/**
 * What a rejected Space Resource placement says, where a refusal would have been.
 *
 * The Resources list places a Space by spending a coordinated Edit across Spaces,
 * and neither the Map it resolves first nor the transport under it is a
 * refusal channel: both *reject*. A rejection is not a refusal: the lifecycle
 * refuses for everything it can name, so reaching here means an invariant broke
 * and there is no field to correct. The reader pressed a row and is owed a
 * sentence either way, and every surface that can show one now draws a single
 * string — the panes that placed fielded errors are gone (ADR 0089).
 *
 * Here rather than on the surface, because a Space Resource's prose is written in
 * this module or nowhere. The rejection is `unknown` because a `throw` can carry
 * anything, and that is the caught-error boundary the parsing rules exempt —
 * named at the type rather than at a parameter, which is what lets a rejection
 * arm take it without writing the annotation those rules reserve for an I/O
 * boundary.
 */
export type SpaceResourceBreak = (failure: unknown) => string;

/** @see SpaceResourceBreak */
export const describeSpaceResourceBreak: SpaceResourceBreak = (failure) =>
  `This Space Resource was not added: ${failureMessage(failure)}`;

/**
 * The same rejection, said by the command that *makes* a Space.
 *
 * Two sentences rather than one generic, because the two gestures are not the
 * same act (ADR 0089): the Resources list points a Resource at a Space that already
 * exists, and Create Space Resource mints one. A reader who pressed the Dock's
 * glyph and is told a Resource "was not added" has to work out what was supposed
 * to have been added to what.
 */
export const describeSpaceResourceCreationBreak: SpaceResourceBreak = (failure) =>
  `This Resource was not created: ${failureMessage(failure)}`;
