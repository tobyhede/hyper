import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  cardDocumentSchema,
  uuidSchema,
  SPACE_CARD_MIN_OPEN_SIZE,
  type CardDocument,
  type CardId,
  type GraphId,
} from '@project/core';
import type { SpaceSession } from '@project/persistence';
import type { CardFlowNode } from '@project/react-flow-adapter';
import type { CanvasSpaceCardSelection, EntityActionGroup } from '@project/ui';
import type { AuthoringAvailability } from './authoring-availability';
import { describeAuthoringRefusal } from './authoring-refusal';
import { CARD_SIZE, snapCardSizeToClose } from './card';
import type { CardResize } from './render-adapter';
import type { SpaceAuthoring } from './space-authoring';
import type { SpaceCardTarget, SpaceCardTargetLayout } from './space-card-lifecycle';
import { NO_SPACE_CARD_TARGETS, type SpaceCardTargets } from './space-card-targets';

type Caret =
  | { readonly cardId: string; readonly field: 'title' }
  | { readonly cardId: string; readonly field: 'body'; readonly openObserved: boolean }
  | null;

/**
 * The two lists an Open Space Card chooses from, and what a choice writes.
 *
 * Built here rather than in the component because the *pairing* is a domain
 * rule and not a presentation one: the Graphs offered are the selected Layout's
 * alone, so a Card whose stored Layout has since been deleted offers no
 * Graphs rather than the previous Layout's (ADR 0040, ADR 0068).
 */
const spaceCardSelection = (
  cardId: CardId,
  target: SpaceCardTarget,
  document: Extract<CardDocument, { kind: 'space' }> | undefined,
  complete: (cardId: CardId, layout: SpaceCardTargetLayout, graphId: GraphId | undefined) => void,
  disabled: boolean,
): CanvasSpaceCardSelection => {
  const selectedLayout = target.layouts.find((layout) => layout.id === document?.layout);
  const layoutOf = (id: string): SpaceCardTargetLayout | undefined =>
    target.layouts.find((layout) => layout.id === id);
  return {
    disabled,
    layouts: target.layouts.map(({ id, title }) => ({ id, title })),
    graphs: (selectedLayout?.graphs ?? []).map(({ id, title }) => ({ id, title })),
    layoutId: selectedLayout?.id ?? null,
    graphId: selectedLayout?.graphs.some((graph) => graph.id === document?.graph)
      ? (document?.graph ?? null)
      : null,
    onLayoutChange: (id) => {
      const layout = layoutOf(id);
      // The Layout's own Active Graph, and the head of its list only where it
      // has authored none — which is what an absent `activeGraph` means
      // (ADR 0026). Resolved against the Layout's Graphs rather than trusted:
      // the seed has to be a Graph this Layout owns or the aggregate refuses
      // the Card that names it.
      if (layout === undefined) return;
      const active = layout.graphs.find((graph) => graph.id === layout.activeGraph);
      complete(cardId, layout, (active ?? layout.graphs[0])?.id);
    },
    onGraphChange: (id) => {
      if (selectedLayout === undefined) return;
      const graph = selectedLayout.graphs.find((candidate) => candidate.id === id);
      if (graph !== undefined) complete(cardId, selectedLayout, graph.id);
    },
  };
};

export interface CanvasCardAuthoringInput {
  readonly nodes: readonly CardFlowNode[];
  /**
   * What may be authored right now, answered once for the whole application.
   *
   * Two answers are read here, and they are deliberately different: every
   * control drawn on a Card is `authorOnCanvas`, while a *live* content editor
   * is `editCardBody`, which a modal pane does not withdraw.
   */
  readonly availability: AuthoringAvailability;
  readonly nameOnCreation: string | null;
  readonly authoring: Pick<SpaceAuthoring, 'complete'>;
  readonly spaceSession: SpaceSession;
  readonly cardResize: CardResize;
  readonly onSelectCard: (cardId: CardId) => void;
  readonly onBodyEditingChange?: ((editing: boolean) => void) | undefined;
  readonly onTitleEditingChange?: ((editing: boolean) => void) | undefined;
  /**
   * What each referenced Space offers a Space Card to select, keyed by target.
   *
   * Absent, or missing an entry, means the target has not been read yet — the
   * Card still draws, without the context and the selectors an Open one carries
   * (ADR 0068).
   */
  readonly spaceCardTargets?: SpaceCardTargets | undefined;
  /**
   * What commands each Card on this canvas offers, asked one Card at a time.
   *
   * A function rather than a built list, for the reason the Space's command
   * surface takes one: what a command *is* — the address it copies, the Edit it
   * runs — belongs to the composition that owns both, while this module knows
   * only which Cards are on the canvas and which of them may be authored.
   *
   * Absent leaves every Card exactly as it was, which is what a read-only or
   * embedded canvas wants: a Card drawn where none of these commands can run
   * offers no menu rather than one that refuses.
   */
  readonly cardEntityActions?: ((cardId: CardId) => readonly EntityActionGroup[]) | undefined;
}

export interface CanvasCardAuthoring {
  readonly nodes: CardFlowNode[];
  readonly bodyEditing: boolean;
  readonly titleEditing: boolean;
  readonly openCard: (cardId: string) => 'completed' | 'retained';
  readonly beginTitleEditing: (cardId: string) => void;
}

/**
 * The complete canvas-local Card interaction: caret ownership, Open/Edit
 * composition, completion translation and the operations projected onto each
 * Card. Space Authoring remains authoritative for every completed Edit.
 */
export function useCanvasCardAuthoring({
  nodes,
  availability,
  nameOnCreation,
  authoring,
  spaceSession,
  cardResize,
  onSelectCard,
  onBodyEditingChange,
  onTitleEditingChange,
  spaceCardTargets = NO_SPACE_CARD_TARGETS,
  cardEntityActions,
}: CanvasCardAuthoringInput): CanvasCardAuthoring {
  const [caret, setCaret] = useState<Caret>(null);
  const editingTitleCardId = caret?.field === 'title' ? caret.cardId : null;
  const bodyCaretNamesOpenMarkdown =
    caret?.field === 'body' &&
    nodes.some(
      (node) =>
        node.id === caret.cardId && node.data.expanded === true && node.data.kind === 'markdown',
    );

  if (caret?.field === 'body') {
    if (bodyCaretNamesOpenMarkdown && !caret.openObserved) {
      setCaret({ ...caret, openObserved: true });
    } else if (!bodyCaretNamesOpenMarkdown && caret.openObserved) {
      setCaret(null);
    }
  }

  const bodyEditorCardId =
    caret?.field === 'body' && availability.editCardBody && bodyCaretNamesOpenMarkdown
      ? caret.cardId
      : null;
  const bodyEditing = bodyEditorCardId !== null;

  useEffect(() => {
    onBodyEditingChange?.(bodyEditing);
  }, [bodyEditing, onBodyEditingChange]);
  useEffect(() => {
    onTitleEditingChange?.(editingTitleCardId !== null);
    // Returning the Space chrome on unmount is the whole of the safety net,
    // and it is narrower than "a Layout change remounts the canvas" would
    // suggest. Only a Layout move that drops the projection unmounts this
    // canvas; a move made *through* a completed Edit installs the next
    // projection instead, so the canvas stays mounted and the caret with it —
    // even where the Card it names has left `nodes`, since the caret is keyed
    // by Card id and nothing here watches them. So a surface that moves the
    // Layout that way withdraws itself while the caret is held rather than
    // relying on this, and what remains here is the unmount case: a canvas that
    // goes away must not leave the chrome withdrawn against an editor no
    // callback will ever settle.
    return () => onTitleEditingChange?.(false);
  }, [editingTitleCardId, onTitleEditingChange]);

  const [canvasAuthoringWasEnabled, setCanvasAuthoringWasEnabled] = useState(
    availability.authorOnCanvas,
  );
  if (canvasAuthoringWasEnabled !== availability.authorOnCanvas) {
    setCanvasAuthoringWasEnabled(availability.authorOnCanvas);
    if (!availability.authorOnCanvas && caret?.field === 'title') setCaret(null);
  }

  const [lastCreatedCardId, setLastCreatedCardId] = useState(nameOnCreation);
  if (lastCreatedCardId !== nameOnCreation) {
    setLastCreatedCardId(nameOnCreation);
    if (nameOnCreation !== null && !bodyEditing) {
      setCaret({ cardId: nameOnCreation, field: 'title' });
    }
  }

  const openCard = useCallback(
    (cardIdInput: string): 'completed' | 'retained' => {
      if (!availability.authorOnCanvas) return 'retained';
      const cardId = uuidSchema.safeParse(cardIdInput);
      if (!cardId.success) return 'retained';
      const stored = spaceSession.getState().working.cards.find((card) => card.id === cardId.data);
      if (stored === undefined) return 'retained';
      // Every Card kind Opens, and there is deliberately no kind guard left
      // here. Opening is one Layout-owned operation (ADR 0064) and each kind
      // differs only in what its front then draws: Markdown of its own, an
      // immutable Target's read-only (ADR 0070), or the Layout a Space Card
      // selects (ADR 0068). The guard this replaced admitted two kinds and
      // silently retained the third, which is a decision about *content* being
      // made by the code that authors placement.
      const result = authoring.complete({ kind: 'opened-card', cardId: cardId.data });
      return result.kind === 'completed' || result.kind === 'unchanged' ? 'completed' : 'retained';
    },
    [authoring, availability.authorOnCanvas, spaceSession],
  );

  const closeCard = useCallback(
    (cardId: CardId): 'completed' | 'retained' => {
      const result = authoring.complete({ kind: 'closed-card', cardId });
      return result.kind === 'completed' || result.kind === 'unchanged' ? 'completed' : 'retained';
    },
    [authoring],
  );

  const completeCardBody = useCallback(
    (cardId: CardId, body: string): 'completed' | 'retained' => {
      const stored = spaceSession.getState().working.cards.find((card) => card.id === cardId);
      if (stored?.document.kind !== 'markdown') return 'retained';
      const parsed = cardDocumentSchema.safeParse({ ...stored.document, body });
      if (!parsed.success) return 'retained';
      const result = authoring.complete({ kind: 'edited-card', cardId, document: parsed.data });
      return result.kind === 'completed' || result.kind === 'unchanged' ? 'completed' : 'retained';
    },
    [authoring, spaceSession],
  );

  const completeCardTitle = useCallback(
    (cardIdInput: string, title: string): string | null => {
      const cardId = uuidSchema.safeParse(cardIdInput);
      if (!cardId.success) return 'This Card is no longer available.';
      const stored = spaceSession.getState().working.cards.find((card) => card.id === cardId.data);
      if (stored === undefined) return 'This Card is no longer available.';
      const named = title.trim();
      const parsed = cardDocumentSchema.safeParse({ ...stored.document, title: named });
      if (!parsed.success) {
        return named.length === 0
          ? 'A Card title is required.'
          : (parsed.error.issues[0]?.message ?? 'The Card title is invalid.');
      }
      const result = authoring.complete({
        kind: 'edited-card',
        cardId: cardId.data,
        document: parsed.data,
      });
      return result.kind === 'refused' ? describeAuthoringRefusal(result.refusal) : null;
    },
    [authoring, spaceSession],
  );

  /**
   * Authoring a Space Card's Layout or Graph selection.
   *
   * One operation for both, because they are not independent: a Graph is owned
   * by the Layout that holds it (ADR 0040), and the aggregate refuses a Card
   * naming a Graph its Layout does not own. So choosing a Layout re-seeds
   * the Graph from that Layout rather than leaving the previous one to be
   * refused at intake, and a Layout with no Graph leaves the selection unwritten
   * rather than pointing at nothing.
   *
   * The target Space reference is untouched here and cannot be reached from the
   * surface at all: it is chosen once, at creation (ADR 0068), and Space
   * Authoring refuses a changed one on its own account.
   */
  const completeSpaceCardSelection = useCallback(
    (cardId: CardId, layout: SpaceCardTargetLayout, graphId: GraphId | undefined): void => {
      const stored = spaceSession.getState().working.cards.find((card) => card.id === cardId);
      if (stored?.document.kind !== 'space') return;
      const document: CardDocument = { ...stored.document, layout: layout.id };
      const parsed = cardDocumentSchema.safeParse(
        graphId === undefined ? { ...document, graph: undefined } : { ...document, graph: graphId },
      );
      if (!parsed.success) return;
      authoring.complete({ kind: 'edited-card', cardId, document: parsed.data });
    },
    [authoring, spaceSession],
  );

  const beginTitleEditing = useCallback((cardId: string) => {
    setCaret({ cardId, field: 'title' });
  }, []);
  const getWorking = useCallback(() => spaceSession.getState().working, [spaceSession]);
  const working = useSyncExternalStore(spaceSession.subscribe, getWorking);
  const editableCardIds = useMemo(() => new Set(working.cards.map((card) => card.id)), [working]);

  const decoratedNodes = useMemo(
    () =>
      nodes.map((node) => {
        const cardBelongsToWorkingSpace = editableCardIds.has(node.data.cardId);
        const data: CardFlowNode['data'] = {
          ...node.data,
          titleEditingEnabled:
            cardBelongsToWorkingSpace && availability.authorOnCanvas && !bodyEditing,
        };
        if (cardBelongsToWorkingSpace && availability.authorOnCanvas) {
          data.cardEditingEnabled = true;
          data.onEditCard = (open) => (open ? openCard(node.id) : closeCard(node.data.cardId));
        }
        if (cardBelongsToWorkingSpace && availability.authorOnCanvas && !bodyEditing) {
          data.onBeginTitleEditing = () => beginTitleEditing(node.id);
        }
        if (
          cardBelongsToWorkingSpace &&
          availability.authorOnCanvas &&
          !bodyEditing &&
          node.data.kind === 'markdown'
        ) {
          data.onBeginBodyEditing = () =>
            setCaret({
              cardId: node.id,
              field: 'body',
              openObserved: node.data.expanded === true,
            });
        }
        if (
          cardBelongsToWorkingSpace &&
          node.data.expanded === true &&
          availability.authorOnCanvas
        ) {
          // Ordinary Open proposals preserve the Space footer. The gesture
          // itself still reaches Closed Size so ADR 0066's magnet can Close it.
          const floor = node.data.kind === 'space' ? SPACE_CARD_MIN_OPEN_SIZE : CARD_SIZE;
          data.resize = {
            minWidth: CARD_SIZE.width,
            minHeight: CARD_SIZE.height,
            onResizeStart: () => {
              onSelectCard(node.data.cardId);
              cardResize.beginResize(node.data.cardId);
            },
            onResize: (size) => {
              const proposed = snapCardSizeToClose(size);
              cardResize.previewResize(
                node.data.cardId,
                proposed === CARD_SIZE
                  ? proposed
                  : {
                      width: Math.max(floor.width, size.width),
                      height: Math.max(floor.height, size.height),
                    },
              );
            },
            onResizeEnd: () => cardResize.finishResize(node.data.cardId),
            onResizeCancel: () => cardResize.cancelResize(node.data.cardId),
          };
        }
        if (
          cardBelongsToWorkingSpace &&
          node.data.kind === 'markdown' &&
          bodyEditorCardId === node.id
        ) {
          data.bodyEditor = {
            onComplete: (body) => completeCardBody(node.data.cardId, body),
            onEnd: () => setCaret(null),
          };
        }
        if (
          cardBelongsToWorkingSpace &&
          availability.authorOnCanvas &&
          node.id === editingTitleCardId
        ) {
          data.titleEditor = {
            onComplete: (title) => {
              const error = completeCardTitle(node.id, title);
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
        // one cluster that survived it, on a Card whose every other control has
        // gone.
        if (
          cardEntityActions !== undefined &&
          cardBelongsToWorkingSpace &&
          availability.authorOnCanvas
        ) {
          data.entityActions = cardEntityActions(node.data.cardId);
        }
        if (node.data.kind === 'space') {
          const stored = working.cards.find((card) => card.id === node.data.cardId);
          const target =
            stored?.document.kind === 'space'
              ? spaceCardTargets.get(stored.document.spaceId)
              : undefined;
          if (target !== undefined) {
            data.spaceTitle = target.title;
            // Supplied whenever the target has been read, and *disabled* rather
            // than withheld where it cannot be authored. An absent selection is
            // how the Card says the target Space has not been read yet, so a
            // canvas that had merely withdrawn authoring — a creation pane is
            // up, the Space is presenting, a chrome title is being edited —
            // would put every Open Space Card on it back to reporting a wait
            // that had already ended, beside a marker naming the Space it had
            // just read.
            data.spaceSelection = spaceCardSelection(
              node.data.cardId,
              target,
              stored?.document.kind === 'space' ? stored.document : undefined,
              completeSpaceCardSelection,
              !(cardBelongsToWorkingSpace && availability.authorOnCanvas),
            );
          }
        }
        return { ...node, data };
      }),
    [
      nodes,
      availability.authorOnCanvas,
      bodyEditing,
      openCard,
      closeCard,
      beginTitleEditing,
      onSelectCard,
      cardResize,
      bodyEditorCardId,
      completeCardBody,
      editingTitleCardId,
      completeCardTitle,
      editableCardIds,
      working,
      spaceCardTargets,
      completeSpaceCardSelection,
      cardEntityActions,
    ],
  );

  return {
    nodes: decoratedNodes,
    bodyEditing,
    titleEditing: editingTitleCardId !== null,
    openCard,
    beginTitleEditing,
  };
}
