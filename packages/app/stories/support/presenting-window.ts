import { useState, useSyncExternalStore } from 'react';
import { newUuid, type UUID } from '@project/core';
// Through the package's own subpath imports, as `./navigation` reaches Navigation.
import type { Navigation } from '#src/navigation';
import type { PresentationLinks } from '#src/presentation-link';
import {
  createPresentingWindow,
  type PresentingWindow,
  type PresentingWindowState,
} from '#src/presenting-window';
import { refusingFullscreen } from './fullscreen';

export interface StoryPresentingWindowOptions {
  /** When every presentation in the story starts, so a timer the story draws reads a fixed time. */
  readonly startedAt?: number;
  /** The Notes windows the story links, if it draws one. */
  readonly link?: { readonly spaceId: () => UUID; readonly links: PresentationLinks };
}

export interface StoryPresentingWindow {
  readonly presentingWindow: PresentingWindow;
  /** Its state, read exactly as the application reads it. */
  readonly state: PresentingWindowState;
}

/**
 * The production presenting window over a story's Navigation (ADR 0052).
 *
 * The Stage fixtures and the Notes window fixture draw the presenting keys,
 * the rehearsal notes and the link from it, as the application does, so no
 * fixture wires a presentation up by hand. A story opens no second window.
 */
export function useStoryPresentingWindow(
  navigation: Navigation,
  { startedAt = 0, link }: StoryPresentingWindowOptions = {},
): StoryPresentingWindow {
  const [presentingWindow] = useState(() =>
    createPresentingWindow({
      navigation,
      newId: newUuid,
      now: () => startedAt,
      fullscreen: refusingFullscreen,
      openNotes: () => undefined,
      link,
      reportObserverError: (error) =>
        console.error('Presenting window story observer failed', error),
    }),
  );
  const state = useSyncExternalStore(presentingWindow.subscribe, presentingWindow.getState);
  return { presentingWindow, state };
}
