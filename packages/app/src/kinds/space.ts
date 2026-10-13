import {
  spaceKind,
  type GraphId,
  type ResourceId,
  type SpaceKindId,
  type SpaceView,
  type UUID,
} from '@project/core';
import type { ResourceFlowNodeOf } from '@project/react-flow-adapter';
import type { KindOperationsByKind } from '@project/ui';
import { buildSpaceResourceRail } from '../build-space-resource-rail';
import type {
  CanvasResourceDecorationContext,
  KindCanvasDecoration,
  KindDecoration,
  Mutable,
} from '../canvas-resource-decoration';
import type { CommandOutcomes } from '../command-outcomes';
import type { Continuation } from '../continuation';
import type { DeleteConfirmation } from '../delete-confirmation';
import type { KindCreation } from '../kind-creation';
import type { ResourcePlacementCommands } from '../resource-placement';
import type { OpenSpaces } from '../open-spaces';
import type { SpaceResourceRailContext } from '../space-resource-context-commands';
import type { SpaceResourceTargetMap } from '../space-resource-lifecycle';
import type { SpaceResourceTargets } from '../space-resource-targets';

/** The Space kind's operations and decoration, built by assigning what a gate allows. */
type SpaceOperations = Mutable<KindOperationsByKind[SpaceKindId]>;
type SpaceDecoration = Mutable<KindDecoration<SpaceKindId>>;

export type SpaceResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  'authorOnCanvas' | 'editableResourceIds'
> & {
  readonly continuation: Continuation;
  readonly containingSpaceId: UUID;
  readonly spaceSelections: ReadonlyMap<ResourceId, SpaceView>;
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
};

export function decorateSpaceResourceNode(
  node: ResourceFlowNodeOf<SpaceKindId>,
  context: SpaceResourceDecorationContext,
): KindDecoration<SpaceKindId> {
  const kindOperations: SpaceOperations = { kind: spaceKind.id };
  const decoration: SpaceDecoration = { kindOperations };
  if (node.data.contentAction !== 'author-space-view') return decoration;
  const resourceBelongsToWorkingSpace = context.editableResourceIds.has(node.data.resourceId);
  const selection = context.spaceSelections.get(node.data.resourceId);
  const target =
    selection !== undefined ? context.spaceResourceTargets.get(selection.spaceId) : undefined;
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
      selection !== undefined
    ) {
      const entry = context.spaces.entry(selection.spaceId);
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
      selection,
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

/** The Space kind's canvas decoration, from its own part of the context. */
export const spaceDecoration: KindCanvasDecoration<SpaceKindId, SpaceResourceDecorationContext> = {
  kind: spaceKind.id,
  slice: ({
    authorOnCanvas,
    editableResourceIds,
    continuation,
    containingSpaceId,
    spaceSelections,
    spaceResourceTargets,
    spaces,
    commandOutcomes,
    deleteConfirmation,
    completeSpaceResourceSelection,
    portalEditing,
    onPortalEditingChange,
    contextNotices,
    onContextEditingChange,
    onContextReport,
  }) => ({
    authorOnCanvas,
    editableResourceIds,
    continuation,
    containingSpaceId,
    spaceSelections,
    spaceResourceTargets,
    spaces,
    commandOutcomes,
    deleteConfirmation,
    completeSpaceResourceSelection,
    portalEditing,
    onPortalEditingChange,
    contextNotices,
    onContextEditingChange,
    onContextReport,
  }),
  decorate: decorateSpaceResourceNode,
};

export type SpaceCreationContext = Pick<
  ResourcePlacementCommands,
  'createSpaceResource' | 'creatingSpaceResource'
>;

/**
 * Create Space Resource: one press, one Resource, one new Space (ADR 0074).
 * Its coordinated Edit lands one await after the press, so it is withheld
 * for that window rather than swallowing a second press silently.
 */
export const spaceCreation: KindCreation<SpaceCreationContext> = {
  withheld: ({ creatingSpaceResource }) => creatingSpaceResource,
  create: ({ createSpaceResource }) => createSpaceResource(),
};
