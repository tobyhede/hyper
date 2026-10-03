import type { AuthoringAvailability } from './authoring-availability';

/** A drawn Map's permission, computed once and inherited by its children. */
export type MapSurfacePolicy = 'authoring' | 'inert' | 'read-only';

export interface MapSurfacePolicyInput {
  readonly inherited: MapSurfacePolicy;
  readonly throughReference: boolean;
  readonly stale: boolean;
  readonly depth: number;
  readonly editing: boolean;
}

export function mapSurfacePolicy(input: MapSurfacePolicyInput): MapSurfacePolicy {
  if (input.inherited === 'read-only' || input.throughReference || input.stale) return 'read-only';
  if (input.inherited === 'inert' || input.depth > 1 || !input.editing) return 'inert';
  return 'authoring';
}

export function surfaceOffers(policy: MapSurfacePolicy, depth = 0) {
  const authoring = policy === 'authoring';
  return {
    authoring,
    readOnly: policy === 'read-only',
    editEmbeddedMap: authoring && depth === 0,
    present: authoring && depth === 0,
  };
}

/** Apply one policy to the ordinary in-progress authoring availability. */
export function surfaceAvailability(
  available: AuthoringAvailability,
  policy: MapSurfacePolicy,
  depth: number,
): AuthoringAvailability {
  const permitted = surfaceOffers(policy, depth);
  return permitted.authoring
    ? {
        ...available,
        present: available.present && permitted.present,
        authorInEmbeddedMap: available.authorInEmbeddedMap && permitted.editEmbeddedMap,
      }
    : {
        resourcesView: false,
        chromeTitleEdit: false,
        entityEdits: false,
        deleteResource: false,
        present: false,
        addResource: false,
        createSpaceResource: false,
        createMap: false,
        authorOnCanvas: false,
        authorInEmbeddedMap: false,
        editResourceBody: false,
        connectOnCanvas: false,
        dragNodes: false,
        selectNodes: false,
        navigate: false,
        replaceSession: false,
      };
}
