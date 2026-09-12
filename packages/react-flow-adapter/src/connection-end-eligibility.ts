import { createContext, useContext } from 'react';
import type { ThingId } from '@project/core';

/**
 * Whether releasing the seeking end of a live connection on a Thing may be
 * offered — Space Authoring's eligibility, read by `ThingNode` without the
 * adapter importing app.
 *
 * Absent (null) means no provider: unit and Ladle mounts without Edge Authoring
 * treat every Thing as eligible so they can still exercise seeking connectability.
 * Production always provides through Edge Authoring's `provide`.
 */
export type ConnectionEndEligibility = {
  readonly mayOffer: (thingId: ThingId) => boolean;
};

export const ConnectionEndEligibilityContext = createContext<ConnectionEndEligibility | null>(null);

export function useConnectionEndEligible(thingId: ThingId): boolean {
  const eligibility = useContext(ConnectionEndEligibilityContext);
  return eligibility?.mayOffer(thingId) ?? true;
}
