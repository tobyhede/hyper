import { describe, expect, it } from 'vitest';
import { titleName, uuidSchema } from '@project/core';
import { loadSpace, type CardFile } from '@project/graph';
import fixtureJson from '../fixture/space.json';
import exampleJson from '../example/space.json';

const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000050');

/**
 * The two spaces on disk, loaded exactly as authored.
 *
 * A space is now a directory, not a file (ADR 0020): the space file holds
 * structure, and every card is a markdown file beside it or under `cards/`. So
 * this reads both locations the same way the app does, and is the regression
 * test that the card files are still authored correctly — a missing fence or an
 * unquoted title in a card's frontmatter fails here.
 *
 * Both declare Diagrams, because both hold Graphs and a Diagram is what owns one
 * (ADR 0040). The fixture explicitly opens in Flow; the example still relies on
 * the transitional fallback. That makes the fixture's Space-subject flatten,
 * across two Diagrams, the thing the app and the e2e suite actually exercise. The fixture is separately
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
  // into two Diagrams; the example is one connected collection, so its three
  // Graphs are owned by one.
  [
    'fixture',
    fixtureJson,
    {
      cards: 11,
      diagrams: 2,
      graphs: 4,
      unreached: { 'Collection 1': ['T'], 'Collection 2': [] },
      defaultDiagram: DIAGRAM_ID,
    },
  ],
  [
    'example',
    exampleJson,
    {
      cards: 7,
      diagrams: 1,
      graphs: 3,
      unreached: { Walkthroughs: [] },
      defaultDiagram: undefined,
    },
  ],
])('%s/', (name, json, expected) => {
  it('loads as a version 1 Space whose Diagrams own every Graph, and opens in Flow', () => {
    const result = loadSpace(json, cardFiles(name));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
    expect(result.space.diagrams).toHaveLength(expected.diagrams);
    // `space.graphs` is the flatten across those Diagrams, never a stored
    // collection beside them (ADR 0045).
    expect(result.space.graphs).toHaveLength(expected.graphs);
    expect(result.space.defaultDiagram).toBe(expected.defaultDiagram);
  });

  it('makes every Edge endpoint a member, and names the members no Edge reaches', () => {
    const result = loadSpace(json, cardFiles(name));
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));

    // Membership *is* the position map (ADR 0040), and `loadSpace` has already
    // refused an Edge endpoint that is not a member. What it cannot refuse is a
    // member no Edge reaches — which is both a legitimate authored state (Add
    // Card and the Cards drawer each leave one) and what a Card stranded in a
    // Diagram it does not belong to looks like. So the strays are named, by Card
    // and by the Diagram holding them, rather than counted: a count cannot tell a
    // Card that became connected apart from a different Card stranded in the
    // same fixture edit, and lets the two regressions through together. The
    // fixture strands exactly `T`, whose three-line Title draws the ladder
    // wherever the fixture is loaded (ADR 0083), and the example strands none.
    const nameById = new Map<string, string>(
      result.space.cards.map((card) => [card.id, titleName(card.title)]),
    );
    const unreached = Object.fromEntries(
      result.space.diagrams.map((diagram): readonly [string, readonly string[]] => {
        const endpoints = diagram.graphs.flatMap((graph) =>
          graph.edges.flatMap((edge) => [edge.from, edge.to]),
        );
        for (const endpoint of endpoints) expect(diagram.positions[endpoint]).toBeDefined();
        const connected = new Set<string>(endpoints);
        return [
          diagram.title,
          Object.keys(diagram.positions)
            .filter((card) => !connected.has(card))
            .map((card) => nameById.get(card) ?? card)
            .sort(),
        ];
      }),
    );

    // Keyed by Diagram title, so two Diagrams sharing one would fold together and
    // take a stray in the second with them.
    expect(Object.keys(unreached)).toHaveLength(expected.diagrams);
    expect(unreached).toEqual(expected.unreached);

    // Every Card is in exactly one Diagram, so nothing is left over and nothing
    // is in both.
    const memberships = result.space.diagrams.flatMap((diagram) => Object.keys(diagram.positions));
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
