import { newUuid, type UUID } from '@project/core';
import {
  createSpaceSessionRegistry,
  type LoadedSpace,
  type ObserverErrorReporter,
  type SpaceBackend,
  type SpaceSession,
  type SpaceSessionRegistry,
} from '@project/persistence';
import {
  createSpaceEndpointLifecycle,
  type SpaceEndpointAuthoring,
} from '../src/space-resource-lifecycle';

export interface TestOpenedSpace {
  /** The registry the session was opened through, for tests that open siblings. */
  readonly registry: SpaceSessionRegistry;
  readonly spaceSession: SpaceSession;
  readonly spaceResources: SpaceEndpointAuthoring;
}

/**
 * The session and Space Resource authoring an `OpenedSpace` is built from, opened
 * the way the application opens them.
 *
 * A test cannot reach for `openSpaceSession` here and compose a lifecycle
 * beside it: the lifecycle is written over the *registry* — creating,
 * referencing and deleting a Space Resource are Edits across several Spaces, and
 * the registry is what holds the others (ADR 0076) — so one built beside a
 * session the registry has never seen would coordinate nothing. `registry.open`
 * answers the same `SpaceSession` `openSpaceSession` does, so this changes only
 * the construction path.
 *
 * The `space` half of an `OpenedSpace` is deliberately not built here. Several
 * tests open a *local* snapshot that differs from what the backend stores, and
 * two mount a runtime Space that deliberately disagrees with the session's
 * working snapshot — so which Space value a test means is the test's own
 * statement and never something derived from the session under it.
 */
export const openTestSpace = (
  backend: SpaceBackend,
  loaded: LoadedSpace,
  /** Mints the Space, Resource and Map identities a lifecycle Edit creates (ADR 0016). */
  newId: () => UUID = newUuid,
  /**
   * Where a Spaces-epoch observer's failure goes.
   *
   * Rethrown by default: the epoch's observers are the mounted Resources lists,
   * and one of them failing is a defect rather than something a test tolerates.
   */
  reportObserverError: ObserverErrorReporter = (error) => {
    throw error;
  },
): TestOpenedSpace => {
  const registry = createSpaceSessionRegistry(backend);
  return {
    registry,
    spaceSession: registry.open(loaded),
    spaceResources: createSpaceEndpointLifecycle({ backend, registry, newId, reportObserverError }),
  };
};
