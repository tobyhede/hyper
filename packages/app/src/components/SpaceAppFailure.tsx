import { Component, type ReactNode } from 'react';
import { SpaceAppFailureView } from './SpaceAppFailureView';

interface SpaceAppFailureState {
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
 * is a report, not a recovery: the Space's app it wrapped is gone, and with it
 * the controls that could have changed the state that broke.
 *
 * It catches render throws only, and nothing else reports here. A refused remote
 * snapshot leaves everything on screen still working, so it reports *inside* the
 * app, next to the control that was clicked (`App.tsx`).
 */
export class SpaceAppFailure extends Component<{ children: ReactNode }, SpaceAppFailureState> {
  override state: SpaceAppFailureState = { message: null };

  static getDerivedStateFromError(error: unknown): SpaceAppFailureState {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return <SpaceAppFailureView message={this.state.message} />;
  }
}
