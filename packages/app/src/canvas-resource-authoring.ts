import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  RESOURCE_TITLE_REQUIRED,
  resourceDocumentSchema,
  uuidSchema,
  type ResourceDocument,
  type ResourceId,
  type GraphId,
} from '@project/core';
import type { SpaceSession } from '@project/persistence';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import type { EntityActionGroup } from '@project/ui';
import type { AuthoringAvailability } from './authoring-availability';
import { describeAuthoringRefusal } from './authoring-refusal';
import type { ResourceResize } from './render-adapter';
import type { SpaceAuthoring } from './space-authoring';
import type { SpaceResourceTargetMap } from './space-resource-lifecycle';
import { useOpenSpaces } from './open-spaces-context';
import { completeEmbeddedAuthoring } from './embedded-authoring';
import type { Continuation } from './continuation';
import { NO_SPACE_RESOURCE_TARGETS, type SpaceResourceTargets } from './space-resource-targets';
import type { SpaceResourceFraming } from './space-resource-framing';
import {
  applyResourceDataPatch,
  decorateMarkdownResourceNode,
  decorateSharedResourceNode,
  decorateSpaceResourceNode,
} from './canvas-resource-decoration';

type Caret =
  | { readonly resourceId: string; readonly field: 'title' }
  | { readonly resourceId: string; readonly field: 'body'; readonly openObserved: boolean }
  | null;

const spaceDocumentIdentity = (document: Extract<ResourceDocument, { kind: 'space' }>): string => {
  const framing = document.framing;
  const framingKey =
    framing === undefined ? '' : `${framing.centreX}:${framing.centreY}:${framing.zoom}`;
  return `${document.spaceId}:${document.map}:${document.graph}:${document.title}:${framingKey}`;
};

const spaceDocumentsOf = (
  resources: readonly { readonly id: ResourceId; readonly document: ResourceDocument }[],
): ReadonlyMap<ResourceId, Extract<ResourceDocument, { kind: 'space' }>> => {
  const next = new Map<ResourceId, Extract<ResourceDocument, { kind: 'space' }>>();
  for (const resource of resources) {
    if (resource.document.kind === 'space') next.set(resource.id, resource.document);
  }
  return next;
};

const spaceDocumentsKeyOf = (
  resources: readonly { readonly id: ResourceId; readonly document: ResourceDocument }[],
): string =>
  resources
    .flatMap((resource) =>
      resource.document.kind === 'space'
        ? [`${resource.id}:${spaceDocumentIdentity(resource.document)}`]
        : [],
    )
    .join();

/**
 * Load a Space Resource, parse the next document, persist it as `edited-resource`.
 *
 * Selection and framing both write that one Edit; they differ only in which
 * fields they patch and the sentence a failed parse returns.
 */
const completeEditedSpaceResource = (
  authoring: Pick<SpaceAuthoring, 'complete'>,
  spaceSession: SpaceSession,
  resourceId: ResourceId,
  nextDocument: (document: Extract<ResourceDocument, { kind: 'space' }>) => ResourceDocument,
  invalidMessage: string,
): string | null => {
  const stored = spaceSession
    .getState()
    .working.resources.find((resource) => resource.id === resourceId);
  if (stored?.document.kind !== 'space')
    return describeAuthoringRefusal({ code: 'resource-not-found' });
  const parsed = resourceDocumentSchema.safeParse(nextDocument(stored.document));
  if (!parsed.success) return invalidMessage;
  const result = authoring.complete({ kind: 'edited-resource', resourceId, document: parsed.data });
  return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
};

export interface CanvasResourceAuthoringInput {
  readonly continuation?: Continuation;
  readonly nodes: readonly ResourceFlowNode[];
  /**
   * What may be authored right now, answered once for the whole application.
   *
   * Two answers are read here, and they are deliberately different: every
   * control drawn on a Resource is `authorOnCanvas`, while a *live* content editor
   * is `editResourceBody`, which a modal pane does not withdraw.
   */
  readonly availability: AuthoringAvailability;
  readonly nameOnCreation: string | null;
  readonly authoring: Pick<SpaceAuthoring, 'complete'>;
  readonly spaceSession: SpaceSession;
  readonly resourceResize: ResourceResize;
  readonly onSelectResource: (resourceId: ResourceId) => void;
  readonly onBodyEditingChange?: ((editing: boolean) => void) | undefined;
  readonly onTitleEditingChange?: ((editing: boolean) => void) | undefined;
  /**
   * What each referenced Space offers a Space Resource to select, keyed by target.
   *
   * Absent, or missing an entry, means the target has not been read yet — the
   * Resource still draws, without the rail an Open one carries (ADR 0068).
   */
  readonly spaceResourceTargets?: SpaceResourceTargets | undefined;
  /**
   * What commands each Resource on this canvas offers, asked one Resource at a time.
   *
   * A function rather than a built list, for the reason the Space's command
   * surface takes one: what a command *is* — the address it copies, the Edit it
   * runs — belongs to the composition that owns both, while this module knows
   * only which Resources are on the canvas and which of them may be authored.
   *
   * Absent leaves every Resource exactly as it was, which is what a read-only or
   * embedded canvas wants: a Resource drawn where none of these commands can run
   * offers no menu rather than one that refuses.
   */
  readonly resourceEntityActions?:
    ((resourceId: ResourceId) => readonly EntityActionGroup[]) | undefined;
  /**
   * Which Open Space Resources currently have their embedded canvas in Edit.
   *
   * Absent leaves every Space Resource in Read: the embedding stays inert and the
   * dock offers no Edit/Done. The containing canvas owns the set because the
   * embedding is sibling nodes, not markup inside the Resource.
   */
  readonly portalEditing?: ReadonlySet<ResourceId>;
  readonly onPortalEditingChange?: ((resourceId: ResourceId, editing: boolean) => void) | undefined;
}

export interface CanvasResourceAuthoring {
  readonly nodes: ResourceFlowNode[];
  readonly bodyEditing: boolean;
  readonly titleEditing: boolean;
  readonly openResource: (resourceId: string) => 'completed' | 'retained';
  readonly beginTitleEditing: (resourceId: string) => void;
  readonly completeSpaceResourceFraming: (
    resourceId: ResourceId,
    framing: SpaceResourceFraming,
  ) => string | null;
}

/**
 * The complete canvas-local Resource interaction: caret ownership, Open/Edit
 * composition, completion translation and the operations projected onto each
 * Resource. Space Authoring remains authoritative for every completed Edit.
 */
export function useCanvasResourceAuthoring({
  continuation,
  nodes,
  availability,
  nameOnCreation,
  authoring,
  spaceSession,
  resourceResize,
  onSelectResource,
  onBodyEditingChange,
  onTitleEditingChange,
  spaceResourceTargets = NO_SPACE_RESOURCE_TARGETS,
  resourceEntityActions,
  portalEditing,
  onPortalEditingChange,
}: CanvasResourceAuthoringInput): CanvasResourceAuthoring {
  const spaces = useOpenSpaces();
  const [contextEditingIds, setContextEditingIds] = useState<ReadonlySet<ResourceId>>(
    () => new Set(),
  );
  const [contextNotices, setContextNotices] = useState<ReadonlyMap<ResourceId, string>>(
    () => new Map(),
  );
  const [caret, setCaret] = useState<Caret>(null);
  const editingTitleResourceId = caret?.field === 'title' ? caret.resourceId : null;
  const bodyCaretNamesOpenMarkdown =
    caret?.field === 'body' &&
    nodes.some(
      (node) =>
        node.id === caret.resourceId &&
        node.data.expanded === true &&
        node.data.kind === 'markdown',
    );

  if (caret?.field === 'body') {
    if (bodyCaretNamesOpenMarkdown && !caret.openObserved) {
      setCaret({ ...caret, openObserved: true });
    } else if (!bodyCaretNamesOpenMarkdown && caret.openObserved) {
      setCaret(null);
    }
  }

  const bodyEditorResourceId =
    caret?.field === 'body' && availability.editResourceBody && bodyCaretNamesOpenMarkdown
      ? caret.resourceId
      : null;
  const bodyEditing = bodyEditorResourceId !== null;

  useEffect(() => {
    onBodyEditingChange?.(bodyEditing);
  }, [bodyEditing, onBodyEditingChange]);
  useEffect(() => {
    onTitleEditingChange?.(editingTitleResourceId !== null || contextEditingIds.size > 0);
    // Returning the Space chrome on unmount is the whole of the safety net,
    // and it is narrower than "a Map change remounts the canvas" would
    // suggest. Only a Map move that drops the projection unmounts this
    // canvas; a move made *through* a completed Edit installs the next
    // projection instead, so the canvas stays mounted and the caret with it —
    // even where the Resource it names has left `nodes`, since the caret is keyed
    // by Resource id and nothing here watches them. So a surface that moves the
    // Map that way withdraws itself while the caret is held rather than
    // relying on this, and what remains here is the unmount case: a canvas that
    // goes away must not leave the chrome withdrawn against an editor no
    // callback will ever settle.
    return () => onTitleEditingChange?.(false);
  }, [editingTitleResourceId, contextEditingIds, onTitleEditingChange]);

  const [canvasAuthoringWasEnabled, setCanvasAuthoringWasEnabled] = useState(
    availability.authorOnCanvas,
  );
  if (canvasAuthoringWasEnabled !== availability.authorOnCanvas) {
    setCanvasAuthoringWasEnabled(availability.authorOnCanvas);
    if (!availability.authorOnCanvas && caret?.field === 'title') setCaret(null);
  }

  const [lastCreatedResourceId, setLastCreatedResourceId] = useState(nameOnCreation);
  if (lastCreatedResourceId !== nameOnCreation) {
    setLastCreatedResourceId(nameOnCreation);
    if (nameOnCreation !== null && !bodyEditing) {
      setCaret({ resourceId: nameOnCreation, field: 'title' });
    }
  }

  const openResource = useCallback(
    (resourceIdInput: string): 'completed' | 'retained' => {
      if (!availability.authorOnCanvas) return 'retained';
      const resourceId = uuidSchema.safeParse(resourceIdInput);
      if (!resourceId.success) return 'retained';
      const stored = spaceSession
        .getState()
        .working.resources.find((resource) => resource.id === resourceId.data);
      if (stored === undefined) return 'retained';
      // Every Resource kind Opens, and there is deliberately no kind guard left
      // here. Opening is one Map-owned operation (ADR 0064) and each kind
      // differs only in what its front then draws: Markdown of its own, an
      // immutable Target's read-only (ADR 0070), or the Map a Space Resource
      // selects (ADR 0068). The guard this replaced admitted two kinds and
      // silently retained the third, which is a decision about *content* being
      // made by the code that authors placement.
      const result = authoring.complete({ kind: 'opened-resource', resourceId: resourceId.data });
      return result.kind === 'completed' || result.kind === 'unchanged' ? 'completed' : 'retained';
    },
    [authoring, availability.authorOnCanvas, spaceSession],
  );

  const closeResource = useCallback(
    (resourceId: ResourceId): 'completed' | 'retained' => {
      onPortalEditingChange?.(resourceId, false);
      setContextNotices((previous) => {
        if (!previous.has(resourceId)) return previous;
        const next = new Map(previous);
        next.delete(resourceId);
        return next;
      });
      setContextEditingIds((previous) => {
        if (!previous.has(resourceId)) return previous;
        const next = new Set(previous);
        next.delete(resourceId);
        return next;
      });
      const result = authoring.complete({ kind: 'closed-resource', resourceId });
      return result.kind === 'completed' || result.kind === 'unchanged' ? 'completed' : 'retained';
    },
    [authoring, onPortalEditingChange],
  );

  const completeResourceBody = useCallback(
    (resourceId: ResourceId, body: string): 'completed' | 'retained' => {
      const stored = spaceSession
        .getState()
        .working.resources.find((resource) => resource.id === resourceId);
      if (stored?.document.kind !== 'markdown') return 'retained';
      const parsed = resourceDocumentSchema.safeParse({ ...stored.document, body });
      if (!parsed.success) return 'retained';
      const result = authoring.complete({
        kind: 'edited-resource',
        resourceId,
        document: parsed.data,
      });
      return result.kind === 'completed' || result.kind === 'unchanged' ? 'completed' : 'retained';
    },
    [authoring, spaceSession],
  );

  const completeResourceTitle = useCallback(
    (resourceIdInput: string, title: string): string | null => {
      const resourceId = uuidSchema.safeParse(resourceIdInput);
      if (!resourceId.success) return 'This Resource is no longer available.';
      const stored = spaceSession
        .getState()
        .working.resources.find((resource) => resource.id === resourceId.data);
      if (stored === undefined) return 'This Resource is no longer available.';
      // The draft goes to the schema as it was typed: normalization is that
      // boundary's (ADR 0083), and a `trim()` here would be the rule written a
      // second time and disagreeing about the line breaks the author meant.
      // Which refusal this is comes off the issue the schema raised rather than
      // being re-derived from the draft — the domain owns the code and this
      // composes its sentence (ADR 0057), and re-deciding it here would be the
      // same rule kept in two places, free to drift apart.
      const parsed = resourceDocumentSchema.safeParse({ ...stored.document, title });
      if (!parsed.success) {
        const titleRequired = parsed.error.issues.some(
          (issue) => issue.code === 'custom' && issue.params?.['code'] === RESOURCE_TITLE_REQUIRED,
        );
        return titleRequired
          ? describeAuthoringRefusal({ code: RESOURCE_TITLE_REQUIRED })
          : (parsed.error.issues[0]?.message ?? 'The Resource title is invalid.');
      }
      const result = authoring.complete({
        kind: 'edited-resource',
        resourceId: resourceId.data,
        document: parsed.data,
      });
      return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
    },
    [authoring, spaceSession],
  );

  /**
   * Authoring a Space Resource's Map or Graph selection.
   *
   * One operation for both, because they are not independent: a Graph is owned
   * by the Map that holds it (ADR 0040), and the aggregate refuses a Resource
   * naming a Graph its Map does not own. So choosing a Map re-seeds
   * the Graph from that Map rather than leaving the previous one to be
   * refused at intake.
   *
   * There is no arm for a Map that owns no Graph. A Map owns at least
   * one — `spaceFileSchema` says so — and a Space Resource stores a Graph as well
   * as a Map (ADR 0079), so writing the pair half-made is not a state this
   * surface may reach. `graphId` is required here for that reason, and the
   * schema parse is what still stands between a resolved pair and a stored one.
   *
   * The target Space reference is untouched here and cannot be reached from the
   * surface at all: it is chosen once, at creation (ADR 0068), and Space
   * Authoring refuses a changed one on its own account.
   */
  const completeSpaceResourceSelection = useCallback(
    (
      resourceId: ResourceId,
      map: Pick<SpaceResourceTargetMap, 'id'>,
      graphId: GraphId,
    ): string | null =>
      completeEditedSpaceResource(
        authoring,
        spaceSession,
        resourceId,
        (document) => {
          const next: Extract<ResourceDocument, { kind: 'space' }> = {
            ...document,
            map: map.id,
            graph: graphId,
          };
          if (document.map !== map.id) delete next.framing;
          return next;
        },
        'The selection is invalid.',
      ),
    [authoring, spaceSession],
  );

  const completeSpaceResourceFraming = useCallback(
    (resourceId: ResourceId, framing: SpaceResourceFraming): string | null =>
      completeEditedSpaceResource(
        authoring,
        spaceSession,
        resourceId,
        (document) => ({ ...document, framing }),
        'The framing is invalid.',
      ),
    [authoring, spaceSession],
  );

  const beginTitleEditing = useCallback((resourceId: string) => {
    setCaret({ resourceId, field: 'title' });
  }, []);
  const getWorking = useCallback(() => spaceSession.getState().working, [spaceSession]);
  const working = useSyncExternalStore(spaceSession.subscribe, getWorking);
  const editableResourceIdsKey = working.resources.map((resource) => resource.id).join();
  /* eslint-disable react-hooks/exhaustive-deps -- membership key, not snapshot identity */
  const editableResourceIds = useMemo(
    () => new Set(working.resources.map((resource) => resource.id)),
    [editableResourceIdsKey],
  );
  const spaceDocumentsKey = spaceDocumentsKeyOf(working.resources);
  const spaceDocuments = useMemo(() => spaceDocumentsOf(working.resources), [spaceDocumentsKey]);
  /* eslint-enable react-hooks/exhaustive-deps */
  const clearCaret = useCallback(() => {
    setCaret(null);
  }, []);
  const beginBodyEditing = useCallback((node: ResourceFlowNode) => {
    setCaret({
      resourceId: node.id,
      field: 'body',
      openObserved: node.data.expanded === true,
    });
  }, []);
  const onContextEditingChange = useCallback((resourceId: ResourceId, editing: boolean) => {
    setContextEditingIds((prev) => {
      const has = prev.has(resourceId);
      if (editing === has) return prev;
      const next = new Set(prev);
      if (editing) next.add(resourceId);
      else next.delete(resourceId);
      return next;
    });
  }, []);
  const onContextReport = useCallback((resourceId: ResourceId, message: string | null) => {
    setContextNotices((prev) => {
      const current = prev.get(resourceId) ?? null;
      if (current === message) return prev;
      const next = new Map(prev);
      if (message === null) next.delete(resourceId);
      else next.set(resourceId, message);
      return next;
    });
  }, []);

  const sharedContext = useMemo(
    () => ({
      authorOnCanvas: availability.authorOnCanvas,
      bodyEditing,
      editableResourceIds,
      openResource,
      closeResource,
      beginTitleEditing,
      onSelectResource,
      resourceResize,
      editingTitleResourceId,
      completeResourceTitle,
      clearCaret,
      resourceEntityActions,
    }),
    [
      availability.authorOnCanvas,
      bodyEditing,
      editableResourceIds,
      openResource,
      closeResource,
      beginTitleEditing,
      onSelectResource,
      resourceResize,
      editingTitleResourceId,
      completeResourceTitle,
      clearCaret,
      resourceEntityActions,
    ],
  );
  const markdownContext = useMemo(
    () => ({
      authorOnCanvas: availability.authorOnCanvas,
      bodyEditing,
      editableResourceIds,
      beginBodyEditing,
      bodyEditorResourceId,
      completeResourceBody,
      clearCaret,
    }),
    [
      availability.authorOnCanvas,
      bodyEditing,
      editableResourceIds,
      beginBodyEditing,
      bodyEditorResourceId,
      completeResourceBody,
      clearCaret,
    ],
  );
  const spaceContext = useMemo(
    () => ({
      authorOnCanvas: availability.authorOnCanvas,
      editableResourceIds,
      containingSpaceId: working.id,
      spaceDocuments,
      spaceResourceTargets,
      spaces,
      continuation,
      completeSpaceResourceSelection,
      completeEmbedded: completeEmbeddedAuthoring,
      portalEditing,
      onPortalEditingChange,
      contextNotices,
      onContextEditingChange,
      onContextReport,
    }),
    [
      availability.authorOnCanvas,
      editableResourceIds,
      working.id,
      spaceDocuments,
      spaceResourceTargets,
      spaces,
      continuation,
      completeSpaceResourceSelection,
      portalEditing,
      onPortalEditingChange,
      contextNotices,
      onContextEditingChange,
      onContextReport,
    ],
  );

  const withShared = useMemo(
    () =>
      nodes.map((node) =>
        applyResourceDataPatch(node, decorateSharedResourceNode(node, sharedContext)),
      ),
    [nodes, sharedContext],
  );
  const markdownDecorated = useMemo(() => {
    const next = new Map<string, ResourceFlowNode>();
    for (const node of withShared) {
      if (node.data.kind === 'markdown') {
        next.set(
          node.id,
          applyResourceDataPatch(node, decorateMarkdownResourceNode(node, markdownContext)),
        );
      }
    }
    return next;
  }, [withShared, markdownContext]);
  const spaceDecorated = useMemo(() => {
    const next = new Map<string, ResourceFlowNode>();
    for (const node of withShared) {
      if (node.data.kind === 'space') {
        next.set(
          node.id,
          applyResourceDataPatch(node, decorateSpaceResourceNode(node, spaceContext)),
        );
      }
    }
    return next;
  }, [withShared, spaceContext]);
  const decoratedNodes = useMemo(
    () =>
      withShared.map(
        (node) => markdownDecorated.get(node.id) ?? spaceDecorated.get(node.id) ?? node,
      ),
    [withShared, markdownDecorated, spaceDecorated],
  );

  return {
    nodes: decoratedNodes,
    bodyEditing,
    titleEditing: editingTitleResourceId !== null || contextEditingIds.size > 0,
    openResource,
    beginTitleEditing,
    completeSpaceResourceFraming,
  };
}
