import { imageKind, type ImageKindId, type ResourceId } from '@project/core';
import type { KindOperationsOf, ResourceFlowNodeOf } from '@project/react-flow-adapter';
import { beginReplacing, type ImageReplacement } from '@project/ui';
import type {
  CanvasResourceDecorationContext,
  KindDecoration,
  Mutable,
} from '../canvas-resource-decoration';
import type { KindCreation } from '../kind-creation';
import type { ResourcePlacementCommands } from '../resource-placement';

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
  | 'clearCaret'
> & {
  /**
   * Replace an Image Resource's image, answering the sentence for a refusal or
   * `null` once the replacement is over.
   */
  readonly replaceResourceImage: (
    resourceId: ResourceId,
    replacement: ImageReplacement,
  ) => Promise<string | null>;
  /** Open the file picker for a replacement, within the press that asked for it. */
  readonly pickImageFiles: () => Promise<readonly File[]>;
};

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
      pick: context.pickImageFiles,
      onReplace: (replacement: ImageReplacement) => replace(resourceId, replacement),
      onEnd: () => context.clearCaret(),
    };
    const display = beginReplacing(node.data.display, replacer);
    if (display !== node.data.display) decoration.display = display;
  }
  return decoration;
}

export type ImageCreationContext = Pick<ResourcePlacementCommands, 'createImagesFromFiles'> & {
  /** Open the browser's file picker for images, within the press that asked for it. */
  readonly pickImages: () => Promise<readonly File[]>;
};

/**
 * Create Image Resource: the press opens the browser's file picker, and the
 * files chosen there are created at the visible centre; a cancelled picker
 * creates nothing (ADR 0106).
 */
export const imageCreation: KindCreation<ImageCreationContext> = {
  create: async ({ pickImages }, later) => {
    // Opened before any `await`: a browser opens a picker only within the press.
    const files = await pickImages();
    // Placed by the Dock as it stands when the picker answers, not as it was
    // pressed, and not at all once Create is withheld.
    later()?.createImagesFromFiles(files);
  },
};
