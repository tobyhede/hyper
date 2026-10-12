import { imageKind } from '@project/core';

/**
 * The view half of the Image kind (ADR 0106, ADR 0128): what an Image Resource
 * is called, and the one operation it offers beyond the shared Title. Its
 * content view is `ResourceImage`, and its content action is Replace.
 */
export const imageView = {
  name: 'Image Resource',
  referenceName: 'Reference to an Image Resource',
} as const;

/** What an Image Resource offers beyond its Title. */
export interface ImageOperations {
  readonly kind: typeof imageKind.id;
  /** Begin replacing the image: the image kind's counterpart to a Markdown edit. */
  readonly onBeginEdit?: () => void;
}

/** Whether these operations are an Image Resource's. */
export const isImageOperations = (operations: {
  readonly kind: string;
}): operations is ImageOperations => operations.kind === imageKind.id;
