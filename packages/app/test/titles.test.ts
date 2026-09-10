import { describe, expect, it } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { nextThingTitle, nextGraphTitle, nextDiagramTitle } from '../src/titles';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');

/** A Space holding exactly the Thing Titles named, and nothing else of interest. */
const spaceOf = (...titles: readonly string[]): SpaceSnapshot =>
  spaceSnapshotSchema.parse({
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'Space',
      diagrams: [
        {
          id: DIAGRAM_ID,
          title: 'Diagram 1',
          kind: 'positioned',
          positions: {},
          graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
        },
      ],
      defaultDiagram: DIAGRAM_ID,
    },
    things: titles.map((title, index) => ({
      // Distinct ids, minted from the index rather than a generator: nothing
      // here reads one, and a title is what every assertion is about.
      id: uuidSchema.parse(`00000000-0000-4000-8000-1000000000${String(index).padStart(2, '0')}`),
      document: { title, kind: 'markdown', body: '' },
    })),
  });

describe('the titles an Edit mints', () => {
  it('takes one past the highest number already in use', () => {
    expect(nextThingTitle(spaceOf())).toBe('Thing 1');
    expect(nextThingTitle(spaceOf('Thing 1', 'Thing 2'))).toBe('Thing 3');
    // One past the highest rather than one past the count, so deleting the
    // middle of a numbered set never mints a title already in use.
    expect(nextThingTitle(spaceOf('Thing 1', 'Thing 7'))).toBe('Thing 8');
    // A title an author wrote contributes nothing to the numbering.
    expect(nextThingTitle(spaceOf('Auth', 'Thing 2'))).toBe('Thing 3');
  });

  /**
   * The scan reads **first lines** (ADR 0083).
   *
   * A Thing named `Thing 3` is still named `Thing 3` after an author adds a
   * subtitle to it, so it still occupies 3. Reading the whole Title instead
   * would match nothing, free the number, and mint a second `Thing 3` into a
   * Space that already had one — a duplicate produced by an author qualifying
   * a Thing rather than by anyone naming one.
   */
  it('reads a Thing’s name, so a Title with more lines still occupies its number', () => {
    expect(nextThingTitle(spaceOf('Thing 3\nHow a session begins'))).toBe('Thing 4');
    expect(nextThingTitle(spaceOf('Thing 1', 'Thing 2\nOAuth only\nADR 0083'))).toBe('Thing 3');
  });

  /**
   * And a *later* line that reads as a numbered title is not one. Only Things
   * have Title Lines at all, and only the first of them is the name — so a
   * subtitle spelling out `Thing 9` names nothing and takes no number with it.
   */
  it('does not let a line below the name claim a number', () => {
    expect(nextThingTitle(spaceOf('Auth\nThing 9'))).toBe('Thing 1');
  });

  /** Diagrams and Graphs keep a single-line title, and number the same way. */
  it('numbers Diagrams and Graphs on their own titles', () => {
    expect(nextDiagramTitle(spaceOf())).toBe('Diagram 2');
    expect(nextGraphTitle([{ id: GRAPH_ID, title: 'Graph 1', edges: [] }])).toBe('Graph 2');
  });
});
