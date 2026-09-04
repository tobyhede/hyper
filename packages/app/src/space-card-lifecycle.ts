import { loadSpaceSnapshot } from '@project/graph';
import type {
  SpaceBackend,
  SpaceCardLifecycle,
  SpaceSessionRegistry,
  SpaceSummary,
} from '@project/persistence';
import type { GraphId, Layout, UUID } from '@project/core';

export type {
  CreateSpaceCardInput,
  DeleteSpaceCardInput,
  LinkSpaceCardInput,
  SpaceCardLifecycle,
  SpaceCardLifecycleResult,
} from '@project/persistence';

/** One Graph a Space Card may show, named the way its Card's selector draws it. */
export interface SpaceCardTargetGraph {
  readonly id: GraphId;
  readonly title: string;
}

/** One Layout a Space Card may show, with the Graphs that Layout owns (ADR 0040). */
export interface SpaceCardTargetLayout {
  readonly id: UUID;
  readonly title: string;
  readonly graphs: readonly SpaceCardTargetGraph[];
  /**
   * The Layout's own Active Graph, where it has authored one (ADR 0026).
   *
   * Carried because a Card pointed at this Layout has to seed a Graph from it,
   * and the Layout has already answered which one is current. Dropping it here
   * would leave the surface to invent an answer the Layout disagrees with.
   */
  readonly activeGraph?: GraphId;
}

/**
 * A target Space as the Cards referencing it see it.
 *
 * Deliberately not a `Space`. A Space Card selects a Layout and a Graph and
 * shows a Title, and that is the whole of what its surface can do with the
 * Space it points at — handing the validated aggregate over instead would put a
 * second Space's Cards, lookup and renderer within reach of a containing
 * Space's canvas, which is exactly the boundary a Space Card is.
 */
export interface SpaceCardTarget {
  readonly id: UUID;
  readonly title: string;
  readonly layouts: readonly SpaceCardTargetLayout[];
}

/**
 * Everything authoring a Space Card needs, over the coordinated lifecycle.
 *
 * The three writes are ADR 0076's, unchanged and still the module's public
 * interface. The two reads are here rather than beside them on a backend
 * because they answer the same question the writes do — *which Space, and which
 * of its Layouts and Graphs* — and a surface that had to reach a backend for
 * them would be composing its own answer to a question this module already
 * owns.
 */
export interface SpaceCardAuthoring extends SpaceCardLifecycle {
  /**
   * The Spaces a new Space Card in this Space may reference.
   *
   * The containing Space is withheld, being the one target that cannot work
   * whatever else is stored. Every deeper cycle is left to intake: the
   * coordinated Edit validates the candidate aggregate before it installs
   * anything, so a cycle comes back as an `aggregate-refused` refusal with the
   * Cards that formed it, which is a better sentence than a silently shorter
   * list (ADR 0068, ADR 0074).
   */
  readonly referenceableSpaces: (containingSpaceId: UUID) => Promise<readonly SpaceSummary[]>;
  /**
   * What one target Space offers a Space Card to select, or `undefined` where
   * it is gone or no longer passes intake.
   *
   * Read through the live session where one is open, so a Layout authored in a
   * Space this browser also has open is selectable before it has committed.
   */
  readonly target: (spaceId: UUID) => Promise<SpaceCardTarget | undefined>;
}

export interface SpaceCardLifecycleOptions {
  readonly backend: SpaceBackend;
  readonly registry: SpaceSessionRegistry;
  readonly newId: () => UUID;
}

const targetLayout = (layout: Layout): SpaceCardTargetLayout => {
  const read = {
    id: layout.id,
    title: layout.title,
    graphs: layout.graphs.map((graph) => ({ id: graph.id, title: graph.title })),
  };
  // Absent where the Layout authored none, which is the distinction the seed
  // reads: ADR 0026 makes an absent Active Graph mean the first, and a key
  // carrying `undefined` would say the Layout had answered.
  return layout.activeGraph === undefined ? read : { ...read, activeGraph: layout.activeGraph };
};

export function createSpaceCardLifecycle({
  backend,
  registry,
  newId,
}: SpaceCardLifecycleOptions): SpaceCardAuthoring {
  const lifecycle = registry.spaceCards(newId);
  return {
    ...lifecycle,
    referenceableSpaces: async (containingSpaceId) => {
      const spaces = await backend.listSpaces();
      return spaces.filter((space) => space.id !== containingSpaceId);
    },
    target: async (spaceId) => {
      const working = registry.session(spaceId)?.getState().working;
      const snapshot = working ?? (await backend.loadSpace(spaceId))?.snapshot;
      if (snapshot === undefined) return undefined;
      const loaded = loadSpaceSnapshot(snapshot);
      if (!loaded.ok) return undefined;
      return {
        id: loaded.space.id,
        title: loaded.space.title,
        layouts: loaded.space.layouts.map(targetLayout),
      };
    },
  };
}
