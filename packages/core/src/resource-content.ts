import type { ImageContent } from './kinds/image';
import type { MarkdownContent } from './kinds/markdown';
import type { ReferenceKindId } from './kinds/reference';
import { contentFacts } from './kinds/registry';
import type { SpaceContent } from './kinds/space';
import type { UrContent } from './kinds/ur';

/** Whether content is the Resource's own or reached through a Reference Resource (ADR 0070). */
export type ContentVia = 'self' | ReferenceKindId;

/**
 * What a Resource's content is. `''` is a genuinely empty body; `ur` is no
 * content at all, which is what an Ur Resource has (ADR 0113). `unresolved`
 * answers only states intake refuses: a Reference Resource whose Target is
 * missing or is itself a Reference Resource.
 */
export type ResourceContent =
  MarkdownContent | ImageContent | SpaceContent | UrContent | ReferenceContentUnresolved;

/** No content: what a Reference Resource shows when its Target is missing or is itself a Reference. */
export interface ReferenceContentUnresolved {
  readonly kind: 'unresolved';
  readonly via: ReferenceKindId;
}

export type ContentAction = 'none' | 'edit-markdown' | 'replace-image' | 'author-space-view';

/** What a kind's content lets an author do and how it is laid out (ADR 0114). */
export interface ContentFacts {
  readonly action: ContentAction;
  readonly embedsMap: boolean;
  readonly drawsContentArea: boolean;
}

/** The operation an author may perform on this content. */
export function contentAction(content: ResourceContent): ContentAction {
  return content.via !== 'self' ? 'none' : contentFacts(content).action;
}

/** Whether this content draws a Map inside its Resource. */
export function embedsMap(content: ResourceContent): boolean {
  return contentFacts(content).embedsMap;
}

/** Whether an Open Resource reserves an area above its Title for content. */
export function drawsContentArea(content: ResourceContent): boolean {
  return contentFacts(content).drawsContentArea;
}
