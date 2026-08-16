import { useState } from 'react';
import { type CardId } from '@project/core';
import { resolveContentCard } from '@project/graph';
import { Button } from '@project/ui';
import { OpenCard } from '#app/components/OpenCard';
import { CanvasCardNodeSpecimen } from './ReactFlowCanvas';
import { cardIds, GRAPH_PALETTE, space } from './fixture';

const markdown = (() => {
  const found = resolveContentCard(space, cardIds.strategies);
  if (found === undefined) {
    throw new Error('Missing Markdown Card editor fixture');
  }
  return found;
})();

const alias = (() => {
  const found = space.lookup.card(cardIds.openingAlias);
  if (found?.kind !== 'alias') {
    throw new Error('Missing Alias Card editor fixture');
  }
  return found;
})();

const exampleById = new Map(space.cards.map((card) => [card.id, card]));
const exampleCard = (cardId: CardId, title: string) => {
  const card = exampleById.get(cardId);
  if (card?.kind !== 'markdown') {
    throw new Error(`Missing example Card ${cardId}`);
  }
  return { ...card, title };
};
const aliasTargets = [
  exampleCard(cardIds.strategies, 'Strategies'),
  exampleCard(cardIds.problem, 'Graphs as colour-coded flows'),
  exampleCard(cardIds.traversal, 'Colour tokens per graph'),
] as const;

/** A focused production Card node wired to its production editor. */
export function CardEditorDemo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <CanvasCardNodeSpecimen
        cardId={cardIds.strategies}
        cardEditingEnabled
        onEditCard={() => setOpen(true)}
      />
      {open && (
        <OpenCard
          card={markdown}
          graphColor={GRAPH_PALETTE[2]}
          onComplete={() => null}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** A focused production Alias node wired to the kind-derived editor variant. */
export function AliasCardEditorDemo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <CanvasCardNodeSpecimen
        cardId={cardIds.openingAlias}
        cardEditingEnabled
        onEditCard={() => setOpen(true)}
      />
      {open && (
        <OpenCard
          through={alias}
          graphColor={GRAPH_PALETTE[2]}
          occurrence={{
            targets: aliasTargets,
            onEdit: (_change: { readonly title: string; readonly target: CardId }) => null,
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** The production Card dialog in its initial open state for visual reference. */
export function OpenCardEditorReference() {
  const [open, setOpen] = useState(true);

  if (!open) return <Button onClick={() => setOpen(true)}>Open dialog</Button>;

  return (
    <OpenCard
      card={markdown}
      graphColor={GRAPH_PALETTE[2]}
      onComplete={() => null}
      onCancel={() => setOpen(false)}
    />
  );
}

/** The production Alias dialog in its initial open state for visual reference. */
export function OpenAliasCardEditorReference() {
  const [open, setOpen] = useState(true);

  if (!open) return <Button onClick={() => setOpen(true)}>Open dialog</Button>;

  return (
    <OpenCard
      through={alias}
      graphColor={GRAPH_PALETTE[2]}
      occurrence={{
        targets: aliasTargets,
        onEdit: (_change: { readonly title: string; readonly target: CardId }) => null,
      }}
      onCancel={() => setOpen(false)}
    />
  );
}
