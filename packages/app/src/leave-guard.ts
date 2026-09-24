import { useEffect } from 'react';
import type { SpaceSessionState } from '@project/persistence';

/**
 * Leaving while persistence is not settled asks first.
 *
 * The handler is absent in the settled state, which preserves the browser's
 * back/forward cache. `preventDefault` alone: current Chromium, Firefox and
 * Safari all honour it, and lint rejects the deprecated `returnValue` pairing.
 */
export function useUnsettledLeaveGuard(
  persistence: SpaceSessionState['persistence']['kind'],
): void {
  useEffect(() => {
    if (persistence === 'settled') return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [persistence]);
}
