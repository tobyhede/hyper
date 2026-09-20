import { createContext, useContext } from 'react';
import type { ResourceId } from '@project/core';

/**
 * Whether releasing the seeking end of a live connection on a Resource may be
 * offered — Space Authoring's eligibility, read by `ResourceNode` without the
 * adapter importing app.
 *
 * Absent (null) means no provider: unit and Ladle mounts without Edge Authoring
 * treat every Resource as eligible so they can still exercise seeking connectability.
 * Production always provides through Edge Authoring's `provide`.
 */
export type ConnectionEndEligibility = {
  readonly mayOffer: (resourceId: ResourceId) => boolean;
};

export const ConnectionEndEligibilityContext = createContext<ConnectionEndEligibility | null>(null);

export function useConnectionEndEligible(resourceId: ResourceId): boolean {
  const eligibility = useContext(ConnectionEndEligibilityContext);
  return eligibility?.mayOffer(resourceId) ?? true;
}
