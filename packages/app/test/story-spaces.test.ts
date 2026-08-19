import { describe, expect, it } from 'vitest';
import { loadSpaceSnapshot } from '@project/graph';
import { canvasRenderers, currentRenderer } from '../src/canvas-renderers';
import { defaultRenderer } from '../src/renderer';
import {
  authoredSnapshot,
  authoredSpace,
  editedSnapshot,
  storyGraphIds,
  unauthoredSpace,
} from '../stories/support/spaces';

/**
 * The Spaces the Ladle catalogue draws, held to production's own rules.
 *
 * ADR 0052 makes a stable story evidence about the UI Hyper ships, and its
 * negative to remember forbids making one possible by "translating its state in
 * the harness". Where a Space opens is `defaultRenderer` reading
 * `space.defaultRenderer` — so the story fixture must not answer that question
 * itself, and these Spaces have to *declare* what the Ladle specs then assert.
 *
 * That is what this file pins. `issue-14-workspace-sidebar.spec.ts` proves the
 * rendered story presses Collection 1; this proves the story is entitled to,
 * because the Space says so through the same call production makes. Delete the
 * `defaultRenderer` and this fails here rather than in a browser.
 */
describe('the story Spaces', () => {
  it('opens the authored Space on the Layout its stories press', () => {
    const opens = defaultRenderer(authoredSpace);

    expect(opens.kind).toBe('layout');
    expect(currentRenderer(canvasRenderers(authoredSpace), opens).title).toBe('Collection 1');
  });

  /** A new Space names no view, so production's own fallback answers (ADR 0018, ADR 0025). */
  it('opens the unauthored Space on Flow, owning no Layout to open on', () => {
    const opens = defaultRenderer(unauthoredSpace);

    expect(opens).toEqual({ kind: 'view', view: 'flow' });
    expect(unauthoredSpace.layouts).toEqual([]);
    expect(unauthoredSpace.graphs).toEqual([]);
    expect(currentRenderer(canvasRenderers(unauthoredSpace), opens).title).toBe('Flow');
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

    expect(currentRenderer(canvasRenderers(edited.space), opens).title).toBe('Collection 1');
    expect(edited.space.layouts.slice(0, authoredSpace.layouts.length)).toEqual(
      authoredSpace.layouts,
    );
    expect(
      edited.space.layouts.slice(authoredSpace.layouts.length).map((layout) => layout.title),
    ).toEqual(['Collection 3']);
  });

  /**
   * The identities a story's conversion mints are not identities the story
   * already carries.
   *
   * `convertSubject` checks a minted Graph id against the Space's **Graphs**
   * and nothing else, which is right: ADR 0045 makes a Graph id unique across
   * the Graphs of a Space, and a Card's id lives in another namespace. So the
   * boundary would accept a Graph wearing `CARD_A`'s id without a word, and the
   * counter that produced it is the only thing that can refuse — which it can
   * only do by starting above every id the literals above it declare.
   *
   * The counter has no upper bound, so this reads far enough past the declared
   * block to be about where it *starts* rather than about how many ids happen
   * to be asked for: `0x40` is the highest id declared, and a counter that
   * began anywhere below it would be caught inside this many draws.
   *
   * `unauthoredSpace` is deliberately not in the set. `newSpace()` mints a real
   * v4 uuid on every load, so its ids are not tracked literals this could be
   * held against, and asserting over them would make the test a coin toss
   * rather than a claim about the block.
   */
  it('mints Graph identities no story literal already carries', () => {
    const edited = loadSpaceSnapshot(editedSnapshot);
    if (!edited.ok) throw new Error(edited.errors.map((error) => error.message).join('\n'));

    const declared = new Set<string>([
      authoredSnapshot.id,
      ...[authoredSpace, edited.space].flatMap((space) => [
        ...space.cards.map((card) => card.id),
        ...space.layouts.map((layout) => layout.id),
        ...space.graphs.map((graph) => graph.id),
      ]),
    ]);

    const mint = storyGraphIds();
    const minted = Array.from({ length: 0x40 }, mint);

    expect(minted.filter((id) => declared.has(id))).toEqual([]);
    // The set has to be reaching the literals, or the assertion above holds for
    // a reason nobody chose.
    expect(declared.size).toBeGreaterThan(0x0c);
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
