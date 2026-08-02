import { Component, type ReactElement, type ReactNode } from 'react';
import { loadSpaceSnapshot } from '@project/graph';
import { createApp } from './App';
import { WorkspaceReport } from './components/WorkspaceReport';
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
 * It catches render throws only. Event handlers are outside every boundary, so
 * `acceptRemote` below reports through `WorkspaceReport` directly.
 */
class WorkspaceFailure extends Component<{ children: ReactNode }, WorkspaceFailureState> {
  override state: WorkspaceFailureState = { message: null };

  static getDerivedStateFromError(error: unknown): WorkspaceFailureState {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return <WorkspaceReport message={this.state.message} />;
  }
}

/** Mount a workspace-local app, replacing every derived store after remote acceptance. */
export function mountWorkspace(opened: OpenedSpace, render: WorkspaceRenderer): void {
  /**
   * Validate the remote snapshot *before* handing it to the session. Accepting
   * first and checking after published an unloadable snapshot as settled working
   * state, so the conflict that could still have been resolved was gone. And the
   * check cannot report by throwing: this runs as an `onClick` handler, which
   * React error boundaries do not catch, so `WorkspaceFailure` never saw it and
   * the throw escaped to the window leaving the stale workspace on screen.
   */
  const acceptRemote = () => {
    const { persistence } = opened.spaceSession.getState();
    if (persistence.kind !== 'conflicted') return;
    const accepted = loadSpaceSnapshot(persistence.current.snapshot);
    if (!accepted.ok) {
      render(
        <WorkspaceReport
          message={`The remote space is invalid and was not accepted:\n${accepted.errors
            .map((error) => `  - ${error.message}`)
            .join('\n')}`}
        />,
      );
      return;
    }
    opened.spaceSession.acceptRemote();
    mountWorkspace({ space: accepted.space, spaceSession: opened.spaceSession }, render);
  };
  const App = createApp(opened, { acceptRemote });
  render(
    <WorkspaceFailure>
      <App />
    </WorkspaceFailure>,
  );
}
