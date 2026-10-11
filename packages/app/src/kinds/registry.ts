import { useMemo } from 'react';
import { imageKind, markdownKind, spaceKind, urKind } from '@project/core';
import { isResourceNodeOf, type ResourceFlowNode } from '@project/react-flow-adapter';
import { applyKindDecoration } from '../canvas-resource-decoration';
import { decorateImageResourceNode, type ImageResourceDecorationContext } from './image';
import { decorateMarkdownResourceNode, type MarkdownResourceDecorationContext } from './markdown';
import { decorateSpaceResourceNode, type SpaceResourceDecorationContext } from './space';
import { decorateUrResourceNode, type UrResourceDecorationContext } from './ur';

/** What every kind's canvas decoration reads, together. */
export type KindDecorationContext = MarkdownResourceDecorationContext &
  ImageResourceDecorationContext &
  UrResourceDecorationContext &
  SpaceResourceDecorationContext;

/** Each node of one kind decorated with that kind's operations, by node id. */
const decoratedOfKind = (
  nodes: readonly ResourceFlowNode[],
  decorate: (node: ResourceFlowNode) => ResourceFlowNode | undefined,
): ReadonlyMap<string, ResourceFlowNode> => {
  const next = new Map<string, ResourceFlowNode>();
  for (const node of nodes) {
    const decorated = decorate(node);
    if (decorated !== undefined) next.set(node.id, decorated);
  }
  return next;
};

/**
 * Every Resource node with its kind's operations (ADR 0128): the app half of
 * each kind, and the one place in the application each kind's canvas
 * decoration is named. Each kind's nodes are decorated from that kind's own
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
  const markdownDecorated = useMemo(
    () =>
      decoratedOfKind(nodes, (node) =>
        isResourceNodeOf(node, markdownKind.id)
          ? applyKindDecoration(node, decorateMarkdownResourceNode(node, markdownContext))
          : undefined,
      ),
    [nodes, markdownContext],
  );
  const imageDecorated = useMemo(
    () =>
      decoratedOfKind(nodes, (node) =>
        isResourceNodeOf(node, imageKind.id)
          ? applyKindDecoration(node, decorateImageResourceNode(node, imageContext))
          : undefined,
      ),
    [nodes, imageContext],
  );
  const urDecorated = useMemo(
    () =>
      decoratedOfKind(nodes, (node) =>
        isResourceNodeOf(node, urKind.id)
          ? applyKindDecoration(node, decorateUrResourceNode(node, urContext))
          : undefined,
      ),
    [nodes, urContext],
  );
  const spaceDecorated = useMemo(
    () =>
      decoratedOfKind(nodes, (node) =>
        isResourceNodeOf(node, spaceKind.id)
          ? applyKindDecoration(node, decorateSpaceResourceNode(node, spaceContext))
          : undefined,
      ),
    [nodes, spaceContext],
  );
  return useMemo(
    () =>
      nodes.map(
        (node) =>
          markdownDecorated.get(node.id) ??
          imageDecorated.get(node.id) ??
          urDecorated.get(node.id) ??
          spaceDecorated.get(node.id) ??
          node,
      ),
    [nodes, markdownDecorated, imageDecorated, urDecorated, spaceDecorated],
  );
}
