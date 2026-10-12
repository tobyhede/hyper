import { useMemo } from 'react';
import {
  imageKind,
  KIND_IDS,
  markdownKind,
  referenceKind,
  spaceKind,
  urKind,
  type KindId,
} from '@project/core';
import {
  isResourceNodeOf,
  type ResourceFlowNode,
  type ResourceFlowNodeOf,
} from '@project/react-flow-adapter';
import { applyKindDecoration, type KindDecoration } from '../canvas-resource-decoration';
import type { KindCreation } from '../kind-creation';
import {
  decorateImageResourceNode,
  imageCreation,
  type ImageCreationContext,
  type ImageResourceDecorationContext,
} from './image';
import {
  decorateMarkdownResourceNode,
  markdownCreation,
  type MarkdownCreationContext,
  type MarkdownResourceDecorationContext,
} from './markdown';
import {
  decorateSpaceResourceNode,
  spaceCreation,
  type SpaceCreationContext,
  type SpaceResourceDecorationContext,
} from './space';
import {
  decorateUrResourceNode,
  urCreation,
  type UrCreationContext,
  type UrResourceDecorationContext,
} from './ur';

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

/** What every kind's canvas decoration reads, together. */
export type KindDecorationContext = MarkdownResourceDecorationContext &
  ImageResourceDecorationContext &
  UrResourceDecorationContext &
  SpaceResourceDecorationContext;

/** Each node of one kind decorated from that kind's own context, by node id. */
const useDecoratedOfKind = <K extends ResourceFlowNode['data']['kind'], Context>(
  nodes: readonly ResourceFlowNode[],
  kind: K,
  decorate: (node: ResourceFlowNodeOf<K>, context: Context) => KindDecoration<K>,
  context: Context,
): ReadonlyMap<string, ResourceFlowNode> =>
  useMemo(() => {
    const next = new Map<string, ResourceFlowNode>();
    for (const node of nodes) {
      if (isResourceNodeOf(node, kind)) {
        next.set(node.id, applyKindDecoration(node, decorate(node, context)));
      }
    }
    return next;
  }, [nodes, kind, decorate, context]);

/**
 * Every Resource node with its kind's operations: the app half of each kind,
 * and the one place in the application each kind's canvas decoration is named
 * (ADR 0128). Each kind's nodes are decorated from that kind's own
 * part of the context, so a change that only one kind reads keeps every other
 * kind's nodes, and their identities, as they were.
 */
export function useKindDecoratedNodes(
  nodes: readonly ResourceFlowNode[],
  context: KindDecorationContext,
): ResourceFlowNode[] {
  const {
    authorOnCanvas,
    bodyEditing,
    editableResourceIds,
    beginBodyEditing,
    bodyEditorResourceId,
    completeResourceBody,
    clearCaret,
    replaceResourceImage,
    imageAccept,
    changeResourceShape,
    continuation,
    containingSpaceId,
    spaceDocuments,
    spaceResourceTargets,
    spaces,
    commandOutcomes,
    deleteConfirmation,
    completeSpaceResourceSelection,
    portalEditing,
    onPortalEditingChange,
    contextNotices,
    onContextEditingChange,
    onContextReport,
  } = context;
  const markdownContext = useMemo(
    (): MarkdownResourceDecorationContext => ({
      authorOnCanvas,
      bodyEditing,
      editableResourceIds,
      beginBodyEditing,
      bodyEditorResourceId,
      completeResourceBody,
      clearCaret,
    }),
    [
      authorOnCanvas,
      bodyEditing,
      editableResourceIds,
      beginBodyEditing,
      bodyEditorResourceId,
      completeResourceBody,
      clearCaret,
    ],
  );
  const imageContext = useMemo(
    (): ImageResourceDecorationContext => ({
      authorOnCanvas,
      bodyEditing,
      editableResourceIds,
      beginBodyEditing,
      bodyEditorResourceId,
      replaceResourceImage,
      imageAccept,
      clearCaret,
    }),
    [
      authorOnCanvas,
      bodyEditing,
      editableResourceIds,
      beginBodyEditing,
      bodyEditorResourceId,
      replaceResourceImage,
      imageAccept,
      clearCaret,
    ],
  );
  const urContext = useMemo(
    (): UrResourceDecorationContext => ({
      authorOnCanvas,
      editableResourceIds,
      changeResourceShape,
    }),
    [authorOnCanvas, editableResourceIds, changeResourceShape],
  );
  const spaceContext = useMemo(
    (): SpaceResourceDecorationContext => ({
      authorOnCanvas,
      editableResourceIds,
      continuation,
      containingSpaceId,
      spaceDocuments,
      spaceResourceTargets,
      spaces,
      commandOutcomes,
      deleteConfirmation,
      completeSpaceResourceSelection,
      portalEditing,
      onPortalEditingChange,
      contextNotices,
      onContextEditingChange,
      onContextReport,
    }),
    [
      authorOnCanvas,
      editableResourceIds,
      continuation,
      containingSpaceId,
      spaceDocuments,
      spaceResourceTargets,
      spaces,
      commandOutcomes,
      deleteConfirmation,
      completeSpaceResourceSelection,
      portalEditing,
      onPortalEditingChange,
      contextNotices,
      onContextEditingChange,
      onContextReport,
    ],
  );
  const markdownDecorated = useDecoratedOfKind(
    nodes,
    markdownKind.id,
    decorateMarkdownResourceNode,
    markdownContext,
  );
  const imageDecorated = useDecoratedOfKind(
    nodes,
    imageKind.id,
    decorateImageResourceNode,
    imageContext,
  );
  const urDecorated = useDecoratedOfKind(nodes, urKind.id, decorateUrResourceNode, urContext);
  const spaceDecorated = useDecoratedOfKind(
    nodes,
    spaceKind.id,
    decorateSpaceResourceNode,
    spaceContext,
  );
  return useMemo(() => {
    const decorated = new Map(
      [markdownDecorated, imageDecorated, urDecorated, spaceDecorated].flatMap((byId) => [...byId]),
    );
    return nodes.map((node) => decorated.get(node.id) ?? node);
  }, [nodes, markdownDecorated, imageDecorated, urDecorated, spaceDecorated]);
}
