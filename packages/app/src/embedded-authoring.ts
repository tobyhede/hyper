import type { MapId } from '@project/core';
import { Placement } from '@project/graph';
import {
  createNonThrowingReporter,
  createObservableState,
  type ObserverErrorReporter,
} from '@project/persistence';
import type { OpenSpace } from './open-spaces';
import { createRenderAdapter, type RenderAdapterAuthoring } from './render-adapter';
import type {
  AuthoringCompletion,
  AuthoringResult,
  EmbeddedContextCompletion,
  EmbeddedResourceCompletion,
} from './space-authoring';

/** Nothing was authored: the answer this canvas owes the author no prose for. */
const NOTHING_AUTHORED = { kind: 'unchanged' } as const;

/** What an embedded Map forwards: every completion `completeInMap` takes, bar Graph deletion. */
type ForwardedCompletion = Exclude<
  EmbeddedResourceCompletion | EmbeddedContextCompletion,
  { kind: 'deleted-graph' }
>;

/**
 * The forwarded kinds, keyed by the union `completeInMap` declares, so a kind
 * added to it fails to compile here until it is forwarded — or excluded above.
 */
const FORWARDED = {
  'opened-resource': true,
  'closed-resource': true,
  'resized-resource': true,
  'edited-resource': true,
  'settled-resource-movement': true,
  'removed-resource-from-map': true,
  'connected-resources': true,
  'renamed-map': true,
  'added-graph': true,
  'renamed-graph': true,
  'recolored-graph': true,
  'changed-graph-head-shape': true,
} as const satisfies Record<ForwardedCompletion['kind'], true>;

const isForwarded = (completion: AuthoringCompletion): completion is ForwardedCompletion =>
  Object.hasOwn(FORWARDED, completion.kind);

const completeEmbedded = (
  entry: OpenSpace,
  mapId: MapId,
  completion: AuthoringCompletion,
  report: ObserverErrorReporter,
): AuthoringResult => {
  if (isForwarded(completion)) return entry.app.authoring.completeInMap(mapId, completion);
  /**
   * Anything else is a broken invariant, not a refusal.
   *
   * The kinds `FORWARDED` names are the whole of what the surfaces holding this
   * `authoring` produce — `EmbeddedMapAuthoring`, the render adapter's
   * resize and movement settlements, Canvas Resource Authoring, and the Space
   * Resource rail's rename / recolor / head shape / add-Graph commands. Graph deletion is
   * not forwarded (`embedded-authoring.test.ts` — "does not forward Graph
   * deletion, which coordinated lifecycle owns"). Connecting two embedded Resources is
   * completed here as `connected-resources`; the host Edge Authoring module is
   * still not composed over this adapter. So any other kind arriving here is a
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
      `A ${completion.kind} completion reached an embedded Map, which supports only Open, Close, Edit, Resize, movement, Remove from Map, connecting Resources, renaming the Map, and renaming, recoloring, changing the head shape of or adding a Graph.`,
    ),
  );
  return NOTHING_AUTHORED;
};

/**
 * The map-scoped authoring port: Resource gestures and context commands on
 * the Map a Space Resource shows, completed by the target's sole Space
 * Authoring. Graph deletion is not forwarded here
 * (`embedded-authoring.test.ts` — "does not forward Graph deletion, which
 * coordinated lifecycle owns").
 *
 * The reporter is required with no default (ADR 0016): the composition names
 * the ambient console once and answers it as `ComposedApp.reportObserverError`,
 * so this module never mints a second, invisible one.
 */
export function completeEmbeddedAuthoring(
  entry: OpenSpace,
  mapId: MapId,
  completion: AuthoringCompletion,
  reportObserverError: ObserverErrorReporter,
): AuthoringResult {
  return completeEmbedded(entry, mapId, completion, createNonThrowingReporter(reportObserverError));
}

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
    completeEmbeddedAuthoring(entry, mapId, completion, reportObserverError);
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
