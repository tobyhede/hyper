import type { ReferenceKindId } from './kinds/reference';
import { contentFacts, type ResourceContent } from './kinds/registry';

export type { ResourceContent } from './kinds/registry';

/** Whether content is the Resource's own or reached through a Reference Resource (ADR 0070). */
export type ContentVia = 'self' | ReferenceKindId;

/** No content: what a Reference Resource shows when its Target is missing or is itself a Reference. */
export interface ReferenceContentUnresolved {
  readonly kind: 'unresolved';
  readonly via: ReferenceKindId;
}

/** What a kind's content lets an author do and how it is laid out (ADR 0114). */
export interface ContentFacts {
  /**
   * Whether an author changes the content itself, the Resource's own: in its
   * content area through the content caret, or, for content that embeds a Map,
   * in that Map. What the command is called and drawn as is the kind's view half's.
   */
  readonly authored: boolean;
  readonly embedsMap: boolean;
  readonly drawsContentArea: boolean;
}

/** Whether an author may change this content here: the Resource's own, of a kind whose content is authored. */
export function authorsContent(content: ResourceContent): boolean {
  return content.via === 'self' && contentFacts(content).authored;
}

/** Whether this content draws a Map inside its Resource. */
export function embedsMap(content: ResourceContent): boolean {
  return contentFacts(content).embedsMap;
}

/** Whether an Open Resource reserves an area above its Title for content. */
export function drawsContentArea(content: ResourceContent): boolean {
  return contentFacts(content).drawsContentArea;
}
