import type { DiagramId } from '@project/core';
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
  diagramId: DiagramId,
  completion: AuthoringCompletion,
  report: ObserverErrorReporter,
): AuthoringResult => {
  if (
    completion.kind === 'opened-thing' ||
    completion.kind === 'closed-thing' ||
    completion.kind === 'resized-thing' ||
    completion.kind === 'edited-thing' ||
    completion.kind === 'settled-thing-movement' ||
    completion.kind === 'removed-thing-from-diagram' ||
    completion.kind === 'connected-things' ||
    completion.kind === 'renamed-diagram' ||
    completion.kind === 'added-graph' ||
    completion.kind === 'renamed-graph' ||
    completion.kind === 'recolored-graph'
  ) {
    return entry.app.authoring.completeInDiagram(diagramId, completion);
  }
  /**
   * Anything else is a broken invariant, not a refusal.
   *
   * The kinds above are the whole of what the surfaces holding this
   * `authoring` produce — `EmbeddedDiagramAuthoring`, the render adapter's
   * resize and movement settlements, Canvas Thing Authoring, and the Space
   * Thing rail's rename / recolor / add-Graph commands. Graph deletion is
   * not forwarded (`embedded-authoring.test.ts` — "does not forward Graph
   * deletion, which coordinated lifecycle owns"). Connecting two embedded Things is
   * completed here as `connected-things`; the host Edge Authoring module is
   * still not composed over this adapter. So any other kind arriving here is a
   * wiring defect, and `AuthoringResult`'s own rule (`space-authoring.ts`) says
   * a broken invariant "throws, or is reported through the non-throwing
   * reporter — dressing a programming defect as a refusal would put it in front
   * of the author as their own mistake". The refusal that used to stand here
   * did exactly that, and with an unrelated sentence:
   * `edge-thing-outside-diagram` presents as "An Edge can only join Things in
   * this Diagram."
   *
   * Reported rather than thrown, under the canvas-wide rule recorded once in
   * `docs/agents/rendering.md` ("React Flow itself") and argued in
   * `connection-completion.ts`. `unchanged` is the honest answer — nothing
   * was authored, and it is the one outcome that owes the author no prose.
   */
  report(
    new Error(
      `A ${completion.kind} completion reached an embedded Diagram, which supports only Open, Close, Edit, Resize, movement, Remove from Diagram, connecting Things, renaming the Diagram, and renaming, recoloring or adding a Graph.`,
    ),
  );
  return NOTHING_AUTHORED;
};

/**
 * The diagram-scoped authoring port: Thing gestures and context commands on
 * the Diagram a Space Thing shows, completed by the target's sole Space
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
  diagramId: DiagramId,
  completion: AuthoringCompletion,
  reportObserverError: ObserverErrorReporter,
): AuthoringResult {
  return completeEmbedded(
    entry,
    diagramId,
    completion,
    createNonThrowingReporter(reportObserverError),
  );
}

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
  diagramId: DiagramId,
  reportObserverError: ObserverErrorReporter,
) {
  const report = createNonThrowingReporter(reportObserverError);
  const notifications = createObservableState(null, (error) =>
    report(new Error('An embedded authoring observer failed.', { cause: error })),
  );
  const complete = (completion: AuthoringCompletion): AuthoringResult =>
    completeEmbeddedAuthoring(entry, diagramId, completion, reportObserverError);
  const authoring: RenderAdapterAuthoring = {
    getState: entry.app.authoring.getState,
    complete,
    // This Diagram's own placement, not the host canvas's selected one — a
    // Space Thing embeds a Diagram of the target Space, which need not be the
    // one either canvas has selected.
    diagramPlacement: () => {
      const resolved = entry.app.currentSpace().lookup.diagram(diagramId);
      return resolved === undefined ? Placement.empty() : Placement.fromDiagram(resolved.diagram);
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
