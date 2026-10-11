import { z } from 'zod';
import type { ContentVia } from '../resource-content';
import type { ContentOwnerKindModule } from './kind-module';

/** What an Ur Resource's content resolves to: nothing, reached one way or the other. */
export interface UrContent {
  readonly kind: 'ur';
  readonly via: ContentVia;
}

/** An Ur Resource's content, which is nothing (ADR 0113). */
const urContentSchema = z.object({});

/**
 * The Ur kind (ADR 0113): a Resource with no content, the one every capability
 * belongs to. It is the only kind that takes a Shape (ADR 0121) and it is never
 * Open, having nothing to show (ADR 0122).
 */
export const urKind = {
  id: 'ur',
  contentSchema: urContentSchema,
  flags: { takesResourceShape: true, canOpen: false, mayBeTarget: true },
  facts: { action: 'none', embedsMap: false, drawsContentArea: false },
  resolveContent: (_content, via) => ({ kind: 'ur', via }),
} as const satisfies ContentOwnerKindModule<'ur', z.infer<typeof urContentSchema>, UrContent>;

/** The Ur kind's id. */
export type UrKindId = typeof urKind.id;
