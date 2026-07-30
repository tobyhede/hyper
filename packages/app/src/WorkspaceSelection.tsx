import { useRef, useState } from 'react';
import type { UUID } from '@project/core';
import type { SpaceSummary } from '@project/persistence';
import type { OpenedSpace } from './open-workspace';

interface WorkspaceSelectionProps {
  spaces: readonly SpaceSummary[];
  openSelected: (id: UUID) => Promise<OpenedSpace>;
  onOpened: (opened: OpenedSpace) => void;
  onError: (error: unknown) => void;
}

export const WorkspaceSelection = ({
  spaces,
  openSelected,
  onOpened,
  onError,
}: WorkspaceSelectionProps) => {
  const opening = useRef(false);
  const [isOpening, setIsOpening] = useState(false);

  const select = (id: UUID): void => {
    if (opening.current) return;
    opening.current = true;
    setIsOpening(true);
    void openSelected(id).then(onOpened).catch(onError);
  };

  return (
    <main className="workspace-selection">
      <section className="workspace-selection__panel">
        <h1>Choose a space</h1>
        <div className="workspace-selection__choices" aria-busy={isOpening}>
          {spaces.map((space) => (
            <button
              key={space.id}
              type="button"
              disabled={isOpening}
              onClick={() => {
                select(space.id);
              }}
            >
              <span>{space.title}</span>
              <span>{space.id}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
};
