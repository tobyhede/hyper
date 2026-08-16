import { useRef, useState } from 'react';
import { PersistenceIndicator, type AlgorithmicViewId } from '@project/ui';
import { WorkspaceToolbar } from '#app/components/WorkspaceToolbar';
import { colorByGraphId, graphIds, graphs, layoutId, layouts } from './fixture';

export type FixturePersistence = 'settled' | 'pending';

export interface WorkspaceToolbarFixtureProps {
  readonly persistence?: FixturePersistence;
  readonly presenting?: boolean;
  readonly authoringDisabled?: boolean;
}

/** Controlled fixture state around the unchanged production toolbar composition. */
export function WorkspaceToolbarFixture({
  persistence = 'settled',
  presenting = false,
  authoringDisabled = false,
}: WorkspaceToolbarFixtureProps) {
  const [view, setView] = useState<AlgorithmicViewId>('flow');
  const [layout, setLayout] = useState<string | null>(layoutId);
  const [activeGraph, setActiveGraph] = useState<string | null>(graphIds.long);
  const addCardMenu = useRef<HTMLButtonElement>(null);

  return (
    <WorkspaceToolbar
      view={{ value: view, active: layout === null, onValueChange: setView }}
      layout={{ layouts, value: layout, active: layout !== null, onValueChange: setLayout }}
      graph={{
        graphs,
        activeGraphId: activeGraph,
        colorByGraphId,
        onActivate: setActiveGraph,
        onPresent: () => undefined,
        presenting,
        onExitPresenting: () => undefined,
      }}
      addCard={{
        onAddCard: () => undefined,
        onAddAlias: () => undefined,
        disabled: authoringDisabled,
        keyShortcut: 'C',
        menuTriggerRef: addCardMenu,
      }}
      persistence={<PersistenceIndicator state={persistence} />}
      persistenceState={persistence}
      acknowledgedRevision={0n}
    />
  );
}
