import { Component, type ReactElement, type ReactNode } from 'react';
import { createApp } from './App';
import { WorkspaceFailureView } from './components/WorkspaceFailureView';
import type { OpenedSpace } from './space';

export type WorkspaceRenderer = (app: ReactElement) => void;

interface WorkspaceFailureState {
  readonly message: string | null;
}

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
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return <WorkspaceFailureView message={this.state.message} />;
  }
}

/** Mount one workspace-local application for the lifetime of the opened Space. */
export function mountWorkspace(opened: OpenedSpace, render: WorkspaceRenderer): void {
  const App = createApp(opened);
  render(
    <WorkspaceFailure>
      <App />
    </WorkspaceFailure>,
  );
}
