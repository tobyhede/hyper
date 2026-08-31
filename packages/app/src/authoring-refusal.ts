import type { AuthoringRefusal, EdgeEndpoint } from './space-authoring';

type PresentedAuthoringRefusal =
  AuthoringRefusal | { readonly code: 'placement-failed'; readonly error: Error };

/** Application-owned copy for a stable Authoring refusal identity. */
export const describeAuthoringRefusal = (refusal: PresentedAuthoringRefusal): string => {
  switch (refusal.code) {
    case 'placement-failed':
      return `This view could not place its Cards: ${refusal.error.message}`;
    case 'placement-pending':
      return 'This view has not finished placing its Cards, so there is nowhere to write yet.';
    case 'computed-view-read-only':
      return 'Create a Layout from this Computed View before editing.';
    case 'layout-not-found':
      return 'This Layout is no longer part of the Space.';
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
    case 'card-title-required':
      return 'A Card title is required.';
    case 'layout-title-required':
      return 'A Layout title is required.';
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
  'computed-view-read-only': form,
  'layout-not-found': form,
  'layout-required': form,
  'card-not-found': form,
  'card-kind-immutable': form,
  'alias-target-immutable': form,
  'card-title-required': 'title',
  'layout-title-required': form,
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
  'computed-view-read-only': false,
  'layout-not-found': false,
  'layout-required': false,
  'card-not-found': false,
  'card-kind-immutable': false,
  'alias-target-immutable': false,
  'card-title-required': false,
  'layout-title-required': false,
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
 * field has nowhere else for a code to go, so a second nineteen-line table
 * saying `form` nineteen times would be a thing to keep in step and never a
 * thing to decide.
 */
export const presentEdgeDeletionRefusal = (
  refusal: AuthoringRefusal,
): EdgeDeletionRefusalErrors => ({
  fields: {},
  form: describeAuthoringRefusal(refusal),
});
