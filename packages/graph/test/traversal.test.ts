import { describe, expect, it } from 'vitest';
import type { Graph, UUID } from '@project/core';
import { outgoingEdges, graphStartThing } from '../src/index';
// Internal to the package: `graphStartThing` is the offered way in.
import { graphEntryThings } from '../src/traversal';
import { uuid } from './thing-files';

const graph = (edges: [UUID, UUID][]): Graph => ({
  id: uuid('00000000-0000-4000-8000-000000000001'),
  title: 'R',
  edges: edges.map(([from, to]) => ({ from, to })),
});

// a forks to b and c, which merge back into d. Every move a traversal can make is in
// here: a choice, a single step, and an arrival by two paths.
const diamond = graph([
  [uuid('00000000-0000-4000-8000-000000000002'), uuid('00000000-0000-4000-8000-000000000003')],
  [uuid('00000000-0000-4000-8000-000000000002'), uuid('00000000-0000-4000-8000-000000000005')],
  [uuid('00000000-0000-4000-8000-000000000003'), uuid('00000000-0000-4000-8000-000000000006')],
  [uuid('00000000-0000-4000-8000-000000000005'), uuid('00000000-0000-4000-8000-000000000006')],
]);

describe('outgoingEdges', () => {
  it('lists a fork’s edges in the order they were authored', () => {
    expect(
      outgoingEdges(diamond, uuid('00000000-0000-4000-8000-000000000002')).map((e) => e.to),
    ).toEqual(['00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000005']);
  });

  it('gives a thing on a line exactly one — the degenerate fork', () => {
    expect(
      outgoingEdges(diamond, uuid('00000000-0000-4000-8000-000000000003')).map((e) => e.to),
    ).toEqual(['00000000-0000-4000-8000-000000000006']);
  });

  it('gives a sink none, which is how traversal ends', () => {
    expect(outgoingEdges(diamond, uuid('00000000-0000-4000-8000-000000000006'))).toEqual([]);
  });

  it('gives a thing the graph does not touch none', () => {
    expect(outgoingEdges(diamond, uuid('00000000-0000-4000-8000-000000000098'))).toEqual([]);
  });
});

describe('graphEntryThings', () => {
  it('finds the thing nothing arrives at', () => {
    expect(graphEntryThings(diamond)).toEqual(['00000000-0000-4000-8000-000000000002']);
  });

  it('finds one per component — a Graph need not be connected (ADR 0032)', () => {
    expect(
      graphEntryThings(
        graph([
          [
            uuid('00000000-0000-4000-8000-000000000002'),
            uuid('00000000-0000-4000-8000-000000000003'),
          ],
          [
            uuid('00000000-0000-4000-8000-000000000010'),
            uuid('00000000-0000-4000-8000-000000000011'),
          ],
        ]),
      ),
    ).toEqual(['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000010']);
  });

  it('lists each entry once however many edges leave it', () => {
    expect(graphEntryThings(diamond)).toEqual(['00000000-0000-4000-8000-000000000002']);
  });

  it('answers none for a fully cyclic Graph, which is the honest answer', () => {
    // "A thing nothing arrives at" is a true question about the structure, and a
    // loop has none. `graphStartThing` decides what to do about that; making this
    // report a thing would make the word a lie.
    expect(
      graphEntryThings(
        graph([
          [
            uuid('00000000-0000-4000-8000-000000000003'),
            uuid('00000000-0000-4000-8000-000000000005'),
          ],
          [
            uuid('00000000-0000-4000-8000-000000000005'),
            uuid('00000000-0000-4000-8000-000000000003'),
          ],
        ]),
      ),
    ).toEqual([]);
  });
});

describe('graphStartThing', () => {
  it('starts traversal at the first entry', () => {
    expect(graphStartThing(diamond)).toBe('00000000-0000-4000-8000-000000000002');
  });

  it('is undefined only for a graph with no edges, which the schema forbids', () => {
    expect(graphStartThing(graph([]))).toBeUndefined();
  });

  it('starts a self-connected Graph at its only thing', () => {
    // The first gesture authoring ships: connecting a thing to itself. Nothing
    // arrives at nothing here — the thing arrives at itself — so rule 1 has no
    // answer and traversal would never begin.
    expect(
      graphStartThing(
        graph([
          [
            uuid('00000000-0000-4000-8000-000000000002'),
            uuid('00000000-0000-4000-8000-000000000002'),
          ],
        ]),
      ),
    ).toBe('00000000-0000-4000-8000-000000000002');
  });

  it('picks the first edge’s source for a cycle no thing enters', () => {
    // Three things, all arrived at. Rule 2 *picks* here rather than deriving:
    // any of the three would have been defensible, and authoring order is the
    // only tie-break left.
    expect(
      graphStartThing(
        graph([
          [
            uuid('00000000-0000-4000-8000-000000000003'),
            uuid('00000000-0000-4000-8000-000000000005'),
          ],
          [
            uuid('00000000-0000-4000-8000-000000000005'),
            uuid('00000000-0000-4000-8000-000000000002'),
          ],
          [
            uuid('00000000-0000-4000-8000-000000000002'),
            uuid('00000000-0000-4000-8000-000000000003'),
          ],
        ]),
      ),
    ).toBe('00000000-0000-4000-8000-000000000003');
  });

  it('prefers an entry to the first edge’s source when a Graph has both', () => {
    // A cycle with a tail into it: b → c, c → b, a → b. `a` is an entry, so
    // rule 2 never runs — and the two rules disagree here, because the first
    // edge's source is `b`, inside the loop.
    expect(
      graphStartThing(
        graph([
          [
            uuid('00000000-0000-4000-8000-000000000003'),
            uuid('00000000-0000-4000-8000-000000000005'),
          ],
          [
            uuid('00000000-0000-4000-8000-000000000005'),
            uuid('00000000-0000-4000-8000-000000000003'),
          ],
          [
            uuid('00000000-0000-4000-8000-000000000002'),
            uuid('00000000-0000-4000-8000-000000000003'),
          ],
        ]),
      ),
    ).toBe('00000000-0000-4000-8000-000000000002');
  });

  it('does not depend on which thing the first edge happens to mention', () => {
    // The authored order runs b → c before a → b, so the first `from` is not the
    // entry. Connecting appends, so that is what an author who draws b → c and
    // then attaches a → b in front of it stores, and rule 2 alone would start
    // traversal at b — skipping a, which forward traversal never reaches.
    expect(
      graphStartThing(
        graph([
          [
            uuid('00000000-0000-4000-8000-000000000003'),
            uuid('00000000-0000-4000-8000-000000000005'),
          ],
          [
            uuid('00000000-0000-4000-8000-000000000002'),
            uuid('00000000-0000-4000-8000-000000000003'),
          ],
        ]),
      ),
    ).toBe('00000000-0000-4000-8000-000000000002');
  });
});
