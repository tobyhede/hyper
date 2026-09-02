import type { Card, Graph, GraphId, UUID } from '@project/core';
import {
  Placement,
  positionedStrategy,
  type LayoutStrategy,
  type ResolvedLayout,
  type Space,
} from '@project/graph';

/** The exact authored content one Layout draws. */
export interface RendererSubject {
  readonly cards: readonly Card[];
  readonly graphs: readonly Graph[];
}

/** The only V1 canvas renderer: one authored Layout. */
export interface ResolvedRenderer {
  readonly resolvedLayout: ResolvedLayout;
  readonly subject: RendererSubject;
  readonly strategy: LayoutStrategy;
}

export type CanvasRendererId = UUID;

export type RendererInvariantReason = 'renderer-not-found' | 'invalid-subject';

export class RendererInvariantError extends Error {
  readonly reason: RendererInvariantReason;

  constructor(reason: RendererInvariantReason, message: string) {
    super(message);
    this.name = 'RendererInvariantError';
    this.reason = reason;
  }
}

export const layoutNotFound = (layoutId: UUID): RendererInvariantError =>
  new RendererInvariantError(
    'renderer-not-found',
    `The selected Layout ${layoutId} does not exist.`,
  );

function layoutSubject(
  space: Space,
  resolved: ResolvedLayout,
  members: Placement,
): RendererSubject {
  return {
    cards: space.cards.filter((card) => members.has(card.id)),
    graphs: resolved.layout.graphs,
  };
}

export function checkSubject(
  space: Space,
  rendererId: UUID,
  subject: RendererSubject,
): RendererSubject {
  const cardIds = new Set<UUID>();
  for (const card of subject.cards) {
    if (space.lookup.card(card.id) !== card || cardIds.has(card.id)) {
      throw new RendererInvariantError(
        'invalid-subject',
        `The renderer ${rendererId} selected an invalid Card ${card.id}.`,
      );
    }
    cardIds.add(card.id);
  }

  const graphIds = new Set<GraphId>();
  for (const graph of subject.graphs) {
    if (space.lookup.graph(graph.id)?.graph !== graph || graphIds.has(graph.id)) {
      throw new RendererInvariantError(
        'invalid-subject',
        `The renderer ${rendererId} selected an invalid Graph ${graph.id}.`,
      );
    }
    graphIds.add(graph.id);
  }
  return subject;
}

export type ResolveRenderer = (space: Space, selection?: CanvasRendererId) => ResolvedRenderer;

export const canvasRendererKey = (selection: CanvasRendererId): string => selection;

/** Resolve the durable opening Layout. Working-space intake guarantees it exists. */
export function defaultLayout(space: Space): CanvasRendererId {
  if (space.defaultLayout === undefined) {
    throw new RendererInvariantError('renderer-not-found', 'The Space has no default Layout.');
  }
  return space.defaultLayout;
}

export function createRendererResolver(): ResolveRenderer {
  return (space, selection = defaultLayout(space)) => {
    const resolvedLayout = space.lookup.layout(selection);
    if (resolvedLayout === undefined) throw layoutNotFound(selection);
    const members = Placement.fromLayout(resolvedLayout.layout);
    return {
      resolvedLayout,
      subject: checkSubject(
        space,
        resolvedLayout.layout.id,
        layoutSubject(space, resolvedLayout, members),
      ),
      strategy: positionedStrategy(members),
    };
  };
}
