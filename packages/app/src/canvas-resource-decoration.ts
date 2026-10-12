import type { Continuation } from './continuation';
import {
  takesOpen,
  type GraphId,
  type ResourceDocument,
  type ResourceId,
  type ResourceShape,
  type SpaceKindId,
  type UUID,
} from '@project/core';
import type {
  KindOperationsOf,
  ResourceFlowNode,
  ResourceFlowNodeOf,
  ResourceNodeData,
} from '@project/react-flow-adapter';
import type { EntityActionGroup, ImageReplacement, ResourceDisplay } from '@project/ui';
import type { CommandOutcomes } from './command-outcomes';
import type { DeleteConfirmation } from './delete-confirmation';
import type { OpenSpaces } from './open-spaces';
import type { ResourceResize } from './render-adapter';
import type { SpaceResourceTargetMap } from './space-resource-lifecycle';
import type { SpaceResourceTargets } from './space-resource-targets';
import { RESOURCE_SIZE } from './resource';

/** A value built by assigning what a gate allows. */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** What the shared decoration adds to a Resource of any kind. */
export type CanvasResourceDataPatch = Partial<
  Pick<
    ResourceNodeData,
    'onOpenChange' | 'onBeginTitleEditing' | 'resize' | 'titleEditor' | 'entityActions'
  >
>;

/**
 * What one kind's decoration supplies: that kind's operations whole, and the
 * display or context notice where it changes them.
 */
export interface KindDecoration<K extends ResourceFlowNode['data']['kind']> {
  readonly kindOperations: KindOperationsOf<K>;
  readonly display?: ResourceDisplay;
  readonly contextNotice?: string;
}

/**
 * Completions and canvas facts the decorate functions read. The hook owns
 * caret, session subscription, and the completion functions passed in here.
 */
export interface CanvasResourceDecorationContext {
  readonly authorOnCanvas: boolean;
  readonly bodyEditing: boolean;
  readonly editableResourceIds: ReadonlySet<string>;
  readonly openResource: (resourceId: string) => 'completed' | 'retained';
  readonly closeResource: (resourceId: ResourceId) => 'completed' | 'retained';
  readonly beginTitleEditing: (resourceId: string) => void;
  readonly onSelectResource: (resourceId: ResourceId) => void;
  readonly resourceResize: ResourceResize;
  readonly editingTitleResourceId: string | null;
  readonly completeResourceTitle: (resourceId: string, title: string) => string | null;
  readonly clearCaret: () => void;
  readonly beginBodyEditing: (node: ResourceFlowNode) => void;
  readonly bodyEditorResourceId: string | null;
  readonly completeResourceBody: (resourceId: ResourceId, body: string) => 'completed' | 'retained';
  /**
   * Replace an Image Resource's image, answering the sentence for a refusal or
   * `null` once the replacement is over.
   */
  readonly replaceResourceImage: (
    resourceId: ResourceId,
    replacement: ImageReplacement,
  ) => Promise<string | null>;
  /** What a replacement's file picker offers. */
  readonly imageAccept: string;
  readonly resourceEntityActions?:
    ((resourceId: ResourceId) => readonly EntityActionGroup[]) | undefined;
  /**
   * Draw an Ur Resource in another Shape on this Map, reporting a refusal.
   * Absent where this canvas has no command outcomes to report one through.
   */
  readonly changeResourceShape?:
    ((resourceId: ResourceId, resourceShape: ResourceShape) => void) | undefined;
  readonly continuation: Continuation;
  readonly containingSpaceId: UUID;
  readonly spaceDocuments: ReadonlyMap<
    ResourceId,
    Extract<ResourceDocument, { kind: SpaceKindId }>
  >;
  readonly spaceResourceTargets: SpaceResourceTargets;
  readonly spaces: OpenSpaces | null;
  readonly commandOutcomes: CommandOutcomes | undefined;
  readonly deleteConfirmation: Pick<DeleteConfirmation, 'arm'> | undefined;
  readonly completeSpaceResourceSelection: (
    resourceId: ResourceId,
    targetMap: Pick<SpaceResourceTargetMap, 'id'>,
    graphId: GraphId,
  ) => string | null;
  readonly portalEditing: ReadonlySet<ResourceId> | undefined;
  readonly onPortalEditingChange: ((resourceId: ResourceId, editing: boolean) => void) | undefined;
  readonly contextNotices: ReadonlyMap<ResourceId, string>;
  readonly onContextEditingChange: (resourceId: ResourceId, editing: boolean) => void;
  readonly onContextReport: (resourceId: ResourceId, message: string | null) => void;
}

export function applyResourceDataPatch(
  node: ResourceFlowNode,
  patch: CanvasResourceDataPatch,
): ResourceFlowNode {
  if (Object.keys(patch).length === 0) return node;
  return { ...node, data: { ...node.data, ...patch } };
}

/**
 * `node` with its kind's decoration. A decoration that offers nothing beyond
 * the bare kind the projection already carries leaves the node as it is, so a
 * Resource whose operations did not change keeps its identity.
 */
export function applyKindDecoration<K extends ResourceFlowNode['data']['kind']>(
  node: ResourceFlowNodeOf<K>,
  decoration: KindDecoration<K>,
): ResourceFlowNodeOf<K> {
  const offersNothing =
    Object.keys(decoration.kindOperations).length === 1 &&
    decoration.display === undefined &&
    decoration.contextNotice === undefined;
  if (offersNothing) return node;
  return { ...node, data: { ...node.data, ...decoration } };
}

type SharedResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  | 'authorOnCanvas'
  | 'bodyEditing'
  | 'bodyEditorResourceId'
  | 'editableResourceIds'
  | 'openResource'
  | 'closeResource'
  | 'beginTitleEditing'
  | 'onSelectResource'
  | 'resourceResize'
  | 'editingTitleResourceId'
  | 'completeResourceTitle'
  | 'clearCaret'
  | 'resourceEntityActions'
>;

export function decorateSharedResourceNode(
  node: ResourceFlowNode,
  context: SharedResourceDecorationContext,
): CanvasResourceDataPatch {
  const resourceBelongsToWorkingSpace = context.editableResourceIds.has(node.data.resourceId);
  const patch: Mutable<
    Pick<
      ResourceNodeData,
      'onOpenChange' | 'onBeginTitleEditing' | 'resize' | 'titleEditor' | 'entityActions'
    >
  > = {};
  if (resourceBelongsToWorkingSpace && context.authorOnCanvas && takesOpen(node.data.kind)) {
    // An Ur Resource has no content to show, so it offers no Open or Close.
    patch.onOpenChange = (open) =>
      open ? context.openResource(node.id) : context.closeResource(node.data.resourceId);
  } else if (resourceBelongsToWorkingSpace && node.id === context.bodyEditorResourceId) {
    // A live content editor keeps its Close drawn when the canvas withdraws
    // authoring — a running image replacement withdraws it — so the control
    // stays in its slot, unavailable, instead of vanishing and returning.
    // `CanvasResource` draws it disabled while the edit runs; withdrawn, it
    // also retains rather than running an Open or Close Edit.
    patch.onOpenChange = () => 'retained';
  }
  if (resourceBelongsToWorkingSpace && context.authorOnCanvas && !context.bodyEditing) {
    patch.onBeginTitleEditing = () => context.beginTitleEditing(node.id);
  }
  if (resourceBelongsToWorkingSpace && context.authorOnCanvas) {
    // Every kind resizes, Open or Closed (ADR 0122); `ResourceNode` draws the
    // control only while the Resource is selected. The Closed Size is the one
    // floor, and the control's own minimum keeps a proposal at or above it.
    patch.resize = {
      minWidth: RESOURCE_SIZE.width,
      minHeight: RESOURCE_SIZE.height,
      onResizeStart: () => {
        context.onSelectResource(node.data.resourceId);
        context.resourceResize.beginResize(node.data.resourceId);
      },
      onResize: (size) => {
        context.resourceResize.previewResize(node.data.resourceId, {
          width: Math.max(RESOURCE_SIZE.width, size.width),
          height: Math.max(RESOURCE_SIZE.height, size.height),
        });
      },
      onResizeEnd: () => context.resourceResize.finishResize(node.data.resourceId),
      onResizeCancel: () => context.resourceResize.cancelResize(node.data.resourceId),
    };
  }
  if (
    resourceBelongsToWorkingSpace &&
    context.authorOnCanvas &&
    node.id === context.editingTitleResourceId
  ) {
    patch.titleEditor = {
      onComplete: (title) => {
        const error = context.completeResourceTitle(node.id, title);
        if (error === null) context.clearCaret();
        return error;
      },
      onCancel: () => context.clearCaret(),
    };
  }
  if (context.resourceEntityActions !== undefined && resourceBelongsToWorkingSpace) {
    // The same gate every other control on the rail takes: these commands are
    // drawn in that rail, so a canvas that has withdrawn authoring would
    // otherwise reinstate the one cluster that survived it. Withdrawn is `[]`,
    // never `undefined`: `CanvasResource` keeps its `EntityActions` wrapper
    // mounted for any defined list, so withdrawing authoring does not remount
    // the Resource and lose a running replacement's target. Held by
    // `canvas-resource-decoration.test.ts` ('asks for entity actions only where
    // authoring is on…') and `CanvasResource.test.tsx` ('keeps a pending
    // replacement mounted when its entity actions become unavailable').
    patch.entityActions = context.authorOnCanvas
      ? context.resourceEntityActions(node.data.resourceId)
      : [];
  }
  return patch;
}
