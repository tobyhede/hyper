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
  /**
   * Validate the remote snapshot *before* handing it to the session. Accepting
   * first and checking after published an unloadable snapshot as settled working
   * state, so the conflict that could still have been resolved was gone. And the
   * check cannot report by throwing: this runs as an `onClick` handler, which
   * React error boundaries do not catch, so `WorkspaceFailure` never saw it and
   * the throw escaped to the window leaving the stale workspace on screen.
   *
   * Refusing changes nothing — local work, conflict and every control survive —
   * so it answers with the reason and leaves the mounted workspace alone. The
   * caller shows it; unmounting the page over a refusal would take the author's
   * unsaved work off screen to explain why it could not be replaced.
   */
  const acceptRemote = (): string | null => {
    const { persistence } = opened.spaceSession.getState();
    if (persistence.kind !== 'conflicted') return null;
    const accepted = loadSpaceSnapshot(persistence.current.snapshot);
    if (!accepted.ok) {
      return `The remote space is invalid and was not accepted:\n${accepted.errors
        .map((error) => `  - ${error.message}`)
        .join('\n')}`;
    }
    opened.spaceSession.acceptRemote();
    // The replacement subscribes to the same session this one is subscribed to,
    // so the outgoing workspace has to let go first or every conflict resolved
    // in a sitting leaves another listener on a session that outlives them all.
    dispose();
    mountWorkspace({ space: accepted.space, spaceSession: opened.spaceSession }, render);
    return null;
  };
  const { App, dispose } = createApp(opened, { acceptRemote });
  render(
    <WorkspaceFailure>
      <App />
    </WorkspaceFailure>,
  );
}
