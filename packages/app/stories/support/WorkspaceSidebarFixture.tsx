import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { uuidSchema, type Graph, type SpaceSnapshot } from '@project/core';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  openSpaceSession,
  type SpaceSessionState,
} from '@project/persistence';
import { AppShell } from '@project/ui';
import { PersistenceControl, PersistenceNotice } from '#components/PersistenceControl';
import { CurrentCanvas, WorkspaceSidebar, type CanvasChoice } from '#components/WorkspaceSidebar';

const from = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const to = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

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

/** The two built-in Views, in the order `core` ships them. */
const flow: CanvasChoice = { selection: { kind: 'view', view: 'flow' }, title: 'Flow' };
const grid: CanvasChoice = { selection: { kind: 'view', view: 'grid' }, title: 'Grid' };
const computed: readonly CanvasChoice[] = [flow, grid];

const collectionOne: CanvasChoice = {
  selection: { kind: 'layout', layoutId: uuidSchema.parse('00000000-0000-4000-8000-000000000020') },
  title: 'Collection 1',
};
const collectionTwo: CanvasChoice = {
  selection: { kind: 'layout', layoutId: uuidSchema.parse('00000000-0000-4000-8000-000000000021') },
  title: 'Collection 2',
};
const authored: readonly CanvasChoice[] = [collectionOne, collectionTwo];

export interface WorkspaceSidebarFixtureProps {
  readonly persistence?: SpaceSessionState['persistence'];
  readonly presenting?: boolean;
  readonly authoringDisabled?: boolean;
  readonly remoteRefusal?: string | null;
  readonly acknowledgedRevision?: bigint;
  readonly onRetry?: () => void;
  /** A Space before its first Edit: no authored Layout and no Graph (ADR 0025). */
  readonly unauthored?: boolean;
}

/**
 * Controlled fixture state around the unchanged production chrome.
 *
 * It composes the real `AppShell`, not a stand-in frame, because the sidebar and
 * the canvas header are two halves of one decision — the header names the choice
 * made in the sidebar — and a retryable failure reports in two places at once,
 * as a cue in the footer and as the notice the shell pins beneath the header.
 */
export function WorkspaceSidebarFixture({
  persistence = { kind: 'settled' },
  presenting = false,
  authoringDisabled = false,
  remoteRefusal = null,
  acknowledgedRevision = 4n,
  onRetry = () => undefined,
  unauthored = false,
}: WorkspaceSidebarFixtureProps) {
  const [selected, setSelected] = useState<CanvasChoice>(unauthored ? flow : collectionOne);
  const [activeGraph, setActiveGraph] = useState<string | null>(unauthored ? null : longGraph.id);
  const addCardMenu = useRef<HTMLButtonElement>(null);

  return (
    <AppShell
      sidebar={
        <WorkspaceSidebar
          workspaceTitle="Workspace"
          canvas={{
            computed,
            authored: unauthored ? [] : authored,
            selected: selected.selection,
            onSelect: setSelected,
          }}
          graph={{
            graphs: unauthored ? [] : graphs,
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
      header={<CurrentCanvas title={selected.title} kind={selected.selection.kind} />}
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
export function RetryableWorkspaceSidebarFixture() {
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
    <WorkspaceSidebarFixture
      persistence={state.persistence}
      acknowledgedRevision={state.acknowledgedRevision}
      onRetry={session.retry}
    />
  );
}
