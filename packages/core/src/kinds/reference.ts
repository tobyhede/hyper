/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import { uuidSchema } from '../uuid';
import { defineKind } from './kind-module';

/** A Reference Resource's content: a pointer to the resource whose content it shows. */
export const referenceResourceContentSchema = z
  .object({
    /** The id of the resource this reference shows, which it declares as its one Resource reference. */
    target: uuidSchema,
  })
  .strict();

const REFERENCE_KIND_ID = 'reference';

/** The Reference kind's id. */
export type ReferenceKindId = typeof REFERENCE_KIND_ID;

/**
 * The Reference kind (ADR 0070): a Resource that shows its Target's content
 * read-only. Its one Resource reference is its Target, and it may not itself
 * be a Target, so referencing is a single hop (ADR 0113).
 */
export const referenceKind = defineKind({
  id: REFERENCE_KIND_ID,
  contentSchema: referenceResourceContentSchema,
  flags: {
    takesResourceShape: false,
    canOpen: true,
    mayBeTarget: false,
    ownsReferencedSpaces: false,
  },
  /** A Reference reached as a Target shows nothing: intake refuses a Reference to a Reference. */
  resolveContent: (): { readonly kind: 'unresolved' } => ({ kind: 'unresolved' }),
  resourceReferences: (content) => [content.target],
  contentTarget: (content) => content.target,
});
