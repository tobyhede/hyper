import {
  SPACE_THING_MIN_OPEN_SIZE,
  type DiagramId,
  type GraphId,
  type ThingDocument,
  type ThingId,
  type UUID,
} from '@project/core';
import type { ObserverErrorReporter } from '@project/persistence';
import type { ThingFlowNode, ThingNodeData } from '@project/react-flow-adapter';
import type { EntityActionGroup } from '@project/ui';
import { buildSpaceThingRail, type SpaceThingRailContext } from './build-space-thing-rail';
import type { Continuation } from './continuation';
import type { OpenSpace, OpenSpaces } from './open-spaces';
import type { ThingResize } from './render-adapter';
import type { AuthoringCompletion, AuthoringResult } from './space-authoring';
import type { SpaceThingTargetDiagram } from './space-thing-lifecycle';
import type { SpaceThingTargets } from './space-thing-targets';
import { snapThingSizeToClose, THING_SIZE } from './thing';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export type CanvasThingDataPatch = Partial<
  Pick<
    ThingNodeData,
    | 'titleEditingEnabled'
    | 'thingEditingEnabled'
    | 'onEditThing'
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
export interface CanvasThingDecorationContext {
  readonly authorOnCanvas: boolean;
  readonly bodyEditing: boolean;
  readonly editableThingIds: ReadonlySet<string>;
  readonly openThing: (thingId: string) => 'completed' | 'retained';
  readonly closeThing: (thingId: ThingId) => 'completed' | 'retained';
  readonly beginTitleEditing: (thingId: string) => void;
  readonly onSelectThing: (thingId: ThingId) => void;
  readonly thingResize: ThingResize;
  readonly editingTitleThingId: string | null;
  readonly completeThingTitle: (thingId: string, title: string) => string | null;
  readonly clearCaret: () => void;
  readonly beginBodyEditing: (node: ThingFlowNode) => void;
  readonly bodyEditorThingId: string | null;
  readonly completeThingBody: (thingId: ThingId, body: string) => 'completed' | 'retained';
  readonly thingEntityActions?: ((thingId: ThingId) => readonly EntityActionGroup[]) | undefined;
  readonly containingSpaceId: UUID;
  readonly spaceDocuments: ReadonlyMap<ThingId, Extract<ThingDocument, { kind: 'space' }>>;
  readonly spaceThingTargets: SpaceThingTargets;
  readonly spaces: OpenSpaces | null;
  readonly continuation: Continuation | undefined;
  readonly completeSpaceThingSelection: (
    thingId: ThingId,
    diagram: Pick<SpaceThingTargetDiagram, 'id'>,
    graphId: GraphId,
  ) => string | null;
  readonly completeEmbedded: (
    entry: OpenSpace,
    diagramId: DiagramId,
    completion: AuthoringCompletion,
    reportObserverError: ObserverErrorReporter,
  ) => AuthoringResult;
  readonly portalEditing: ReadonlySet<ThingId> | undefined;
  readonly onPortalEditingChange: ((thingId: ThingId, editing: boolean) => void) | undefined;
  readonly contextNotices: ReadonlyMap<ThingId, string>;
  readonly onContextEditingChange: (thingId: ThingId, editing: boolean) => void;
  readonly onContextReport: (thingId: ThingId, message: string | null) => void;
}

export function applyThingDataPatch(
  node: ThingFlowNode,
  patch: CanvasThingDataPatch,
): ThingFlowNode {
  if (Object.keys(patch).length === 0) return node;
  return { ...node, data: { ...node.data, ...patch } };
}

type SharedThingDecorationContext = Pick<
  CanvasThingDecorationContext,
  | 'authorOnCanvas'
  | 'bodyEditing'
  | 'editableThingIds'
  | 'openThing'
  | 'closeThing'
  | 'beginTitleEditing'
  | 'onSelectThing'
  | 'thingResize'
  | 'editingTitleThingId'
  | 'completeThingTitle'
  | 'clearCaret'
  | 'thingEntityActions'
>;

type MarkdownThingDecorationContext = Pick<
  CanvasThingDecorationContext,
  | 'authorOnCanvas'
  | 'bodyEditing'
  | 'editableThingIds'
  | 'beginBodyEditing'
  | 'bodyEditorThingId'
  | 'completeThingBody'
  | 'clearCaret'
>;

type SpaceThingDecorationContext = Pick<
  CanvasThingDecorationContext,
  | 'authorOnCanvas'
  | 'editableThingIds'
  | 'containingSpaceId'
  | 'spaceDocuments'
  | 'spaceThingTargets'
  | 'spaces'
  | 'continuation'
  | 'completeSpaceThingSelection'
  | 'completeEmbedded'
  | 'portalEditing'
  | 'onPortalEditingChange'
  | 'contextNotices'
  | 'onContextEditingChange'
  | 'onContextReport'
>;

export function decorateSharedThingNode(
  node: ThingFlowNode,
  context: SharedThingDecorationContext,
): CanvasThingDataPatch {
  const thingBelongsToWorkingSpace = context.editableThingIds.has(node.data.thingId);
  const patch: Mutable<
    Pick<
      ThingNodeData,
      | 'titleEditingEnabled'
      | 'thingEditingEnabled'
      | 'onEditThing'
      | 'onBeginTitleEditing'
      | 'resize'
      | 'titleEditor'
      | 'entityActions'
    >
  > = {};
  patch.titleEditingEnabled =
    thingBelongsToWorkingSpace && context.authorOnCanvas && !context.bodyEditing;
  if (thingBelongsToWorkingSpace && context.authorOnCanvas) {
    patch.thingEditingEnabled = true;
    patch.onEditThing = (open) =>
      open ? context.openThing(node.id) : context.closeThing(node.data.thingId);
  }
  if (thingBelongsToWorkingSpace && context.authorOnCanvas && !context.bodyEditing) {
    patch.onBeginTitleEditing = () => context.beginTitleEditing(node.id);
  }
  if (thingBelongsToWorkingSpace && node.data.expanded === true && context.authorOnCanvas) {
    // Ordinary Open proposals preserve the Space footer. The gesture itself
    // still reaches Closed Size so ADR 0066's magnet can Close it.
    const floor = node.data.kind === 'space' ? SPACE_THING_MIN_OPEN_SIZE : THING_SIZE;
    patch.resize = {
      minWidth: THING_SIZE.width,
      minHeight: THING_SIZE.height,
      onResizeStart: () => {
        context.onSelectThing(node.data.thingId);
        context.thingResize.beginResize(node.data.thingId);
      },
      onResize: (size) => {
        const proposed = snapThingSizeToClose(size);
        context.thingResize.previewResize(
          node.data.thingId,
          proposed === THING_SIZE
            ? proposed
            : {
                width: Math.max(floor.width, size.width),
                height: Math.max(floor.height, size.height),
              },
        );
      },
      onResizeEnd: () => context.thingResize.finishResize(node.data.thingId),
      onResizeCancel: () => context.thingResize.cancelResize(node.data.thingId),
    };
  }
  if (
    thingBelongsToWorkingSpace &&
    context.authorOnCanvas &&
    node.id === context.editingTitleThingId
  ) {
    patch.titleEditor = {
      onComplete: (title) => {
        const error = context.completeThingTitle(node.id, title);
        if (error === null) context.clearCaret();
        return error;
      },
      onCancel: () => context.clearCaret(),
    };
  }
  if (
    context.thingEntityActions !== undefined &&
    thingBelongsToWorkingSpace &&
    context.authorOnCanvas
  ) {
    // The same gate every other control on the rail takes: these commands are
    // drawn in that rail, so a canvas that has withdrawn authoring would
    // otherwise reinstate the one cluster that survived it.
    patch.entityActions = context.thingEntityActions(node.data.thingId);
  }
  return patch;
}

export function decorateMarkdownThingNode(
  node: ThingFlowNode,
  context: MarkdownThingDecorationContext,
): CanvasThingDataPatch {
  const patch: Mutable<Pick<ThingNodeData, 'onBeginBodyEditing' | 'bodyEditor'>> = {};
  const thingBelongsToWorkingSpace = context.editableThingIds.has(node.data.thingId);
  if (
    thingBelongsToWorkingSpace &&
    context.authorOnCanvas &&
    !context.bodyEditing &&
    node.data.kind === 'markdown'
  ) {
    patch.onBeginBodyEditing = () => context.beginBodyEditing(node);
  }
  if (
    thingBelongsToWorkingSpace &&
    node.data.kind === 'markdown' &&
    context.bodyEditorThingId === node.id
  ) {
    patch.bodyEditor = {
      onComplete: (body) => context.completeThingBody(node.data.thingId, body),
      onEnd: () => context.clearCaret(),
    };
  }
  return patch;
}

export function decorateSpaceThingNode(
  node: ThingFlowNode,
  context: SpaceThingDecorationContext,
): CanvasThingDataPatch {
  if (node.data.kind !== 'space') return {};
  const patch: Mutable<Pick<ThingNodeData, 'spaceRail' | 'contextNotice' | 'portal'>> = {};
  const thingBelongsToWorkingSpace = context.editableThingIds.has(node.data.thingId);
  const spaceDocument = context.spaceDocuments.get(node.data.thingId);
  const target =
    spaceDocument !== undefined ? context.spaceThingTargets.get(spaceDocument.spaceId) : undefined;
  // Closed, read-only, and unread omit the rail. Withdrawn authoring still
  // draws it, disabled: an absent rail is how the Thing says the target has
  // not been read yet, so a canvas that had merely withdrawn authoring would
  // put every Open Space Thing back to reporting a wait that had already ended.
  if (node.data.expanded === true && !node.data.readOnly && target !== undefined) {
    const thingId = node.data.thingId;
    let railContext: SpaceThingRailContext | undefined;
    if (
      context.spaces !== null &&
      context.continuation !== undefined &&
      spaceDocument !== undefined
    ) {
      const entry = context.spaces.entry(spaceDocument.spaceId);
      if (entry !== undefined) {
        railContext = {
          entry,
          spaces: context.spaces,
          containingSpaceId: context.containingSpaceId,
          continuation: context.continuation,
          complete: (completion) =>
            context.completeEmbedded(
              entry,
              spaceDocument.diagram,
              completion,
              entry.app.reportObserverError,
            ),
        };
      }
    }
    patch.spaceRail = buildSpaceThingRail({
      target,
      document: spaceDocument,
      disabled: !(thingBelongsToWorkingSpace && context.authorOnCanvas),
      complete: (diagram, graphId) =>
        context.completeSpaceThingSelection(thingId, diagram, graphId),
      onEditingChange: (editing) => context.onContextEditingChange(thingId, editing),
      onReport: (message) => context.onContextReport(thingId, message),
      context: railContext,
    });
  }
  if (patch.spaceRail !== undefined) {
    const notice = context.contextNotices.get(node.data.thingId);
    if (notice !== undefined) patch.contextNotice = notice;
  }
  const onPortalEditingChange = context.onPortalEditingChange;
  if (
    onPortalEditingChange !== undefined &&
    node.data.expanded === true &&
    patch.spaceRail !== undefined
  ) {
    patch.portal = {
      editing: context.portalEditing?.has(node.data.thingId) === true,
      onEditingChange: (editing) => onPortalEditingChange(node.data.thingId, editing),
    };
  }
  return patch;
}
