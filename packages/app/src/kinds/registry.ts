import { useMemo } from 'react';
import { imageKind, markdownKind, spaceKind, urKind } from '@project/core';
import {
  isResourceNodeOf,
  type ResourceFlowNode,
  type ResourceFlowNodeOf,
} from '@project/react-flow-adapter';
import { applyKindDecoration, type KindDecoration } from '../canvas-resource-decoration';
import { decorateImageResourceNode, type ImageResourceDecorationContext } from './image';
import { decorateMarkdownResourceNode, type MarkdownResourceDecorationContext } from './markdown';
import { decorateSpaceResourceNode, type SpaceResourceDecorationContext } from './space';
import { decorateUrResourceNode, type UrResourceDecorationContext } from './ur';

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
