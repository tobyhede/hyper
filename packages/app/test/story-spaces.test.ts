import { describe, expect, it } from 'vitest';
import { loadSpaceSnapshot } from '@project/graph';
import { canvasRenderers } from '../src/canvas-renderers';
import { defaultRenderer } from '../src/renderer';
import { authoredSpace, editedSnapshot, unauthoredSpace } from '../stories/support/spaces';

/**
 * The Spaces the Ladle catalogue draws, held to production's own rules.
 *
 * ADR 0052 makes a stable story evidence about the UI Hyper ships, and its
 * negative to remember forbids making one possible by "translating its state in
 * the harness". Where a Space opens is `defaultRenderer` reading
 * `space.defaultView` — so the story fixture must not answer that question
 * itself, and these Spaces have to *declare* what the Ladle specs then assert.
 *
 * That is what this file pins. `issue-14-workspace-sidebar.spec.ts` proves the
 * rendered story presses Collection 1; this proves the story is entitled to,
 * because the Space says so through the same call production makes. Delete the
 * `defaultView` and this fails here rather than in a browser.
 */
describe('the story Spaces', () => {
  it('opens the authored Space on the Layout its stories press', () => {
    const opens = defaultRenderer(authoredSpace);

    expect(opens.kind).toBe('layout');
    expect(canvasRenderers(authoredSpace, opens).selected.title).toBe('Collection 1');
  });

  /** A new Space names no view, so production's own fallback answers (ADR 0018, ADR 0025). */
  it('opens the unauthored Space on Flow, owning no Layout to open on', () => {
    const opens = defaultRenderer(unauthoredSpace);

    expect(opens).toEqual({ kind: 'view', view: 'flow' });
    expect(unauthoredSpace.layouts).toEqual([]);
    expect(unauthoredSpace.graphs).toEqual([]);
    expect(canvasRenderers(unauthoredSpace, opens).selected.title).toBe('Flow');
  });

  /**
   * The retryable story hands the fixture a Space that changes: it opens on
   * `authoredSnapshot` and submits `editedSnapshot`. The fixture seeds `selected`
   * once and never reconciles it, so an Edit withdrawing the opened Layout would
   * make `canvasRenderers` throw on the second render — a blank story rather than a
   * degraded one. The Edit appends, and this is what says so, at `verify` rather
   * than in a browser — including that it appends *something*, since an
   * `editedSnapshot` that stopped differing from what the session loaded would
   * leave the story's claim with nothing to show.
   */
  it('keeps the opened Layout when the retryable story submits its Edit', () => {
    const edited = loadSpaceSnapshot(editedSnapshot);
    if (!edited.ok) throw new Error(edited.errors.map((error) => error.message).join('\n'));

    const opens = defaultRenderer(authoredSpace);

    expect(canvasRenderers(edited.space, opens).selected.title).toBe('Collection 1');
    expect(edited.space.layouts.slice(0, authoredSpace.layouts.length)).toEqual(
      authoredSpace.layouts,
    );
    expect(
      edited.space.layouts.slice(authoredSpace.layouts.length).map((layout) => layout.title),
    ).toEqual(['Collection 3']);
  });

  /**
   * The Graph colours the sidebar draws are derived, not transcribed. The four
   * Graphs carry no colour of their own, so each takes a palette slot by its
   * position in the flatten across Layouts (ADR 0045) — which is what let the
   * fixture's four hex literals go.
   */
  it('carries no Graph colour of its own, leaving the palette to answer', () => {
    expect(authoredSpace.graphs.map((graph) => graph.title)).toEqual([
      'Long',
      'Mid',
      'Short',
      'Echo',
    ]);
    expect(authoredSpace.graphs.every((graph) => graph.color === undefined)).toBe(true);
  });
});
