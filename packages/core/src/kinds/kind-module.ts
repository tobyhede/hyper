import type { z } from 'zod';
import type { ContentFacts, ContentVia } from '../resource-content';
import type { UUID } from '../types';

/**
 * What a kind says about the rules every Resource meets, so that no rule names
 * a kind (ADR 0128). The core reads these; a module sets them.
 */
export interface KindFlags {
  /** Whether a Resource of this kind takes a Shape other than the rectangle (ADR 0121). */
  readonly takesResourceShape: boolean;
  /** Whether a Resource of this kind may be Open (ADR 0122). */
  readonly canOpen: boolean;
  /** Whether another Resource may reference one of this kind as its Target, which keeps referencing a single hop (ADR 0113). */
  readonly mayBeTarget: boolean;
}

/**
 * The domain half of a Resource kind (ADR 0120, ADR 0128): its id, the schema
 * its `content` is parsed by and the rules it declares. The view half is the
 * application's.
 */
export interface KindModule<K extends string, Content> {
  readonly id: K;
  readonly contentSchema: z.ZodType<Content, z.ZodTypeDef, unknown>;
  readonly flags: KindFlags;
}

/** A kind whose Resources own the content they show: the facts about it and how it resolves. */
export interface ContentOwnerKindModule<K extends string, Content, Resolved> extends KindModule<
  K,
  Content
> {
  readonly facts: ContentFacts;
  /** What this kind's content resolves to, reached `via` its own Resource or a Reference. */
  readonly resolveContent: (content: Content, via: ContentVia) => Resolved;
}

/**
 * A kind whose Resources show another Resource's content: the Resources its
 * content references, which intake resolves, and the one whose content it shows.
 */
export interface TargetingKindModule<K extends string, Content> extends KindModule<K, Content> {
  readonly resourceReferences: (content: Content) => readonly UUID[];
  readonly contentTarget: (content: Content) => UUID;
}
