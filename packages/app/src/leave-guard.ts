import { useEffect } from 'react';
import type { SpaceSessionState } from '@project/persistence';

/**
 * Leaving while persistence is not settled, or while an image replacement
 * runs, asks first.
 *
 * The handler is absent while persistence is settled and no replacement runs,
 * which preserves the browser's back/forward cache. `preventDefault` alone: current Chromium, Firefox and
 * Safari all honour it, and lint rejects the deprecated `returnValue` pairing.
 */
export function useUnsettledLeaveGuard(
  persistence: SpaceSessionState['persistence']['kind'],
  replacingImage = false,
): void {
  useEffect(() => {
    if (persistence === 'settled' && !replacingImage) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [persistence, replacingImage]);
}
