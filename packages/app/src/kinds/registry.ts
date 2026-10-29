import { useState, type ReactNode } from 'react';
import {
  imageKind,
  KIND_IDS,
  markdownKind,
  referenceKind,
  spaceKind,
  urKind,
  type KindId,
  type ResourceContent,
} from '@project/core';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import {
  kindDecorationMemo,
  kindDecorator,
  type AgreeingAllOf,
  type KindDecorator,
} from '../canvas-resource-decoration';
import type { KindCreation } from '../kind-creation';
import { imageCreation, imageDecoration, type ImageCreationContext } from './image';
import { markdownCreation, markdownDecoration, type MarkdownCreationContext } from './markdown';
import {
  spaceCreation,
  spaceDecoration,
  spacePresentation,
  type SpaceCreationContext,
} from './space';
import { urCreation, urDecoration, type UrCreationContext } from './ur';

/** What every kind's Create reads, together. */
export type KindCreationContext = MarkdownCreationContext &
  SpaceCreationContext &
  ImageCreationContext &
  UrCreationContext;

/**
 * How each kind is created from the Command Dock, or `null` for a kind it does
 * not create. A Reference Resource is always created *from* the Resource it
 * points at, which supplies the Target (ADR 0089), so its Create is a row in
 * that Resource's own command menu.
 */
const CREATIONS = {
  [markdownKind.id]: markdownCreation,
  [spaceKind.id]: spaceCreation,
  [imageKind.id]: imageCreation,
  [urKind.id]: urCreation,
  [referenceKind.id]: null,
} satisfies Readonly<Record<KindId, KindCreation<KindCreationContext> | null>>;

/** Every kind the Command Dock creates, with its Create, in registry order. */
export const KIND_CREATIONS: readonly (readonly [KindId, KindCreation<KindCreationContext>])[] =
  KIND_IDS.flatMap((kind): (readonly [KindId, KindCreation<KindCreationContext>])[] => {
    const creation = CREATIONS[kind];
    return creation === null ? [] : [[kind, creation]];
  });

/**
 * How each kind decorates its Resources on the canvas, or `null` for a kind
 * whose Resources take only the shared decoration. A Reference Resource offers
 * nothing of its own: its Target's content is shown read-only (ADR 0070).
 */
const DECORATIONS = {
  [markdownKind.id]: kindDecorator(markdownDecoration),
  [imageKind.id]: kindDecorator(imageDecoration),
  [urKind.id]: kindDecorator(urDecoration),
  [spaceKind.id]: kindDecorator(spaceDecoration),
  [referenceKind.id]: null,
} satisfies Readonly<Record<KindId, KindDecorator<never> | null>>;

/** The context one kind's decoration reads. */
type ContextOf<Decorator> = Decorator extends KindDecorator<infer Context> ? Context : never;

/**
 * What every kind's canvas decoration reads, together. Two kinds that read a
 * field of one name with different types fail to compile where it is supplied.
 */
export type KindDecorationContext = AgreeingAllOf<ContextOf<(typeof DECORATIONS)[KindId]>>;

/** Every kind's decoration, in registry order. */
const KIND_DECORATORS: readonly KindDecorator<KindDecorationContext>[] = KIND_IDS.flatMap(
  (kind): KindDecorator<KindDecorationContext>[] => {
    const decorator = DECORATIONS[kind];
    return decorator === null ? [] : [decorator];
  },
);

/**
 * Every Resource node with its kind's operations: the app half of each kind,
 * and the one place in the application each kind's canvas decoration is named
 * (ADR 0128). Each kind's nodes are decorated from that kind's own part of the
 * context, so a change that only one kind reads keeps every other kind's
 * nodes, and their identities, as they were.
 */
export function useKindDecoratedNodes(
  nodes: readonly ResourceFlowNode[],
  context: KindDecorationContext,
): ResourceFlowNode[] {
  const [decorate] = useState(() => kindDecorationMemo(KIND_DECORATORS));
  return decorate(nodes, context);
}

/**
 * What the Stage draws in place of a content's own view, for the one kind
 * whose presented content needs the application: a Space Resource's Map.
 * Every other kind's presented content is its view half's, so this answers
 * `undefined` for it.
 */
export const presentedByApplication = (content: ResourceContent): ReactNode =>
  content.kind === spaceKind.id ? spacePresentation(content) : undefined;
