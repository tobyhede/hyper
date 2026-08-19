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
 * `elkStrategy` to do it. This module answers two related questions without
 * making the current id an input to the total renderer list.
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

/** Every renderer the canvas can draw. */
export interface CanvasRenderers {
  readonly computed: readonly CanvasRenderer[];
  readonly authored: readonly CanvasRenderer[];
}

/**
 * Every built-in View's row, by id.
 *
 * Keyed rather than searched, because a View selection names a `BuiltInViewId`
 * and every one of them has a row here: indexing is **total**, so there is no
 * "no such View" case to write, and none to leave untested. Searching for it
 * produced exactly that twice — once in the operation that returned the list
 * and the selection together, and again in `currentRenderer` when they were
 * separated. Both times the refusal was one no caller could reach and no test
 * could cover without a cast.
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
 * Everything the canvas can draw. Total for every valid Space: the identity of
 * the current renderer is deliberately not an input.
 */
export function canvasRenderers(space: Space): CanvasRenderers {
  const authored: readonly CanvasRenderer[] = space.layouts.map((layout) => ({
    selection: { kind: 'layout', layoutId: layout.id },
    title: layout.title,
  }));
  return { computed: COMPUTED, authored };
}

/**
 * The row named by the current renderer id.
 *
 * Partial in exactly one place, and the id's own shape says where: a View names
 * a `BuiltInViewId`, which `BY_VIEW` answers totally, so only the Layout arm can
 * fail — and it throws in the same words as `resolveRenderer`. Asking for the
 * list itself remains total.
 *
 * Each arm is answered from the one source that can answer it, rather than by
 * searching both groups for either kind. Searching wrote a "no such View" case
 * the type had already ruled out, and the module constant `computed` always
 * holds is `COMPUTED` — the very rows `BY_VIEW` does — so the View arm still
 * returns a member of the supplied list by reference.
 */
export function currentRenderer(renderers: CanvasRenderers, id: CanvasRendererId): CanvasRenderer {
  if (id.kind === 'view') return BY_VIEW[id.view];

  // The one identity rule, and it is the one `canvasRendererKey` already
  // states. Comparing the two selections field by field here would be a second
  // answer to "are these the same choice".
  const key = canvasRendererKey(id);
  const row = renderers.authored.find(
    (candidate) => canvasRendererKey(candidate.selection) === key,
  );
  if (row === undefined) throw layoutNotFound(id.layoutId);
  return row;
}
