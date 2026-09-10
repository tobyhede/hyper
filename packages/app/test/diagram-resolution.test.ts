import { describe, expect, it } from 'vitest';
import { uuidSchema, type DiagramId } from '@project/core';
import { loadSpace } from '@project/graph';
import {
  diagramCards,
  DiagramNotFoundError,
  requireDefaultDiagram,
  resolveDiagram,
} from '../src/diagram-resolution';
import { cardFile } from './card-files';

const PLACED = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const ALSO_PLACED = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const OMITTED = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const DIAGRAM = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const MISSING = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

const load = (defaultDiagram: DiagramId | undefined) =>
  loadSpace(
    {
      version: 1,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Space',
      defaultDiagram,
      diagrams: [
        {
          id: DIAGRAM,
          title: 'Diagram 1',
          kind: 'positioned',
          // Declared out of the Space's Card order on purpose: the derivation
          // answers in `space.cards` order, and a Placement that agreed with
          // that order could not tell the two apart.
          positions: {
            [ALSO_PLACED]: { x: 40, y: 50, open: false },
            [PLACED]: { x: 12, y: 24, open: false },
          },
          graphs: [{ id: GRAPH, title: 'Graph 1', edges: [] }],
          activeGraph: GRAPH,
        },
      ],
    },
    [cardFile(PLACED), cardFile(ALSO_PLACED), cardFile(OMITTED)],
  );

const loaded = load(DIAGRAM);
if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
const space = loaded.space;

const diagramless = load(undefined);
if (!diagramless.ok) throw new Error(JSON.stringify(diagramless.errors));

describe('requireDefaultDiagram', () => {
  it('answers the durable opening selection', () => {
    expect(requireDefaultDiagram(space)).toBe(DIAGRAM);
  });

  it('throws on a Space with no default Diagram', () => {
    expect(() => requireDefaultDiagram(diagramless.space)).toThrow(DiagramNotFoundError);
  });
});

describe('resolveDiagram', () => {
  it('answers the default Diagram when no id is named', () => {
    expect(resolveDiagram(space).diagram.id).toBe(DIAGRAM);
  });

  it('answers the Diagram an id names', () => {
    expect(resolveDiagram(space, DIAGRAM).diagram.id).toBe(DIAGRAM);
  });

  it('throws on an id that names no Diagram', () => {
    expect(() => resolveDiagram(space, MISSING)).toThrow(DiagramNotFoundError);
  });
});

describe('diagramCards', () => {
  /**
   * Membership and ordering in one assertion, because they are one guarantee:
   * the Cards a Diagram places, as the Space's own objects, in the Space's Card
   * order. No higher seam states the ordering, and the canvas reads it.
   */
  it("answers the Space's own placed Cards in the Space's Card order", () => {
    const cards = diagramCards(space, resolveDiagram(space).diagram);

    expect(cards.map(({ id }) => id)).toEqual([PLACED, ALSO_PLACED]);
    expect(cards[0]).toBe(space.lookup.card(PLACED));
    expect(cards[1]).toBe(space.lookup.card(ALSO_PLACED));
  });
});
