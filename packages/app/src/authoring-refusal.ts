import type { SpaceAggregateError } from '@project/graph';
import type { AuthoringRefusal, EdgeEndpoint } from './space-authoring';
import type { SpaceCardLifecycleResult } from './space-card-lifecycle';

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

export type NewAliasRefusalErrors = AuthoringRefusalErrors<'title' | 'target'>;

/** Error placement for Alias creation, which owns Title and Target. */
export const presentNewAliasRefusal = (refusal: AuthoringRefusal): NewAliasRefusalErrors =>
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
export const presentNewSpaceCardRefusal = (refusal: SpaceCardRefusal): NewAliasRefusalErrors =>
  refusal.code === 'aggregate-refused'
    ? { fields: { target: describeSpaceCardRefusal(refusal) } }
    : { fields: {}, form: describeSpaceCardRefusal(refusal) };
