import { Component, type ReactElement, type ReactNode } from 'react';
import { createApp } from './App';
import { SpaceAppFailureView } from './components/SpaceAppFailureView';
import type { OpenedSpace } from './space';
import type { CanvasRendererId } from './renderer';
import type { CardId } from '@project/core';

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
 * Composition is guarded as well as rendering, because it reads the same
 * snapshot: `createApp` builds Navigation, which resolves the renderer the
 * Space opens in against the session's working Space (`compose-app.ts`), so a
 * snapshot that fails domain intake throws here — before there is a tree for
 * the boundary to catch it in. Both paths report the same sentence, for the
 * same reason: an uncaught throw leaves a blank page, which says nothing.
 *
 * `openStoredSpace` validates the snapshot and the session then clones that
 * same value, so the two halves of an `OpenedSpace` agree on every route this
 * app actually opens by. This guard is therefore a backstop, not a path with a
 * caller: it catches a composition assembled from halves that disagree, and it
 * logs as well as reports because — unlike the boundary below, which React
 * traces for us — nothing else would say what threw.
 */
export function mountSpaceApp(
  opened: OpenedSpace,
  render: SpaceAppRenderer,
  selection?: CanvasRendererId,
  cardId?: CardId,
): void {
  let App: ReturnType<typeof createApp>;
  try {
    App = createApp(opened, selection, cardId);
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
