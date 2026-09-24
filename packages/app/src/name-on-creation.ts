import { useSyncExternalStore } from 'react';
import type { ResourceId } from '@project/core';
import type { Continuation, PendingContinuation } from './continuation';

/** The Resource a pending continuation opens the Title editor of, or `null`. */
export const nameOnCreationOf = (pending: PendingContinuation | null): ResourceId | null =>
  pending?.then === 'rename' && pending.target.kind === 'resource'
    ? pending.target.resourceId
    : null;

/**
 * The Resource whose inline Title editor a creation opens.
 *
 * It reaches `CanvasResource` as a prop rather than through the continuation
 * module: `@project/ui` owns that editor and depends only on `core`, and a
 * component refocusing its own control after its own edit is genuine locality.
 */
export function useNameOnCreation(
  continuation: Pick<Continuation, 'getState' | 'subscribe'>,
): ResourceId | null {
  const { pending } = useSyncExternalStore(continuation.subscribe, continuation.getState);
  return nameOnCreationOf(pending);
}
