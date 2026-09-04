import { Component, type ReactElement, type ReactNode } from 'react';
import { createApp } from './App';
import { SpaceAppFailureView } from './components/SpaceAppFailureView';
import type { BrowserLocation } from './browser-location';
import type { OpenSpace } from './open-spaces';
import type { DestinationOpening } from './destination-opening';

export type SpaceAppRenderer = (app: ReactElement) => void;

interface SpaceAppFailureState {
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
 * is a report, not a recovery: the Space's app it wrapped is gone, and with it
 * the controls that could have changed the state that broke.
 *
 * It catches render throws only, and nothing else reports here. A refused remote
 * snapshot leaves everything on screen still working, so it reports *inside* the
 * app, next to the control that was clicked (`App.tsx`).
 */
class SpaceAppFailure extends Component<{ children: ReactNode }, SpaceAppFailureState> {
  override state: SpaceAppFailureState = { message: null };

  static getDerivedStateFromError(error: unknown): SpaceAppFailureState {
    return { message: failureMessage(error) };
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return <SpaceAppFailureView message={this.state.message} />;
  }
}

/**
 * Mount one application for the lifetime of the opened Space.
 *
 * Open Spaces validates the snapshot and composes the collaborators once, so
 * `createApp` no longer performs domain intake. What it still does before there
 * is a tree is apply the addressed opening against the session's working Space,
 * and that throws on a Space that has since stopped loading — with no boundary
 * mounted yet to catch it. Both paths report the same sentence, for the same
 * reason: an uncaught throw leaves a blank page, which says nothing. This guard
 * is a backstop for a broken invariant, not a second composition path.
 */
export function mountSpaceApp(
  opened: OpenSpace,
  browserLocation: BrowserLocation,
  render: SpaceAppRenderer,
  opening?: DestinationOpening,
): void {
  let App: ReturnType<typeof createApp>;
  try {
    App = createApp(opened, browserLocation, opening);
  } catch (error) {
    console.error('Composing the Space app failed', error);
    render(<SpaceAppFailureView message={failureMessage(error)} />);
    return;
  }
  render(
    <SpaceAppFailure>
      <App />
    </SpaceAppFailure>,
  );
}
