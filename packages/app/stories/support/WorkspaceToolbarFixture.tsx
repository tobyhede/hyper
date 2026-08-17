import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { uuidSchema, type Graph, type Layout, type SpaceSnapshot } from '@project/core';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  openSpaceSession,
  type SpaceSessionState,
} from '@project/persistence';
import type { AlgorithmicViewId } from '@project/ui';
import { PersistenceControl } from '#components/PersistenceControl';
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
  readonly acknowledgedRevision?: bigint;
  readonly onRetry?: () => void;
}

/** Controlled fixture state around the unchanged production toolbar composition. */
export function WorkspaceToolbarFixture({
  persistence = { kind: 'settled' },
  presenting = false,
  authoringDisabled = false,
  remoteRefusal = null,
  acknowledgedRevision = 4n,
  onRetry = () => undefined,
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
      persistence={{
        control: (
          <PersistenceControl
            persistence={persistence}
            onRetry={onRetry}
            onAcceptRemote={() => remoteRefusal}
            onKeepLocal={() => undefined}
          />
        ),
        state: persistence.kind,
        acknowledgedRevision,
      }}
    />
  );
}

const retrySnapshot: SpaceSnapshot = {
  id: uuidSchema.parse('00000000-0000-4000-8000-000000000006'),
  document: { version: 1, title: 'Retry lifecycle' },
  cards: [],
};

/** A real session that fails its first commit and succeeds when Retry asks again. */
export function RetryableWorkspaceToolbarFixture() {
  const session = useMemo(() => {
    const control = new MemorySpaceBackendTestControl();
    control.queueResult({
      kind: 'retryable-failure',
      code: 'network',
      message: 'Network unavailable',
    });
    return openSpaceSession(
      new MemorySpaceBackend(
        [{ snapshot: retrySnapshot, revision: 0n, exportedRevision: null }],
        control,
      ),
      {
        snapshot: retrySnapshot,
        revision: 0n,
        exportedRevision: null,
      },
    );
  }, []);
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    session.submit(retrySnapshot);
  }, [session]);

  return (
    <WorkspaceToolbarFixture
      persistence={state.persistence}
      acknowledgedRevision={state.acknowledgedRevision}
      onRetry={session.retry}
    />
  );
}
