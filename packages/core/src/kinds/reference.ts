/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import { uuidSchema } from '../uuid';
import type { TargetingKindModule } from './kind-module';

/** A Reference Resource's content: a pointer to the resource whose content it shows. */
export const referenceResourceContentSchema = z.object({
  /** The id of the resource this reference shows. Intake resolves it from `resourceReferences`. */
  target: uuidSchema,
});

/**
 * The Reference kind (ADR 0070): a Resource that shows its Target's content
 * read-only. Its one Resource reference is its Target, and it may not itself
 * be a Target, so referencing is a single hop (ADR 0113).
 */
export const referenceKind = {
  id: 'reference',
  contentSchema: referenceResourceContentSchema,
  flags: {
    takesResourceShape: false,
    canOpen: true,
    mayBeTarget: false,
    ownsReferencedSpaces: false,
  },
  resourceReferences: (content) => [content.target],
  contentTarget: (content) => content.target,
} as const satisfies TargetingKindModule<
  'reference',
  z.infer<typeof referenceResourceContentSchema>
>;

/** The Reference kind's id. */
export type ReferenceKindId = typeof referenceKind.id;
