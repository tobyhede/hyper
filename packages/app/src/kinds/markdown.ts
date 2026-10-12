import { markdownKind, type MarkdownKindId } from '@project/core';
import type { KindOperationsOf, ResourceFlowNodeOf } from '@project/react-flow-adapter';
import { beginEditing } from '@project/ui';
import type {
  CanvasResourceDecorationContext,
  KindDecoration,
  Mutable,
} from '../canvas-resource-decoration';

/** The Markdown kind's operations and decoration, built by assigning what a gate allows. */
type MarkdownOperations = Mutable<KindOperationsOf<MarkdownKindId>>;
type MarkdownDecoration = Mutable<KindDecoration<MarkdownKindId>>;

export type MarkdownResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  | 'authorOnCanvas'
  | 'bodyEditing'
  | 'editableResourceIds'
  | 'beginBodyEditing'
  | 'bodyEditorResourceId'
  | 'completeResourceBody'
  | 'clearCaret'
>;

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
    node.data.contentAction === 'edit-markdown'
  ) {
    kindOperations.onBeginEdit = () => context.beginBodyEditing(node);
  }
  if (
    resourceBelongsToWorkingSpace &&
    node.data.contentAction === 'edit-markdown' &&
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
