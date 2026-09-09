import type { LayoutId } from '@project/core';
import { Placement } from '@project/graph';
import {
  createNonThrowingReporter,
  createObservableState,
  type ObserverErrorReporter,
} from '@project/persistence';
import type { OpenSpace } from './open-spaces';
import { createRenderAdapter, type RenderAdapterAuthoring } from './render-adapter';
import type { AuthoringCompletion, AuthoringResult } from './space-authoring';

/** Nothing was authored: the answer this canvas owes the author no prose for. */
const NOTHING_AUTHORED = { kind: 'unchanged' } as const;

/**
 * One embedded canvas's gestures, completed by the target's sole Space Authoring.
 *
 * The reporter is required with no default (ADR 0016): the composition names
 * the ambient console once and answers it as `ComposedApp.reportObserverError`,
 * so this module — mounted from a canvas gesture, deep under it — never mints a
 * second, invisible one. One sink serves both of the things it hears about,
 * each arriving as an `Error` that says which it was.
 */
export function createEmbeddedAuthoring(
  entry: OpenSpace,
  layoutId: LayoutId,
  reportObserverError: ObserverErrorReporter,
) {
  const report = createNonThrowingReporter(reportObserverError);
  const notifications = createObservableState(null, (error) =>
    report(new Error('An embedded authoring observer failed.', { cause: error })),
  );
  const complete = (completion: AuthoringCompletion): AuthoringResult => {
    if (
      completion.kind === 'opened-card' ||
      completion.kind === 'closed-card' ||
      completion.kind === 'resized-card' ||
      completion.kind === 'edited-card' ||
      completion.kind === 'settled-card-movement' ||
      completion.kind === 'removed-card-from-layout'
    ) {
      return entry.app.authoring.completeInLayout(layoutId, completion);
    }
    /**
     * Anything else is a broken invariant, not a refusal.
     *
     * The six kinds above are the whole of what the surfaces holding this
     * `authoring` produce — `EmbeddedLayoutAuthoring`, the render adapter's
     * resize and movement settlements, and Canvas Card Authoring — and Edge
     * Authoring is never composed over an embedded adapter. So a seventh kind
     * arriving here is a wiring defect, and `AuthoringResult`'s own rule
     * (`space-authoring.ts`) says a broken invariant "throws, or is reported
     * through the non-throwing reporter — dressing a programming defect as a
     * refusal would put it in front of the author as their own mistake". The
     * refusal that used to stand here did exactly that, and with an unrelated
     * sentence: `edge-card-outside-layout` presents as "An Edge can only join
     * Cards in this Layout."
     *
     * Reported rather than thrown, under the canvas-wide rule recorded once in
     * `docs/agents/rendering.md` ("React Flow itself") and argued in
     * `connection-completion.ts`. `unchanged` is the honest answer — nothing
     * was authored, and it is the one outcome that owes the author no prose.
     */
    report(
      new Error(
        `A ${completion.kind} completion reached an embedded Layout, which supports only Open, Close, Edit, Resize, movement and Remove from Layout.`,
      ),
    );
    return NOTHING_AUTHORED;
  };
  const authoring: RenderAdapterAuthoring = {
    getState: entry.app.authoring.getState,
    complete,
    authoredPlacement: () => {
      const resolved = entry.app.currentSpace().lookup.layout(layoutId);
      return resolved === undefined ? null : Placement.fromLayout(resolved.layout);
    },
    // The embedded projection is derived from this Layout on every Edit. Its
    // transient render reports must never replace the full canvas's placement.
    reportRendered: () => undefined,
    replacePlacement: () => undefined,
    subscribe: notifications.subscribe,
  };
  const adapter = createRenderAdapter(authoring);
  return {
    authoring,
    adapter,
    observe: () => {
      notifications.notify();
      return entry.app.authoring.subscribe(notifications.notify);
    },
  };
}
