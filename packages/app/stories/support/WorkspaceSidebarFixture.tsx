import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
import { canvasRenderers } from '#src/canvas-renderers';
import { graphColorMap } from '#src/colors';
import { defaultRenderer, type CanvasRendererId } from '#src/renderer';
import { createWorkingSpaceReader } from '#src/snapshot';
import { PersistenceControl, PersistenceNotice } from '#components/PersistenceControl';
import { SelectedCanvasRenderer, WorkspaceSidebar } from '#components/WorkspaceSidebar';
import { authoredSnapshot, authoredSpace, editedSnapshot } from './spaces';

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
  // stopped. The Space declares `defaultRenderer`, which is fixture *data* and
  // allowed; deciding what to do with it is not.
  const [selected, setSelected] = useState<CanvasRendererId>(() => defaultRenderer(space));
  const [activeGraph, setActiveGraph] = useState<string | null>(space.graphs[0]?.id ?? null);
  const addCardMenu = useRef<HTMLButtonElement>(null);
  // Both derivations run on every render, unmemoized. Production memoizes them
  // because a canvas hangs off their identity; nothing here does, and a story
  // that reproduces the memo without the reason for it is reproducing the shape
  // of production rather than its behaviour.
  //
  // One module answers which canvas renderers exist and which is current, and the header
  // below reads the row it named rather than a title of the fixture's own.
  const renderers = canvasRenderers(space, selected);
  // Colours the way the sidebar's own consumer gets them, and deliberately not
  // through `canvasProjection`: that needs a resolved strategy, so a story about
  // a sidebar would run elkjs to find out what colour a Graph's glyph is.
  const colorByGraphId = graphColorMap(space);

  return (
    <AppShell
      sidebar={
        <WorkspaceSidebar
          workspaceTitle={space.title}
          canvas={{ renderers, onSelect: setSelected }}
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
      header={<SelectedCanvasRenderer renderer={renderers.selected} />}
      notice={<PersistenceNotice persistence={persistence} onRetry={onRetry} />}
    >
      <div data-testid="workspace-canvas-stand-in" />
    </AppShell>
  );
}

/**
 * A real session that fails its first commit and succeeds when Retry asks
 * again, with the sidebar drawing the Space that session holds.
 *
 * One claim: **a failed save keeps the unsaved work on screen.** The session
 * loads `authoredSnapshot` and submits `editedSnapshot`, so `Collection 3` is
 * work no stored revision carries — it is on screen only because the sidebar
 * reads `state.working`, and it is still there once the retry succeeds. Its
 * pair in the application is `keeps persistence failure visible, accepts
 * another Edit, and retries the latest Space`, in
 * `packages/app/test/space-authoring.test.ts`: that one proves the working
 * state survives a failure, this one proves the workspace draws it (ADR 0052).
 *
 * The Space comes from one `createWorkingSpaceReader`, the same translation the
 * application's render path runs — a second `loadSpaceSnapshot` here would be a
 * copy of it and would reparse on every publication. The reader caches on
 * snapshot identity, and a session replaces `working` only when a submission
 * does, so the two states this story passes through cost two parses and hand
 * `canvasRenderers` a stable `Space` in between.
 */
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
        [{ snapshot: authoredSnapshot, revision: 0n, exportedRevision: null }],
        control,
      ),
      {
        snapshot: authoredSnapshot,
        revision: 0n,
        exportedRevision: null,
      },
    );
  }, []);
  const readWorkingSpace = useMemo(() => createWorkingSpaceReader(), []);
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    session.submit(editedSnapshot);
  }, [session]);

  return (
    <WorkspaceSidebarFixture
      space={readWorkingSpace(state.working)}
      persistence={state.persistence}
      acknowledgedRevision={state.acknowledgedRevision}
      onRetry={session.retry}
    />
  );
}
