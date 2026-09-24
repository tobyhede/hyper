import { createContext, useContext, useSyncExternalStore } from 'react';
import type { UUID } from '@project/core';
import type { OpenSpaces, OpenSpacesState } from './open-spaces';

/** Isolated single-Space mounts have no session-wide command surface. */
export const OpenSpacesContext = createContext<OpenSpaces | null>(null);
export const useOpenSpaces = (): OpenSpaces | null => useContext(OpenSpacesContext);

/**
 * What an isolated single-Space mount reads in place of the session's open set.
 *
 * `SpaceApp` mounts one Space with no `OpenSpacesContext` above it, and
 * `useSyncExternalStore` can be called neither conditionally nor with a
 * snapshot that is a fresh object each render — so the absent store is one
 * frozen empty state and one subscription that never publishes.
 */
const NO_OPEN_SPACES: OpenSpacesState = {
  activeSpaceId: null,
  entries: [],
  openedFrom: new Map(),
};
const noOpenSpaces = (): OpenSpacesState => NO_OPEN_SPACES;
const noOpenSpacesChanges = (): (() => void) => () => undefined;

/**
 * Whether a Space is the one on the canvas.
 *
 * An isolated mount has no open set, and the Space it mounts is always the one
 * on the canvas.
 */
export const showsSpace = (state: OpenSpacesState | null, spaceId: UUID): boolean =>
  state === null || state.activeSpaceId === spaceId;

export interface OpenSpacesStanding {
  /** The session's open set, or `null` under an isolated mount. */
  readonly spaces: OpenSpaces | null;
  /** Whether this Space is the one on the canvas. */
  readonly active: boolean;
}

/**
 * The session's open set, and whether one Space is the one it shows.
 *
 * Read through a subscription rather than `getState()` during render, because
 * both answers decide what a *hidden* Space does: `active` withholds the
 * `window`-level Presenting keys and the portalled persistence dialogs, and the
 * listing is the rows the Dock's Open Spaces menu draws, which is how a hidden
 * Space that has gone unwell is still reportable on the showing one. A
 * `getState()` read is only correct while every mounted `App` re-renders on
 * each publish, which nothing here asks for.
 */
export const useOpenSpacesStanding = (spaceId: UUID): OpenSpacesStanding => {
  const spaces = useOpenSpaces();
  const state = useSyncExternalStore(
    spaces?.subscribe ?? noOpenSpacesChanges,
    spaces?.getState ?? noOpenSpaces,
  );
  return { spaces, active: showsSpace(spaces === null ? null : state, spaceId) };
};
