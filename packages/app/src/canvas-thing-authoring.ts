import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  THING_TITLE_REQUIRED,
  thingDocumentSchema,
  uuidSchema,
  type ThingDocument,
  type ThingId,
  type GraphId,
} from '@project/core';
import type { SpaceSession } from '@project/persistence';
import type { ThingFlowNode } from '@project/react-flow-adapter';
import type { EntityActionGroup } from '@project/ui';
import type { AuthoringAvailability } from './authoring-availability';
import { describeAuthoringRefusal } from './authoring-refusal';
import type { ThingResize } from './render-adapter';
import type { SpaceAuthoring } from './space-authoring';
import type { SpaceThingTargetDiagram } from './space-thing-lifecycle';
import { useOpenSpaces } from './open-spaces-context';
import { completeEmbeddedAuthoring } from './embedded-authoring';
import type { Continuation } from './continuation';
import { NO_SPACE_THING_TARGETS, type SpaceThingTargets } from './space-thing-targets';
import type { SpaceThingFraming } from './space-thing-framing';
import {
  applyThingDataPatch,
  decorateMarkdownThingNode,
  decorateSharedThingNode,
  decorateSpaceThingNode,
} from './canvas-thing-decoration';

type Caret =
  | { readonly thingId: string; readonly field: 'title' }
  | { readonly thingId: string; readonly field: 'body'; readonly openObserved: boolean }
  | null;

const spaceDocumentIdentity = (document: Extract<ThingDocument, { kind: 'space' }>): string => {
  const framing = document.framing;
  const framingKey =
    framing === undefined ? '' : `${framing.centreX}:${framing.centreY}:${framing.zoom}`;
  return `${document.spaceId}:${document.diagram}:${document.graph}:${document.title}:${framingKey}`;
};

const spaceDocumentsOf = (
  things: readonly { readonly id: ThingId; readonly document: ThingDocument }[],
): Map<ThingId, Extract<ThingDocument, { kind: 'space' }>> => {
  const next = new Map<ThingId, Extract<ThingDocument, { kind: 'space' }>>();
  for (const thing of things) {
    if (thing.document.kind === 'space') next.set(thing.id, thing.document);
  }
  return next;
};

const spaceDocumentsKeyOf = (
  things: readonly { readonly id: ThingId; readonly document: ThingDocument }[],
): string =>
  things
    .flatMap((thing) =>
      thing.document.kind === 'space'
        ? [`${thing.id}:${spaceDocumentIdentity(thing.document)}`]
        : [],
    )
    .join();

/**
 * Load a Space Thing, parse the next document, persist it as `edited-thing`.
 *
 * Selection and framing both write that one Edit; they differ only in which
 * fields they patch and the sentence a failed parse returns.
 */
const completeEditedSpaceThing = (
  authoring: Pick<SpaceAuthoring, 'complete'>,
  spaceSession: SpaceSession,
  thingId: ThingId,
  nextDocument: (document: Extract<ThingDocument, { kind: 'space' }>) => ThingDocument,
  invalidMessage: string,
): string | null => {
  const stored = spaceSession.getState().working.things.find((thing) => thing.id === thingId);
  if (stored?.document.kind !== 'space')
    return describeAuthoringRefusal({ code: 'thing-not-found' });
  const parsed = thingDocumentSchema.safeParse(nextDocument(stored.document));
  if (!parsed.success) return invalidMessage;
  const result = authoring.complete({ kind: 'edited-thing', thingId, document: parsed.data });
  return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
};

export interface CanvasThingAuthoringInput {
  readonly continuation?: Continuation;
  readonly nodes: readonly ThingFlowNode[];
  /**
   * What may be authored right now, answered once for the whole application.
   *
   * Two answers are read here, and they are deliberately different: every
   * control drawn on a Thing is `authorOnCanvas`, while a *live* content editor
   * is `editThingBody`, which a modal pane does not withdraw.
   */
  readonly availability: AuthoringAvailability;
  readonly nameOnCreation: string | null;
  readonly authoring: Pick<SpaceAuthoring, 'complete'>;
  readonly spaceSession: SpaceSession;
  readonly thingResize: ThingResize;
  readonly onSelectThing: (thingId: ThingId) => void;
  readonly onBodyEditingChange?: ((editing: boolean) => void) | undefined;
  readonly onTitleEditingChange?: ((editing: boolean) => void) | undefined;
  /**
   * What each referenced Space offers a Space Thing to select, keyed by target.
   *
   * Absent, or missing an entry, means the target has not been read yet — the
   * Thing still draws, without the rail an Open one carries (ADR 0068).
   */
  readonly spaceThingTargets?: SpaceThingTargets | undefined;
  /**
   * What commands each Thing on this canvas offers, asked one Thing at a time.
   *
   * A function rather than a built list, for the reason the Space's command
   * surface takes one: what a command *is* — the address it copies, the Edit it
   * runs — belongs to the composition that owns both, while this module knows
   * only which Things are on the canvas and which of them may be authored.
   *
   * Absent leaves every Thing exactly as it was, which is what a read-only or
   * embedded canvas wants: a Thing drawn where none of these commands can run
   * offers no menu rather than one that refuses.
   */
  readonly thingEntityActions?: ((thingId: ThingId) => readonly EntityActionGroup[]) | undefined;
  /**
   * Which Open Space Things currently have their embedded canvas in Edit.
   *
   * Absent leaves every Space Thing in Read: the embedding stays inert and the
   * dock offers no Edit/Done. The containing canvas owns the set because the
   * embedding is sibling nodes, not markup inside the Thing.
   */
  readonly portalEditing?: ReadonlySet<ThingId>;
  readonly onPortalEditingChange?: ((thingId: ThingId, editing: boolean) => void) | undefined;
}

export interface CanvasThingAuthoring {
  readonly nodes: ThingFlowNode[];
  readonly bodyEditing: boolean;
  readonly titleEditing: boolean;
  readonly openThing: (thingId: string) => 'completed' | 'retained';
  readonly beginTitleEditing: (thingId: string) => void;
  readonly completeSpaceThingFraming: (
    thingId: ThingId,
    framing: SpaceThingFraming,
  ) => string | null;
}

/**
 * The complete canvas-local Thing interaction: caret ownership, Open/Edit
 * composition, completion translation and the operations projected onto each
 * Thing. Space Authoring remains authoritative for every completed Edit.
 */
export function useCanvasThingAuthoring({
  continuation,
  nodes,
  availability,
  nameOnCreation,
  authoring,
  spaceSession,
  thingResize,
  onSelectThing,
  onBodyEditingChange,
  onTitleEditingChange,
  spaceThingTargets = NO_SPACE_THING_TARGETS,
  thingEntityActions,
  portalEditing,
  onPortalEditingChange,
}: CanvasThingAuthoringInput): CanvasThingAuthoring {
  const spaces = useOpenSpaces();
  const [contextEditingIds, setContextEditingIds] = useState<ReadonlySet<ThingId>>(() => new Set());
  const [contextNotices, setContextNotices] = useState<ReadonlyMap<ThingId, string>>(
    () => new Map(),
  );
  const [caret, setCaret] = useState<Caret>(null);
  const editingTitleThingId = caret?.field === 'title' ? caret.thingId : null;
  const bodyCaretNamesOpenMarkdown =
    caret?.field === 'body' &&
    nodes.some(
      (node) =>
        node.id === caret.thingId && node.data.expanded === true && node.data.kind === 'markdown',
    );

  if (caret?.field === 'body') {
    if (bodyCaretNamesOpenMarkdown && !caret.openObserved) {
      setCaret({ ...caret, openObserved: true });
    } else if (!bodyCaretNamesOpenMarkdown && caret.openObserved) {
      setCaret(null);
    }
  }

  const bodyEditorThingId =
    caret?.field === 'body' && availability.editThingBody && bodyCaretNamesOpenMarkdown
      ? caret.thingId
      : null;
  const bodyEditing = bodyEditorThingId !== null;

  useEffect(() => {
    onBodyEditingChange?.(bodyEditing);
  }, [bodyEditing, onBodyEditingChange]);
  useEffect(() => {
    onTitleEditingChange?.(editingTitleThingId !== null || contextEditingIds.size > 0);
    // Returning the Space chrome on unmount is the whole of the safety net,
    // and it is narrower than "a Diagram change remounts the canvas" would
    // suggest. Only a Diagram move that drops the projection unmounts this
    // canvas; a move made *through* a completed Edit installs the next
    // projection instead, so the canvas stays mounted and the caret with it —
    // even where the Thing it names has left `nodes`, since the caret is keyed
    // by Thing id and nothing here watches them. So a surface that moves the
    // Diagram that way withdraws itself while the caret is held rather than
    // relying on this, and what remains here is the unmount case: a canvas that
    // goes away must not leave the chrome withdrawn against an editor no
    // callback will ever settle.
    return () => onTitleEditingChange?.(false);
  }, [editingTitleThingId, contextEditingIds, onTitleEditingChange]);

  const [canvasAuthoringWasEnabled, setCanvasAuthoringWasEnabled] = useState(
    availability.authorOnCanvas,
  );
  if (canvasAuthoringWasEnabled !== availability.authorOnCanvas) {
    setCanvasAuthoringWasEnabled(availability.authorOnCanvas);
    if (!availability.authorOnCanvas && caret?.field === 'title') setCaret(null);
  }

  const [lastCreatedThingId, setLastCreatedThingId] = useState(nameOnCreation);
  if (lastCreatedThingId !== nameOnCreation) {
    setLastCreatedThingId(nameOnCreation);
    if (nameOnCreation !== null && !bodyEditing) {
      setCaret({ thingId: nameOnCreation, field: 'title' });
    }
  }

  const openThing = useCallback(
    (thingIdInput: string): 'completed' | 'retained' => {
      if (!availability.authorOnCanvas) return 'retained';
      const thingId = uuidSchema.safeParse(thingIdInput);
      if (!thingId.success) return 'retained';
      const stored = spaceSession
        .getState()
        .working.things.find((thing) => thing.id === thingId.data);
      if (stored === undefined) return 'retained';
      // Every Thing kind Opens, and there is deliberately no kind guard left
      // here. Opening is one Diagram-owned operation (ADR 0064) and each kind
      // differs only in what its front then draws: Markdown of its own, an
      // immutable Target's read-only (ADR 0070), or the Diagram a Space Thing
      // selects (ADR 0068). The guard this replaced admitted two kinds and
      // silently retained the third, which is a decision about *content* being
      // made by the code that authors placement.
      const result = authoring.complete({ kind: 'opened-thing', thingId: thingId.data });
      return result.kind === 'completed' || result.kind === 'unchanged' ? 'completed' : 'retained';
    },
    [authoring, availability.authorOnCanvas, spaceSession],
  );

  const closeThing = useCallback(
    (thingId: ThingId): 'completed' | 'retained' => {
      onPortalEditingChange?.(thingId, false);
      setContextNotices((previous) => {
        if (!previous.has(thingId)) return previous;
        const next = new Map(previous);
        next.delete(thingId);
        return next;
      });
      setContextEditingIds((previous) => {
        if (!previous.has(thingId)) return previous;
        const next = new Set(previous);
        next.delete(thingId);
        return next;
      });
      const result = authoring.complete({ kind: 'closed-thing', thingId });
      return result.kind === 'completed' || result.kind === 'unchanged' ? 'completed' : 'retained';
    },
    [authoring, onPortalEditingChange],
  );

  const completeThingBody = useCallback(
    (thingId: ThingId, body: string): 'completed' | 'retained' => {
      const stored = spaceSession.getState().working.things.find((thing) => thing.id === thingId);
      if (stored?.document.kind !== 'markdown') return 'retained';
      const parsed = thingDocumentSchema.safeParse({ ...stored.document, body });
      if (!parsed.success) return 'retained';
      const result = authoring.complete({ kind: 'edited-thing', thingId, document: parsed.data });
      return result.kind === 'completed' || result.kind === 'unchanged' ? 'completed' : 'retained';
    },
    [authoring, spaceSession],
  );

  const completeThingTitle = useCallback(
    (thingIdInput: string, title: string): string | null => {
      const thingId = uuidSchema.safeParse(thingIdInput);
      if (!thingId.success) return 'This Thing is no longer available.';
      const stored = spaceSession
        .getState()
        .working.things.find((thing) => thing.id === thingId.data);
      if (stored === undefined) return 'This Thing is no longer available.';
      // The draft goes to the schema as it was typed: normalization is that
      // boundary's (ADR 0083), and a `trim()` here would be the rule written a
      // second time and disagreeing about the line breaks the author meant.
      // Which refusal this is comes off the issue the schema raised rather than
      // being re-derived from the draft — the domain owns the code and this
      // composes its sentence (ADR 0057), and re-deciding it here would be the
      // same rule kept in two places, free to drift apart.
      const parsed = thingDocumentSchema.safeParse({ ...stored.document, title });
      if (!parsed.success) {
        const titleRequired = parsed.error.issues.some(
          (issue) => issue.code === 'custom' && issue.params?.['code'] === THING_TITLE_REQUIRED,
        );
        return titleRequired
          ? describeAuthoringRefusal({ code: THING_TITLE_REQUIRED })
          : (parsed.error.issues[0]?.message ?? 'The Thing title is invalid.');
      }
      const result = authoring.complete({
        kind: 'edited-thing',
        thingId: thingId.data,
        document: parsed.data,
      });
      return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
    },
    [authoring, spaceSession],
  );

  /**
   * Authoring a Space Thing's Diagram or Graph selection.
   *
   * One operation for both, because they are not independent: a Graph is owned
   * by the Diagram that holds it (ADR 0040), and the aggregate refuses a Thing
   * naming a Graph its Diagram does not own. So choosing a Diagram re-seeds
   * the Graph from that Diagram rather than leaving the previous one to be
   * refused at intake.
   *
   * There is no arm for a Diagram that owns no Graph. A Diagram owns at least
   * one — `spaceFileSchema` says so — and a Space Thing stores a Graph as well
   * as a Diagram (ADR 0079), so writing the pair half-made is not a state this
   * surface may reach. `graphId` is required here for that reason, and the
   * schema parse is what still stands between a resolved pair and a stored one.
   *
   * The target Space reference is untouched here and cannot be reached from the
   * surface at all: it is chosen once, at creation (ADR 0068), and Space
   * Authoring refuses a changed one on its own account.
   */
  const completeSpaceThingSelection = useCallback(
    (
      thingId: ThingId,
      diagram: Pick<SpaceThingTargetDiagram, 'id'>,
      graphId: GraphId,
    ): string | null =>
      completeEditedSpaceThing(
        authoring,
        spaceSession,
        thingId,
        (document) => {
          const next: Extract<ThingDocument, { kind: 'space' }> = {
            ...document,
            diagram: diagram.id,
            graph: graphId,
          };
          if (document.diagram !== diagram.id) delete next.framing;
          return next;
        },
        'The selection is invalid.',
      ),
    [authoring, spaceSession],
  );

  const completeSpaceThingFraming = useCallback(
    (thingId: ThingId, framing: SpaceThingFraming): string | null =>
      completeEditedSpaceThing(
        authoring,
        spaceSession,
        thingId,
        (document) => ({ ...document, framing }),
        'The framing is invalid.',
      ),
    [authoring, spaceSession],
  );

  const beginTitleEditing = useCallback((thingId: string) => {
    setCaret({ thingId, field: 'title' });
  }, []);
  const getWorking = useCallback(() => spaceSession.getState().working, [spaceSession]);
  const working = useSyncExternalStore(spaceSession.subscribe, getWorking);
  const editableThingIdsKey = working.things.map((thing) => thing.id).join();
  /* eslint-disable react-hooks/exhaustive-deps -- membership key, not snapshot identity */
  const editableThingIds = useMemo(
    () => new Set(working.things.map((thing) => thing.id)),
    [editableThingIdsKey],
  );
  const spaceDocumentsKey = spaceDocumentsKeyOf(working.things);
  const spaceDocuments = useMemo(() => spaceDocumentsOf(working.things), [spaceDocumentsKey]);
  /* eslint-enable react-hooks/exhaustive-deps */
  const clearCaret = useCallback(() => {
    setCaret(null);
  }, []);
  const beginBodyEditing = useCallback((node: ThingFlowNode) => {
    setCaret({
      thingId: node.id,
      field: 'body',
      openObserved: node.data.expanded === true,
    });
  }, []);
  const onContextEditingChange = useCallback((thingId: ThingId, editing: boolean) => {
    setContextEditingIds((prev) => {
      const has = prev.has(thingId);
      if (editing === has) return prev;
      const next = new Set(prev);
      if (editing) next.add(thingId);
      else next.delete(thingId);
      return next;
    });
  }, []);
  const onContextReport = useCallback((thingId: ThingId, message: string | null) => {
    setContextNotices((prev) => {
      const current = prev.get(thingId) ?? null;
      if (current === message) return prev;
      const next = new Map(prev);
      if (message === null) next.delete(thingId);
      else next.set(thingId, message);
      return next;
    });
  }, []);

  const sharedContext = useMemo(
    () => ({
      authorOnCanvas: availability.authorOnCanvas,
      bodyEditing,
      editableThingIds,
      openThing,
      closeThing,
      beginTitleEditing,
      onSelectThing,
      thingResize,
      editingTitleThingId,
      completeThingTitle,
      clearCaret,
      thingEntityActions,
    }),
    [
      availability.authorOnCanvas,
      bodyEditing,
      editableThingIds,
      openThing,
      closeThing,
      beginTitleEditing,
      onSelectThing,
      thingResize,
      editingTitleThingId,
      completeThingTitle,
      clearCaret,
      thingEntityActions,
    ],
  );
  const markdownContext = useMemo(
    () => ({
      authorOnCanvas: availability.authorOnCanvas,
      bodyEditing,
      editableThingIds,
      beginBodyEditing,
      bodyEditorThingId,
      completeThingBody,
      clearCaret,
    }),
    [
      availability.authorOnCanvas,
      bodyEditing,
      editableThingIds,
      beginBodyEditing,
      bodyEditorThingId,
      completeThingBody,
      clearCaret,
    ],
  );
  const spaceContext = useMemo(
    () => ({
      authorOnCanvas: availability.authorOnCanvas,
      editableThingIds,
      containingSpaceId: working.id,
      spaceDocuments,
      spaceThingTargets,
      spaces,
      continuation,
      completeSpaceThingSelection,
      completeEmbedded: completeEmbeddedAuthoring,
      portalEditing,
      onPortalEditingChange,
      contextNotices,
      onContextEditingChange,
      onContextReport,
    }),
    [
      availability.authorOnCanvas,
      editableThingIds,
      working.id,
      spaceDocuments,
      spaceThingTargets,
      spaces,
      continuation,
      completeSpaceThingSelection,
      portalEditing,
      onPortalEditingChange,
      contextNotices,
      onContextEditingChange,
      onContextReport,
    ],
  );

  const withShared = useMemo(
    () =>
      nodes.map((node) => applyThingDataPatch(node, decorateSharedThingNode(node, sharedContext))),
    [nodes, sharedContext],
  );
  const markdownDecorated = useMemo(() => {
    const next = new Map<string, ThingFlowNode>();
    for (const node of withShared) {
      if (node.data.kind === 'markdown') {
        next.set(
          node.id,
          applyThingDataPatch(node, decorateMarkdownThingNode(node, markdownContext)),
        );
      }
    }
    return next;
  }, [withShared, markdownContext]);
  const spaceDecorated = useMemo(() => {
    const next = new Map<string, ThingFlowNode>();
    for (const node of withShared) {
      if (node.data.kind === 'space') {
        next.set(node.id, applyThingDataPatch(node, decorateSpaceThingNode(node, spaceContext)));
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
    titleEditing: editingTitleThingId !== null || contextEditingIds.size > 0,
    openThing,
    beginTitleEditing,
    completeSpaceThingFraming,
  };
}
