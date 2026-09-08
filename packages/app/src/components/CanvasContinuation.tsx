import { useEffect, useSyncExternalStore } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import type { CardId } from '@project/core';
import { staysOwed, type Continuation, type ContinuationTarget } from '../continuation';
import { edgeSelectionOf, sameEdgeSubject, type EdgeSubject } from '../render-adapter';

/**
 * The half of {@link Continuation} that can reach a canvas subject.
 *
 * Mounted inside `ReactFlowProvider`, because `reveal` needs `fitView` and
 * because resolving an Edge subject to an element means knowing React Flow's
 * edge ids. It owns `card | edge | canvas` and is the only place a *continuation*
 * is focused. It is not quite the only `.focus()` for these subjects:
 * `repairFocus` in `edge-authoring-react.tsx` still puts the caret back on the
 * canvas after React Flow's native Edge Escape blurs it, which is a repair to
 * that library's own handler rather than a continuation, and was left where it
 * is deliberately.
 *
 * **It cannot also be the chrome adapter.** The provider is conditional on
 * there being Cards on the canvas, so an adapter inside it would never spend a
 * chrome continuation while placement is pending or failed — which is exactly
 * when a creation pane is likely to have been cancelled.
 *
 * Readiness is discovered rather than declared: this re-resolves on every
 * render and spends when the element appears, so there is no `ready(fact)`
 * protocol for a caller to forget to fire. How long to keep looking is
 * `staysOwed`'s, in the module.
 */
export function CanvasContinuation({
  continuation,
  onSelectCard,
  onSelectEdge,
}: {
  readonly continuation: Continuation;
  readonly onSelectCard: (cardId: CardId) => void;
  readonly onSelectEdge: (subject: EdgeSubject) => void;
}) {
  const flow = useReactFlow();
  const { pending } = useSyncExternalStore(continuation.subscribe, continuation.getState);
  /**
   * What React Flow has taken, read from React Flow — both lists, and both for
   * the same two reasons.
   *
   * *The re-render.* "Every render" below means every render of *this*
   * component, and the render that carries a projection is one commit too
   * early: React Flow syncs the `nodes` and `edges` props into its own store
   * from an effect and draws from that, so an element it has never drawn before
   * is still absent when this component's effect first looks for it. Nothing
   * else re-renders this component when that second commit lands, so without
   * these subscriptions a continuation would be spent whenever some later,
   * unrelated render happened to come along — and never, if none did.
   *
   * **Both kinds `staysOwed` waits for are subscribed, and the node arm is not
   * spare.** A card target waits on exactly the same schedule an Edge does, and
   * the Edge arm looked like it covered both only because `syncProjection`
   * copies the Edge list (`edges: [...edges]`) on every publication. It is
   * `mergeProjected` that shows the difference: it replaces the nodes and
   * leaves the Edges the reference they had, which is the path a
   * create-and-connect takes — Authoring mints a Card, the projection carrying
   * it arrives with no Edge moving, and nothing in the Edge arm fires.
   *
   * *The lookup.* `elementOf` resolves an Edge subject against `drawnEdges`
   * rather than against a projection prop, so the id it mints comes from the
   * list the DOM is actually keyed off. The two agree today — the surface
   * hands React Flow the projected Edges decorated, ids untouched — and
   * subscribing to one list while resolving against another is what makes that
   * agreement something to re-establish rather than something to read.
   *
   * The stored array references are returned as they are: no derivation, no new
   * identity per render. `nodes` is subscribed for the render alone, since a
   * card target is resolved by `data-id` and consults no list.
   */
  // `drawnEdges`, not `drawn`: the effect below binds `drawn` to whether the
  // element it wants has appeared, and confusing "the Edges React Flow drew"
  // with "did it draw" is the bug class this module exists to get right.
  const drawnEdges = useStore((state) => state.edges);
  useStore((state) => state.nodes);

  /**
   * The element a target names, against the projection now on screen.
   *
   * The only place a domain subject becomes a React Flow id: an Edge is named
   * by subject everywhere else, and the drawn list is what carries the mapping.
   *
   * A plain function rather than a memo, because the effect below runs on every
   * render anyway and a stable identity would buy nothing.
   */
  const elementOf = (target: ContinuationTarget): HTMLElement | null => {
    if (target.kind === 'canvas') return document.querySelector<HTMLElement>('.react-flow');
    if (target.kind === 'card') {
      return document.querySelector<HTMLElement>(
        `.react-flow__node[data-id="${CSS.escape(target.cardId)}"]`,
      );
    }
    if (target.kind !== 'edge') return null;
    const edge = drawnEdges.find((candidate) => {
      const subject = edgeSelectionOf(candidate);
      return subject !== null && sameEdgeSubject(subject, target);
    });
    return edge === undefined
      ? null
      : document.querySelector<HTMLElement>(`.react-flow__edge[data-id="${CSS.escape(edge.id)}"]`);
  };

  /**
   * On **every** render, with no dependency list — which is the honest spelling
   * of "readiness is discovered".
   *
   * The element a continuation names appears one or more commits after the
   * projection that carries it: React Flow syncs the nodes prop into its own
   * store and draws them in a pass of its own, and this component re-renders
   * with every prop identity unchanged when it does. Keying this on `pending`
   * and the drawn Edges therefore misses exactly the commit the continuation
   * was waiting for. Spending is idempotent — `take` leaves nothing behind, and
   * the guard above returns on the very next run — so the cost of asking again
   * is a `querySelector` per render of a component that renders nothing.
   */
  useEffect(() => {
    if (pending === null) return;
    const { target } = pending;
    // Each adapter checks the kind itself. Which ones it owns is a fact about
    // where it mounts, so the module is never told.
    if (target.kind !== 'card' && target.kind !== 'edge' && target.kind !== 'canvas') return;
    const element = elementOf(target);
    // `reveal` needs React Flow's own store as well as the DOM: the camera move
    // names the node by id, and asking it to fit a node it does not know would
    // move the camera to nothing.
    const drawn =
      element !== null &&
      (pending.then !== 'reveal' ||
        target.kind !== 'card' ||
        flow.getNode(target.cardId) !== undefined);
    if (!drawn && staysOwed(pending)) return;
    if (pending.select) {
      if (target.kind === 'card') onSelectCard(target.cardId);
      if (target.kind === 'edge') onSelectEdge(target);
    }
    continuation.take();
    // `nothing` is a gesture that owed a subject and no caret — a completed Edge
    // drop. `rename` is the created Card's own inline editor, which `App` opens
    // by passing the Card down and which focuses itself; putting a `.focus()`
    // on the node here would take the caret straight back off it.
    if (pending.then === 'nothing' || pending.then === 'rename') return;
    if (pending.then === 'reveal' && target.kind === 'card' && drawn) {
      // The camera, and the only member that touches it: a Card addressed by
      // URL is somewhere the reader has never been.
      void flow
        .fitView({ nodes: [{ id: target.cardId }], padding: 0.5, duration: 0 })
        .then(() => element.focus());
      return;
    }
    // Only when the completed projection has left focus nowhere. An author who
    // has already moved to another control keeps it.
    if (document.activeElement !== document.body) return;
    (element ?? document.querySelector<HTMLElement>('.react-flow'))?.focus();
  });

  return null;
}
