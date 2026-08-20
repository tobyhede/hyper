import type { CardId, LayoutPosition } from '@project/core';
import { createNonThrowingReporter, type ObserverErrorReporter } from '@project/persistence';
import type { CardFlowNode } from '@project/react-flow-adapter';
import type { RenderAdapter } from './render-adapter';
import { describeAuthoringRefusal } from './authoring-refusal';
import type { SpaceAuthoring } from './space-authoring';

/**
 * The three steps a completed connection takes, in the one order that works.
 *
 * Edge Authoring decides *when* a connect or create-and-connect interaction has
 * finished; this decides what finishing does. The two are separate because the
 * order below is a fact about the render adapter and Space Authoring rather
 * than about pointers and keys, and it was previously spread across two render
 * adapter methods that each knew half of it.
 *
 * Neither the render adapter nor Space Authoring owns this: the adapter must
 * not interpret a gesture, and Authoring must not know that React Flow has a
 * second node list.
 */
/**
 * What a connection attempt came to.
 *
 * Three outcomes rather than `CardId | null`, because the caller has to tell a
 * **refusal** — which owes the author the sentence carried here — from a gesture
 * that simply had nowhere to land, which owes them nothing and must not wipe a
 * message already on screen. Answering the reason here is also what keeps
 * eligibility asked twice per gesture rather than three times: the coordinator
 * already asked it to decide, so a caller reaching for the sentence afterwards
 * would be asking the same question of a Space that has since moved.
 */
export type ConnectionResult =
  | { readonly kind: 'completed'; readonly cardId: CardId }
  | { readonly kind: 'refused'; readonly reason: string }
  /** No arrangement to write into, or an invariant already reported. */
  | { readonly kind: 'unavailable' };

export interface ConnectionCompletion {
  /**
   * Author one Edge between two Cards already on screen.
   *
   * `projected` is the render path's next projection, merged onto the live
   * nodes so the Edge draws without waiting for a strategy. It is `null` while
   * a replacement arrangement is still resolving — the canvas keeps drawing the
   * one already on screen, so a connection stays reachable through that window
   * — and then there is nothing to merge and the live nodes stand until the
   * next `syncProjection`.
   */
  readonly connect: (
    from: CardId,
    to: CardId,
    projected: readonly CardFlowNode[] | null,
  ) => ConnectionResult;
  /** Author a Card at an Option/Alt empty drop and the Edge that reaches it. */
  readonly createAndConnect: (
    from: CardId,
    position: LayoutPosition,
    projected: readonly CardFlowNode[] | null,
  ) => ConnectionResult;
}

const UNAVAILABLE = { kind: 'unavailable' } as const;

export interface ConnectionCompletionDependencies {
  readonly adapter: RenderAdapter;
  readonly authoring: SpaceAuthoring;
  /** Where an invariant violation at the React Flow seam is reported. */
  readonly reportInvariant?: ObserverErrorReporter;
}

export function createConnectionCompletion({
  adapter,
  authoring,
  reportInvariant = (error) => console.error('Connection completion invariant', error),
}: ConnectionCompletionDependencies): ConnectionCompletion {
  const report = createNonThrowingReporter(reportInvariant);

  /**
   * Complete, then reconcile — and only when the Space really gained the Edge.
   *
   * The placement handed to Authoring is read from the **live** nodes while the
   * list merged back is the **projected** one, deliberately. `renderedPlacement`
   * reads positions only, and `mergeProjected` takes every surviving Card's
   * position from its live node, so the two agree on every Card already on
   * screen. They diverge only for a Card the projection has gained and the live
   * list has not, which `App` makes reachable by withholding `syncProjection`
   * until a strategy resolves. That Card has no resolved position yet, and
   * authoring the origin it is standing on is exactly what a sparse Layout
   * exists to avoid.
   *
   * A completion that has not happened — refused, or thrown on an invalid Space
   * — must not leave a connection drawn for an Edge the Space never gained.
   *
   * **`queued` is an invariant violation here, not an outcome.** It is
   * Authoring's answer to a completion made from inside its own publication, and
   * a React Flow event is not that: a pointer release or a key press reaches
   * this from the browser's event loop, with no Edit on the stack. Reaching it
   * means some notification path now calls a canvas handler synchronously, which
   * is worth hearing about — but not worth taking the canvas down for mid-drag,
   * so it is reported rather than thrown and the gesture ends having drawn
   * nothing. If the queued Edit does land, the projection that follows it draws
   * the Edge anyway.
   */
  const complete = (
    completion: Parameters<SpaceAuthoring['complete']>[0],
    projected: readonly CardFlowNode[] | null,
    continueAt: (result: { readonly createdCardId?: CardId }) => CardId | undefined,
  ): ConnectionResult => {
    const result = authoring.complete(completion);
    if (result.kind === 'refused') {
      return { kind: 'refused', reason: describeAuthoringRefusal(result.refusal) };
    }
    if (result.kind === 'queued') {
      report(
        new Error(
          `A ${completion.kind} completion was queued behind another Edit. React Flow events cannot be re-entrant.`,
        ),
      );
      return UNAVAILABLE;
    }
    if (result.kind !== 'completed') return UNAVAILABLE;
    // Re-read through the store rather than capturing: completing published,
    // and a listener may have replaced the projection — accepting a stored
    // Space drops it outright.
    if (projected !== null) adapter.getState().mergeProjected(projected);
    const cardId = continueAt(result);
    return cardId === undefined ? UNAVAILABLE : { kind: 'completed', cardId };
  };

  /**
   * Ask eligibility once, and answer its sentence rather than re-asking for it.
   *
   * Completion validates the same proposal again — the Space can change between
   * the preview and the release — so a refusal can arrive from either, and both
   * are the same answer to the author.
   */
  const eligible = (proposal: Parameters<SpaceAuthoring['edgeEligibility']>[0]): string | null => {
    const eligibility = authoring.edgeEligibility(proposal);
    return eligibility.kind === 'refused' ? describeAuthoringRefusal(eligibility.refusal) : null;
  };

  return {
    connect: (from, to, projected) => {
      const rendered = adapter.getState().renderedPlacement();
      if (rendered === null) return UNAVAILABLE;
      const refusal = eligible({ kind: 'connect', from, to });
      if (refusal !== null) return { kind: 'refused', reason: refusal };
      return complete({ kind: 'connected-cards', from, to, rendered }, projected, () => to);
    },

    createAndConnect: (from, position, projected) => {
      const rendered = adapter.getState().renderedPlacement();
      if (rendered === null) return UNAVAILABLE;
      const refusal = eligible({ kind: 'create-and-connect', from });
      if (refusal !== null) return { kind: 'refused', reason: refusal };
      // The dropped Card is placed by `position` inside the completion itself.
      return complete(
        { kind: 'create-and-connect', from, position, rendered },
        projected,
        (result) => result.createdCardId,
      );
    },
  };
}
