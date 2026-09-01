import { isComputedViewId, type Card, type Graph, type UUID } from '@project/core';
import type { Space } from './space';

/** The pure authored subject an application-supplied Computed View sees. */
export interface ComputedViewSubject {
  readonly cards: readonly Card[];
  readonly graphs: readonly Graph[];
}

/**
 * Select a Computed View's subject without choosing its name or Layout strategy.
 * All currently supplied Computed Views see the complete Space; keeping that
 * policy here gives rendering and aggregate selection validation one answer.
 */
export function computedViewSubject(
  space: Space,
  spaceViewId: UUID,
): ComputedViewSubject | undefined {
  if (!isComputedViewId(spaceViewId)) return undefined;
  return { cards: space.cards, graphs: space.graphs };
}
