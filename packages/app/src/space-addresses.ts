import { useCallback, useMemo, useState } from 'react';
import type { UUID } from '@project/core';
import type { ProductDestination } from '@project/http';
import type { EntityActionGroup } from '@project/ui';
import type { BrowserLocation } from './browser-location';
import { copyLink } from './clipboard';
import { spaceEntityActions, type SpaceEntity } from './entity-actions';
import { openIndependently } from './open-independently';

export interface SpaceAddresses {
  /** The addresses each entity of this Space offers, as its command menu draws them. */
  readonly entityActions: (entity: SpaceEntity) => readonly EntityActionGroup[];
  /** Copy one address, answering whether it reached the clipboard. */
  readonly copyProductDestination: (destination: ProductDestination) => Promise<boolean>;
  /** Why the last copy did not reach the clipboard, or `null`. */
  readonly clipboardFailure: string | null;
  readonly dismissClipboardFailure: () => void;
}

/**
 * The addresses this Space's entities offer, and what happens to one after it
 * is chosen.
 *
 * What a destination's URL *is* belongs to the browser location (ADR 0081);
 * copying it and opening it in a new browsing context are this surface's. The
 * copy answers whether the link reached the clipboard, because that answer is
 * what a menu item reports on, and a refusal is kept for the shell's notice.
 * With `noopener`, a tab that did open and a blocked popup both return `null`
 * from `open`, so opening answers only whether `open` ran.
 *
 * `entityActions` is stable across renders that keep the Space's id and Title:
 * the Resource rail's builder hangs off it, and that builder is a dependency of
 * the node-decoration memo in `canvas-resource-authoring.ts`.
 */
export function useSpaceAddresses(
  location: Pick<BrowserLocation, 'href'>,
  space: { readonly id: UUID; readonly title: string },
): SpaceAddresses {
  const [clipboardFailure, setClipboardFailure] = useState<string | null>(null);
  const copyProductDestination = useCallback(
    async (destination: ProductDestination): Promise<boolean> => {
      setClipboardFailure(null);
      const failure = await copyLink(location.href(destination));
      setClipboardFailure(failure);
      return failure === null;
    },
    [location],
  );
  const openProductDestination = useCallback(
    (destination: ProductDestination): boolean => openIndependently(location.href(destination)),
    [location],
  );
  const entityActions = useMemo(
    () =>
      spaceEntityActions({
        spaceId: space.id,
        spaceTitle: space.title,
        onCopy: copyProductDestination,
        onOpenIndependently: openProductDestination,
        // No Rename item: the Dock renames a Map and a Graph from Rename in that
        // identity's own list, and a Resource's Title is renamed in place on the
        // canvas, so a row here would be a second path to one command.
        onRename: null,
      }),
    [space.id, space.title, copyProductDestination, openProductDestination],
  );
  const dismissClipboardFailure = useCallback(() => setClipboardFailure(null), []);
  return { entityActions, copyProductDestination, clipboardFailure, dismissClipboardFailure };
}
