import {
  COLLAPSED_RESOURCE_SIZE,
  SPACE_RESOURCE_MIN_OPEN_SIZE,
  DEFAULT_OPEN_SIZE,
  DEFAULT_SPACE_RESOURCE_OPEN_SIZE,
  IMAGE_FIRST_OPEN_BOUND,
  OPEN_RESOURCE_CHROME,
} from './resource-geometry';
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
 * What a Resource's content is. `''` is a genuinely empty body; `ur` is no
 * content at all, which is what an Ur Resource has (ADR 0113). `unresolved`
 * answers only states intake refuses: a Reference Resource whose Target is
 * missing or is itself a Reference Resource.
 */
export type ResourceContent =
  | { readonly kind: 'markdown'; readonly source: string; readonly via: ContentVia }
  | {
      readonly kind: 'image';
      readonly url: string;
      readonly naturalSize: Extract<Resource, { kind: 'image' }>['naturalSize'];
      readonly via: ContentVia;
    }
  | { readonly kind: 'space'; readonly view: SpaceView; readonly via: ContentVia }
  | { readonly kind: 'ur'; readonly via: ContentVia }
  | { readonly kind: 'unresolved'; readonly via: 'reference' };

export type ContentAction = 'none' | 'edit-markdown' | 'replace-image' | 'author-space-view';

type Extent = { readonly width: number; readonly height: number };

interface ContentFacts {
  readonly action: ContentAction;
  readonly firstOpenSize: (content: ResourceContent) => Extent;
  readonly floor: Extent;
  readonly embedsMap: boolean;
  readonly drawsContentArea: boolean;
}

function imageOpenSize(content: ResourceContent): Extent {
  if (content.kind !== 'image' || content.naturalSize === undefined) return DEFAULT_OPEN_SIZE;
  const natural = content.naturalSize;
  const scale = Math.min(
    1,
    IMAGE_FIRST_OPEN_BOUND.width / natural.width,
    IMAGE_FIRST_OPEN_BOUND.height / natural.height,
  );
  const fitted = (axis: keyof Extent): number =>
    Math.max(
      COLLAPSED_RESOURCE_SIZE[axis],
      Math.round(natural[axis] * scale) + OPEN_RESOURCE_CHROME[axis],
    );
  return { width: fitted('width'), height: fitted('height') };
}

const CONTENT_FACTS = {
  markdown: {
    firstOpenSize: () => DEFAULT_OPEN_SIZE,
    action: 'edit-markdown',
    floor: COLLAPSED_RESOURCE_SIZE,
    embedsMap: false,
    drawsContentArea: true,
  },
  image: {
    firstOpenSize: imageOpenSize,
    action: 'replace-image',
    floor: COLLAPSED_RESOURCE_SIZE,
    embedsMap: false,
    drawsContentArea: true,
  },
  space: {
    firstOpenSize: () => DEFAULT_SPACE_RESOURCE_OPEN_SIZE,
    action: 'author-space-view',
    floor: SPACE_RESOURCE_MIN_OPEN_SIZE,
    embedsMap: true,
    drawsContentArea: false,
  },
  ur: {
    firstOpenSize: () => DEFAULT_OPEN_SIZE,
    action: 'none',
    floor: COLLAPSED_RESOURCE_SIZE,
    embedsMap: false,
    drawsContentArea: false,
  },
  unresolved: {
    firstOpenSize: () => DEFAULT_OPEN_SIZE,
    action: 'none',
    floor: COLLAPSED_RESOURCE_SIZE,
    embedsMap: false,
    drawsContentArea: false,
  },
} satisfies Record<ResourceContent['kind'], ContentFacts>;

/** The operation an author may perform on this content. */
export function contentAction(content: ResourceContent): ContentAction {
  return content.via === 'reference' ? 'none' : CONTENT_FACTS[content.kind].action;
}

/** The ordinary resize floor when the Close magnet does not apply. */
export function openSizeFloor(content: ResourceContent): Extent {
  return CONTENT_FACTS[content.kind].floor;
}

/** Whether this content draws a Map inside its Resource. */
export function embedsMap(content: ResourceContent): boolean {
  return CONTENT_FACTS[content.kind].embedsMap;
}

/** Whether the Open front reserves an area above its Title for content. */
export function drawsContentArea(content: ResourceContent): boolean {
  return CONTENT_FACTS[content.kind].drawsContentArea;
}

/** The first Open Size, before a Map has recorded a remembered size. */
export function firstOpenSize(content: ResourceContent): Extent {
  return CONTENT_FACTS[content.kind].firstOpenSize(content);
}
