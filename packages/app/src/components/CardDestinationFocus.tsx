import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { CardId } from '@project/core';

/** Focus and centre the Card named by a URL after its canvas projection exists. */
export function CardDestinationFocus({
  cardId,
  ready,
}: {
  readonly cardId: CardId | null;
  readonly ready: boolean;
}) {
  const flow = useReactFlow();

  useEffect(() => {
    if (!ready || cardId === null || flow.getNode(cardId) === undefined) return;
    void flow.fitView({ nodes: [{ id: cardId }], padding: 0.5, duration: 0 }).then(() => {
      document
        .querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(cardId)}"]`)
        ?.focus();
    });
  }, [cardId, flow, ready]);

  return null;
}
