import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import type { Space } from '@project/graph';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  openSpaceSession,
  type SpaceSessionState,
} from '@project/persistence';
import { AppShell } from '@project/ui';
// Through the package's own subpath imports, as `#components/*` already is: a
// story sits two directories above `src`, and climbing there by relative path is
// how a package boundary gets crossed without naming one (AGENTS.md).
import { canvasChoice } from '#src/canvas-choice';
import { graphColorMap } from '#src/colors';
import { defaultRenderer, type RendererSelection } from '#src/renderer';
import { PersistenceControl, PersistenceNotice } from '#components/PersistenceControl';
import { SelectedCanvas, WorkspaceSidebar } from '#components/WorkspaceSidebar';
import { authoredSpace } from './spaces';

export interface WorkspaceSidebarFixtureProps {
  /** Which Space the sidebar reports on. See `./spaces`. */
  readonly space?: Space;
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
 * It composes the real `AppShell`, not a stand-in frame, because the sidebar and
 * the canvas header are two halves of one decision — the header names the choice
 * made in the sidebar — and a retryable failure reports in two places at once,
 * as a cue in the footer and as the notice the shell pins beneath the header.
 */
export function WorkspaceSidebarFixture({
  space = authoredSpace,
  persistence = { kind: 'settled' },
  presenting = false,
  authoringDisabled = false,
  remoteRefusal = null,
  acknowledgedRevision = 4n,
  onRetry = () => undefined,
}: WorkspaceSidebarFixtureProps) {
  // Where the Space opens is production's answer, from the same call `createApp`
  // makes on the Space it was given. A rule of the fixture's own — "the first
  // Layout, else Flow" — stood here, and it is the state translation ADR 0052's
  // negative names: the story would go on pressing a row after the app had
  // stopped. The Space declares `defaultView`, which is fixture *data* and
  // allowed; deciding what to do with it is not.
  const [selected, setSelected] = useState<RendererSelection>(() => defaultRenderer(space));
  const [activeGraph, setActiveGraph] = useState<string | null>(space.graphs[0]?.id ?? null);
  const addCardMenu = useRef<HTMLButtonElement>(null);
  // Both derivations run on every render, unmemoized. Production memoizes them
  // because a canvas hangs off their identity; nothing here does, and a story
  // that reproduces the memo without the reason for it is reproducing the shape
  // of production rather than its behaviour.
  //
  // One module answers which canvases exist and which is taken, and the header
  // below reads the row it named rather than a title of the fixture's own.
  const choice = canvasChoice(space, selected);
  // Colours the way the sidebar's own consumer gets them, and deliberately not
  // through `canvasProjection`: that needs a resolved strategy, so a story about
  // a sidebar would run elkjs to find out what colour a Graph's glyph is.
  const colorByGraphId = graphColorMap(space);

  return (
    <AppShell
      sidebar={
        <WorkspaceSidebar
          workspaceTitle={space.title}
          canvas={{ choice, onSelect: setSelected }}
          graph={{
            graphs: space.graphs,
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
      header={<SelectedCanvas renderer={choice.selected} />}
      notice={<PersistenceNotice persistence={persistence} onRetry={onRetry} />}
    >
      <div data-testid="workspace-canvas-stand-in" />
    </AppShell>
  );
}

/**
 * The Space this fixture's session commits — its own, and **not**
 * `authoredSpace`.
 *
 * The sidebar below reads three things off the session: `persistence`,
 * `acknowledgedRevision` and `retry`. It never reads its working Space, so one
 * value serving as both the session's subject and the sidebar's would suggest a
 * link the code does not have — a reader would take the drawn Layouts for the
 * ones being saved. Making that link real is issue 03.
 */
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
