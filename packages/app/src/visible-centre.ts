import { useCallback, useState } from 'react';
import type { MapPosition } from '@project/core';
import type { VisibleCentre } from './components/CanvasCentre';

/**
 * Where a Resource created from a control rather than a pointer lands.
 *
 * The origin is where the first Resource of an empty authored Map lands: the
 * reporter is mounted only while Resources are on the canvas, but the Dock's
 * creation stays available without them. A created Resource must land
 * *somewhere*, and a refusal would be the wrong answer to a question about
 * geometry.
 */
export const anchorAt = (centre: VisibleCentre | null): MapPosition => centre?.() ?? { x: 0, y: 0 };

export interface VisibleCentreReporting {
  /** Installed by `CanvasCentre` when the canvas mounts, withdrawn when it unmounts. */
  readonly reportVisibleCentre: (centre: VisibleCentre | null) => void;
  /** The centre of the viewport, read at the gesture rather than captured earlier. */
  readonly centreAnchor: () => MapPosition;
}

/**
 * The visible centre of the canvas and the anchor it gives new Resources.
 *
 * Read at the gesture: an author who pans between opening a surface and
 * pressing in it is looking somewhere else by then, and the visible centre is
 * where they are looking now.
 *
 * **State rather than a ref.** The reporter is installed once per canvas mount,
 * so there is no per-frame write to keep out of React's hands — and a ref read
 * by a handler that the Command Dock's chrome object carries makes that whole
 * object a ref value to React's compiler, which then refuses its use in render.
 * Set through the updater form because the value *is* a function: passing it
 * directly would have React call it as an updater.
 */
export function useVisibleCentre(): VisibleCentreReporting {
  const [visibleCentre, setVisibleCentre] = useState<VisibleCentre | null>(null);
  const reportVisibleCentre = useCallback((centre: VisibleCentre | null) => {
    setVisibleCentre(() => centre);
  }, []);
  const centreAnchor = useCallback((): MapPosition => anchorAt(visibleCentre), [visibleCentre]);
  return { reportVisibleCentre, centreAnchor };
}
