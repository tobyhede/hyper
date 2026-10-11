import type { z } from 'zod';
import type { ContentFacts, ContentVia } from '../resource-content';

/**
 * What a kind says about the rules every Resource meets, so that no rule names
 * a kind (ADR 0128). The core reads these; a module sets them.
 */
export interface KindFlags {
  /** Whether a Resource of this kind takes a Shape other than the rectangle (ADR 0121). */
  readonly takesResourceShape: boolean;
  /** Whether a Resource of this kind may be Open (ADR 0122). */
  readonly canOpen: boolean;
}

/**
 * The domain half of a Resource kind (ADR 0120, ADR 0128): its id, the schema
 * its `content` is parsed by, the rules it declares, the facts about its
 * content and how that content resolves. The view half is the application's.
 */
export interface KindModule<K extends string, Content, Resolved> {
  readonly id: K;
  readonly contentSchema: z.ZodType<Content>;
  readonly flags: KindFlags;
  readonly facts: ContentFacts;
  /** What this kind's content resolves to, reached `via` its own Resource or a Reference. */
  readonly resolveContent: (content: Content, via: ContentVia) => Resolved;
}
