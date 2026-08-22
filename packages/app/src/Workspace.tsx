import { Component, type ReactElement, type ReactNode } from 'react';
import { createApp } from './App';
import { WorkspaceFailureView } from './components/WorkspaceFailureView';
import type { OpenedSpace } from './space';

export type WorkspaceRenderer = (app: ReactElement) => void;

interface WorkspaceFailureState {
  readonly message: string | null;
}

/** What a failure says, whichever of the two paths below caught it. */
const failureMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Reports what broke rather than letting it take the page down.
 *
 * `App` re-derives its whole runtime aggregate from the session's working
 * snapshot on every render, and that derivation throws when the snapshot stops
 * passing domain intake. Every path that writes the snapshot validates first, so
 * reaching this means an invariant has already broken — but an uncaught render
 * throw unmounts the tree and leaves a blank page, which reports nothing. This
 * is a report, not a recovery: the workspace it wrapped is gone, and with it the
 * controls that could have changed the state that broke.
 *
 * It catches render throws only, and nothing else reports here. A refused remote
 * snapshot leaves a workspace that still works, so it reports *inside* the app,
 * next to the control that was clicked (`App.tsx`).
 */
class WorkspaceFailure extends Component<{ children: ReactNode }, WorkspaceFailureState> {
  override state: WorkspaceFailureState = { message: null };

  static getDerivedStateFromError(error: unknown): WorkspaceFailureState {
    return { message: failureMessage(error) };
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return <WorkspaceFailureView message={this.state.message} />;
  }
}

/**
 * Mount one workspace-local application for the lifetime of the opened Space.
 *
 * Composition is guarded as well as rendering, because it reads the same
 * snapshot: `createApp` builds Navigation, which resolves the renderer the
 * Space opens in against the session's working Space (`compose-app.ts`), so a
 * snapshot that fails domain intake throws here — before there is a tree for
 * the boundary to catch it in. Both paths report the same sentence, for the
 * same reason: an uncaught throw leaves a blank page, which says nothing.
 *
 * `openStoredWorkspace` validates the snapshot and the session then clones that
 * same value, so the two halves of an `OpenedSpace` agree on every route this
 * app actually opens by. This guard is therefore a backstop, not a path with a
 * caller: it catches a composition assembled from halves that disagree, and it
 * logs as well as reports because — unlike the boundary below, which React
 * traces for us — nothing else would say what threw.
 */
export function mountWorkspace(opened: OpenedSpace, render: WorkspaceRenderer): void {
  let App: ReturnType<typeof createApp>;
  try {
    App = createApp(opened);
  } catch (error) {
    console.error('Composing the workspace failed', error);
    render(<WorkspaceFailureView message={failureMessage(error)} />);
    return;
  }
  render(
    <WorkspaceFailure>
      <App />
    </WorkspaceFailure>,
  );
}
