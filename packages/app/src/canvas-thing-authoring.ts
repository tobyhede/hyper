import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  THING_TITLE_REQUIRED,
  thingDocumentSchema,
  uuidSchema,
  SPACE_THING_MIN_OPEN_SIZE,
  type ThingDocument,
  type ThingId,
  type GraphId,
} from '@project/core';
import type { SpaceSession } from '@project/persistence';
import type { ThingFlowNode } from '@project/react-flow-adapter';
import type { CanvasSpaceThingSelection, EntityActionGroup } from '@project/ui';
import type { AuthoringAvailability } from './authoring-availability';
import { describeAuthoringRefusal } from './authoring-refusal';
import { THING_SIZE, snapThingSizeToClose } from './thing';
import type { ThingResize } from './render-adapter';
import type { SpaceAuthoring } from './space-authoring';
import type { SpaceThingTarget, SpaceThingTargetDiagram } from './space-thing-lifecycle';
import { NO_SPACE_THING_TARGETS, type SpaceThingTargets } from './space-thing-targets';

type Caret =
  | { readonly thingId: string; readonly field: 'title' }
  | { readonly thingId: string; readonly field: 'body'; readonly openObserved: boolean }
  | null;

/**
 * The two lists an Open Space Thing chooses from, and what a choice writes.
 *
 * Built here rather than in the component because the *pairing* is a domain
 * rule and not a presentation one: the Graphs offered are the selected Diagram's
 * alone, so a Thing whose stored Diagram has since been deleted offers no
 * Graphs rather than the previous Diagram's (ADR 0040, ADR 0068).
 */
const spaceThingSelection = (
  thingId: ThingId,
  target: SpaceThingTarget,
  document: Extract<ThingDocument, { kind: 'space' }> | undefined,
  complete: (thingId: ThingId, diagram: SpaceThingTargetDiagram, graphId: GraphId) => void,
  disabled: boolean,
): CanvasSpaceThingSelection => {
  const selectedDiagram = target.diagrams.find((diagram) => diagram.id === document?.diagram);
  const diagramOf = (id: string): SpaceThingTargetDiagram | undefined =>
    target.diagrams.find((diagram) => diagram.id === id);
  return {
    disabled,
    diagrams: target.diagrams.map(({ id, title }) => ({ id, title })),
    graphs: (selectedDiagram?.graphs ?? []).map(({ id, title }) => ({ id, title })),
    diagramId: selectedDiagram?.id ?? null,
    graphId: selectedDiagram?.graphs.some((graph) => graph.id === document?.graph)
      ? (document?.graph ?? null)
      : null,
    onDiagramChange: (id) => {
      const diagram = diagramOf(id);
      // The Diagram's own Active Graph, and the head of its list only where it
      // has authored none — which is what an absent `activeGraph` means
      // (ADR 0026). Resolved against the Diagram's Graphs rather than trusted:
      // the seed has to be a Graph this Diagram owns or the aggregate refuses
      // the Thing that names it.
      if (diagram === undefined) return;
      const seed = diagram.graphs.find((graph) => graph.id === diagram.activeGraph) ?? diagram.graphs[0];
      // A Diagram owns at least one Graph, so this is the type-level boundary
      // between a validated Space and the ids read out of it, not a Diagram an
      // author can choose and leave half-selected.
      if (seed === undefined) return;
      complete(thingId, diagram, seed.id);
    },
    onGraphChange: (id) => {
      if (selectedDiagram === undefined) return;
      const graph = selectedDiagram.graphs.find((candidate) => candidate.id === id);
      if (graph !== undefined) complete(thingId, selectedDiagram, graph.id);
    },
  };
};

export interface CanvasThingAuthoringInput {
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
   * Thing still draws, without the context and the selectors an Open one carries
   * (ADR 0068).
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
}

export interface CanvasThingAuthoring {
  readonly nodes: ThingFlowNode[];
  readonly bodyEditing: boolean;
  readonly titleEditing: boolean;
  readonly openThing: (thingId: string) => 'completed' | 'retained';
  readonly beginTitleEditing: (thingId: string) => void;
}

/**
 * The complete canvas-local Thing interaction: caret ownership, Open/Edit
 * composition, completion translation and the operations projected onto each
 * Thing. Space Authoring remains authoritative for every completed Edit.
 */
export function useCanvasThingAuthoring({
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
}: CanvasThingAuthoringInput): CanvasThingAuthoring {
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
    onTitleEditingChange?.(editingTitleThingId !== null);
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
  }, [editingTitleThingId, onTitleEditingChange]);

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
      const result = authoring.complete({ kind: 'closed-thing', thingId });
      return result.kind === 'completed' || result.kind === 'unchanged' ? 'completed' : 'retained';
    },
    [authoring],
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
   * schema parse below is what still stands between a resolved pair and a
   * stored one.
   *
   * The target Space reference is untouched here and cannot be reached from the
   * surface at all: it is chosen once, at creation (ADR 0068), and Space
   * Authoring refuses a changed one on its own account.
   */
  const completeSpaceThingSelection = useCallback(
    (thingId: ThingId, diagram: SpaceThingTargetDiagram, graphId: GraphId): void => {
      const stored = spaceSession.getState().working.things.find((thing) => thing.id === thingId);
      if (stored?.document.kind !== 'space') return;
      const document: ThingDocument = { ...stored.document, diagram: diagram.id, graph: graphId };
      const parsed = thingDocumentSchema.safeParse(document);
      if (!parsed.success) return;
      authoring.complete({ kind: 'edited-thing', thingId, document: parsed.data });
    },
    [authoring, spaceSession],
  );

  const beginTitleEditing = useCallback((thingId: string) => {
    setCaret({ thingId, field: 'title' });
  }, []);
  const getWorking = useCallback(() => spaceSession.getState().working, [spaceSession]);
  const working = useSyncExternalStore(spaceSession.subscribe, getWorking);
  const editableThingIds = useMemo(
    () => new Set(working.things.map((thing) => thing.id)),
    [working],
  );

  const decoratedNodes = useMemo(
    () =>
      nodes.map((node) => {
        const thingBelongsToWorkingSpace = editableThingIds.has(node.data.thingId);
        const data: ThingFlowNode['data'] = {
          ...node.data,
          titleEditingEnabled:
            thingBelongsToWorkingSpace && availability.authorOnCanvas && !bodyEditing,
        };
        if (thingBelongsToWorkingSpace && availability.authorOnCanvas) {
          data.thingEditingEnabled = true;
          data.onEditThing = (open) => (open ? openThing(node.id) : closeThing(node.data.thingId));
        }
        if (thingBelongsToWorkingSpace && availability.authorOnCanvas && !bodyEditing) {
          data.onBeginTitleEditing = () => beginTitleEditing(node.id);
        }
        if (
          thingBelongsToWorkingSpace &&
          availability.authorOnCanvas &&
          !bodyEditing &&
          node.data.kind === 'markdown'
        ) {
          data.onBeginBodyEditing = () =>
            setCaret({
              thingId: node.id,
              field: 'body',
              openObserved: node.data.expanded === true,
            });
        }
        if (
          thingBelongsToWorkingSpace &&
          node.data.expanded === true &&
          availability.authorOnCanvas
        ) {
          // Ordinary Open proposals preserve the Space footer. The gesture
          // itself still reaches Closed Size so ADR 0066's magnet can Close it.
          const floor = node.data.kind === 'space' ? SPACE_THING_MIN_OPEN_SIZE : THING_SIZE;
          data.resize = {
            minWidth: THING_SIZE.width,
            minHeight: THING_SIZE.height,
            onResizeStart: () => {
              onSelectThing(node.data.thingId);
              thingResize.beginResize(node.data.thingId);
            },
            onResize: (size) => {
              const proposed = snapThingSizeToClose(size);
              thingResize.previewResize(
                node.data.thingId,
                proposed === THING_SIZE
                  ? proposed
                  : {
                      width: Math.max(floor.width, size.width),
                      height: Math.max(floor.height, size.height),
                    },
              );
            },
            onResizeEnd: () => thingResize.finishResize(node.data.thingId),
            onResizeCancel: () => thingResize.cancelResize(node.data.thingId),
          };
        }
        if (
          thingBelongsToWorkingSpace &&
          node.data.kind === 'markdown' &&
          bodyEditorThingId === node.id
        ) {
          data.bodyEditor = {
            onComplete: (body) => completeThingBody(node.data.thingId, body),
            onEnd: () => setCaret(null),
          };
        }
        if (
          thingBelongsToWorkingSpace &&
          availability.authorOnCanvas &&
          node.id === editingTitleThingId
        ) {
          data.titleEditor = {
            onComplete: (title) => {
              const error = completeThingTitle(node.id, title);
              if (error === null) setCaret(null);
              return error;
            },
            onCancel: () => setCaret(null),
          };
        }
        // The same gate every other control on the rail takes, and for the same
        // reason rather than by analogy: these commands are drawn *in* that
        // rail, so a canvas that has withdrawn authoring — presenting, a
        // creation pane, a live chrome rename — would otherwise reinstate the
        // one cluster that survived it, on a Thing whose every other control has
        // gone.
        if (
          thingEntityActions !== undefined &&
          thingBelongsToWorkingSpace &&
          availability.authorOnCanvas
        ) {
          data.entityActions = thingEntityActions(node.data.thingId);
        }
        if (node.data.kind === 'space') {
          const stored = working.things.find((thing) => thing.id === node.data.thingId);
          const target =
            stored?.document.kind === 'space'
              ? spaceThingTargets.get(stored.document.spaceId)
              : undefined;
          if (target !== undefined) {
            // Supplied whenever the target has been read, and *disabled* rather
            // than withheld where it cannot be authored. An absent selection is
            // how the Thing says the target Space has not been read yet, so a
            // canvas that had merely withdrawn authoring — a creation pane is
            // up, the Space is presenting, a chrome title is being edited —
            // would put every Open Space Thing on it back to reporting a wait
            // that had already ended.
            data.spaceSelection = spaceThingSelection(
              node.data.thingId,
              target,
              stored?.document.kind === 'space' ? stored.document : undefined,
              completeSpaceThingSelection,
              !(thingBelongsToWorkingSpace && availability.authorOnCanvas),
            );
          }
        }
        return { ...node, data };
      }),
    [
      nodes,
      availability.authorOnCanvas,
      bodyEditing,
      openThing,
      closeThing,
      beginTitleEditing,
      onSelectThing,
      thingResize,
      bodyEditorThingId,
      completeThingBody,
      editingTitleThingId,
      completeThingTitle,
      editableThingIds,
      working,
      spaceThingTargets,
      completeSpaceThingSelection,
      thingEntityActions,
    ],
  );

  return {
    nodes: decoratedNodes,
    bodyEditing,
    titleEditing: editingTitleThingId !== null,
    openThing,
    beginTitleEditing,
  };
}
