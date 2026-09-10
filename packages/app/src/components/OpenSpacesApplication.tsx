import { useState, useSyncExternalStore } from 'react';
import { createApp } from '../App';
import type { DestinationOpening } from '../destination-opening';
import type { OpenSpace, OpenSpaces } from '../open-spaces';
import { OpenSpacesContext } from '../open-spaces-context';
import { SpaceAppFailure } from './SpaceAppFailure';

function SpaceApplication({
  entry,
  spaces,
  opening,
}: {
  readonly entry: OpenSpace;
  readonly spaces: OpenSpaces;
  readonly opening?: DestinationOpening | undefined;
}) {
  const [App] = useState(() => createApp(entry, spaces.browserLocation, opening));
  return <App />;
}

/**
 * Every open Space, mounted at once, with one of them on the canvas.
 *
 * **There is no surface here any more, and that is the change.** This drew the
 * open set as a strip of vertical tabs beside each Space's Sidebar; ADR 0082
 * leaves *which* surface draws the set as treatment and the Command Dock draws
 * it — as the tree the Opener makes, with the Space you came from named on the
 * bar beside it. A strip as well would be a second place to switch Spaces, and
 * the strip is the one that has to go: it needs a permanent column to stand in,
 * which is the layout space ADR 0082 refuses.
 *
 * So what is left is the mounting rule, and it is load-bearing. Every entry
 * stays mounted and hidden rather than being unmounted, because a Space keeps
 * its Diagram selection, its Graph and its traversal for as long as it is open —
 * and because a hidden Space still commits, still fails, and still has to be
 * reportable on the showing Space's Open Spaces menu. `active` is what withholds
 * the global keys and the portalled persistence dialogs from the hidden ones;
 * each `App` reads it from the session, so nothing is passed down here.
 *
 * Hidden with `hidden` rather than by not rendering: React Flow measures its own
 * container, and a canvas remounted on every Space switch would re-measure and
 * re-fit every time the reader crossed back.
 *
 * A `switchTo` that fails is reported by the Space the reader is still standing
 * in — `App` names the Space that would not open in the shell's standing notice,
 * beside every other report a command owes — rather than by a panel here. The
 * strip that used to raise it was the only caller, and for a while after it went
 * the failure reached `console.error` and nothing else.
 */
export function OpenSpacesApplication({
  spaces,
  initial,
  opening,
}: {
  readonly spaces: OpenSpaces;
  readonly initial: OpenSpace;
  readonly opening?: DestinationOpening | undefined;
}) {
  const state = useSyncExternalStore(spaces.subscribe, spaces.getState);
  const showing = state.activeSpaceId ?? initial.id;

  return (
    <OpenSpacesContext.Provider value={spaces}>
      {state.entries.map((entry) => (
        <div key={entry.id} hidden={entry.id !== showing}>
          <SpaceAppFailure>
            <SpaceApplication
              entry={entry}
              spaces={spaces}
              opening={entry === initial ? opening : undefined}
            />
          </SpaceAppFailure>
        </div>
      ))}
    </OpenSpacesContext.Provider>
  );
}
