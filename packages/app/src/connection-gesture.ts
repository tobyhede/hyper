/**
 * Whether a connection drag authors a new Card, decided away from the DOM.
 *
 * `SpaceCanvas` asks this twice per gesture and from two places: the live
 * preview drawn under the pointer, and the release that authors. Both used to
 * spell the rule out by hand — the same conjunction against different inputs,
 * with nothing pinning that they agreed — and both hand-rolled the same
 * centre-to-top-left arithmetic. One rule and two suppliers of facts is what
 * this module is.
 *
 * **The two suppliers do not agree in every case, and that is deliberate.**
 * Four of the five facts come from sources that track the pointer across the
 * whole document: React Flow's own connection state, and a `window` key
 * listener. `over` does not. The release hit-tests the DOM at the moment it
 * happens, while the preview reads state last written by `onMouseMove`, which
 * is bound to the flow container and stops firing the moment the pointer leaves
 * it. Drag out over the toolbar with the modifier held and the preview's fact
 * freezes, so the ghost goes on tracking — clipped by the container's own
 * `overflow: hidden` — while the release correctly refuses. That release is
 * covered by `new-space.spec.ts`, "an Alt-drop released off the canvas creates
 * no Card".
 *
 * Closing it means giving the preview the same live source: a document-level
 * pointer listener running `elementFromPoint` per frame, against a
 * `handleMouseMove` that was narrowed to one non-positional value precisely to
 * stop per-frame re-renders. That is a trade with its own measurement to make.
 * So what this module guarantees is narrower than it first looks — the same
 * facts yield the same answer, not that the preview and the release always
 * agree.
 */

import type { LayoutPosition } from '@project/core';
import { CARD_SIZE } from './card';

/**
 * What a connection drag currently points at.
 *
 * Two sources answer this and neither is sufficient alone. React Flow resolves
 * `toNode` through `getClosestHandle`, by distance from the pointer to a handle
 * within `connectionRadius` — 20 in the pinned 12.11.2 — so it is non-null over
 * blank canvas near a handle, and **null over the middle of a Card**, whose
 * centre is some 73px from the nearest handle at 260x146. The DOM answers the
 * rest, from the element under the pointer. Drop the DOM half and an Alt-release
 * onto a Card's body authors a Card on top of it; drop React Flow's half and a
 * release just outside a Card authors one where the author was aiming at a
 * handle. A connection target in range therefore outranks what lies underneath,
 * and both callers apply that precedence before asking.
 *
 * `card` and `off-canvas` are refused for the same reason today and are still
 * two values, because this is a fact a caller reports rather than a verdict it
 * reaches. Collapsing them would name an input after the answer it happens to
 * produce.
 */
export type DropTarget = 'connection-target' | 'card' | 'empty-canvas' | 'off-canvas';

/**
 * An unfinished connection drag — CONTEXT.md's **Interaction draft**, as much of
 * one as deciding an empty-drop needs.
 *
 * `sourceId` and `point` exist only under `dragging`, so a gesture naming a
 * source while idle is unrepresentable rather than rejected on a branch. The id
 * is a plain string because that is what React Flow knows a node by; the uuid
 * parse belongs where a Card identity is actually needed, in `App`.
 */
export type ConnectionGesture =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'dragging';
      readonly sourceId: string;
      /** Flow space. Both suppliers convert before handing it over. */
      readonly point: LayoutPosition;
      readonly over: DropTarget;
      /** Alt/Option, tracked on `window` so it survives leaving the canvas. */
      readonly modifierHeld: boolean;
    };

/** The Card an empty-drop would author: its source, and its top-left. */
export interface NewCardDrop {
  readonly sourceId: string;
  readonly position: LayoutPosition;
}

/**
 * The Card this gesture would author, or `null` for one that authors none.
 *
 * `accepts` is a parameter rather than a sixth field because it is a capability
 * and not a fact, which keeps `ConnectionGesture` plain data a table test can
 * write as a literal. It is the domain half of the question and lives in
 * `space-authoring` — this module never reads a Space.
 *
 * The position returned is the Card's top-left, centred on the drop point. The
 * preview draws from the same answer, so the ghost and the authored Card cannot
 * land in different places.
 */
export function newCardDrop(
  gesture: ConnectionGesture,
  accepts: (from: string) => boolean,
): NewCardDrop | null {
  if (gesture.kind !== 'dragging') return null;
  if (gesture.over !== 'empty-canvas') return null;
  if (!gesture.modifierHeld) return null;
  if (!accepts(gesture.sourceId)) return null;
  return {
    sourceId: gesture.sourceId,
    position: {
      x: gesture.point.x - CARD_SIZE.width / 2,
      y: gesture.point.y - CARD_SIZE.height / 2,
    },
  };
}
