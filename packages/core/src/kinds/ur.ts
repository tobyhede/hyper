/* v8 ignore next -- V8 attributes ESM module initialization to this import as a function. */
import { z } from 'zod';
import type { ContentVia } from '../resource-content';
import { defineKind } from './kind-module';

/** What an Ur Resource's content resolves to: nothing, reached one way or the other. */
export interface UrContent {
  readonly kind: 'ur';
  readonly via: ContentVia;
}

/** An Ur Resource's content, which is nothing (ADR 0113). */
export const urResourceContentSchema = z.object({}).strict();

/**
 * The Ur kind (ADR 0113): a Resource with no content, the one every capability
 * belongs to. It is the only kind that takes a Shape (ADR 0121) and it is never
 * Open, having nothing to show (ADR 0122).
 */
export const urKind = defineKind({
  id: 'ur',
  contentSchema: urResourceContentSchema,
  flags: {
    takesResourceShape: true,
    canOpen: false,
    mayBeTarget: true,
    ownsReferencedSpaces: false,
  },
  facts: { action: 'none', embedsMap: false, drawsContentArea: false },
  resolveContent: (_content, via): UrContent => ({ kind: 'ur', via }),
  newContent: {},
});

/** The Ur kind's id. */
export type UrKindId = typeof urKind.id;
