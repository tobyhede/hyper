import { useState } from 'react';
import type { MapId, Resource, ResourceId } from '@project/core';

/** A request that the Dock disclose its Resources list, naming the addressed Resource that asked. */
export interface ResourcesDisclosure {
  readonly resourceId: ResourceId;
}

/** The Map and Resource an address last revealed the Resources list for. */
export interface RevealedAddress {
  readonly mapId: MapId;
  readonly resourceId: ResourceId;
}

export interface AddressedMap {
  /** The Resource the location names, or `null`. */
  readonly addressedResourceId: ResourceId | null;
  readonly mapId: MapId;
  /** The Resources the drawn Map leaves out, which the Resources list offers. */
  readonly resourcesOutsideMap: readonly Resource[];
}

/** What an address changes: the address now revealed, and the Resource to disclose, if any. */
export interface RevealStep {
  readonly revealed: RevealedAddress | null;
  readonly disclose: ResourceId | null;
}

/**
 * Whether an address reveals the Resources list, once per (Map, address).
 *
 * `null` is no change. An unrelated Edit recomputes the Resources outside the
 * Map with a fresh identity, and revealing again on that alone would reopen a
 * list the reader just closed. The Map is part of the key, not only the
 * Resource: a canonical Resource link addresses no Map of its own, so the same
 * Resource can be revealed in one Map and then adopt a different default Map
 * that omits it, which is a second reveal rather than a repeat.
 *
 * Only a real navigation clears the address — choosing a Map, activating a
 * Graph, or restoring a destination that names no Resource — so arriving back at
 * the same address afterwards is a fresh reveal.
 */
export function revealStep(
  revealed: RevealedAddress | null,
  { addressedResourceId, mapId, resourcesOutsideMap }: AddressedMap,
): RevealStep | null {
  if (addressedResourceId === null) {
    return revealed === null ? null : { revealed: null, disclose: null };
  }
  if (revealed?.mapId === mapId && revealed.resourceId === addressedResourceId) return null;
  return {
    revealed: { mapId, resourceId: addressedResourceId },
    disclose: resourcesOutsideMap.some(({ id }) => id === addressedResourceId)
      ? addressedResourceId
      : null,
  };
}

/**
 * The outstanding request that the Dock disclose its Resources list, if any.
 *
 * **A request, not the open state** — the Dock owns whether the list is open,
 * because it owns the one slot that keeps its disclosures exclusive
 * (`DockResourcesList`). A fresh object per request is the signal; an equal one
 * recomputed by an unrelated Edit reopens nothing the reader has closed.
 *
 * A withdrawn list takes its outstanding request with it, or the list would
 * reopen itself — and take focus — the moment authoring came back. Both rules
 * are render-time transitions rather than effects, so neither draws a frame
 * behind the state it answers.
 */
export function useResourcesDisclosure(
  available: boolean,
  address: AddressedMap,
): ResourcesDisclosure | null {
  const [disclose, setDisclose] = useState<ResourcesDisclosure | null>(null);
  const [revealed, setRevealed] = useState<RevealedAddress | null>(null);
  if (disclose !== null && !available) setDisclose(null);
  const step = revealStep(revealed, address);
  if (step !== null) {
    setRevealed(step.revealed);
    if (step.disclose !== null) setDisclose({ resourceId: step.disclose });
  }
  return disclose;
}
