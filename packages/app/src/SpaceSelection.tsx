import { useRef, useState } from 'react';
import type { UUID } from '@project/core';
import type { SpaceSummary } from '@project/persistence';
import type { OpenedSpace } from './open-space';

interface SpaceSelectionProps {
  spaces: readonly SpaceSummary[];
  openSelected: (id: UUID) => Promise<OpenedSpace>;
  onOpened: (opened: OpenedSpace) => void;
  onError: (error: unknown) => void;
}

export const SpaceSelection = ({
  spaces,
  openSelected,
  onOpened,
  onError,
}: SpaceSelectionProps) => {
  const opening = useRef(false);
  const [isOpening, setIsOpening] = useState(false);

  const select = (id: UUID): void => {
    if (opening.current) return;
    opening.current = true;
    setIsOpening(true);
    void openSelected(id).then(onOpened).catch(onError);
  };

  return (
    <main className="space-selection">
      <section className="space-selection__panel">
        <h1>Choose a space</h1>
        <div className="space-selection__choices" aria-busy={isOpening}>
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
