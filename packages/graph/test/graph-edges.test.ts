import { describe, expect, it } from 'vitest';
import { uuidSchema, type GraphEdge } from '@project/core';
import { repeatedGraphEdges } from '../src/graph-edges';

/**
 * The one computation of "an exact duplicate within one Graph" (ADR 0032).
 *
 * Its two readers phrase the answer differently — intake reports every repeat as
 * a load diagnostic naming both indices, and application authoring refuses
 * the first one a View hands back — so this is where the rule itself is pinned,
 * rather than twice in the vocabularies of the two things that ask it.
 */
const card = (n: number): GraphEdge['from'] =>
  uuidSchema.parse(`00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`);

const A = card(1);
const B = card(2);
const C = card(3);

describe('repeatedGraphEdges', () => {
  it('finds nothing in a Graph whose Edges are all distinct', () => {
    expect(
      repeatedGraphEdges([
        { from: A, to: B },
        { from: B, to: C },
      ]).size,
    ).toBe(0);
  });

  it('answers each repeat with the index the same pair first appeared at', () => {
    const repeats = repeatedGraphEdges([
      { from: A, to: B },
      { from: B, to: C },
      { from: A, to: B },
      { from: A, to: B },
    ]);
    // Both later occurrences name the *first*, not the one before them: a
    // diagnostic that pointed at index 2 from index 3 would send an author to
    // another copy of the problem rather than to its original.
    expect([...repeats]).toEqual([
      [2, 0],
      [3, 0],
    ]);
  });

  it('reads an Edge as directed, so a return Edge is not a repeat', () => {
    expect(
      repeatedGraphEdges([
        { from: A, to: B },
        { from: B, to: A },
      ]).size,
    ).toBe(0);
  });

  it('treats a repeated self-Edge as a repeat, though one self-Edge is legal', () => {
    expect(repeatedGraphEdges([{ from: A, to: A }]).size).toBe(0);
    expect([
      ...repeatedGraphEdges([
        { from: A, to: A },
        { from: A, to: A },
      ]),
    ]).toEqual([[1, 0]]);
  });
});
