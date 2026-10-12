import type { ReactNode } from 'react';
import {
  imageKind,
  markdownKind,
  referenceKind,
  spaceKind,
  urKind,
  type KindId,
  type ReferenceContentUnresolved,
  type ResourceContent,
} from '@project/core';
import { imageView, type ImageOperations } from './image';
import type { CanvasArea, KindView } from './kind-view';
import { markdownView, type MarkdownOperations } from './markdown';
import { referenceView, type ReferenceOperations } from './reference';
import { spaceView, type SpaceOperations } from './space';
import { urView, type UrOperations } from './ur';

/** What each kind offers beyond its shared Title, by its id. */
export interface KindOperationsByKind {
  [markdownKind.id]: MarkdownOperations;
  [referenceKind.id]: ReferenceOperations;
  [imageKind.id]: ImageOperations;
  [urKind.id]: UrOperations;
  [spaceKind.id]: SpaceOperations;
}

/**
 * What a Resource's kind offers beyond its shared Title (ADR 0051): a kind-owned
 * choice of operations, not a kind tag plus an optional field every other kind
 * ignores. Opening and Closing are every Resource's and are not here; what it
 * draws, and whether it is Open, is the display's.
 */
export type KindOperations = KindOperationsByKind[KindId];

/** Each kind's own resolved content, by its id; a kind that shows another's has none. */
type OwnContentByKind = { [K in KindId]: Extract<ResourceContent, { readonly kind: K }> };

/** Each kind's view half, typed so a surface over a kinded value calls its own kind's view. */
type KindViews = {
  readonly [K in KindId]: KindView<KindOperationsByKind[K], OwnContentByKind[K]>;
};

/**
 * The kinds' view halves: the one place in this package each kind is named
 * (ADR 0128). The Resources list offers its filters in this order.
 */
const KIND_VIEWS: KindViews = {
  [markdownKind.id]: markdownView,
  [imageKind.id]: imageView,
  [urKind.id]: urView,
  [referenceKind.id]: referenceView,
  [spaceKind.id]: spaceView,
};

/** Every kind with a view half, in the order the Resources list offers them. */
export const VIEW_KIND_IDS: readonly KindId[] = Object.values(KIND_VIEWS).map(
  (view) => view.bareOperations.kind,
);

/** What a kind's Resources are called and drawn as. */
export type KindNaming = Pick<KindView<unknown>, 'name' | 'listName' | 'referenceName' | 'Glyph'>;

/** What a kind's Resources are called and drawn as, from its view half. */
export const kindNaming = (kind: KindId): KindNaming => KIND_VIEWS[kind];

/** What a Resource of this kind offers before the composition offers anything. */
export const bareOperations = <K extends KindId>(kind: K): KindOperationsByKind[K] =>
  KIND_VIEWS[kind].bareOperations;

const presentedOf = <K extends KindId>(
  name: string,
  kind: K,
  content: OwnContentByKind[K],
): ReactNode => KIND_VIEWS[kind].presented?.(name, content) ?? null;

/** What a presented Resource draws below its name, as its content's kind draws it. */
export const presentedContent = (
  name: string,
  content: Exclude<ResourceContent, ReferenceContentUnresolved>,
): ReactNode => presentedOf(name, content.kind, content);

const canvasOf = <K extends KindId>(
  kind: K,
  content: OwnContentByKind[K],
  area: CanvasArea,
): ReactNode => KIND_VIEWS[kind].canvas?.(content, area) ?? null;

/** What an Open Resource draws in its content area on a Map, as its content's kind draws it. */
export const canvasContent = (
  content: Exclude<ResourceContent, ReferenceContentUnresolved>,
  area: CanvasArea,
): ReactNode => canvasOf(content.kind, content, area);
