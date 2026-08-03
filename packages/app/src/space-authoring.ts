import { newUuid, type CardId, type SpaceSnapshot, type UUID } from '@project/core';
import { loadSpaceSnapshot, type LayoutPoint } from '@project/graph';
import type { SpaceSession, SpaceSessionState } from '@project/persistence';
import type { Navigation, NavigationState } from './navigation';
import { updatePositionedLayout } from './snapshot';

export type AuthoringCompletion =
  | { readonly kind: 'settled-card-movement' }
  | { readonly kind: 'connected-cards'; readonly from: CardId; readonly to: CardId }
  | {
      readonly kind: 'create-and-connect';
      readonly from: CardId;
      readonly position: LayoutPoint;
    };

export type AuthoringResult =
  | { readonly kind: 'completed'; readonly createdCardId?: CardId }
  | { readonly kind: 'no-edit' }
  | { readonly kind: 'queued' };

export interface SpaceAuthoringState {
  readonly placement: ReadonlyMap<string, LayoutPoint> | null;
  readonly session: SpaceSessionState;
  readonly navigation: NavigationState;
}

export interface SpaceAuthoring {
  readonly getState: () => SpaceAuthoringState;
  /** Placement data only when the selected renderer is an authored Layout. */
  readonly authoredPlacement: () => ReadonlyMap<string, LayoutPoint> | null;
  readonly subscribe: (listener: () => void) => () => void;
  readonly installPlacement: (placement: ReadonlyMap<string, LayoutPoint> | null) => void;
  readonly canConnect: (from: CardId, to: CardId) => boolean;
  readonly canCreateConnectedCard: (from: CardId) => boolean;
  readonly complete: (completion: AuthoringCompletion) => AuthoringResult;
  readonly retryPersistence: () => void;
}

interface SpaceAuthoringDependencies {
  readonly session: SpaceSession;
  readonly navigation: Navigation;
  readonly initialPlacement?: ReadonlyMap<string, LayoutPoint> | null;
  readonly reportObserverError?: (error: unknown) => void;
}

function nextLayoutTitle(snapshot: SpaceSnapshot): string {
  const numbered = /^Layout ([1-9]\d*)$/;
  let highest = 0n;
  for (const layout of snapshot.document.layouts ?? []) {
    const match = numbered.exec(layout.title);
    if (match?.[1] === undefined) continue;
    const number = BigInt(match[1]);
    if (number > highest) highest = number;
  }
  return `Layout ${highest + 1n}`;
}

function nextRouteTitle(snapshot: SpaceSnapshot): string {
  const numbered = /^Route ([1-9]\d*)$/;
  let highest = 0n;
  for (const route of snapshot.document.routes) {
    const match = numbered.exec(route.title);
    if (match?.[1] === undefined) continue;
    const number = BigInt(match[1]);
    if (number > highest) highest = number;
  }
  return `Route ${highest + 1n}`;
}

export function nextCardTitle(snapshot: SpaceSnapshot): string {
  const numbered = /^Card ([1-9]\d*)$/;
  let highest = 0n;
  for (const card of snapshot.cards) {
    const match = numbered.exec(card.document.title);
    if (match?.[1] === undefined) continue;
    const number = BigInt(match[1]);
    if (number > highest) highest = number;
  }
  return `Card ${highest + 1n}`;
}

function sameSnapshot(left: SpaceSnapshot, right: SpaceSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function samePlacement(
  left: ReadonlyMap<string, LayoutPoint> | null,
  right: ReadonlyMap<string, LayoutPoint> | null,
): boolean {
  if (left === null || right === null) return left === right;
  if (left.size !== right.size) return false;
  for (const [id, point] of left) {
    const candidate = right.get(id);
    if (candidate?.x !== point.x || candidate.y !== point.y) return false;
  }
  return true;
}

export function createSpaceAuthoring({
  session,
  navigation,
  initialPlacement = null,
  reportObserverError = (error) => console.error('SpaceAuthoring observer failed', error),
}: SpaceAuthoringDependencies): SpaceAuthoring {
  let placement: ReadonlyMap<string, LayoutPoint> | null =
    initialPlacement === null ? null : new Map(initialPlacement);
  let installing = false;
  let state: SpaceAuthoringState;
  const listeners = new Set<() => void>();

  const snapshotState = (): SpaceAuthoringState => ({
    placement,
    session: session.getState(),
    navigation: navigation.getState(),
  });
  state = snapshotState();

  const publish = (): void => {
    state = snapshotState();
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        try {
          reportObserverError(error);
        } catch {
          // Diagnostics cannot interrupt Authoring.
        }
      }
    }
  };

  session.subscribe(() => {
    if (!installing) publish();
  });
  navigation.subscribe(() => {
    if (!installing) publish();
  });

  const canConnect = (from: CardId, to: CardId): boolean => {
    if (placement === null) return false;
    const snapshot = session.getState().working;
    if (!snapshot.cards.some((card) => card.id === from)) return false;
    if (!snapshot.cards.some((card) => card.id === to)) return false;
    const routeId = navigation.getState().activeRouteId;
    if (routeId === null) return snapshot.document.routes.length === 0;
    const route = snapshot.document.routes.find((candidate) => candidate.id === routeId);
    return route !== undefined && !route.edges.some((edge) => edge.from === from && edge.to === to);
  };

  const canCreateConnectedCard = (from: CardId): boolean => {
    if (placement === null) return false;
    const snapshot = session.getState().working;
    if (!snapshot.cards.some((card) => card.id === from)) return false;
    const routeId = navigation.getState().activeRouteId;
    return (
      (routeId === null && snapshot.document.routes.length === 0) ||
      snapshot.document.routes.some((route) => route.id === routeId)
    );
  };

  const performCompletion = (
    completion: AuthoringCompletion,
    completedPlacementInput: ReadonlyMap<string, LayoutPoint> | null,
  ): AuthoringResult => {
    if (completedPlacementInput === null) return { kind: 'no-edit' };
    let snapshot = session.getState().working;
    const previousSnapshot = snapshot;
    const navigationState = navigation.getState();
    let activeRouteId = navigationState.activeRouteId;
    let mintedRouteId: UUID | null = null;
    let createdCardId: CardId | undefined;
    let connection: { readonly from: CardId; readonly to: CardId } | null = null;
    const completedPlacement = new Map(completedPlacementInput);
    if (completion.kind === 'create-and-connect') {
      if (!canCreateConnectedCard(completion.from)) return { kind: 'no-edit' };
      createdCardId = newUuid();
      connection = { from: completion.from, to: createdCardId };
      completedPlacement.set(createdCardId, completion.position);
      snapshot = {
        ...snapshot,
        cards: [
          ...snapshot.cards,
          {
            id: createdCardId,
            document: { title: nextCardTitle(snapshot), kind: 'markdown', body: '' },
          },
        ],
      };
    } else if (completion.kind === 'connected-cards') {
      if (!canConnect(completion.from, completion.to)) return { kind: 'no-edit' };
      connection = { from: completion.from, to: completion.to };
    }
    if (connection !== null) {
      if (activeRouteId === null) {
        mintedRouteId = newUuid();
        activeRouteId = mintedRouteId;
        snapshot = {
          ...snapshot,
          document: {
            ...snapshot.document,
            routes: [
              ...snapshot.document.routes,
              {
                id: mintedRouteId,
                title: nextRouteTitle(snapshot),
                edges: [connection],
              },
            ],
          },
        };
      } else {
        const routeIndex = snapshot.document.routes.findIndex(
          (route) => route.id === activeRouteId,
        );
        const route = snapshot.document.routes[routeIndex];
        if (route === undefined) return { kind: 'no-edit' };
        const routes = [...snapshot.document.routes];
        routes[routeIndex] = {
          ...route,
          edges: [...route.edges, connection],
        };
        snapshot = { ...snapshot, document: { ...snapshot.document, routes } };
      }
    }
    const renderer = navigationState.selectedRenderer;
    const layoutId: UUID = renderer.kind === 'view' ? newUuid() : renderer.layoutId;
    const existing =
      renderer.kind === 'layout'
        ? (snapshot.document.layouts ?? []).find((layout) => layout.id === renderer.layoutId)
        : undefined;
    if (renderer.kind === 'layout' && existing === undefined) return { kind: 'no-edit' };
    const next = updatePositionedLayout(snapshot, {
      layoutId,
      title: existing?.title ?? nextLayoutTitle(snapshot),
      positions: completedPlacement,
      activeRouteId,
      mintedRouteId,
    });
    if (sameSnapshot(previousSnapshot, next)) return { kind: 'no-edit' };
    const loaded = loadSpaceSnapshot(next);
    if (!loaded.ok) {
      throw new Error(
        `Authoring produced an invalid Space: ${loaded.errors
          .map((error) => error.message)
          .join('; ')}`,
      );
    }

    installing = true;
    try {
      placement = completedPlacement;
      session.submit(next);
      if (mintedRouteId !== null) navigation.activateRoute(mintedRouteId);
      navigation.continueInRenderer({ kind: 'layout', layoutId });
    } finally {
      installing = false;
    }
    publish();
    return createdCardId === undefined
      ? { kind: 'completed' }
      : { kind: 'completed', createdCardId };
  };

  let completing = false;
  const queued: {
    readonly completion: AuthoringCompletion;
    readonly placement: ReadonlyMap<string, LayoutPoint> | null;
  }[] = [];
  const complete = (completion: AuthoringCompletion): AuthoringResult => {
    const installedPlacement = placement === null ? null : new Map(placement);
    if (completing) {
      queued.push({ completion, placement: installedPlacement });
      return { kind: 'queued' };
    }
    completing = true;
    try {
      const result = performCompletion(completion, installedPlacement);
      while (queued.length > 0) {
        const next = queued.shift();
        if (next !== undefined) performCompletion(next.completion, next.placement);
      }
      return result;
    } finally {
      completing = false;
      queued.length = 0;
    }
  };

  return {
    getState: () => state,
    authoredPlacement: () =>
      navigation.getState().selectedRenderer.kind === 'layout' ? placement : null,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    installPlacement: (nextPlacement) => {
      if (!samePlacement(placement, nextPlacement)) {
        placement = nextPlacement === null ? null : new Map(nextPlacement);
      }
    },
    canConnect,
    canCreateConnectedCard,
    complete,
    retryPersistence: session.retry,
  };
}
