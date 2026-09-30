import type { Resource } from './types';

/** Whether content is the Resource's own or reached through a Reference Resource (ADR 0070). */
export type ContentVia = 'self' | 'reference';

type SpaceResource = Extract<Resource, { kind: 'space' }>;

/**
 * What an Open Space Resource shows: its Space, Map, Graph and framing. It is
 * not the Resource, because the front names nothing outside itself (ADR 0083).
 * `framing` is a required key that may hold `undefined`, so a value is built
 * whole rather than by a conditional spread.
 */
export interface SpaceView {
  readonly spaceId: SpaceResource['spaceId'];
  readonly map: SpaceResource['map'];
  readonly graph: SpaceResource['graph'];
  readonly framing: SpaceResource['framing'] | undefined;
}

/**
 * What a Resource's content is. `''` is a genuinely empty body. `unresolved`
 * answers only states intake refuses: a Reference Resource whose Target is
 * missing or is itself a Reference Resource.
 */
export type ResourceContent =
  | { readonly kind: 'markdown'; readonly source: string; readonly via: ContentVia }
  | { readonly kind: 'image'; readonly url: string; readonly via: ContentVia }
  | { readonly kind: 'space'; readonly view: SpaceView; readonly via: ContentVia }
  | { readonly kind: 'unresolved'; readonly via: 'reference' };
