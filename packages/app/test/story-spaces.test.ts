import { describe, expect, it } from 'vitest';
import type { LayoutId } from '@project/core';
import { graphStartCard, loadSpaceSnapshot, outgoingEdges, type Space } from '@project/graph';
import { requireDefaultLayout } from '../src/layout-resolution';
import {
  authoredSnapshot,
  authoredSpace,
  sparseAuthoredSnapshot,
  deepDiveSpace,
  editedSnapshot,
  MINTED_GRAPH_ID_BASE,
  storyGraphIds,
  newSpaceFixture,
  traversalSpace,
} from '../stories/support/spaces';

/**
 * The Spaces the Ladle catalogue draws, held to production's own rules.
 *
 * ADR 0052 makes a stable story evidence about the UI Hyper ships, and its
 * negative to remember forbids making one possible by "translating its state in
 * the harness". Where a Space opens is `requireDefaultLayout` reading
 * `space.defaultLayout` — so the story fixture must not answer that question
 * itself, and these Spaces have to *declare* what the Ladle specs then assert.
 *
 * That is what this file pins. `issue-14-space-sidebar.spec.ts` proves the
 * rendered story presses Collection 1; this proves the story is entitled to,
 * because the Space says so through the same call production makes. Delete the
 * `defaultLayout` and this fails here rather than in a browser.
 */
/** The title of the Layout an id names, asked of the Space that declares it. */
const openedLayoutTitle = (space: Space, id: LayoutId): string | undefined =>
  space.lookup.layout(id)?.layout.title;

describe('the story Spaces', () => {
  it('opens the authored Space on the Layout its stories press', () => {
    const opens = requireDefaultLayout(authoredSpace);

    expect(opens).toBe(authoredSpace.defaultLayout);
    expect(openedLayoutTitle(authoredSpace, opens)).toBe('Collection 1');
  });

  /**
   * The Cards drawer's Refused story needs a Layout that is *missing* Cards, and
   * it must not find one by indexing into `layouts` — that follows array order,
   * so inserting a Layout would silently move the story to a different one.
   */
  it('opens the sparse authored Space on a Layout some Cards are absent from', () => {
    const space = loadSpaceSnapshot(sparseAuthoredSnapshot);
    if (!space.ok) throw new Error('sparse story Space did not load');
    const opens = requireDefaultLayout(space.space);

    expect(opens).toBe(space.space.defaultLayout);
    const layout = space.space.lookup.layout(opens)?.layout;
    expect(openedLayoutTitle(space.space, opens)).toBe('Collection 2');
    expect(
      space.space.cards.filter((card) => layout?.positions[card.id] === undefined),
    ).not.toHaveLength(0);
  });

  /** ADR 0080 makes a newly created Space complete before it is first opened. */
  it('opens the newly created Space on its authored Layout', () => {
    const opens = requireDefaultLayout(newSpaceFixture);

    expect(opens).toEqual(newSpaceFixture.layouts[0]?.id);
    expect(newSpaceFixture.layouts).toHaveLength(1);
    expect(newSpaceFixture.graphs).toHaveLength(1);
    expect(openedLayoutTitle(newSpaceFixture, opens)).toBe('Layout 1');
  });

  /**
   * The retryable story hands the fixture a Space that changes: it opens on
   * `authoredSnapshot` and submits `editedSnapshot`. The fixture seeds `selected`
   * once and never reconciles it, so an Edit withdrawing the opened Layout would
   * leave the sidebar with no Layout to press — a blank story rather than a
   * degraded one. The Edit appends, and this is what says so, at `verify` rather
   * than in a browser — including that it appends *something*, since an
   * `editedSnapshot` that stopped differing from what the session loaded would
   * leave the story's claim with nothing to show.
   */
  it('keeps the opened Layout when the retryable story submits its Edit', () => {
    const edited = loadSpaceSnapshot(editedSnapshot);
    if (!edited.ok) throw new Error(edited.errors.map((error) => error.message).join('\n'));

    const opens = requireDefaultLayout(authoredSpace);

    expect(openedLayoutTitle(edited.space, opens)).toBe('Collection 1');
    expect(edited.space.layouts.slice(0, authoredSpace.layouts.length)).toEqual(
      authoredSpace.layouts,
    );
    expect(
      edited.space.layouts.slice(authoredSpace.layouts.length).map((layout) => layout.title),
    ).toEqual(['Collection 3']);
  });

  /**
   * The identities an interactive story mints are not identities the story
   * already carries.
   *
   * The counter has no upper bound, so this reads far enough past the declared
   * block to be about where it *starts* rather than about how many ids happen
   * to be asked for: `0x40` is the highest id declared, and a counter that
   * began anywhere below it would be caught inside this many draws.
   *
   * `newSpaceFixture` is deliberately not in the set. `newSpace()` mints a real
   * v4 uuid on every load, so its ids are not tracked literals this could be
   * held against, and asserting over them would make the test a coin toss
   * rather than a claim about the block.
   */
  it('mints Edit identities no story literal already carries', () => {
    const edited = loadSpaceSnapshot(editedSnapshot);
    if (!edited.ok) throw new Error(edited.errors.map((error) => error.message).join('\n'));

    const declared = new Set<string>([
      authoredSnapshot.id,
      ...[authoredSpace, edited.space, traversalSpace, deepDiveSpace].flatMap((space) => [
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

    // The whole boundary, and not only the draws above. The counter is
    // monotonic from `MINTED_GRAPH_ID_BASE`, so once every declared id sits
    // below the base *no* draw can reach one — including the draws this test
    // does not make. Without this, a literal added at or above the base would
    // pass the assertion above and collide on a later draw.
    //
    // The block is read off a minted id rather than written down again: the
    // minter is what decides the shape, and a second copy of the prefix here
    // would be a transcription that agrees only until one of them moves.
    const sample = minted[0];
    if (sample === undefined) throw new Error('The story minter produced no id.');
    const block = sample.slice(0, sample.lastIndexOf('-') + 1);

    for (const id of declared) {
      expect(id.startsWith(block), id).toBe(true);
      expect(Number.parseInt(id.slice(block.length), 16), id).toBeLessThan(MINTED_GRAPH_ID_BASE);
    }
  });

  /**
   * The traversal Spaces open where they say, on the one Graph their Layout
   * owns — so a presenting story calls `present()` and nothing else, and the
   * Graph it presents is the one `requireDefaultLayout` and ADR 0026 answer rather
   * than one the harness picked.
   */
  it('opens each traversal Space on the Layout and Graph it declares', () => {
    for (const [space, title] of [
      [traversalSpace, 'Traversal'],
      [deepDiveSpace, 'Deep dive'],
    ] as const) {
      const opens = requireDefaultLayout(space);
      expect(opens).toBe(space.defaultLayout);
      expect(openedLayoutTitle(space, opens)).toBe(title);
      expect(space.graphs.map((graph) => graph.title)).toEqual([title]);
    }
  });

  /**
   * The one thing no tracked fixture has, and the reason these Spaces exist.
   *
   * The E2E fixture's Graphs are deliberately all lines and the sidebar's Space
   * is four more of them, so nothing already in the tree gives the presenting
   * chrome a Card with a real choice at it. This is the assertion that the fork
   * story is a fork — and that the line beside it is still the degenerate one
   * rather than a second kind (ADR 0024).
   */
  it('gives the fork story a Card with several ways on, and the line exactly one', () => {
    const outDegree = (space: Space): number => {
      const graph = space.graphs[0];
      if (graph === undefined) throw new Error('The traversal Space owns no Graph.');
      const start = graphStartCard(graph);
      if (start === undefined) throw new Error('The traversal Space has nowhere to begin.');
      return outgoingEdges(graph, start).length;
    };

    expect(outDegree(deepDiveSpace)).toBe(4);
    expect(outDegree(traversalSpace)).toBe(1);
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
