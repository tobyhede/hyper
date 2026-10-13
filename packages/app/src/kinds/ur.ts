import { urKind, type ResourceId, type ResourceShape, type UrKindId } from '@project/core';
import type { KindOperationsOf, ResourceFlowNodeOf } from '@project/react-flow-adapter';
import type {
  CanvasResourceDecorationContext,
  KindDecoration,
  Mutable,
} from '../canvas-resource-decoration';
import type { KindCreation } from '../kind-creation';
import type { ResourcePlacementCommands } from '../resource-placement';

/** The Ur kind's operations, built by assigning what a gate allows. */
type UrOperations = Mutable<KindOperationsOf<UrKindId>>;

export type UrResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  'authorOnCanvas' | 'editableResourceIds'
> & {
  /**
   * Draw an Ur Resource in another Shape on this Map, reporting a refusal.
   * Absent where this canvas has no command outcomes to report one through.
   */
  readonly changeResourceShape?:
    ((resourceId: ResourceId, resourceShape: ResourceShape) => void) | undefined;
};

/** An Ur Resource's Shape choice, offered Open and Closed alike (ADR 0121). */
export function decorateUrResourceNode(
  node: ResourceFlowNodeOf<UrKindId>,
  context: UrResourceDecorationContext,
): KindDecoration<UrKindId> {
  const kindOperations: UrOperations = { kind: urKind.id };
  const changeResourceShape = context.changeResourceShape;
  if (
    context.editableResourceIds.has(node.data.resourceId) &&
    context.authorOnCanvas &&
    changeResourceShape !== undefined
  ) {
    kindOperations.onResourceShapeChange = (resourceShape) =>
      changeResourceShape(node.data.resourceId, resourceShape);
  }
  return { kindOperations };
}

export type UrCreationContext = Pick<ResourcePlacementCommands, 'createResource'>;

/** Create Ur Resource: one press, a Title and nothing else, continuing in its Title (ADR 0113). */
export const urCreation: KindCreation<UrCreationContext> = {
  create: ({ createResource }) => createResource(urKind.id),
};
