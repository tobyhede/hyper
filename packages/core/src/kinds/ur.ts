/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import { defineKind } from './kind-module';

/** The Ur kind's id, declared before its module because the content it resolves to names it. */
const UR_KIND_ID = 'ur';

/** What an Ur Resource's content resolves to: nothing but its kind. */
export interface UrContent {
  readonly kind: typeof UR_KIND_ID;
}

/** An Ur Resource's content, which is nothing (ADR 0113). */
export const urResourceContentSchema = z.object({}).strict();

/**
 * The Ur kind (ADR 0113): a Resource with no content, the one every capability
 * belongs to. It is the only kind that takes a Shape (ADR 0121) and it is never
 * Open, having nothing to show (ADR 0122).
 */
export const urKind = defineKind({
  id: UR_KIND_ID,
  contentSchema: urResourceContentSchema,
  flags: {
    takesResourceShape: true,
    canOpen: false,
    opensToFit: false,
    mayBeTarget: true,
    ownsReferencedSpaces: false,
  },
  facts: { authored: false, embedsMap: false, drawsContentArea: false },
  resolveContent: (): UrContent => ({ kind: UR_KIND_ID }),
  newContent: {},
});

/** The Ur kind's id. */
export type UrKindId = typeof urKind.id;
