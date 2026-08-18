import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  uuidSchema,
  type BuiltInViewId,
  type Graph,
  type Layout,
  type SpaceSnapshot,
} from '@project/core';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  openSpaceSession,
  type SpaceSessionState,
} from '@project/persistence';
import { AppShell } from '@project/ui';
import { PersistenceControl, PersistenceNotice } from '#components/PersistenceControl';
import { WorkspaceToolbar } from '#components/WorkspaceToolbar';

const from = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const to = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const positions = { [from]: { x: 0, y: 0 }, [to]: { x: 320, y: 0 } };

// Titles/colors mirror the tracked e2e fixture (packages/app/fixture/space.json)
// and the app's GRAPH_PALETTE (packages/app/src/colors.ts).
const longGraph: Graph = {
  id: uuidSchema.parse('00000000-0000-4000-8000-000000000030'),
  title: 'Long',
  color: '#6ea8fe',
  edges: [{ from, to }],
};
const midGraph: Graph = {
  id: uuidSchema.parse('00000000-0000-4000-8000-000000000031'),
  title: 'Mid',
  color: '#f59e0b',
  edges: [{ from, to }],
};
const shortGraph: Graph = {
  id: uuidSchema.parse('00000000-0000-4000-8000-000000000032'),
  title: 'Short',
  color: '#34d399',
  edges: [{ from, to }],
};
const echoGraph: Graph = {
  id: uuidSchema.parse('00000000-0000-4000-8000-000000000033'),
  title: 'Echo',
  color: '#f472b6',
  edges: [{ from, to }],
};
const graphs: readonly Graph[] = [longGraph, midGraph, shortGraph, echoGraph];

const layouts: readonly Layout[] = [
  {
    id: uuidSchema.parse('00000000-0000-4000-8000-000000000020'),
    title: 'Collection 1',
    kind: 'positioned',
    positions,
    graphs: [longGraph, midGraph, shortGraph],
    activeGraph: longGraph.id,
  },
  {
    id: uuidSchema.parse('00000000-0000-4000-8000-000000000021'),
    title: 'Collection 2',
    kind: 'positioned',
    positions,
    graphs: [echoGraph],
    activeGraph: echoGraph.id,
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

/**
 * Controlled fixture state around the unchanged production chrome.
 *
 * It composes the real `AppShell`, not a stand-in header, because a retryable
 * failure now reports in two places at once — a red dot in the toolbar and the
 * notice the shell pins beneath it — and a fixture that drew only the toolbar
 * could not show the pairing the design depends on.
 */
export function WorkspaceToolbarFixture({
  persistence = { kind: 'settled' },
  presenting = false,
  authoringDisabled = false,
  remoteRefusal = null,
  acknowledgedRevision = 4n,
  onRetry = () => undefined,
}: WorkspaceToolbarFixtureProps) {
  const [view, setView] = useState<BuiltInViewId>('flow');
  const [layout, setLayout] = useState<string | null>(layouts[0]?.id ?? null);
  const [activeGraph, setActiveGraph] = useState<string | null>(longGraph.id);
  const addCardMenu = useRef<HTMLButtonElement>(null);

  return (
    <AppShell
      title="Workspace"
      toolbar={
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
            colorByGraphId: {},
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
                onAcceptRemote={() => remoteRefusal}
                onKeepLocal={() => undefined}
              />
            ),
            state: persistence.kind,
            acknowledgedRevision,
          }}
        />
      }
      notice={<PersistenceNotice persistence={persistence} onRetry={onRetry} />}
    >
      <div data-testid="workspace-canvas-stand-in" />
    </AppShell>
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
