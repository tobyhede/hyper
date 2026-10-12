import { imageKind, type ImageKindId } from '@project/core';
import type { KindOperationsOf, ResourceFlowNodeOf } from '@project/react-flow-adapter';
import { beginReplacing, type ImageReplacement } from '@project/ui';
import type {
  CanvasResourceDecorationContext,
  KindDecoration,
  Mutable,
} from '../canvas-resource-decoration';

/** The Image kind's operations and decoration, built by assigning what a gate allows. */
type ImageOperations = Mutable<KindOperationsOf<ImageKindId>>;
type ImageDecoration = Mutable<KindDecoration<ImageKindId>>;

export type ImageResourceDecorationContext = Pick<
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

/**
 * An Image Resource's Replace, which takes the place a Markdown Resource's body
 * edit takes, through the same caret (ADR 0064): beginning it, and the running
 * replacement while the caret is on it.
 */
export function decorateImageResourceNode(
  node: ResourceFlowNodeOf<ImageKindId>,
  context: ImageResourceDecorationContext,
): KindDecoration<ImageKindId> {
  const replace = context.replaceResourceImage;
  const kindOperations: ImageOperations = { kind: imageKind.id };
  const decoration: ImageDecoration = { kindOperations };
  if (node.data.contentAction !== 'replace-image') return decoration;
  const resourceBelongsToWorkingSpace = context.editableResourceIds.has(node.data.resourceId);
  if (resourceBelongsToWorkingSpace && context.authorOnCanvas && !context.bodyEditing) {
    kindOperations.onBeginEdit = () => context.beginBodyEditing(node);
  }
  if (resourceBelongsToWorkingSpace && context.bodyEditorResourceId === node.id) {
    const resourceId = node.data.resourceId;
    const replacer = {
      accept: context.imageAccept,
      onReplace: (replacement: ImageReplacement) => replace(resourceId, replacement),
      onEnd: () => context.clearCaret(),
    };
    const display = beginReplacing(node.data.display, replacer);
    if (display !== node.data.display) decoration.display = display;
  }
  return decoration;
}
