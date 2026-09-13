import { describe, expect, it } from 'vitest';
import { titleName, uuidSchema } from '@project/core';
import { loadSpace, type ThingFile } from '@project/graph';
import fixtureJson from '../fixture/00000000-0000-4000-8000-000000000040/space.json';
import walkthroughJson from '../fixture/00000000-0000-4000-8000-000000000060/space.json';
import deepDiveJson from '../fixture/00000000-0000-4000-8000-000000000070/space.json';
import notesJson from '../fixture/00000000-0000-4000-8000-000000000080/space.json';
import exampleJson from '../example/space.json';

const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000050');
const WALKTHROUGH_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000061');
const DEEP_DIVE_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000071');
const NOTES_DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000081');

/**
 * The Spaces on disk, loaded exactly as authored.
 *
 * A space is now a directory, not a file (ADR 0020): the space file holds
 * structure, and every thing is a markdown file beside it or under `things/`. So
 * this reads both locations the same way the app does, and is the regression
 * test that the thing files are still authored correctly — a missing fence or an
 * unquoted title in a thing's frontmatter fails here.
 *
 * The tracked fixture is a complete aggregate: Meta is the Diagram fixture, and
 * the ordinary Spaces hang off it. `example/` is dormant and nothing else would
 * notice it breaking.
 */

const spaceDirs = import.meta.glob<string>(['../fixture/**/*.md', '../example/**/*.md'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The thing files of one space directory, keyed the way the plugin serves them. */
function thingFiles(dir: string): ThingFile[] {
  return Object.entries(spaceDirs)
    .filter(([path]) => path.startsWith(`../${dir}/`))
    .map(([path, text]) => ({ path, text }));
}

describe.each([
  [
    'fixture/00000000-0000-4000-8000-000000000040',
    fixtureJson,
    {
      things: 13,
      diagrams: 3,
      graphs: 5,
      unreached: { 'Collection 1': ['T'], 'Collection 2': [], 'Linked Spaces': [] },
      defaultDiagram: DIAGRAM_ID,
    },
  ],
  [
    'fixture/00000000-0000-4000-8000-000000000060',
    walkthroughJson,
    {
      things: 5,
      diagrams: 1,
      graphs: 1,
      unreached: { Walkthrough: ['Authoring notes', 'Deep dive'] },
      defaultDiagram: WALKTHROUGH_DIAGRAM,
    },
  ],
  [
    'fixture/00000000-0000-4000-8000-000000000070',
    deepDiveJson,
    {
      things: 3,
      diagrams: 1,
      graphs: 1,
      unreached: { 'Deep dive': [] },
      defaultDiagram: DEEP_DIVE_DIAGRAM,
    },
  ],
  [
    'fixture/00000000-0000-4000-8000-000000000080',
    notesJson,
    {
      things: 2,
      diagrams: 1,
      graphs: 1,
      unreached: { Notes: [] },
      defaultDiagram: NOTES_DIAGRAM,
    },
  ],
  [
    'example',
    exampleJson,
    {
      things: 7,
      diagrams: 1,
      graphs: 3,
      unreached: { Walkthroughs: [] },
      defaultDiagram: undefined,
    },
  ],
])('%s/', (name, json, expected) => {
  it('loads as a version 1 Space whose Diagrams own every Graph, and opens in Flow', () => {
    const result = loadSpace(json, thingFiles(name));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
    expect(result.space.diagrams).toHaveLength(expected.diagrams);
    // `space.graphs` is the flatten across those Diagrams, never a stored
    // collection beside them (ADR 0045).
    expect(result.space.graphs).toHaveLength(expected.graphs);
    expect(result.space.defaultDiagram).toBe(expected.defaultDiagram);
  });

  it('makes every Edge endpoint a member, and names the members no Edge reaches', () => {
    const result = loadSpace(json, thingFiles(name));
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));

    // Membership *is* the position map (ADR 0040), and `loadSpace` has already
    // refused an Edge endpoint that is not a member. What it cannot refuse is a
    // member no Edge reaches — which is both a legitimate authored state (Add
    // Thing and the Things list each leave one) and what a Thing stranded in a
    // Diagram it does not belong to looks like. So the strays are named, by Thing
    // and by the Diagram holding them, rather than counted: a count cannot tell a
    // Thing that became connected apart from a different Thing stranded in the
    // same fixture edit, and lets the two regressions through together. The
    // fixture Meta Space strands exactly `T`, whose three-line Title draws the
    // ladder wherever the fixture is loaded (ADR 0083), and the walkthrough
    // strands the two Space Things that sit off its Graph.
    const nameById = new Map<string, string>(
      result.space.things.map((thing) => [thing.id, titleName(thing.title)]),
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
            .filter((thing) => !connected.has(thing))
            .map((thing) => nameById.get(thing) ?? thing)
            .sort(),
        ];
      }),
    );

    // Keyed by Diagram title, so two Diagrams sharing one would fold together and
    // take a stray in the second with them.
    expect(Object.keys(unreached)).toHaveLength(expected.diagrams);
    expect(unreached).toEqual(expected.unreached);

    // Every Thing is in exactly one Diagram, so nothing is left over and nothing
    // is in both.
    const memberships = result.space.diagrams.flatMap((diagram) => Object.keys(diagram.positions));
    expect(memberships).toHaveLength(expected.things);
    expect(new Set(memberships).size).toBe(expected.things);
  });

  it('finds every thing with kind-appropriate content', () => {
    const result = loadSpace(json, thingFiles(name));
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
    expect(result.space.things).toHaveLength(expected.things);
    // An alias shows its target's content, so it has no body of its own (ADR
    // 0009); every markdown thing carries one.
    for (const thing of result.space.things) {
      if (thing.kind !== 'markdown') expect('body' in thing).toBe(false);
      else expect(thing.body.trim().length).toBeGreaterThan(0);
    }
  });
});
