import { newUuid, type RouteId, type SpaceSnapshot, type UUID } from '@project/core';
import { loadSpaceSnapshot, type LayoutPoint } from '@project/graph';
import type { SpaceSession } from '@project/persistence';
import { createEditorStore, type EditorStore } from './editor';
import { updatePositionedLayout } from './snapshot';
import type { RendererSelection, ViewChoice } from './view';

interface PlacementEditorDependencies {
  readonly initialPositions: ReadonlyMap<string, LayoutPoint> | null;
  readonly viewChoice: ViewChoice;
  readonly currentActiveRoute: () => RouteId | null;
  readonly session: SpaceSession;
}

interface CurrentEditState {
  readonly snapshot: SpaceSnapshot;
  readonly positions: ReadonlyMap<string, LayoutPoint>;
  readonly renderer: RendererSelection;
  readonly newLayoutId: UUID | null;
  readonly activeRouteId: RouteId | null;
}

interface DerivedEdit {
  readonly snapshot: SpaceSnapshot;
  readonly layoutId: UUID;
}

function nextLayoutTitle(snapshot: SpaceSnapshot): string {
  let highest = 0n;
  for (const layout of snapshot.document.layouts ?? []) {
    const match = /^Layout ([1-9]\d*)$/.exec(layout.title);
    if (match?.[1] === undefined) continue;
    const number = BigInt(match[1]);
    if (number > highest) highest = number;
  }
  return `Layout ${highest + 1n}`;
}

function targetForEdit(
  snapshot: SpaceSnapshot,
  renderer: RendererSelection,
  newLayoutId: UUID | null,
): { readonly layoutId: UUID; readonly title: string } {
  if (renderer.kind === 'view') {
    if (newLayoutId === null) throw new Error('Converting a View requires a new Layout id.');
    return {
      layoutId: newLayoutId,
      title: nextLayoutTitle(snapshot),
    };
  }
  const layout = (snapshot.document.layouts ?? []).find(
    (candidate) => candidate.id === renderer.layoutId,
  );
  if (layout === undefined) {
    throw new Error(`The selected Layout ${renderer.layoutId} does not exist.`);
  }
  return { layoutId: layout.id, title: layout.title };
}

/** Private functional core: derive and validate the whole next Space before effects. */
function deriveCompletedEdit(current: CurrentEditState): DerivedEdit {
  const target = targetForEdit(current.snapshot, current.renderer, current.newLayoutId);
  const snapshot = updatePositionedLayout(
    current.snapshot,
    target.layoutId,
    target.title,
    current.positions,
    current.activeRouteId,
  );
  const loaded = loadSpaceSnapshot(snapshot);
  if (!loaded.ok) {
    throw new Error(
      `EditCompleted was emitted for invalid editing state: ${loaded.errors
        .map((error) => error.message)
        .join('; ')}`,
    );
  }
  return { snapshot, layoutId: target.layoutId };
}

export function createPlacementEditor({
  initialPositions,
  viewChoice,
  currentActiveRoute,
  session,
}: PlacementEditorDependencies): EditorStore {
  // Each completed Edit installs a fresh positions map before notifying. Record
  // that identity before effects so a synchronous listener cannot resubmit it.
  let submittedPositions: ReadonlyMap<string, LayoutPoint> | null = null;
  let completing = false;
  let completionQueued = false;
  const takeQueuedCompletion = (): boolean => {
    const queued = completionQueued;
    completionQueued = false;
    return queued;
  };
  const editor = createEditorStore(initialPositions, () => {
    if (completing) {
      completionQueued = true;
      return;
    }
    completing = true;
    let firstEffectError: { readonly error: unknown } | null = null;
    try {
      do {
        const positions = editor.getState().positions;
        if (positions === null) {
          throw new Error('EditCompleted was emitted without authored placement.');
        }
        if (positions === submittedPositions) continue;
        const renderer = viewChoice.current();
        const next = deriveCompletedEdit({
          snapshot: session.getState().working,
          positions,
          renderer,
          newLayoutId: renderer.kind === 'view' ? newUuid() : null,
          activeRouteId: currentActiveRoute(),
        });
        submittedPositions = positions;
        try {
          session.submit(next.snapshot);
        } catch (error) {
          firstEffectError ??= { error };
        }
        try {
          viewChoice.select({ kind: 'layout', layoutId: next.layoutId });
        } catch (error) {
          firstEffectError ??= { error };
        }
      } while (takeQueuedCompletion());
      if (firstEffectError !== null) throw firstEffectError.error;
    } finally {
      completing = false;
    }
  });
  return editor;
}
