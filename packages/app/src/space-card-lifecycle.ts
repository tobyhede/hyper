import type { SpaceBackend, SpaceCardLifecycle, SpaceSessionRegistry } from '@project/persistence';
import type { UUID } from '@project/core';

export type {
  CreateSpaceCardInput,
  DeleteSpaceCardInput,
  LinkSpaceCardInput,
  SpaceCardLifecycle,
  SpaceCardLifecycleResult,
} from '@project/persistence';

export interface SpaceCardLifecycleOptions {
  readonly backend: SpaceBackend;
  readonly registry: SpaceSessionRegistry;
  readonly newId: () => UUID;
}

export function createSpaceCardLifecycle({
  registry,
  newId,
}: SpaceCardLifecycleOptions): SpaceCardLifecycle {
  return registry.spaceCards(newId);
}
