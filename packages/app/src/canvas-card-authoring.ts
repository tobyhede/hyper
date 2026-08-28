import { useCallback, useEffect, useMemo, useState } from 'react';
import { cardDocumentSchema, uuidSchema, type CardId } from '@project/core';
import type { SpaceSession } from '@project/persistence';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { describeAuthoringRefusal } from './authoring-refusal';
import { CARD_SIZE } from './card';
import type { CardResize } from './render-adapter';
import type { SpaceAuthoring } from './space-authoring';

type Caret =
  | { readonly cardId: string; readonly field: 'title' }
  | { readonly cardId: string; readonly field: 'body'; readonly openObserved: boolean }
  | null;

export interface CanvasCardAuthoringInput {
  readonly nodes: readonly CardFlowNode[];
  readonly editable: boolean;
  readonly presenting: boolean;
  /** Whether the canvas is uncovered by a modal authoring surface. */
  readonly enabled: boolean;
  readonly nameOnCreation: string | null;
  readonly authoring: SpaceAuthoring;
  readonly spaceSession: SpaceSession;
  readonly cardResize: CardResize;
  readonly onOpenAlias: (cardId: CardId) => void;
  readonly onSelectCard: (cardId: CardId) => void;
  readonly onBodyEditingChange?: ((editing: boolean) => void) | undefined;
}

export interface CanvasCardAuthoring {
  readonly nodes: CardFlowNode[];
  readonly bodyEditing: boolean;
  readonly canAuthorOnCanvas: boolean;
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
  editable,
  presenting,
  enabled,
  nameOnCreation,
  authoring,
  spaceSession,
  cardResize,
  onOpenAlias,
  onSelectCard,
  onBodyEditingChange,
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
    caret?.field === 'body' && editable && !presenting && bodyCaretNamesOpenMarkdown
      ? caret.cardId
      : null;
  const bodyEditing = bodyEditorCardId !== null;
  const canAuthorOnCanvas = editable && enabled && !presenting;

  useEffect(() => {
    onBodyEditingChange?.(bodyEditing);
  }, [bodyEditing, onBodyEditingChange]);

  const [canvasAuthoringWasEnabled, setCanvasAuthoringWasEnabled] = useState(canAuthorOnCanvas);
  if (canvasAuthoringWasEnabled !== canAuthorOnCanvas) {
    setCanvasAuthoringWasEnabled(canAuthorOnCanvas);
    if (!canAuthorOnCanvas && caret?.field === 'title') setCaret(null);
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
      if (!enabled) return 'retained';
      const cardId = uuidSchema.safeParse(cardIdInput);
      if (!cardId.success) return 'retained';
      const stored = spaceSession.getState().working.cards.find((card) => card.id === cardId.data);
      if (stored === undefined) return 'retained';
      if (stored.document.kind === 'alias') {
        onOpenAlias(cardId.data);
        return 'completed';
      }
      const result = authoring.complete({ kind: 'opened-card', cardId: cardId.data });
      return result.kind === 'completed' || result.kind === 'unchanged' ? 'completed' : 'retained';
    },
    [authoring, enabled, onOpenAlias, spaceSession],
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

  const beginTitleEditing = useCallback((cardId: string) => {
    setCaret({ cardId, field: 'title' });
  }, []);
  const working = spaceSession.getState().working;
  const editableCardIds = useMemo(() => new Set(working.cards.map((card) => card.id)), [working]);

  const decoratedNodes = useMemo(
    () =>
      nodes.map((node) => {
        const cardBelongsToWorkingSpace = editableCardIds.has(node.data.cardId);
        const data: CardFlowNode['data'] = {
          ...node.data,
          titleEditingEnabled: cardBelongsToWorkingSpace && canAuthorOnCanvas && !bodyEditing,
        };
        if (cardBelongsToWorkingSpace && canAuthorOnCanvas) {
          data.cardEditingEnabled = true;
          data.onEditCard = (open) => (open ? openCard(node.id) : closeCard(node.data.cardId));
        }
        if (cardBelongsToWorkingSpace && canAuthorOnCanvas && !bodyEditing) {
          data.onBeginTitleEditing = () => beginTitleEditing(node.id);
        }
        if (
          cardBelongsToWorkingSpace &&
          canAuthorOnCanvas &&
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
        if (cardBelongsToWorkingSpace && node.data.expanded === true && canAuthorOnCanvas) {
          data.resize = {
            minWidth: CARD_SIZE.width,
            minHeight: CARD_SIZE.height,
            onResizeStart: () => {
              onSelectCard(node.data.cardId);
              cardResize.beginResize(node.data.cardId);
            },
            onResize: (size) => cardResize.previewResize(node.data.cardId, size),
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
        if (cardBelongsToWorkingSpace && canAuthorOnCanvas && node.id === editingTitleCardId) {
          data.titleEditor = {
            onComplete: (title) => {
              const error = completeCardTitle(node.id, title);
              if (error === null) setCaret(null);
              return error;
            },
            onCancel: () => setCaret(null),
          };
        }
        return { ...node, data };
      }),
    [
      nodes,
      canAuthorOnCanvas,
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
    ],
  );

  return {
    nodes: decoratedNodes,
    bodyEditing,
    canAuthorOnCanvas,
    openCard,
    beginTitleEditing,
  };
}
