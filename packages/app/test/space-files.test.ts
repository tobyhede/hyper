import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import { loadSpace, type CardFile } from '@project/graph';
import fixtureJson from '../fixture/space.json';
import exampleJson from '../example/space.json';

const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000050');

/**
 * The two spaces on disk, loaded exactly as authored.
 *
 * A space is now a directory, not a file (ADR 0020): the space file holds
 * structure, and every card is a markdown file beside it or under `cards/`. So
 * this reads both locations the same way the app does, and is the regression
 * test that the card files are still authored correctly — a missing fence or an
 * unquoted title in a card's frontmatter fails here.
 *
 * Both declare Layouts, because both hold Graphs and a Layout is what owns one
 * (ADR 0040). The fixture explicitly opens in Flow; the example still relies on
 * the transitional fallback. That makes the fixture's Space-subject flatten,
 * across two Layouts, the thing the app and the e2e suite actually exercise. The fixture is separately
 * proven by the app booting; `example/` is dormant and nothing else would notice
 * it breaking.
 */

const spaceDirs = import.meta.glob<string>(['../fixture/**/*.md', '../example/**/*.md'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The card files of one space directory, keyed the way the plugin serves them. */
function cardFiles(dir: string): CardFile[] {
  return Object.entries(spaceDirs)
    .filter(([path]) => path.startsWith(`../${dir}/`))
    .map(([path, text]) => ({ path, text }));
}

describe.each([
  // The fixture is two disconnected collections sharing no cards, so it splits
  // into two Layouts; the example is one connected collection, so its three
  // Graphs are owned by one.
  [
    'fixture',
    fixtureJson,
    { cards: 11, layouts: 2, graphs: 4, unreached: 1, defaultLayout: LAYOUT_ID },
  ],
  [
    'example',
    exampleJson,
    { cards: 7, layouts: 1, graphs: 3, unreached: 0, defaultLayout: undefined },
  ],
])('%s/', (name, json, expected) => {
  it('loads as a version 1 Space whose Layouts own every Graph, and opens in Flow', () => {
    const result = loadSpace(json, cardFiles(name));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
    expect(result.space.layouts).toHaveLength(expected.layouts);
    // `space.graphs` is the flatten across those Layouts, never a stored
    // collection beside them (ADR 0045).
    expect(result.space.graphs).toHaveLength(expected.graphs);
    expect(result.space.defaultLayout).toBe(expected.defaultLayout);
  });

  it('makes every Edge endpoint a member, and counts the members no Edge reaches', () => {
    const result = loadSpace(json, cardFiles(name));
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));

    // Membership *is* the position map (ADR 0040), and `loadSpace` has already
    // refused an Edge endpoint that is not a member. What it cannot refuse is a
    // member no Edge reaches — which is both a legitimate authored state (Add
    // Card and the Cards drawer each leave one) and what a Card stranded in a
    // Layout it does not belong to looks like. So the count is pinned rather
    // than forbidden: the fixture carries exactly one, `T`, whose three-line
    // Title draws the ladder wherever the fixture is loaded (ADR 0083), and the
    // example carries none. A second one appearing in either is the stray this
    // has always been here to catch.
    const unreached = result.space.layouts.flatMap((layout) => {
      const endpoints = layout.graphs.flatMap((graph) =>
        graph.edges.flatMap((edge) => [edge.from, edge.to]),
      );
      for (const endpoint of endpoints) expect(layout.positions[endpoint]).toBeDefined();
      const connected = new Set<string>(endpoints);
      return Object.keys(layout.positions).filter((card) => !connected.has(card));
    });
    expect(unreached).toHaveLength(expected.unreached);

    // Every Card is in exactly one Layout, so nothing is left over and nothing
    // is in both.
    const memberships = result.space.layouts.flatMap((layout) => Object.keys(layout.positions));
    expect(memberships).toHaveLength(expected.cards);
    expect(new Set(memberships).size).toBe(expected.cards);
  });

  it('finds every card with kind-appropriate content', () => {
    const result = loadSpace(json, cardFiles(name));
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
    expect(result.space.cards).toHaveLength(expected.cards);
    // An alias shows its target's content, so it has no body of its own (ADR
    // 0009); every markdown card carries one.
    for (const card of result.space.cards) {
      if (card.kind !== 'markdown') expect('body' in card).toBe(false);
      else expect(card.body.trim().length).toBeGreaterThan(0);
    }
  });
});
