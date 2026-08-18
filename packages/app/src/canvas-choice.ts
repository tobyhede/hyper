import { BUILT_IN_VIEW_IDS } from '@project/core';
import type { Space } from '@project/graph';
import {
  builtInViewTitle,
  RendererInvariantError,
  rendererSelectionKey,
  type RendererSelection,
} from './renderer';

/**
 * Which canvases exist, and which one is taken (ADR 0053).
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
 * Pure: no React, no DOM, no strategy. A `ResolvedRenderer` would drag elkjs
 * into a module whose whole value is being node-testable, and nothing here needs
 * one — the lists are `space.layouts` and the ids `core` ships.
 */

/** One thing the canvas can draw. */
export interface CanvasRenderer {
  /**
   * The selection itself rather than an id and a kind, so choosing a row hands
   * back exactly what Navigation takes and nothing is reassembled — or narrowed
   * with a cast — on the way.
   */
  readonly selection: RendererSelection;
  readonly title: string;
}

/** The one choice over everything the canvas can draw (ADR 0053). */
export interface CanvasChoice {
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
 * The computed group, built once.
 *
 * It reads nothing from the `Space` — the built-in Views are the ids `core`
 * ships and the titles `renderer.ts` keeps beside their strategies — so there is
 * no per-call work here and no reason for two calls to answer with two arrays.
 * Frozen against a caller pushing a row onto the shared array — shallowly, which
 * is all `readonly` claims here anyway.
 *
 * Not exported. A sidebar importing this directly would be going to a second
 * source for half its list, which is the defect this module removes; it would
 * also have nowhere to put the `Space`-dependent answer a future View needs —
 * a tree View whose subject is one Graph's Cards is a row that is offered or
 * refused according to what the Space holds.
 */
const COMPUTED: readonly CanvasRenderer[] = Object.freeze(
  BUILT_IN_VIEW_IDS.map((view) => ({
    selection: { kind: 'view', view } as const,
    title: builtInViewTitle(view),
  })),
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
export function canvasChoice(space: Space, selected: RendererSelection): CanvasChoice {
  const authored: readonly CanvasRenderer[] = space.layouts.map((layout) => ({
    selection: { kind: 'layout', layoutId: layout.id },
    title: layout.title,
  }));

  // One identity rule for both groups, and it is the one `rendererSelectionKey`
  // already states. Comparing the two selections field by field here would be a
  // second answer to "are these the same choice".
  const key = rendererSelectionKey(selected);
  const matches = (candidate: CanvasRenderer): boolean =>
    rendererSelectionKey(candidate.selection) === key;
  const row = COMPUTED.find(matches) ?? authored.find(matches);
  if (row === undefined) {
    throw new RendererInvariantError(
      'renderer-not-found',
      selected.kind === 'layout'
        ? `The selected Layout ${selected.layoutId} does not exist.`
        : `The selected View ${selected.view} is not a built-in View.`,
    );
  }

  return { computed: COMPUTED, authored, selected: row };
}
