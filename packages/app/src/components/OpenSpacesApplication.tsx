import { useState, useSyncExternalStore } from 'react';
import { uuidSchema } from '@project/core';
import { OpenSpaces as OpenSpacesSurface, StatusFailure } from '@project/ui';
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

/** Every managed Space stays mounted; its entry reports its own persistence. */
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
  const [failure, setFailure] = useState<string | null>(null);
  const select = async (id: string) => {
    try {
      await spaces.switchTo(uuidSchema.parse(id));
      setFailure(null);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  };
  const entries = state.entries.map((entry) => {
    const session = entry.session.getState();
    const kind = session.persistence.kind;
    return {
      id: entry.id,
      title: session.working.document.title,
      status: kind === 'failed' || kind === 'conflicted' || kind === 'rejected' ? kind : undefined,
      content: (
        <SpaceAppFailure>
          <SpaceApplication
            entry={entry}
            spaces={spaces}
            opening={entry === initial ? opening : undefined}
          />
        </SpaceAppFailure>
      ),
    };
  });
  return (
    <OpenSpacesContext.Provider value={spaces}>
      {failure === null ? null : (
        <StatusFailure title="Space could not be opened" detailLabel="Details" detail={failure} />
      )}
      <OpenSpacesSurface
        entries={entries}
        activeId={state.activeSpaceId ?? initial.id}
        onSelect={(id) => {
          void select(id);
        }}
      />
    </OpenSpacesContext.Provider>
  );
}
