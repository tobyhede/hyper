import { loadSpaceSnapshot, type Space } from '@project/graph';
import {
  createObservableState,
  type ObserverErrorReporter,
  type SpaceBackend,
  type SpaceThingLifecycle,
  type SpaceThingLifecycleResult,
  type SpaceSessionRegistry,
  type SpaceSummary,
} from '@project/persistence';
import type { GraphId, Diagram, UUID } from '@project/core';

export type {
  CreateSpaceThingInput,
  DeleteSpaceThingInput,
  LinkSpaceThingInput,
  SpaceThingLifecycle,
  SpaceThingLifecycleResult,
} from '@project/persistence';

/** The target's choices; rendering uses its live Space's production projection. */
export interface SpaceThingTargetDiagram {
  readonly id: UUID;
  readonly title: string;
  readonly graphs: readonly { readonly id: GraphId; readonly title: string }[];
  readonly activeGraph?: GraphId;
}

export interface SpaceThingTarget {
  readonly id: UUID;
  readonly title: string;
  readonly diagrams: readonly SpaceThingTargetDiagram[];
}

/**
 * Everything authoring a Space Thing needs, over the coordinated lifecycle.
 *
 * The three writes are ADR 0076's, unchanged and still the module's public
 * interface. The two reads are here rather than beside them on a backend
 * because they answer the same question the writes do — *which Space, and which
 * of its Diagrams and Graphs* — and a surface that had to reach a backend for
 * them would be composing its own answer to a question this module already
 * owns.
 */
export interface SpaceThingAuthoring extends SpaceThingLifecycle {
  /**
   * The Spaces a new Space Thing in this Space may reference.
   *
   * The containing Space is withheld, being the one target that cannot work
   * whatever else is stored. Every deeper cycle is left to intake: the
   * coordinated Edit validates the candidate aggregate before it installs
   * anything, so a cycle comes back as an `aggregate-refused` refusal with the
   * Things that formed it, which is a better sentence than a silently shorter
   * list (ADR 0068, ADR 0074).
   */
  readonly referenceableSpaces: (containingSpaceId: UUID) => Promise<readonly SpaceSummary[]>;
  /**
   * What one target Space offers a Space Thing to select, or `undefined` where
   * it is gone or no longer passes intake.
   *
   * Read through the live session where one is open, so a Diagram authored in a
   * Space this browser also has open is selectable before it has committed.
   */
  readonly target: (spaceId: UUID) => Promise<SpaceThingTarget | undefined>;
  /**
   * That the set {@link referenceableSpaces} answers may have changed.
   *
   * The read is over the repository rather than over one Space, and the Edit
   * that changes it is coordinated across Spaces — so the surfaces reading it
   * are one per open Space while the Edit is the session's. Every open Space
   * stays mounted (`OpenSpacesApplication`), so a Space created or destroyed in
   * one of them reaches the others only because this says so: an epoch a
   * surface re-reads on, rather than a read keyed on a working snapshot that
   * would cost one repository read per keystroke.
   *
   * An epoch and not the set itself, because what each surface may offer is its
   * own question — `referenceableSpaces` withholds the containing Space, and
   * that is a different answer in every open Space.
   *
   * **It invalidates; it does not fetch.** A reader compares it against the
   * epoch its own list answers and reads only when the two differ and its Space
   * is the drawn one, so one Edit costs one repository read however many Spaces
   * are open. A reader that answered every bump would turn this into one read
   * and one render per open Space per Edit, for lists that cannot be opened.
   */
  readonly spaceSet: SpaceSetChanges;
}

/** The observable seam a Spaces read is invalidated through. */
export interface SpaceSetChanges {
  readonly getState: () => number;
  readonly subscribe: (listener: () => void) => () => void;
}

export interface SpaceThingLifecycleOptions {
  readonly backend: SpaceBackend;
  readonly registry: SpaceSessionRegistry;
  readonly newId: () => UUID;
  /**
   * Where an epoch observer's failure is reported, required with no default.
   *
   * The one owner of this module is `createOpenSpaces`, which already names the
   * session's sink; a default here would be the second, invisible one behind
   * its back — the same reason `composeApp`'s seams are supplied explicitly.
   */
  readonly reportObserverError: ObserverErrorReporter;
}

const targetDiagram = (diagram: Diagram): SpaceThingTargetDiagram => {
  const read = {
    id: diagram.id,
    title: diagram.title,
    graphs: diagram.graphs.map(({ id, title }) => ({ id, title })),
  };
  return diagram.activeGraph === undefined ? read : { ...read, activeGraph: diagram.activeGraph };
};

export function createSpaceThingLifecycle({
  backend,
  registry,
  newId,
  reportObserverError,
}: SpaceThingLifecycleOptions): SpaceThingAuthoring {
  const lifecycle = registry.spaceThings(newId);
  const epoch = createObservableState(0, reportObserverError);
  /**
   * Announce an Edit of this shape once it has landed.
   *
   * All three writes, because this is the one place that knows such an Edit
   * completed. A `link` changes no Space set and is announced anyway — one
   * announcement costs the drawn Space one repository read and no other Space
   * anything, which is less than a rule two surfaces would have to agree on.
   * That is a claim about {@link SpaceThingAuthoring.spaceSet} being an
   * invalidation rather than a fan-out, and it would stop holding the day every
   * mounted reader answered a bump. A refusal announces nothing, having changed
   * nothing, and a break leaves the epoch where the failed write left the
   * repository.
   */
  const announcing = <Input>(
    write: (input: Input) => Promise<SpaceThingLifecycleResult>,
  ): ((input: Input) => Promise<SpaceThingLifecycleResult>) => {
    return async (input) => {
      const result = await write(input);
      if (result.kind === 'completed') epoch.publish(epoch.getState() + 1);
      return result;
    };
  };
  return {
    ...lifecycle,
    create: announcing(lifecycle.create),
    link: announcing(lifecycle.link),
    delete: announcing(lifecycle.delete),
    spaceSet: { getState: epoch.getState, subscribe: epoch.subscribe },
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
      return spaceThingTarget(loaded.space);
    },
  };
}

export function spaceThingTarget(space: Space): SpaceThingTarget {
  return {
    id: space.id,
    title: space.title,
    diagrams: space.diagrams.map(targetDiagram),
  };
}
