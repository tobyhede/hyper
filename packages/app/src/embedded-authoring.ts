import type { MapId } from '@project/core';
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

const completeEmbedded = (
  entry: OpenSpace,
  mapId: MapId,
  completion: AuthoringCompletion,
  report: ObserverErrorReporter,
): AuthoringResult => {
  if (
    completion.kind === 'opened-resource' ||
    completion.kind === 'closed-resource' ||
    completion.kind === 'resized-resource' ||
    completion.kind === 'edited-resource' ||
    completion.kind === 'settled-resource-movement' ||
    completion.kind === 'removed-resource-from-map' ||
    completion.kind === 'connected-resources'
  ) {
    return entry.app.authoring.completeInMap(mapId, completion);
  }
  /**
   * Anything else is a broken invariant, not a refusal.
   *
   * The kinds above are the whole of what the surfaces holding this
   * `authoring` produce — `EmbeddedMapAuthoring`, the render adapter's
   * resize and movement settlements and Canvas Resource Authoring. A Map or
   * Graph Edit on the Map a Space Resource shows is completed by Map and
   * Graph authoring through `completeInMap`, never here
   * (`embedded-authoring.test.ts` — "does not forward a Map or Graph Edit").
   * Connecting two embedded Resources is completed here as
   * `connected-resources`; the host Edge Authoring module is still not
   * composed over this adapter. So any other kind arriving here is a
   * wiring defect, and `AuthoringResult`'s own rule (`space-authoring.ts`) says
   * a broken invariant "throws, or is reported through the non-throwing
   * reporter — dressing a programming defect as a refusal would put it in front
   * of the author as their own mistake". Do not answer it with a refusal such
   * as `edge-resource-outside-map`, which presents as the unrelated "An Edge
   * can only join Resources in this Map."
   *
   * Reported rather than thrown, under the canvas-wide rule recorded once in
   * `docs/agents/rendering.md` ("React Flow itself") and argued in
   * `connection-completion.ts`. `unchanged` is the honest answer — nothing
   * was authored, and it is the one outcome that owes the author no prose.
   */
  report(
    new Error(
      `A ${completion.kind} completion reached an embedded Map, which supports only Open, Close, Edit, Resize, movement, Remove from Map and connecting Resources.`,
    ),
  );
  return NOTHING_AUTHORED;
};

/**
 * One embedded canvas's gestures, completed by the target's sole Space Authoring.
 *
 * The reporter is required with no default (ADR 0016): the composition names
 * the ambient console once and answers it as `ComposedApp.reportObserverError`,
 * so this module — mounted from a canvas gesture, deep under it — never mints a
 * second, invisible one. One sink serves both of the events it hears about,
 * each arriving as an `Error` that says which it was.
 */
export function createEmbeddedAuthoring(
  entry: OpenSpace,
  mapId: MapId,
  reportObserverError: ObserverErrorReporter,
) {
  const report = createNonThrowingReporter(reportObserverError);
  const notifications = createObservableState(null, (error) =>
    report(new Error('An embedded authoring observer failed.', { cause: error })),
  );
  const complete = (completion: AuthoringCompletion): AuthoringResult =>
    completeEmbedded(entry, mapId, completion, report);
  const authoring: RenderAdapterAuthoring = {
    getState: entry.app.authoring.getState,
    complete,
    // This Map's own placement, not the host canvas's selected one — a
    // Space Resource embeds a Map of the target Space, which need not be the
    // one either canvas has selected.
    mapPlacement: () => {
      const resolved = entry.app.currentSpace().lookup.map(mapId);
      return resolved === undefined ? Placement.empty() : Placement.fromMap(resolved.map);
    },
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
