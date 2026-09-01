import type { CardDocument, LayoutPosition, SpaceSnapshot, UUID } from '@project/core';
import { initializeSpace, loadSpace } from '@project/graph';
import type { CommitResult, SpaceBackend, SpaceSessionRegistry } from '@project/persistence';
import { snapshotFromSpace, withCardRemovedFromLayouts } from './snapshot';

export interface SpaceCardLifecycleOptions {
  readonly backend: SpaceBackend;
  readonly registry: SpaceSessionRegistry;
  readonly newId: () => UUID;
}

export interface CreateSpaceCardInput {
  readonly containingSpaceId: UUID;
  readonly layoutId: UUID;
  readonly title: string;
  readonly position: LayoutPosition;
}

export interface LinkSpaceCardInput extends CreateSpaceCardInput {
  readonly targetSpaceId: UUID;
  readonly spaceView?: UUID;
  readonly graph?: UUID;
}

export interface DeleteSpaceCardInput {
  readonly containingSpaceId: UUID;
  readonly cardId: UUID;
}

export interface SpaceCardLifecycle {
  readonly create: (input: CreateSpaceCardInput) => Promise<CommitResult>;
  readonly link: (input: LinkSpaceCardInput) => Promise<CommitResult>;
  readonly delete: (input: DeleteSpaceCardInput) => Promise<CommitResult>;
}

const withSpaceCard = (
  snapshot: SpaceSnapshot,
  layoutId: UUID,
  cardId: UUID,
  document: CardDocument,
  position: LayoutPosition,
): SpaceSnapshot => {
  const layouts = snapshot.document.layouts ?? [];
  if (!layouts.some((layout) => layout.id === layoutId)) {
    throw new Error(`Layout ${layoutId} does not belong to Space ${snapshot.id}`);
  }
  return {
    ...snapshot,
    cards: [...snapshot.cards, { id: cardId, document }],
    document: {
      ...snapshot.document,
      layouts: layouts.map((layout) =>
        layout.id === layoutId
          ? {
              ...layout,
              positions: { ...layout.positions, [cardId]: { ...position, open: false } },
            }
          : layout,
      ),
    },
  };
};

export function createSpaceCardLifecycle({
  backend,
  registry,
  newId,
}: SpaceCardLifecycleOptions): SpaceCardLifecycle {
  const containingSnapshot = (spaceId: UUID): SpaceSnapshot => {
    const session = registry.session(spaceId);
    if (session === undefined) throw new Error(`Space ${spaceId} has no live session`);
    return session.getState().working;
  };

  const link = async ({
    containingSpaceId,
    layoutId,
    targetSpaceId,
    title,
    position,
    spaceView,
    graph,
  }: LinkSpaceCardInput): Promise<CommitResult> => {
    let document: CardDocument = {
      title,
      kind: 'space',
      spaceId: targetSpaceId,
    };
    if (spaceView !== undefined) document = { ...document, spaceView };
    if (graph !== undefined) document = { ...document, graph };
    const cardId = newId();
    return registry.submit([
      {
        kind: 'update',
        spaceId: containingSpaceId,
        edit: (current) => withSpaceCard(current, layoutId, cardId, document, position),
      },
    ]);
  };

  return {
    create: async ({ containingSpaceId, layoutId, title, position }) => {
      const initialized = initializeSpace({ title, newId });
      const loaded = loadSpace(initialized.file, initialized.cardFiles);
      if (!loaded.ok) {
        throw new Error(loaded.errors.map(({ message }) => message).join('\n'));
      }
      const target = snapshotFromSpace(loaded.space);
      const cardId = newId();
      return registry.submit([
        {
          kind: 'update',
          spaceId: containingSpaceId,
          edit: (current) =>
            withSpaceCard(
              current,
              layoutId,
              cardId,
              { title, kind: 'space', spaceId: target.id },
              position,
            ),
        },
        { kind: 'create', snapshot: target },
      ]);
    },
    link,
    delete: async ({ containingSpaceId, cardId }) => {
      const aggregate = await backend.loadAggregate();
      const source = containingSnapshot(containingSpaceId);
      const deletedCard = source.cards.find(({ id }) => id === cardId);
      if (deletedCard?.document.kind !== 'space') {
        throw new Error(`Card ${cardId} is not a Space Card in Space ${containingSpaceId}`);
      }
      const withoutCard = (snapshot: SpaceSnapshot): SpaceSnapshot => ({
        ...withCardRemovedFromLayouts(snapshot, cardId),
        cards: snapshot.cards.filter(({ id }) => id !== cardId),
      });
      // The reachability arithmetic below needs a candidate now; the commit
      // re-applies the same edit to whatever the session holds when its
      // in-flight work has drained.
      const updatedSource = withoutCard(source);

      const snapshots = new Map(
        aggregate.spaces.map((loaded) => [loaded.snapshot.id, loaded.snapshot]),
      );
      snapshots.set(containingSpaceId, updatedSource);
      const inbound = new Map<UUID, number>();
      for (const snapshot of snapshots.values()) inbound.set(snapshot.id, 0);
      for (const snapshot of snapshots.values()) {
        for (const card of snapshot.cards) {
          if (card.document.kind === 'space') {
            inbound.set(card.document.spaceId, (inbound.get(card.document.spaceId) ?? 0) + 1);
          }
        }
      }

      const deletedIds: UUID[] = [];
      const pending: UUID[] =
        deletedCard.document.spaceId === aggregate.metaSpaceId ||
        (inbound.get(deletedCard.document.spaceId) ?? 0) !== 0
          ? []
          : [deletedCard.document.spaceId];
      for (const spaceId of pending) {
        if (deletedIds.includes(spaceId)) continue;
        const snapshot = snapshots.get(spaceId);
        if (snapshot === undefined) continue;
        deletedIds.push(spaceId);
        for (const card of snapshot.cards) {
          if (card.document.kind !== 'space') continue;
          const nextCount = (inbound.get(card.document.spaceId) ?? 0) - 1;
          inbound.set(card.document.spaceId, nextCount);
          if (card.document.spaceId !== aggregate.metaSpaceId && nextCount === 0) {
            pending.push(card.document.spaceId);
          }
        }
      }

      for (const spaceId of deletedIds) {
        const loaded = aggregate.spaces.find(({ snapshot }) => snapshot.id === spaceId);
        if (loaded !== undefined && registry.session(spaceId) === undefined) registry.open(loaded);
      }
      return registry.submit([
        { kind: 'update', spaceId: containingSpaceId, edit: withoutCard },
        ...deletedIds.map((spaceId) => ({ kind: 'delete' as const, spaceId })),
      ]);
    },
  };
}
