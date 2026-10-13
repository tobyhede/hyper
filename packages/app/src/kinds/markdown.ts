import { markdownKind, type MarkdownKindId, type ResourceId } from '@project/core';
import type { ResourceFlowNodeOf } from '@project/react-flow-adapter';
import { beginEditing, type KindOperationsByKind } from '@project/ui';
import type {
  CanvasResourceDecorationContext,
  KindCanvasDecoration,
  KindDecoration,
  Mutable,
} from '../canvas-resource-decoration';
import type { KindCreation } from '../kind-creation';
import type { ResourcePlacementCommands } from '../resource-placement';

/** The Markdown kind's operations and decoration, built by assigning what a gate allows. */
type MarkdownOperations = Mutable<KindOperationsByKind[MarkdownKindId]>;
type MarkdownDecoration = Mutable<KindDecoration<MarkdownKindId>>;

export type MarkdownResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  | 'authorOnCanvas'
  | 'bodyEditing'
  | 'editableResourceIds'
  | 'beginBodyEditing'
  | 'bodyEditorResourceId'
  | 'clearCaret'
> & {
  readonly completeResourceBody: (resourceId: ResourceId, body: string) => 'completed' | 'retained';
};

export function decorateMarkdownResourceNode(
  node: ResourceFlowNodeOf<MarkdownKindId>,
  context: MarkdownResourceDecorationContext,
): KindDecoration<MarkdownKindId> {
  const kindOperations: MarkdownOperations = { kind: markdownKind.id };
  const decoration: MarkdownDecoration = { kindOperations };
  const resourceBelongsToWorkingSpace = context.editableResourceIds.has(node.data.resourceId);
  if (
    resourceBelongsToWorkingSpace &&
    context.authorOnCanvas &&
    !context.bodyEditing &&
    node.data.authorsContent
  ) {
    kindOperations.onBeginEdit = () => context.beginBodyEditing(node);
  }
  if (
    resourceBelongsToWorkingSpace &&
    node.data.authorsContent &&
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
    if (display !== node.data.display) decoration.display = display;
  }
  return decoration;
}

/** The Markdown kind's canvas decoration, from its own part of the context. */
export const markdownDecoration: KindCanvasDecoration<
  MarkdownKindId,
  MarkdownResourceDecorationContext
> = {
  kind: markdownKind.id,
  slice: ({
    authorOnCanvas,
    bodyEditing,
    editableResourceIds,
    beginBodyEditing,
    bodyEditorResourceId,
    completeResourceBody,
    clearCaret,
  }) => ({
    authorOnCanvas,
    bodyEditing,
    editableResourceIds,
    beginBodyEditing,
    bodyEditorResourceId,
    completeResourceBody,
    clearCaret,
  }),
  decorate: decorateMarkdownResourceNode,
};

export type MarkdownCreationContext = Pick<ResourcePlacementCommands, 'createResource'>;

/** Create Markdown Resource: one press, an empty body, continuing in its Title. */
export const markdownCreation: KindCreation<MarkdownCreationContext> = {
  create: ({ createResource }) => createResource(markdownKind.id),
};
