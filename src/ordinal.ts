/**
 * Order two strings by code unit, not by locale.
 *
 * `localeCompare` reads the host's collation, so the same directory could import
 * its Spaces and their Things in a different order on a different machine.
 * Import order is observable — it is the order Spaces and Things are inserted
 * and the order a canonical export will emit — so it has to come from the bytes
 * alone.
 *
 * One module because the import and export sides of the round trip both decide
 * order with it, and the invariant that makes a re-export of untouched content
 * produce no diff is that they decide it the *same* way. Three copies of this
 * had accumulated — one per reader plus the exporter's — so a change to any of
 * them, for surrogate pairs or case folding, would have desynchronised read
 * order from write order with nothing to catch it.
 */
export const compareOrdinal = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
