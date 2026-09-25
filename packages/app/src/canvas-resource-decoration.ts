import {
  SPACE_RESOURCE_MIN_OPEN_SIZE,
  type MapId,
  type GraphId,
  type ResourceDocument,
  type ResourceId,
  type UUID,
} from '@project/core';
import type { ObserverErrorReporter } from '@project/persistence';
import type { ResourceFlowNode, ResourceNodeData } from '@project/react-flow-adapter';
import type { EntityActionGroup } from '@project/ui';
import { buildSpaceResourceRail } from './build-space-resource-rail';
import type { SpaceResourceRailContext } from './space-resource-context-commands';
import type { CommandOutcomes } from './command-outcomes';
import type { OpenSpace, OpenSpaces } from './open-spaces';
import type { ResourceResize } from './render-adapter';
import type { AuthoringCompletion, AuthoringResult } from './space-authoring';
import type { SpaceResourceTargetMap } from './space-resource-lifecycle';
import type { SpaceResourceTargets } from './space-resource-targets';
import { snapResourceSizeToClose, RESOURCE_SIZE } from './resource';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export type CanvasResourceDataPatch = Partial<
  Pick<
    ResourceNodeData,
    | 'onEditResource'
    | 'onBeginTitleEditing'
    | 'resize'
    | 'titleEditor'
    | 'entityActions'
    | 'onBeginBodyEditing'
    | 'bodyEditor'
    | 'spaceRail'
    | 'contextNotice'
    | 'portal'
  >
>;

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
  readonly resourceEntityActions?:
    ((resourceId: ResourceId) => readonly EntityActionGroup[]) | undefined;
  readonly containingSpaceId: UUID;
  readonly spaceDocuments: ReadonlyMap<ResourceId, Extract<ResourceDocument, { kind: 'space' }>>;
  readonly spaceResourceTargets: SpaceResourceTargets;
  readonly spaces: OpenSpaces | null;
  readonly commandOutcomes: CommandOutcomes | undefined;
  readonly completeSpaceResourceSelection: (
    resourceId: ResourceId,
    map: Pick<SpaceResourceTargetMap, 'id'>,
    graphId: GraphId,
  ) => string | null;
  readonly completeEmbedded: (
    entry: OpenSpace,
    mapId: MapId,
    completion: AuthoringCompletion,
    reportObserverError: ObserverErrorReporter,
  ) => AuthoringResult;
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

type SharedResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  | 'authorOnCanvas'
  | 'bodyEditing'
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

type MarkdownResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  | 'authorOnCanvas'
  | 'bodyEditing'
  | 'editableResourceIds'
  | 'beginBodyEditing'
  | 'bodyEditorResourceId'
  | 'completeResourceBody'
  | 'clearCaret'
>;

type SpaceResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  | 'authorOnCanvas'
  | 'editableResourceIds'
  | 'containingSpaceId'
  | 'spaceDocuments'
  | 'spaceResourceTargets'
  | 'spaces'
  | 'commandOutcomes'
  | 'completeSpaceResourceSelection'
  | 'completeEmbedded'
  | 'portalEditing'
  | 'onPortalEditingChange'
  | 'contextNotices'
  | 'onContextEditingChange'
  | 'onContextReport'
>;

export function decorateSharedResourceNode(
  node: ResourceFlowNode,
  context: SharedResourceDecorationContext,
): CanvasResourceDataPatch {
  const resourceBelongsToWorkingSpace = context.editableResourceIds.has(node.data.resourceId);
  const patch: Mutable<
    Pick<
      ResourceNodeData,
      'onEditResource' | 'onBeginTitleEditing' | 'resize' | 'titleEditor' | 'entityActions'
    >
  > = {};
  if (resourceBelongsToWorkingSpace && context.authorOnCanvas) {
    patch.onEditResource = (open) =>
      open ? context.openResource(node.id) : context.closeResource(node.data.resourceId);
  }
  if (resourceBelongsToWorkingSpace && context.authorOnCanvas && !context.bodyEditing) {
    patch.onBeginTitleEditing = () => context.beginTitleEditing(node.id);
  }
  if (resourceBelongsToWorkingSpace && node.data.open === true && context.authorOnCanvas) {
    // Ordinary Open proposals preserve the Space footer. The gesture itself
    // still reaches Closed Size so ADR 0066's magnet can Close it.
    const floor = node.data.kind === 'space' ? SPACE_RESOURCE_MIN_OPEN_SIZE : RESOURCE_SIZE;
    patch.resize = {
      minWidth: RESOURCE_SIZE.width,
      minHeight: RESOURCE_SIZE.height,
      onResizeStart: () => {
        context.onSelectResource(node.data.resourceId);
        context.resourceResize.beginResize(node.data.resourceId);
      },
      onResize: (size) => {
        const proposed = snapResourceSizeToClose(size);
        context.resourceResize.previewResize(
          node.data.resourceId,
          proposed === RESOURCE_SIZE
            ? proposed
            : {
                width: Math.max(floor.width, size.width),
                height: Math.max(floor.height, size.height),
              },
        );
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
  if (
    context.resourceEntityActions !== undefined &&
    resourceBelongsToWorkingSpace &&
    context.authorOnCanvas
  ) {
    // The same gate every other control on the rail takes: these commands are
    // drawn in that rail, so a canvas that has withdrawn authoring would
    // otherwise reinstate the one cluster that survived it.
    patch.entityActions = context.resourceEntityActions(node.data.resourceId);
  }
  return patch;
}

export function decorateMarkdownResourceNode(
  node: ResourceFlowNode,
  context: MarkdownResourceDecorationContext,
): CanvasResourceDataPatch {
  const patch: Mutable<Pick<ResourceNodeData, 'onBeginBodyEditing' | 'bodyEditor'>> = {};
  const resourceBelongsToWorkingSpace = context.editableResourceIds.has(node.data.resourceId);
  if (
    resourceBelongsToWorkingSpace &&
    context.authorOnCanvas &&
    !context.bodyEditing &&
    node.data.kind === 'markdown'
  ) {
    patch.onBeginBodyEditing = () => context.beginBodyEditing(node);
  }
  if (
    resourceBelongsToWorkingSpace &&
    node.data.kind === 'markdown' &&
    context.bodyEditorResourceId === node.id
  ) {
    patch.bodyEditor = {
      onComplete: (body) => context.completeResourceBody(node.data.resourceId, body),
      onEnd: () => context.clearCaret(),
    };
  }
  return patch;
}

export function decorateSpaceResourceNode(
  node: ResourceFlowNode,
  context: SpaceResourceDecorationContext,
): CanvasResourceDataPatch {
  if (node.data.kind !== 'space') return {};
  const patch: Mutable<Pick<ResourceNodeData, 'spaceRail' | 'contextNotice' | 'portal'>> = {};
  const resourceBelongsToWorkingSpace = context.editableResourceIds.has(node.data.resourceId);
  const spaceDocument = context.spaceDocuments.get(node.data.resourceId);
  const target =
    spaceDocument !== undefined
      ? context.spaceResourceTargets.get(spaceDocument.spaceId)
      : undefined;
  // Closed, read-only, and unread omit the rail. Withdrawn authoring still
  // draws it, disabled: an absent rail is how the Resource says the target has
  // not been read yet, so a canvas that had merely withdrawn authoring would
  // put every Open Space Resource back to reporting a wait that had already ended.
  if (node.data.open === true && !node.data.readOnly && target !== undefined) {
    const resourceId = node.data.resourceId;
    let railContext: SpaceResourceRailContext | undefined;
    if (
      context.spaces !== null &&
      context.commandOutcomes !== undefined &&
      spaceDocument !== undefined
    ) {
      const entry = context.spaces.entry(spaceDocument.spaceId);
      if (entry !== undefined) {
        railContext = {
          entry,
          spaces: context.spaces,
          containingSpaceId: context.containingSpaceId,
          commandOutcomes: context.commandOutcomes,
          complete: (completion) =>
            context.completeEmbedded(
              entry,
              spaceDocument.map,
              completion,
              entry.app.reportObserverError,
            ),
        };
      }
    }
    patch.spaceRail = buildSpaceResourceRail({
      target,
      document: spaceDocument,
      disabled: !(resourceBelongsToWorkingSpace && context.authorOnCanvas),
      complete: (map, graphId) => context.completeSpaceResourceSelection(resourceId, map, graphId),
      onEditingChange: (editing) => context.onContextEditingChange(resourceId, editing),
      onReport: (message) => context.onContextReport(resourceId, message),
      context: railContext,
    });
  }
  if (patch.spaceRail !== undefined) {
    const notice = context.contextNotices.get(node.data.resourceId);
    if (notice !== undefined) patch.contextNotice = notice;
  }
  const onPortalEditingChange = context.onPortalEditingChange;
  if (
    onPortalEditingChange !== undefined &&
    node.data.open === true &&
    patch.spaceRail !== undefined
  ) {
    patch.portal = {
      editing: context.portalEditing?.has(node.data.resourceId) === true,
      onEditingChange: (editing) => onPortalEditingChange(node.data.resourceId, editing),
    };
  }
  return patch;
}
