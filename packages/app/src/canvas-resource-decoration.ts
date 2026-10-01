import {
  SPACE_RESOURCE_MIN_OPEN_SIZE,
  type GraphId,
  type ResourceDocument,
  type ResourceId,
  type UUID,
} from '@project/core';
import type { ResourceFlowNode, ResourceNodeData } from '@project/react-flow-adapter';
import {
  beginEditing,
  beginReplacing,
  type EntityActionGroup,
  type ImageReplacement,
} from '@project/ui';
import { buildSpaceResourceRail } from './build-space-resource-rail';
import type { SpaceResourceRailContext } from './space-resource-context-commands';
import type { CommandOutcomes } from './command-outcomes';
import type { DeleteConfirmation } from './delete-confirmation';
import type { OpenSpaces } from './open-spaces';
import type { ResourceResize } from './render-adapter';
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
    | 'display'
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
  /**
   * Replace an Image Resource's image, answering the sentence for a refusal or
   * `null` once the replacement is over. Absent where no image can be stored.
   */
  readonly replaceResourceImage?:
    ((resourceId: ResourceId, replacement: ImageReplacement) => Promise<string | null>) | undefined;
  /** What a replacement's file picker offers. */
  readonly imageAccept: string;
  readonly resourceEntityActions?:
    ((resourceId: ResourceId) => readonly EntityActionGroup[]) | undefined;
  readonly containingSpaceId: UUID;
  readonly spaceDocuments: ReadonlyMap<ResourceId, Extract<ResourceDocument, { kind: 'space' }>>;
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

type ImageResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  | 'authorOnCanvas'
  | 'bodyEditing'
  | 'editableResourceIds'
  | 'beginBodyEditing'
  | 'bodyEditorResourceId'
  | 'replaceResourceImage'
  | 'imageAccept'
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
  | 'deleteConfirmation'
  | 'completeSpaceResourceSelection'
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
  } else if (resourceBelongsToWorkingSpace && node.id === context.bodyEditorResourceId) {
    // A live content editor keeps its Close drawn when the canvas withdraws
    // authoring — a running image replacement withdraws it — so the control
    // stays in its slot, unavailable, instead of vanishing and returning.
    // `CanvasResource` draws it disabled while the edit runs; withdrawn, it
    // also retains rather than running an Open or Close Edit.
    patch.onEditResource = () => 'retained';
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

export function decorateMarkdownResourceNode(
  node: ResourceFlowNode,
  context: MarkdownResourceDecorationContext,
): CanvasResourceDataPatch {
  const patch: Mutable<Partial<Pick<ResourceNodeData, 'onBeginBodyEditing' | 'display'>>> = {};
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
    const editor = {
      onComplete: (body: string) => context.completeResourceBody(node.data.resourceId, body),
      onEnd: () => context.clearCaret(),
    };
    // The editor is drawn only once the display is Open with this Resource's
    // own Markdown: a caret that lands before the Open projection draws
    // nothing until it arrives. It takes focus, since the author just asked
    // to write.
    const display = beginEditing(node.data.display, editor, true);
    if (display !== node.data.display) patch.display = display;
  }
  return patch;
}

/**
 * An Image Resource's Replace, which takes the place a Markdown Resource's body
 * edit takes, through the same caret (ADR 0064): beginning it, and the running
 * replacement while the caret is on it.
 */
export function decorateImageResourceNode(
  node: ResourceFlowNode,
  context: ImageResourceDecorationContext,
): CanvasResourceDataPatch {
  const replace = context.replaceResourceImage;
  if (node.data.kind !== 'image' || replace === undefined) return {};
  const patch: Mutable<Partial<Pick<ResourceNodeData, 'onBeginBodyEditing' | 'display'>>> = {};
  const resourceBelongsToWorkingSpace = context.editableResourceIds.has(node.data.resourceId);
  if (resourceBelongsToWorkingSpace && context.authorOnCanvas && !context.bodyEditing) {
    patch.onBeginBodyEditing = () => context.beginBodyEditing(node);
  }
  if (resourceBelongsToWorkingSpace && context.bodyEditorResourceId === node.id) {
    const resourceId = node.data.resourceId;
    const replacer = {
      accept: context.imageAccept,
      onReplace: (replacement: ImageReplacement) => replace(resourceId, replacement),
      onEnd: () => context.clearCaret(),
    };
    const display = beginReplacing(node.data.display, replacer);
    if (display !== node.data.display) patch.display = display;
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
      context.deleteConfirmation !== undefined &&
      spaceDocument !== undefined
    ) {
      const entry = context.spaces.entry(spaceDocument.spaceId);
      if (entry !== undefined) {
        railContext = {
          entry,
          spaces: context.spaces,
          containingSpaceId: context.containingSpaceId,
          commandOutcomes: context.commandOutcomes,
          deleteConfirmation: context.deleteConfirmation,
        };
      }
    }
    patch.spaceRail = buildSpaceResourceRail({
      target,
      document: spaceDocument,
      disabled: !(resourceBelongsToWorkingSpace && context.authorOnCanvas),
      complete: (targetMap, graphId) =>
        context.completeSpaceResourceSelection(resourceId, targetMap, graphId),
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
