import { useEffect, useSyncExternalStore } from 'react';
import type { MapId, ResourceId } from '@project/core';
import type { BrowserLocation, BrowserLocationState } from './browser-location';
import type { Continuation } from './continuation';

/** The two selection writes an addressed Resource makes on the canvas. */
export interface AddressedSelection {
  readonly getState: () => {
    readonly selectResource: (resourceId: ResourceId) => void;
    readonly clearSelection: () => void;
  };
}

/**
 * The two facts the browser's location tells this Space (ADR 0081), and the
 * canvas selection that follows the Resource it names.
 *
 * Read rather than owned: the location follows one Space, is answered by
 * `browser-location.ts`, and outlives any one mount.
 *
 * The selection is keyed on the Map as well as the Resource: a deliberate move
 * clears the published selection, and moving between two Maps that address the
 * *same* Resource leaves `addressedResourceId` untouched, so keying on the
 * Resource alone would let React bail out and never restore it. Clearing on
 * `null` is the other half — an address that stops naming a Resource must stop
 * selecting one, or the Resource's rail keeps offering copy commands for a
 * Resource the URL has left behind.
 */
export function useAddressedResource(
  location: Pick<BrowserLocation, 'getState' | 'subscribe'>,
  selection: AddressedSelection,
  continuation: Pick<Continuation, 'request'>,
  selectedMapId: MapId,
): BrowserLocationState {
  const addressed = useSyncExternalStore(location.subscribe, location.getState);
  const { addressedResourceId } = addressed;
  useEffect(() => {
    const adapter = selection.getState();
    if (addressedResourceId === null) {
      adapter.clearSelection();
      return;
    }
    adapter.selectResource(addressedResourceId);
    // Centred and focused once its projection exists — the one member that
    // touches the camera, because a Resource arrived at by URL is somewhere the
    // reader has never been. The wait is the canvas continuation's.
    continuation.request({
      target: { kind: 'resource', resourceId: addressedResourceId },
      select: false,
      then: 'reveal',
    });
  }, [addressedResourceId, selectedMapId, selection, continuation]);
  return addressed;
}
