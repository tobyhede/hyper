import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { uuidSchema } from '@project/core';
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
import { canvasRenderers, currentRenderer } from '#src/canvas-renderers';
import { graphColorMap } from '#src/colors';
import { createNavigation } from '#src/navigation';
import { createRendererResolver, defaultRenderer } from '#src/renderer';
import { createWorkingSpaceReader } from '#src/snapshot';
import { PersistenceControl, PersistenceNotice } from '#components/PersistenceControl';
import { SelectedCanvasRenderer, WorkspaceSidebar } from '#components/WorkspaceSidebar';
import { authoredSnapshot, authoredSpace, editedSnapshot } from './spaces';

const storyGraphIds = (): (() => ReturnType<typeof uuidSchema.parse>) => {
  let next = 0;
  return () => {
    next += 1;
    return uuidSchema.parse(`00000000-0000-4000-8000-${next.toString().padStart(12, '0')}`);
  };
};

export interface WorkspaceSidebarFixtureProps {
  /** Which Space the sidebar reports on. See `./spaces`. */
  readonly space?: Space;
  /** The live Space Navigation reads; supplied by session-backed fixtures. */
  readonly currentSpace?: () => Space;
  readonly persistence?: SpaceSessionState['persistence'];
  readonly presenting?: boolean;
  readonly authoringDisabled?: boolean;
  readonly remoteRefusal?: string | null;
  readonly acknowledgedRevision?: bigint;
  readonly onRetry?: () => void;
}

/**
 * Production Navigation around the unchanged production chrome.
 *
 * It composes the real `AppShell`, not a stand-in frame, because the sidebar and
 * the canvas header are two halves of one decision — the header names the choice
 * made in the sidebar — and a retryable failure reports in two places at once,
 * as a cue in the footer and as the notice the shell pins beneath the header.
 */
export function WorkspaceSidebarFixture({
  space = authoredSpace,
  currentSpace,
  persistence = { kind: 'settled' },
  presenting = false,
  authoringDisabled = false,
  remoteRefusal = null,
  acknowledgedRevision = 4n,
  onRetry = () => undefined,
}: WorkspaceSidebarFixtureProps) {
  const suppliedSpace = useCallback(() => space, [space]);
  const readCurrentSpace = currentSpace ?? suppliedSpace;
  const resolveRenderer = useMemo(
    () => createRendererResolver({ newGraphId: storyGraphIds() }),
    [],
  );
  const navigation = useMemo(() => {
    const initialSpace = readCurrentSpace();
    const composed = createNavigation(
      readCurrentSpace,
      resolveRenderer,
      defaultRenderer(initialSpace),
      initialSpace,
    );
    if (presenting) composed.present();
    return composed;
  }, [presenting, readCurrentSpace, resolveRenderer]);
  const navigationState = useSyncExternalStore(navigation.subscribe, navigation.getState);
  const addCardMenu = useRef<HTMLButtonElement>(null);
  // One module answers which canvas renderers exist and which is current, and
  // the header below reads the row it named rather than a title of the
  // fixture's own. The selected renderer, its Active Graph and its mode are all
  // Navigation's published state.
  const renderers = canvasRenderers(space);
  const current = currentRenderer(renderers, navigationState.selectedRenderer);
  const renderer = resolveRenderer(space, navigationState.selectedRenderer);
  // Colours the way the sidebar's own consumer gets them, and deliberately not
  // through `canvasProjection`: that needs a resolved strategy, so a story about
  // a sidebar would run elkjs to find out what colour a Graph's glyph is.
  const colorByGraphId = graphColorMap(space);

  return (
    <AppShell
      sidebar={
        <WorkspaceSidebar
          workspaceTitle={space.title}
          canvas={{ renderers, current, onSelect: navigation.selectRenderer }}
          graph={{
            graphs: renderer.subject.graphs,
            activeGraphId: navigationState.activeGraphId,
            colorByGraphId,
            onActivate: navigation.activateGraph,
            onPresent: navigation.present,
            presenting: navigationState.mode === 'presenting',
            onExitPresenting: navigation.exitPresenting,
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
      header={<SelectedCanvasRenderer renderer={current} />}
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
  const currentSpace = useCallback(
    () => readWorkingSpace(session.getState().working),
    [readWorkingSpace, session],
  );
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    session.submit(editedSnapshot);
  }, [session]);

  return (
    <WorkspaceSidebarFixture
      space={currentSpace()}
      currentSpace={currentSpace}
      persistence={state.persistence}
      acknowledgedRevision={state.acknowledgedRevision}
      onRetry={session.retry}
    />
  );
}
