import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Placement, type Space } from '@project/graph';
import { productDestinationPath, type ProductDestination } from '@project/http';
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
import { resolveLayout } from '#src/layout-resolution';
import { graphColorMap } from '#src/colors';
import { describeAuthoringRefusal } from '#src/authoring-refusal';
import { spaceEntityActions } from '#src/entity-actions';
import { createWorkingSpaceReader, snapshotFromSpace } from '#src/snapshot';
import { createSpaceAuthoring } from '#src/space-authoring';
import { PersistenceControl, PersistenceNotice } from '#components/PersistenceControl';
import {
  SelectedLayoutName,
  SpaceSidebar,
  type SpaceChromeTitleEdit,
  type SpaceChromeTitleSubject,
  type SpaceSidebarProps,
} from '#components/SpaceSidebar';
import { useStoryNavigation } from './navigation';
import { authoredSnapshot, authoredSpace, editedSnapshot, storyGraphIds } from './spaces';

/**
 * What a copy command leaves behind for a behaviour test to read.
 *
 * The **kind** of destination it built, not a name this fixture invented: the
 * commands come from production's own `spaceEntityActions`, so which address a
 * menu item copies is what a Ladle spec should be able to press, and a label of
 * the harness's own choosing would only prove the harness.
 */
const recordCopy = (destination: ProductDestination): boolean => {
  document.body.dataset['copyCommand'] = destination.kind;
  document.body.dataset['copyPath'] = productDestinationPath(destination);
  // Recording cannot fail, so the story draws the confirmation the application
  // draws when the clipboard accepts the link.
  return true;
};

export interface SpaceSidebarFixtureProps {
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
  /** Real AppShell canvas content supplied by a story-specific fixture. */
  readonly children?: ReactNode;
  /** Story-specific controls beside the real selected-Layout header. */
  readonly headerActions?: ReactNode;
  /**
   * Whether the footer names a selected Card, which is what gives that Card's
   * own actions menu an entity to hang off.
   */
  readonly showSelectedCard?: boolean;
  /**
   * The per-entity actions menu the real Sidebar draws on its rows.
   *
   * Defaulted to **production's own** `spaceEntityActions`, with copying and
   * renaming recorded rather than performed. A fixture that built its own
   * command list would be a second menu agreeing with the application only
   * while somebody kept the two in step.
   */
  readonly entityActions?: SpaceSidebarProps['entityActions'];
  readonly createLayout?: SpaceSidebarProps['createLayout'];
}

/**
 * Production Navigation around the unchanged production chrome.
 *
 * It composes the real `AppShell`, not a stand-in frame, because the sidebar and
 * the canvas header are two halves of one decision — the header names the choice
 * made in the sidebar — and a retryable failure reports in two places at once,
 * as a cue in the footer and as the notice the shell pins beneath the header.
 */
export function SpaceSidebarFixture({
  space = authoredSpace,
  currentSpace,
  persistence = { kind: 'settled' },
  presenting = false,
  authoringDisabled = false,
  remoteRefusal = null,
  acknowledgedRevision = 4n,
  onRetry = () => undefined,
  children,
  headerActions,
  showSelectedCard = true,
  entityActions,
  createLayout,
}: SpaceSidebarFixtureProps) {
  const [titleEdit, setTitleEdit] = useState<{
    readonly subject: SpaceChromeTitleSubject;
    readonly draft: string;
    readonly error: string | null;
    readonly surface: 'sidebar' | 'header';
    readonly returnFocus: () => void;
  } | null>(null);
  const editSession = useMemo(() => {
    const snapshot = snapshotFromSpace(space);
    return openSpaceSession(
      new MemorySpaceBackend([{ snapshot, revision: 0n, exportedRevision: null }]),
      { snapshot, revision: 0n, exportedRevision: null },
    );
  }, [space]);
  const readEditedSpace = useMemo(() => createWorkingSpaceReader(), []);
  const editSessionState = useSyncExternalStore(editSession.subscribe, editSession.getState);
  const editedSpace = readEditedSpace(editSessionState.working);
  const readEditableSpace = useCallback(
    () => readEditedSpace(editSession.getState().working),
    [editSession, readEditedSpace],
  );
  const readCurrentSpace = currentSpace ?? readEditableSpace;
  const displayedSpace = currentSpace === undefined ? editedSpace : space;
  const { navigation, state: navigationState } = useStoryNavigation(
    readCurrentSpace,
    (composed) => {
      if (presenting) composed.present();
    },
  );
  const authoring = useMemo(() => {
    const selected = navigation.getState().selectedLayoutId;
    const selectedLayout = readEditableSpace().lookup.layout(selected)?.layout;
    return createSpaceAuthoring({
      session: editSession,
      navigation,
      currentSpace: readEditableSpace,
      initialPlacement: selectedLayout === undefined ? null : Placement.fromLayout(selectedLayout),
      newId: storyGraphIds(),
    });
  }, [editSession, navigation, readEditableSpace]);
  // Where `presenting` is honoured now that Navigation outlives it. Reconciled
  // against the mode rather than applied, so the mount the initializer already
  // presented publishes nothing here, and so a story's own Present button — the
  // prop unchanged either side of it — is never argued with: this runs when the
  // prop changes and at no other time.
  useEffect(() => {
    if (presenting === (navigation.getState().mode === 'presenting')) return;
    if (presenting) navigation.present();
    else navigation.exitPresenting();
  }, [navigation, presenting]);
  const addCardMenu = useRef<HTMLButtonElement>(null);
  // The Space answers which Layouts exist and the resolver answers which one is
  // drawing; the header below reads that Layout rather than a title of the
  // fixture's own. The selection, its Active Graph and its mode are all
  // Navigation's published state.
  const selectedLayout = resolveLayout(displayedSpace, navigationState.selectedLayoutId).layout;
  // Colours the way the sidebar's own consumer gets them, and deliberately not
  // through `canvasProjection`: that needs a resolved strategy, so a story about
  // a sidebar would run elkjs to find out what colour a Graph's glyph is.
  const colorByGraphId = graphColorMap(displayedSpace);
  const linkedCard = displayedSpace.cards[0];
  const chromeTitleEdit: SpaceChromeTitleEdit = {
    subject: presenting || authoringDisabled ? null : (titleEdit?.subject ?? null),
    surface: presenting || authoringDisabled ? null : (titleEdit?.surface ?? null),
    draft: titleEdit?.draft ?? '',
    error: titleEdit?.error ?? null,
    disabled: authoringDisabled || presenting,
    onBegin: (subject, title, surface, returnFocus) =>
      setTitleEdit({ subject, draft: title, error: null, surface, returnFocus }),
    onDraftChange: (draft) =>
      setTitleEdit((current) => (current === null ? null : { ...current, draft })),
    onErrorChange: (error) =>
      setTitleEdit((current) => (current === null ? null : { ...current, error })),
    onComplete: (subject, title) => {
      const result =
        subject.kind === 'layout'
          ? authoring.complete({ kind: 'renamed-layout', layoutId: subject.id, title })
          : authoring.complete({ kind: 'renamed-graph', graphId: subject.id, title });
      if (result.kind === 'refused') return describeAuthoringRefusal(result.refusal);
      setTitleEdit(null);
      return null;
    },
    onCancel: () => setTitleEdit(null),
    onReturnFocus: () => titleEdit?.returnFocus(),
  };

  // The production builder, over the fixture's own Space, with the two side
  // effects replaced: a copy records the destination it would have written and
  // a rename runs the real chrome title edit above, which is the Sidebar's own.
  // Both Edits are behind one condition, and it is `App.tsx`'s whole condition
  // rather than the first half of it. A Layout rename begins the chrome title
  // edit `chromeTitleEdit.disabled` withdraws, and Delete Layout goes with it
  // rather than standing alone in a menu whose other Edit cannot run — that is
  // the first term. The second is `titleEdit === null`, production's
  // `spaceChromeEdit === null`: while a rename is already running, no row's
  // menu offers a second start to it. Reading only the first drew a menu in the
  // catalogue that the application does not have, which is the one thing a
  // story owing an application proof must not do (ADR 0052). Copying is in
  // front of both — an address is a fact about the entity rather than a change
  // to it.
  const editsAvailable = chromeTitleEdit.disabled !== true && titleEdit === null;
  const productionEntityActions = spaceEntityActions({
    spaceId: displayedSpace.id,
    spaceTitle: displayedSpace.title,
    onCopy: recordCopy,
    onRename: editsAvailable
      ? (subject, title, returnFocus) =>
          chromeTitleEdit.onBegin(subject, title, 'sidebar', returnFocus)
      : null,
    onDeleteLayout: editsAvailable
      ? (layoutId) => authoring.complete({ kind: 'deleted-layout', layoutId }).kind === 'completed'
      : null,
  });

  return (
    <AppShell
      sidebar={
        <SpaceSidebar
          spaceTitle={displayedSpace.title}
          canvas={{
            layouts: displayedSpace.layouts,
            selected: selectedLayout,
            onSelect: navigation.selectLayout,
          }}
          graph={{
            graphs: selectedLayout.graphs,
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
            hidden: false,
          }}
          createLayout={
            createLayout ?? {
              disabled: authoringDisabled,
              refusal: null,
              onCreate: () => {
                authoring.complete({ kind: 'created-layout' });
              },
            }
          }
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
          selectedCard={
            !showSelectedCard || linkedCard === undefined ? undefined : { card: linkedCard }
          }
          titleEdit={chromeTitleEdit}
          entityActions={entityActions ?? productionEntityActions}
        />
      }
      header={
        <>
          <SelectedLayoutName layout={selectedLayout} titleEdit={chromeTitleEdit} />
          {headerActions}
        </>
      }
      notice={<PersistenceNotice persistence={persistence} onRetry={onRetry} />}
    >
      {children ?? <div data-testid="space-canvas-stand-in" />}
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
 * state survives a failure, this one proves the Sidebar draws it (ADR 0052).
 *
 * The Space comes from one `createWorkingSpaceReader`, the same translation the
 * application's render path runs — a second `loadSpaceSnapshot` here would be a
 * copy of it and would reparse on every publication. The reader caches on
 * snapshot identity, and a session replaces `working` only when a submission
 * does, so the two states this story passes through cost two parses and hand
 * `resolveLayout` a stable `Space` in between.
 */
export function RetryableSpaceSidebarFixture() {
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
    <SpaceSidebarFixture
      space={currentSpace()}
      currentSpace={currentSpace}
      persistence={state.persistence}
      acknowledgedRevision={state.acknowledgedRevision}
      onRetry={session.retry}
    />
  );
}
