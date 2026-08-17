import { useRef, useState } from 'react';
import { uuidSchema, type Graph, type Layout } from '@project/core';
import type { SpaceSessionState } from '@project/persistence';
import type { AlgorithmicViewId } from '@project/ui';
import { WorkspaceToolbar } from '#components/WorkspaceToolbar';

const layoutId = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const graphId = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const from = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const to = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

const graphs: readonly Graph[] = [
  { id: graphId, title: 'Long path', color: '#4f8cff', edges: [{ from, to }] },
];
const layouts: readonly Layout[] = [
  {
    id: layoutId,
    title: 'Collection 1',
    kind: 'positioned',
    positions: { [from]: { x: 0, y: 0 }, [to]: { x: 320, y: 0 } },
    graphs: [...graphs],
    activeGraph: graphId,
  },
];

export interface WorkspaceToolbarFixtureProps {
  readonly persistence?: SpaceSessionState['persistence'];
  readonly presenting?: boolean;
  readonly authoringDisabled?: boolean;
  readonly remoteRefusal?: string | null;
}

/** Controlled fixture state around the unchanged production toolbar composition. */
export function WorkspaceToolbarFixture({
  persistence = { kind: 'settled' },
  presenting = false,
  authoringDisabled = false,
  remoteRefusal = null,
}: WorkspaceToolbarFixtureProps) {
  const [view, setView] = useState<AlgorithmicViewId>('flow');
  const [layout, setLayout] = useState<string | null>(layoutId);
  const [activeGraph, setActiveGraph] = useState<string | null>(graphId);
  const addCardMenu = useRef<HTMLButtonElement>(null);

  return (
    <WorkspaceToolbar
      view={{
        value: view,
        active: layout === null,
        onValueChange: (value) => {
          setView(value);
          setLayout(null);
        },
      }}
      layout={{ layouts, value: layout, active: layout !== null, onValueChange: setLayout }}
      graph={{
        graphs,
        activeGraphId: activeGraph,
        colorByGraphId: { [graphId]: '#4f8cff' },
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
      persistence={persistence}
      acknowledgedRevision={4n}
      onRetryPersistence={() => undefined}
      onAcceptRemote={() => undefined}
      onKeepLocal={() => undefined}
      remoteRefusal={remoteRefusal}
    />
  );
}
