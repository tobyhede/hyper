import { spaceKind, type SpaceKindId } from '@project/core';
import type { KindOperationsOf, ResourceFlowNodeOf } from '@project/react-flow-adapter';
import { buildSpaceResourceRail } from '../build-space-resource-rail';
import type {
  CanvasResourceDecorationContext,
  KindDecoration,
  Mutable,
} from '../canvas-resource-decoration';
import type { SpaceResourceRailContext } from '../space-resource-context-commands';

/** The Space kind's operations and decoration, built by assigning what a gate allows. */
type SpaceOperations = Mutable<KindOperationsOf<SpaceKindId>>;
type SpaceDecoration = Mutable<KindDecoration<SpaceKindId>>;

export type SpaceResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  | 'authorOnCanvas'
  | 'editableResourceIds'
  | 'continuation'
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

export function decorateSpaceResourceNode(
  node: ResourceFlowNodeOf<SpaceKindId>,
  context: SpaceResourceDecorationContext,
): KindDecoration<SpaceKindId> {
  const kindOperations: SpaceOperations = { kind: spaceKind.id };
  const decoration: SpaceDecoration = { kindOperations };
  if (node.data.contentAction !== 'author-space-view') return decoration;
  const resourceBelongsToWorkingSpace = context.editableResourceIds.has(node.data.resourceId);
  const spaceDocument = context.spaceDocuments.get(node.data.resourceId);
  const target =
    spaceDocument !== undefined
      ? context.spaceResourceTargets.get(spaceDocument.content.spaceId)
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
      const entry = context.spaces.entry(spaceDocument.content.spaceId);
      if (entry !== undefined) {
        railContext = {
          entry,
          continuation: context.continuation,
          spaces: context.spaces,
          containingSpaceId: context.containingSpaceId,
          deleteConfirmation: entry.app.deleteConfirmation,
        };
      }
    }
    kindOperations.spaceRail = buildSpaceResourceRail({
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
  if (kindOperations.spaceRail !== undefined) {
    const notice = context.contextNotices.get(node.data.resourceId);
    if (notice !== undefined) decoration.contextNotice = notice;
  }
  const onPortalEditingChange = context.onPortalEditingChange;
  if (
    onPortalEditingChange !== undefined &&
    node.data.open === true &&
    kindOperations.spaceRail !== undefined
  ) {
    kindOperations.portal = {
      editing: context.portalEditing?.has(node.data.resourceId) === true,
      onEditingChange: (editing) => onPortalEditingChange(node.data.resourceId, editing),
    };
  }
  return decoration;
}
