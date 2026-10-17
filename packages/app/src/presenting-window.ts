import type { UUID } from '@project/core';
import { createObservableState, type ObserverErrorReporter } from '@project/persistence';
import {
  presentationScope,
  samePresentation,
  type Navigation,
  type PresentationScope,
} from './navigation';
import { presentingLink, type PresentationLinks } from './presentation-link';
import { presentingFullscreen, type Fullscreen } from './presenting-fullscreen';
import type { TraversalCommands } from './presenting-keys';

/** One presentation in the presenting window: who it is and when it started. */
export interface Presentation {
  readonly id: UUID;
  /** When it started, in milliseconds since the Unix epoch. */
  readonly startedAt: number;
}

export interface PresentingWindowState {
  /** The presentation under way, or `null` while not presenting. */
  readonly presentation: Presentation | null;
  /** Whether the notes are shown under the Stage, to rehearse on one screen. */
  readonly rehearsalNotesShown: boolean;
}

export interface PresentingWindow {
  readonly getState: () => PresentingWindowState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Start presenting and, within the same activation, ask for fullscreen. */
  readonly present: () => void;
  /** What the presenting keys and the Stage's chrome do. */
  readonly commands: TraversalCommands;
  /** Follow fullscreen and link Notes windows until the returned function is called. */
  readonly connect: () => () => void;
}

export interface PresentingWindowDependencies {
  readonly navigation: Navigation;
  /** Mints each presentation's identity (ADR 0109). */
  readonly newId: () => UUID;
  /** Reads each presentation's start, in milliseconds since the Unix epoch (ADR 0109). */
  readonly now: () => number;
  readonly fullscreen: Fullscreen;
  /** Open a Notes window following this Space's presentation. */
  readonly openNotes: () => void;
  /** Where Notes windows are reached. Absent, none follows this window. */
  readonly link?:
    | {
        readonly spaceId: () => UUID;
        readonly links: PresentationLinks;
      }
    | undefined;
  readonly reportObserverError: ObserverErrorReporter;
}

interface Under {
  readonly scope: PresentationScope;
  readonly presentation: Presentation;
}

/**
 * A presentation as the presenting window holds it (ADR 0129): its identity
 * and start time, the rehearsal notes, the Notes window, fullscreen and the
 * presentation link, behind one state and one set of commands.
 *
 * The one place a presentation starts. It starts when `presentationScope`
 * changes to a value it did not hold, and only here are its identity and start
 * time minted; the link posts what this hands it. The rehearsal notes belong
 * to one presentation, so a new one shows them hidden without anything
 * resetting them, and they are never stored in the Space or the browser.
 *
 * Read on demand rather than only when Navigation notifies, because the link
 * asks for the presentation while Navigation is notifying, and must not depend
 * on hearing Navigation after this does.
 */
export function createPresentingWindow({
  navigation,
  newId,
  now,
  fullscreen,
  openNotes,
  link,
  reportObserverError,
}: PresentingWindowDependencies): PresentingWindow {
  let under: Under | null = null;
  let rehearsing: UUID | null = null;
  let answered: PresentingWindowState = { presentation: null, rehearsalNotesShown: false };

  const current = (): Presentation | null => {
    const scope = presentationScope(navigation.getState());
    if (scope === null) under = null;
    else if (under === null || !samePresentation(under.scope, scope))
      under = { scope, presentation: { id: newId(), startedAt: now() } };
    return under?.presentation ?? null;
  };

  const getState = (): PresentingWindowState => {
    const presentation = current();
    const rehearsalNotesShown = presentation !== null && rehearsing === presentation.id;
    if (
      answered.presentation !== presentation ||
      answered.rehearsalNotesShown !== rehearsalNotesShown
    )
      answered = { presentation, rehearsalNotesShown };
    return answered;
  };

  const observable = createObservableState(getState(), reportObserverError);
  const announce = (): void => {
    const next = getState();
    if (next !== observable.getState()) observable.publish(next);
  };
  navigation.subscribe(announce);

  const fullscreenPairing = presentingFullscreen(fullscreen, {
    presenting: () => navigation.getState().mode === 'presenting',
    subscribe: navigation.subscribe,
    present: navigation.present,
    exitPresenting: navigation.exitPresenting,
  });
  const notesLink =
    link === undefined
      ? undefined
      : presentingLink({ navigation, spaceId: link.spaceId, links: link.links, current });

  const commands: TraversalCommands = {
    advance: navigation.advance,
    retreat: navigation.retreat,
    selectBranch: navigation.selectBranch,
    exitPresenting: navigation.exitPresenting,
    openNotes,
    toggleNotes: () => {
      const presentation = current();
      if (presentation === null) return;
      rehearsing = rehearsing === presentation.id ? null : presentation.id;
      announce();
    },
  };

  return {
    getState,
    subscribe: observable.subscribe,
    present: fullscreenPairing.present,
    commands,
    connect: () => {
      const stopFullscreen = fullscreenPairing.connect();
      const stopLink = notesLink?.connect();
      return () => {
        stopLink?.();
        stopFullscreen();
      };
    },
  };
}
