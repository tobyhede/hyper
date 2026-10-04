import type { ResourceFlowNode } from '@project/react-flow-adapter';
import type { CanvasGestureRefusal } from './authoring-refusal';
import type { AuthoringAvailability } from './authoring-availability';
import type { EditTarget } from './space-authoring';

/** A drawn Map's permission, computed once and inherited by its children. */
export type MapSurfacePolicy = 'authoring' | 'inert' | 'read-only';

/** Whether a Map is the canvas's own, or one drawn inside it. */
export type SurfaceDrawing = EditTarget['kind'];

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

/** What one policy offers on one drawing. */
export interface SurfaceOffers {
  readonly authoring: boolean;
  readonly readOnly: boolean;
  /** Edit on a Space Resource: offered only in the canvas's own Map. */
  readonly editEmbeddedMap: boolean;
  /** Presenting: only the canvas's own Space presents. */
  readonly present: boolean;
}

export function surfaceOffers(policy: MapSurfacePolicy, drawing: SurfaceDrawing): SurfaceOffers {
  const authoring = policy === 'authoring';
  const canvas = drawing === 'canvas';
  return {
    authoring,
    readOnly: policy === 'read-only',
    editEmbeddedMap: authoring && canvas,
    present: authoring && canvas,
  };
}

const WITHHELD_CLASSES = 'nopan nowheel nodrag';

/**
 * Stamp a policy onto one projected Resource node: every drawing's one rule
 * for which gestures a node takes. An authoring Map keeps the node's own
 * flags; an inert or read-only one withholds every gesture, and the pointer
 * passes through it to the canvas.
 */
export function withSurfacePolicy(
  node: ResourceFlowNode,
  policy: MapSurfacePolicy,
): ResourceFlowNode {
  const readOnly = policy === 'read-only';
  // An authoring node keeps its identity, so a memoised node is not redrawn.
  if (policy === 'authoring' && node.data.readOnly === readOnly) return node;
  const data = { ...node.data, readOnly };
  if (policy === 'authoring') return { ...node, data };
  const className =
    node.className === undefined || node.className === ''
      ? WITHHELD_CLASSES
      : `${node.className} ${WITHHELD_CLASSES}`;
  return {
    ...node,
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
    deletable: false,
    className,
    style: { ...node.style, pointerEvents: 'none' },
    data: { ...data, connectionAuthoringEnabled: false },
  };
}

/** Apply one policy to the ordinary in-progress authoring availability. */
export function surfaceAvailability(
  available: AuthoringAvailability,
  policy: MapSurfacePolicy,
  drawing: SurfaceDrawing,
): AuthoringAvailability {
  const permitted = surfaceOffers(policy, drawing);
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

/**
 * Why a drop or a paste aimed at a drawn Map lands nowhere, or `null` when it
 * may land there. `adding` is whether that Map's own availability takes a new
 * Resource right now.
 */
export function drawnDropRefusal(
  policy: MapSurfacePolicy,
  depth: number,
  adding: boolean,
): CanvasGestureRefusal | null {
  if (policy === 'read-only') return { code: 'drawn-map-read-only' };
  if (policy === 'inert') return { code: depth > 1 ? 'drawn-map-nested' : 'drawn-map-not-in-edit' };
  return adding ? null : { code: 'drawn-map-unavailable' };
}
