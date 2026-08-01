import { Component, type ReactElement, type ReactNode } from 'react';
import { loadSpaceSnapshot } from '@project/graph';
import { createApp } from './App';
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
 */
class WorkspaceFailure extends Component<{ children: ReactNode }, WorkspaceFailureState> {
  override state: WorkspaceFailureState = { message: null };

  static getDerivedStateFromError(error: unknown): WorkspaceFailureState {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return (
      <div className="placement-status" role="alert" data-testid="workspace-failure">
        <div className="placement-status__panel">
          <h2>Unable to open this space</h2>
          <pre>{this.state.message}</pre>
        </div>
      </div>
    );
  }
}

/** Mount a workspace-local app, replacing every derived store after remote acceptance. */
export function mountWorkspace(opened: OpenedSpace, render: WorkspaceRenderer): void {
  const acceptRemote = () => {
    opened.spaceSession.acceptRemote();
    const accepted = loadSpaceSnapshot(opened.spaceSession.getState().working);
    if (!accepted.ok) {
      throw new Error(
        `The accepted remote space is invalid:\n${accepted.errors
          .map((error) => `  - ${error.message}`)
          .join('\n')}`,
      );
    }
    mountWorkspace({ space: accepted.space, spaceSession: opened.spaceSession }, render);
  };
  const App = createApp(opened, { acceptRemote });
  render(
    <WorkspaceFailure>
      <App />
    </WorkspaceFailure>,
  );
}
