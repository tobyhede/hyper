import { BUILT_IN_VIEW_IDS, type BuiltInViewId } from '@project/core';
import type { Space } from '@project/graph';
import {
  builtInViewTitle,
  layoutNotFound,
  canvasRendererKey,
  type CanvasRendererId,
} from './renderer';

/**
 * Which canvas renderers exist, and which one is current (ADR 0053, ADR 0055).
 *
 * Deliberately **not** in `renderer.ts`. That module answers what one selection
 * resolves to — a subject, a strategy, and what editing it means — and needs
 * `elkStrategy` to do it. This answers a different question: what the author may
 * choose between, and which of those choices is current. Different question,
 * different test file, and `renderer.ts` is long enough already.
 *
 * It is a **locality** change and not a deep module. The mapping below is small
 * on purpose; what it buys is that no caller derives the choice a second way.
 * The defect it removes was four sources for one answer — the composition built
 * both lists, the sidebar decided which row was pressed, the canvas header
 * derived the same title off the resolved renderer, and a story fixture wrote a
 * fourth copy by hand.
 *
 * No React, no DOM, and **no resolved renderer**: the lists are `space.layouts`
 * and the ids `core` ships, so nothing here needs a strategy, and taking a
 * `ResolvedRenderer` would mean holding an elkjs instance to answer a question
 * about titles. Being node-testable is the point, and the whole derivation is
 * tested in that environment.
 *
 * It does not follow that elkjs is absent from the load graph. This imports
 * `./renderer` for the View titles and the shared refusal, and `renderer.ts`
 * imports `elkStrategy` — so the adapter loads with this module, here and in its
 * test. The claim is about what this module *holds and calls*, not about what a
 * bundler pulls in behind it.
 */

/** One thing the canvas can draw. */
export interface CanvasRenderer {
  /**
   * The selection itself rather than an id and a kind, so choosing a row hands
   * back exactly what Navigation takes and nothing is reassembled — or narrowed
   * with a cast — on the way.
   */
  readonly selection: CanvasRendererId;
  readonly title: string;
}

/** Every renderer the canvas can draw and the one currently drawing it. */
export interface CanvasRenderers {
  readonly computed: readonly CanvasRenderer[];
  readonly authored: readonly CanvasRenderer[];
  /**
   * Reference-identical to one row in `computed` or in `authored`.
   *
   * Part of the interface and not an implementation detail: it is how the
   * sidebar decides which row is pressed, so the pressed test is `===` rather
   * than a field-by-field comparison made at each site — which is how a list and
   * the thing it reports on begin to disagree.
   */
  readonly selected: CanvasRenderer;
}

/**
 * Every built-in View's row, by id.
 *
 * Keyed rather than searched, because a View selection names a `BuiltInViewId`
 * and every one of them has a row here: indexing is **total**, so there is no
 * "no such View" case to write, and none to leave untested. Searching the array
 * for it produced exactly that — a refusal the type made unreachable.
 *
 * Written out per id under `satisfies`, the same shape `BUILT_IN_VIEWS` and
 * `VIEW_ICONS` already take, so a new built-in View is a compile error here
 * rather than a View the canvas cannot be switched to. The titles still come
 * from `builtInViewTitle`; only the keys are named twice, which is what makes
 * the compiler able to ask.
 */
const BY_VIEW = {
  flow: { selection: { kind: 'view', view: 'flow' }, title: builtInViewTitle('flow') },
  grid: { selection: { kind: 'view', view: 'grid' }, title: builtInViewTitle('grid') },
} as const satisfies Record<BuiltInViewId, CanvasRenderer>;

/**
 * The computed group, built once, in the order `core` ships the ids.
 *
 * It reads nothing from the `Space`, so there is no per-call work here and no
 * reason for two calls to answer with two arrays. Frozen against a caller
 * pushing a row onto the shared array — shallowly, which is all `readonly`
 * claims here anyway. Its members are the very values `BY_VIEW` holds, which is
 * what lets a View selection be answered by lookup and still be one of these
 * rows by reference.
 *
 * Not exported. A sidebar importing this directly would be going to a second
 * source for half its list, which is the defect this module removes; it would
 * also have nowhere to put the `Space`-dependent answer a future View needs —
 * a tree View whose subject is one Graph's Cards is a row that is offered or
 * refused according to what the Space holds.
 */
const COMPUTED: readonly CanvasRenderer[] = Object.freeze(
  BUILT_IN_VIEW_IDS.map((view) => BY_VIEW[view]),
);

/**
 * Everything the canvas can draw, and the row that is drawing.
 *
 * A `selected` naming a Layout the Space no longer holds throws — the same
 * answer `resolveRenderer` gives to the same condition, in the same words.
 * ADR 0053's canvas choice is one decision, and a caller holding a selection
 * that resolves in one module and not in the other is a defect rather than an
 * author's mistake.
 */
export function canvasRenderers(space: Space, selected: CanvasRendererId): CanvasRenderers {
  const authored: readonly CanvasRenderer[] = space.layouts.map((layout) => ({
    selection: { kind: 'layout', layoutId: layout.id },
    title: layout.title,
  }));

  if (selected.kind === 'view') {
    return { computed: COMPUTED, authored, selected: BY_VIEW[selected.view] };
  }

  // The one identity rule, and it is the one `canvasRendererKey` already
  // states. Comparing the two selections field by field here would be a second
  // answer to "are these the same choice".
  const key = canvasRendererKey(selected);
  const row = authored.find((candidate) => canvasRendererKey(candidate.selection) === key);
  if (row === undefined) throw layoutNotFound(selected.layoutId);

  return { computed: COMPUTED, authored, selected: row };
}
